from __future__ import annotations
import os
import gc
import time
import torch
import logging
from typing import Dict, List, Optional, Any, Union
from collections import OrderedDict
from sentence_transformers import SentenceTransformer
from transformers import CLIPProcessor, CLIPModel, CLIPTokenizerFast, AutoModel, AutoProcessor, AutoTokenizer
from PIL import Image
import base64
import io
import open_clip
import httpx
from .types import ModelType, ModelInfo
from .database_initializer import database_initializer
from ..settings import settings
from ..repositories import SystemModelRepository
from ..models import SystemModel

logger = logging.getLogger(__name__)


class ModelManager:
    def __init__(self):
        self._models: OrderedDict[str, Dict[str, Any]] = OrderedDict()
        self._model_info: Dict[str, ModelInfo] = {}
        self._device = torch.device(settings.device if settings.device != "auto" else ("cuda" if torch.cuda.is_available() else "cpu"))
        os.makedirs(settings.models_cache_dir if hasattr(settings, 'models_cache_dir') else str(settings.models_path), exist_ok=True)
        self._available_models = {
            "sentence-transformers/all-MiniLM-L6-v2": {"type": ModelType.TEXT, "dimensions": 768, "description": "Fast and efficient text embedding model"},
            "sentence-transformers/all-mpnet-base-v2": {"type": ModelType.TEXT, "dimensions": 768, "description": "High-quality text embedding model"},
            "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2": {"type": ModelType.TEXT, "dimensions": 768, "description": "Multilingual text embedding model"},
            "openai/clip-vit-base-patch32": {"type": ModelType.MULTIMODAL, "dimensions": 512, "description": "CLIP model for text and image embeddings"},
            "sentence-transformers/clip-ViT-B-32": {"type": ModelType.MULTIMODAL, "dimensions": 512, "description": "Sentence-transformers CLIP model"},
            "Marqo/marqo-ecommerce-embeddings-B": {"type": ModelType.MULTIMODAL, "dimensions": 768, "description": "Marqo ecommerce embedding model", "use_auto_model": True},
            "Marqo/marqo-ecommerce-embeddings-L": {"type": ModelType.MULTIMODAL, "dimensions": 1024, "description": "Marqo ecommerce embedding model (large)", "use_auto_model": True},
        }

    def get_model_type(self, model_name: str) -> ModelType:
        entry = self._available_models.get(model_name)
        if entry:
            return entry["type"]
        return ModelType.TEXT

    async def _persist_system_model(self, model_name: str, mtype: ModelType, loaded: bool = True):
        sm = await SystemModelRepository.get_by_name(model_name) or SystemModel(name=model_name, type=mtype.value)
        sm.loaded = loaded
        sm = await SystemModelRepository.save(sm)
        await SystemModelRepository.ensure_active_if_none(sm)

    async def load_model(self, model_name: str, model_type: ModelType, force_reload: bool = False) -> ModelInfo:
        if model_name in self._models and not force_reload:
            self._update_last_used(model_name)
            return self._model_info[model_name]
        await self._ensure_memory_available()
        start = time.time()
        try:
            if model_type == ModelType.TEXT:
                model_data = await self._load_text_model(model_name)
            else:
                model_data = await self._load_multimodal_model(model_name)
        except Exception as e:
            logger.error("Failed loading model %s: %s", model_name, e)
            raise
        self._models[model_name] = model_data
        self._models.move_to_end(model_name)
        info = ModelInfo(
            name=model_name,
            type=model_type,
            dimensions=model_data["dimensions"],
            is_loaded=True,
            description=self._available_models.get(model_name, {}).get("description"),
        )
        self._model_info[model_name] = info
        await self._persist_system_model(model_name, model_type, True)
        logger.info("Loaded model %s in %.2fs", model_name, time.time() - start)
        return info

    # --- Backwards compatibility wrappers (legacy code expects these) ---
    async def load_text_model(self, name: str):  # returns underlying model object
        cfg = self._available_models.get(name)
        mtype = cfg["type"] if cfg else ModelType.TEXT
        info = await self.load_model(name, mtype if mtype != ModelType.MULTIMODAL else ModelType.MULTIMODAL)
        return self._models[name]["model"]

    async def load_image_model(self, name: str, pretrained: str | None = None):  # pretrained kept for signature
        # Determine type (prefer MULTIMODAL, else IMAGE)
        cfg = self._available_models.get(name)
        mtype = cfg["type"] if cfg else ModelType.IMAGE
        info = await self.load_model(name, mtype)
        return self._models[name]["model"], self._models[name].get("processor")

    async def _load_text_model(self, model_name: str) -> Dict[str, Any]:
        try:
            model = SentenceTransformer(model_name, cache_folder=str(settings.models_path), device=str(self._device))
            dims = model.get_sentence_embedding_dimension()
            return {"model": model, "type": ModelType.TEXT, "dimensions": dims, "processor": None}
        except Exception as e:
            logger.warning("SentenceTransformer failed for %s, fallback to AutoModel: %s", model_name, e)
            tokenizer = AutoTokenizer.from_pretrained(model_name, trust_remote_code=True)
            model = AutoModel.from_pretrained(model_name, trust_remote_code=True)
            model.to(self._device).eval()
            # Determine dimension by forwarding dummy token
            with torch.no_grad():
                dummy = tokenizer(["test"], return_tensors="pt").to(self._device)
                out = model(**dummy)
                hidden = out.last_hidden_state
                dims = hidden.shape[-1]
            return {"model": model, "tokenizer": tokenizer, "type": ModelType.TEXT, "dimensions": dims, "is_auto_model": True}

    async def _load_multimodal_model(self, model_name: str) -> Dict[str, Any]:
        cfg = self._available_models.get(model_name, {})
        if cfg.get("use_auto_model"):
            # Correctly load Marqo models using open_clip with 'hf-hub:' prefix, as per official examples.
            # This avoids both the 'meta tensor' errors from AutoModel and the dimension mismatch from the old fallback.
            try:
                hub_model_name = f"hf-hub:{model_name}"
                model, _, processor = open_clip.create_model_and_transforms(
                    hub_model_name,
                    cache_dir=str(settings.models_path)
                )
                model.to(self._device).eval()
                tokenizer = open_clip.get_tokenizer(hub_model_name)

                # Probe dimension to be certain, but fall back to config.
                dims = cfg.get("dimensions", 768)
                try:
                    with torch.no_grad(), torch.amp.autocast(self._device.type):
                        tokens = tokenizer(["dimension probe"]).to(self._device)
                        text_features = model.encode_text(tokens, normalize=True)
                        dims = text_features.shape[-1]
                except Exception as probe_exc:
                    logger.warning("Could not probe dimension for %s, using configured dimension %d. Error: %s", model_name, dims, probe_exc)

                logger.info("Successfully loaded Marqo model %s via open_clip with dimension %d", model_name, dims)
                return {"model": model, "processor": processor, "tokenizer": tokenizer, "type": ModelType.MULTIMODAL, "dimensions": dims, "is_open_clip": True}
            except Exception as e:
                logger.error("Fatal error loading Marqo model %s via open_clip: %s", model_name, e)
                raise  # Re-raise as this is the correct path and should not fail.
        
        # Fallback to sentence-transformers for other standard multimodal models
        model = SentenceTransformer(model_name, cache_folder=str(settings.models_path), device=str(self._device))
        dims = model.get_sentence_embedding_dimension()
        return {"model": model, "type": ModelType.MULTIMODAL, "dimensions": dims, "processor": None, "is_sentence_transformers": True}

    async def get_embedding(self, model_name: str, content: Union[str, List[str]], content_type: ModelType) -> List[List[float]]:
        if model_name not in self._models:
            cfg = self._available_models.get(model_name)
            if not cfg:
                raise ValueError(f"Unknown model {model_name}")
            await self.load_model(model_name, cfg["type"])
        model_data = self._models[model_name]
        model = model_data["model"]
        if isinstance(content, str):
            content = [content]
        self._update_last_used(model_name)
        try:
            if content_type == ModelType.TEXT:
                return await self._text_embeddings(model_data, content)
            elif content_type == ModelType.IMAGE:
                return await self._image_embeddings(model_data, content)
            else:
                # treat multimodal text
                return await self._text_embeddings(model_data, content)
        except Exception as e:
            logger.error("Embedding error for %s: %s", model_name, e)
            raise

    async def _text_embeddings(self, model_data: Dict[str, Any], texts: List[str]) -> List[List[float]]:
        model = model_data["model"]
        # SigLIP AutoModel path
        if model_data.get("is_siglip_auto"):
            processor = model_data["processor"]
            with torch.no_grad():
                inputs = processor(text=texts, images=None, return_tensors="pt", padding=True, truncation=True).to(self._device)
                out = model(**inputs)
                text_embeds = getattr(out, "text_embeds", None)
                if text_embeds is None:
                    hidden = out.last_hidden_state  # type: ignore[attr-defined]
                    attn = inputs.get("attention_mask")
                    if attn is not None:
                        mask = attn.unsqueeze(-1)
                        summed = (hidden * mask).sum(dim=1)
                        counts = mask.sum(dim=1).clamp(min=1)
                        pooled = summed / counts
                    else:
                        pooled = hidden.mean(dim=1)
                    pooled = torch.nn.functional.normalize(pooled, p=2, dim=1)
                    return pooled.cpu().numpy().tolist()
                text_embeds = torch.nn.functional.normalize(text_embeds, p=2, dim=1)
                return text_embeds.cpu().numpy().tolist()
        if model_data.get("is_open_clip"):
            tokenizer = model_data["tokenizer"]
            with torch.no_grad():
                tokens = tokenizer(texts)
                text_features = model.encode_text(tokens.to(self._device))
                text_features /= text_features.norm(dim=-1, keepdim=True)
                return text_features.cpu().numpy().tolist()
        if hasattr(model, "encode"):
            return model.encode(texts, normalize_embeddings=True)  # type: ignore
        # AutoModel fallback
        tokenizer = model_data.get("tokenizer") or AutoTokenizer.from_pretrained(model_data.get("name", ""))
        inputs = tokenizer(texts, padding=True, truncation=True, return_tensors="pt").to(self._device)
        with torch.no_grad():
            out = model(**inputs)
            hidden = out.last_hidden_state
            mask = inputs["attention_mask"].unsqueeze(-1)
            summed = (hidden * mask).sum(dim=1)
            counts = mask.sum(dim=1).clamp(min=1)
            emb = summed / counts
            emb = torch.nn.functional.normalize(emb, p=2, dim=1)
        return emb.cpu().numpy().tolist()

    async def _image_embeddings(self, model_data: Dict[str, Any], images: List[str]) -> List[List[float]]:
        processed = []
        for item in images:
            if item.startswith("http://") or item.startswith("https://"):
                async with httpx.AsyncClient(timeout=30) as client:
                    r = await client.get(item)
                    r.raise_for_status()
                    im = Image.open(io.BytesIO(r.content)).convert("RGB")
            else:
                # base64
                import base64
                if item.startswith("data:image"):
                    item = item.split(",", 1)[1]
                im = Image.open(io.BytesIO(base64.b64decode(item))).convert("RGB")
            processed.append(im)
        model = model_data["model"]
        if model_data.get("is_siglip_auto"):
            processor = model_data["processor"]
            batch = []
            for im in processed:
                batch.append(im)
            with torch.no_grad():
                inputs = processor(images=batch, return_tensors="pt").to(self._device)
                out = model(**inputs)
                image_embeds = getattr(out, "image_embeds", None)
                if image_embeds is None:
                    raise ValueError("SigLIP AutoModel output missing image_embeds")
                image_embeds = torch.nn.functional.normalize(image_embeds, p=2, dim=1)
                return image_embeds.cpu().numpy().tolist()
        if model_data.get("is_open_clip"):
            processor = model_data["processor"]
            image_tensors = torch.stack([processor(p) for p in processed]).to(self._device)
            with torch.no_grad():
                feats = model.encode_image(image_tensors)
                feats /= feats.norm(dim=-1, keepdim=True)
            return feats.cpu().numpy().tolist()
        if hasattr(model, "encode"):
            return model.encode(processed, normalize_embeddings=True)  # type: ignore
        # AutoModel path (if added later)
        raise ValueError("Image embedding not supported for this model type")

    async def unload_model(self, model_name: str) -> bool:
        if model_name not in self._models:
            return False
        del self._models[model_name]
        if model_name in self._model_info:
            self._model_info[model_name].is_loaded = False
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        return True

    async def _ensure_memory_available(self):
        max_models = getattr(settings, 'max_models_in_memory', 8)
        while len(self._models) >= max_models:
            lru = next(iter(self._models))
            await self.unload_model(lru)

    def _update_last_used(self, model_name: str):
        if model_name in self._models:
            self._models.move_to_end(model_name)

    def list_models(self) -> List[ModelInfo]:
        return list(self._model_info.values())

    async def sync_state_to_db(self):
        for name, info in self._model_info.items():
            await self._persist_system_model(name, info.type, info.is_loaded)

    async def embed_text(self, text: str, model_name: str | None = None) -> List[float]:
        model_name = model_name or settings.text_model_name
        info = await self.load_model(model_name, self._available_models[model_name]["type"])  # ensure loaded
        emb = await self.get_embedding(model_name, text, info.type)
        return emb[0]

    async def embed_weighted_terms(self, weights: dict[str, float], model_name: str | None = None) -> List[float]:
        import numpy as np
        model_name = model_name or settings.text_model_name
        info = await self.load_model(model_name, self._available_models[model_name]["type"])  # ensure
        terms = list(weights.keys())
        embs = await self.get_embedding(model_name, terms, info.type)
        arr = np.array(embs, dtype=float)
        w = np.array([weights[t] for t in terms], dtype=float).reshape((-1, 1))
        agg = (arr * w).sum(axis=0)
        n = (agg ** 2).sum() ** 0.5
        if n > 0:
            agg /= n
        return agg.tolist()

    async def embed_image_url(self, image_url: str, model_name: str | None = None) -> List[float]:
        # Choose explicit model if provided, else reuse text (if flag) else default image model
        if model_name:
            chosen = model_name
        elif settings.use_text_model_for_images and settings.text_model_name in self._available_models:
            chosen = settings.text_model_name
        else:
            chosen = settings.image_model_name
        mtype = self.get_model_type(chosen)
        await self.load_model(chosen, mtype)
        emb = await self.get_embedding(chosen, image_url, ModelType.IMAGE)
        return emb[0]

    async def build_query_embedding(self, term_weights=None, weighted_texts=None, weighted_images=None, **kwargs) -> dict:
        import numpy as np
        components = []
        vectors = []
        weights = []
        
        text_model_override = kwargs.get("text_model_name") or kwargs.get("textModelName")
        image_model_override = kwargs.get("image_model_name") or kwargs.get("imageModelName")

        if term_weights:
            v = await self.embed_weighted_terms(term_weights, model_name=text_model_override)
            vectors.append(np.array(v, dtype=float))
            weights.append(1.0) # term aggregations are pre-weighted
            components.append({"type": "TERM_AGG", "count": len(term_weights), "weight": 1.0, "sample": v[:8]})

        if weighted_texts:
            text_list = list(weighted_texts.keys())
            text_embs = await self.get_embedding(text_model_override or settings.text_model_name, text_list, ModelType.TEXT)
            for i, t in enumerate(text_list):
                v = text_embs[i]
                w = weighted_texts[t]
                vectors.append(np.array(v, dtype=float))
                weights.append(w)
                components.append({"type": "TEXT", "key": t[:64], "weight": w, "sample": v[:8]})

        if weighted_images:
            image_list = list(weighted_images.keys())
            # Use image_model_override, fallback to text_model_override (for multimodal), then default
            image_model = image_model_override or text_model_override or settings.image_model_name
            image_embs = await self.get_embedding(image_model, image_list, ModelType.IMAGE)
            for i, u in enumerate(image_list):
                v = image_embs[i]
                w = weighted_images[u]
                vectors.append(np.array(v, dtype=float))
                weights.append(w)
                components.append({"type": "IMAGE", "key": u, "weight": w, "sample": v[:8]})

        if not vectors:
            raise ValueError("No inputs provided for building query embedding")

        strategy = kwargs.get("strategy", "WEIGHTED_SUM")
        
        # Convert to numpy arrays for vectorized operations
        vector_stack = np.stack(vectors)
        weight_arr = np.array(weights, dtype=float).reshape((-1, 1))

        if strategy == "MEAN":
            combined = np.average(vector_stack, axis=0, weights=weight_arr.flatten() if np.any(weight_arr != 1.0) else None)
        else: # WEIGHTED_SUM is default
            combined = (vector_stack * weight_arr).sum(axis=0)

        if kwargs.get("normalize", True):
            norm = np.linalg.norm(combined)
            if norm > 0:
                combined /= norm
        
        combined_list = combined.tolist()
        return {"vector": combined_list, "dimension": len(combined_list), "components": components, "strategy": strategy}


models_manager = ModelManager()
