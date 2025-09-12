from __future__ import annotations
import strawberry
from strawberry.scalars import JSON
from typing import List, Optional
from datetime import datetime

from ..repositories import IndexConfigRepository, SystemModelRepository
from ..models import ApplicationIndexConfig, VectorFieldConfig, SystemModel
from ..embeddings.model_manager import models_manager
from ..integration.search import push_index_config_to_search


@strawberry.type
class VectorFieldType:
    name: str
    dimensions: int
    weight: float


@strawberry.type
class IndexConfigType:
    id: strawberry.ID
    applicationId: str
    tenantId: Optional[str]
    clusterId: str
    activeModel: Optional[str]
    schema: Optional[str]
    servicesXml: Optional[str]
    hostsXml: Optional[str]
    vectorFields: List[VectorFieldType]
    createdAt: datetime
    updatedAt: datetime


@strawberry.type
class SystemModelType:
    id: strawberry.ID
    name: str
    type: str
    active: bool
    loaded: bool
    version: Optional[str]
    createdAt: datetime
    updatedAt: datetime


@strawberry.type
class EmbeddingVector:
    dimension: int
    values: list[float]

    @strawberry.field
    def valuesSample(self) -> list[float]:  # small preview
        return self.values[:8]


@strawberry.input
class VectorFieldInput:
    name: str
    dimensions: int
    weight: float = 1.0


@strawberry.input
class TermWeightInput:
    term: str
    weight: float


@strawberry.input
class QueryEmbeddingInput:
    terms: Optional[List[TermWeightInput]] = None
    weightedTexts: Optional[List[WeightedTextInput]] = None
    weightedImages: Optional[List[WeightedImageInput]] = None
    textModelName: Optional[str] = None
    imageModelName: Optional[str] = None
    strategy: str = "WEIGHTED_SUM"  # or MEAN
    normalize: bool = True


@strawberry.type
class QueryEmbeddingComponent:
    type: str
    weight: float
    key: Optional[str] = None
    count: Optional[int] = None
    sample: Optional[List[float]] = None


@strawberry.type
class QueryEmbeddingResult:
    dimension: int
    vector: List[float]
    strategy: str
    components: List[QueryEmbeddingComponent]

    @strawberry.field
    def valuesSample(self) -> List[float]:
        return self.vector[:8]


@strawberry.input
class UpsertIndexConfigInput:
    applicationId: str
    tenantId: Optional[str] = None
    clusterId: str
    activeModel: Optional[str] = None
    schema: Optional[str] = None
    servicesXml: Optional[str] = None
    hostsXml: Optional[str] = None
    vectorFields: List[VectorFieldInput]


@strawberry.input
class WeightedTextInput:
    text: str
    weight: float = 1.0


@strawberry.input
class WeightedImageInput:
    imageUrl: str
    weight: float = 1.0


def _to_type(cfg: ApplicationIndexConfig) -> IndexConfigType:
    return IndexConfigType(
        id=str(cfg.id),
        applicationId=cfg.applicationId,
        tenantId=cfg.tenantId,
        clusterId=cfg.clusterId,
        activeModel=cfg.activeModel,
    schema=cfg.schemaText,
    servicesXml=cfg.servicesXml,
    hostsXml=cfg.hostsXml,
        vectorFields=[VectorFieldType(**vf.model_dump()) for vf in cfg.vectorFields],
        createdAt=cfg.createdAt,
        updatedAt=cfg.updatedAt,
    )


def _model_to_type(m: SystemModel) -> SystemModelType:
    return SystemModelType(
        id=str(m.id),
        name=m.name,
        type=m.type,
        active=m.active,
        loaded=m.loaded,
        version=m.version,
        createdAt=m.createdAt,
        updatedAt=m.updatedAt,
    )


@strawberry.type
class Query:
    @strawberry.field
    async def indexConfig(self, applicationId: str) -> Optional[IndexConfigType]:
        cfg = await IndexConfigRepository.get_by_application(applicationId)
        return _to_type(cfg) if cfg else None

    @strawberry.field
    async def indexConfigs(self, applicationId: Optional[str] = None, tenantId: Optional[str] = None, clusterId: Optional[str] = None) -> List[IndexConfigType]:
        results = await IndexConfigRepository.find(application_id=applicationId, tenant_id=tenantId, cluster_id=clusterId)
        return [_to_type(r) for r in results]

    @strawberry.field
    async def models(self) -> List[SystemModelType]:
        models = await SystemModelRepository.list()
        return [_model_to_type(m) for m in models]

    @strawberry.field
    async def textEmbedding(self, text: str, modelName: Optional[str] = None) -> EmbeddingVector:
        vec = await models_manager.embed_text(text, model_name=modelName)
        return EmbeddingVector(dimension=len(vec), values=vec)

    @strawberry.field
    async def weightedQueryEmbedding(self, weights: List[TermWeightInput], modelName: Optional[str] = None) -> EmbeddingVector:
        weights_dict = {w.term: w.weight for w in weights}
        vec = await models_manager.embed_weighted_terms(weights_dict, model_name=modelName)
        return EmbeddingVector(dimension=len(vec), values=vec)

    @strawberry.field
    async def weightedQueryEmbeddingFromMap(self, weightsMap: JSON, modelName: Optional[str] = None) -> EmbeddingVector:
        # Expect weightsMap as { term: weight }
        if not isinstance(weightsMap, dict):
            raise ValueError("weightsMap must be an object { term: weight }")
        vec = await models_manager.embed_weighted_terms({str(k): float(v) for k, v in weightsMap.items()}, model_name=modelName)
        return EmbeddingVector(dimension=len(vec), values=vec)


@strawberry.type
class Mutation:
    @strawberry.mutation
    async def upsertIndexConfig(self, input: UpsertIndexConfigInput) -> IndexConfigType:
        cfg_kwargs = dict(
            applicationId=input.applicationId,
            tenantId=input.tenantId,
            clusterId=input.clusterId,
            schemaText=input.schema,
            servicesXml=input.servicesXml,
            hostsXml=input.hostsXml,
            vectorFields=[VectorFieldConfig(**vf.__dict__) for vf in input.vectorFields],
        )
        # Only set activeModel explicitly if provided; else allow model default_factory to populate
        if input.activeModel is not None:
            cfg_kwargs["activeModel"] = input.activeModel
        cfg = ApplicationIndexConfig(**cfg_kwargs)
        saved = await IndexConfigRepository.upsert(cfg)
        await push_index_config_to_search(saved.applicationId, saved.model_dump(by_alias=True))
        return _to_type(saved)

    @strawberry.mutation
    async def loadModel(self, name: str, type: str = "text") -> SystemModelType:
        if type == "text":
            await models_manager.load_text_model(name)
        else:
            await models_manager.load_image_model(name, "laion2b_s34b_b79k")
        m = await SystemModelRepository.get_by_name(name if type == "text" else f"{name}:laion2b_s34b_b79k")
        return _model_to_type(m)  # type: ignore

    @strawberry.mutation
    async def loadModelAdvanced(self, name: str, type: str = "text", activate: bool = False) -> SystemModelType:
        if type == "text":
            await models_manager.load_text_model(name)
            key = name
        else:
            # default pretrained backbone aligning with existing loadModel
            pretrained = "laion2b_s34b_b79k"
            await models_manager.load_image_model(name, pretrained)
            key = f"{name}:{pretrained}"
        if activate:
            await SystemModelRepository.set_active(key)
        m = await SystemModelRepository.get_by_name(key)
        return _model_to_type(m)  # type: ignore

    @strawberry.mutation
    async def setActiveModel(self, name: str) -> SystemModelType:
        m = await SystemModelRepository.set_active(name)
        return _model_to_type(m)

    @strawberry.mutation
    async def imageUrlEmbedding(self, imageUrl: str, modelName: Optional[str] = None) -> EmbeddingVector:
        vec = await models_manager.embed_image_url(imageUrl, model_name=modelName)
        return EmbeddingVector(dimension=len(vec), values=vec)

    @strawberry.mutation
    async def buildQueryEmbedding(self, input: QueryEmbeddingInput) -> QueryEmbeddingResult:
        term_weights = {t.term: t.weight for t in (input.terms or [])} if input.terms else None
        
        weighted_texts = {t.text: t.weight for t in (input.weightedTexts or [])} if input.weightedTexts else None
        
        weighted_images = {i.imageUrl: i.weight for i in (input.weightedImages or [])} if input.weightedImages else None

        result = await models_manager.build_query_embedding(
            term_weights=term_weights,
            weighted_texts=weighted_texts,
            weighted_images=weighted_images,
            text_model_name=input.textModelName,
            image_model_name=input.imageModelName,
            strategy=input.strategy,
            normalize=input.normalize,
        )
        components = [
            QueryEmbeddingComponent(
                type=c.get("type"),
                weight=c.get("weight", 1.0),
                key=c.get("key"),
                count=c.get("count"),
                sample=c.get("sample"),
            )
            for c in result["components"]
        ]
        return QueryEmbeddingResult(
            dimension=result["dimension"],
            vector=result["vector"],
            strategy=result["strategy"],
            components=components,
        )


schema = strawberry.Schema(query=Query, mutation=Mutation)
