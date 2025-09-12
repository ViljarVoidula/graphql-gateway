from pydantic_settings import BaseSettings
from pydantic import Field
from pathlib import Path
import os
import logging


class Settings(BaseSettings):
    mongodb_uri: str = Field(default="mongodb://localhost:27017", alias="MONGODB_URI")
    mongodb_db: str = Field(default="embeddings", alias="MONGODB_DB")
    search_service_url: str = Field(default="http://localhost:8080", alias="SEARCH_SERVICE_URL")
    models_cache_dir: str = Field(default=".models-cache", alias="MODELS_CACHE_DIR")
    text_model_name: str = Field(default="Marqo/marqo-ecommerce-embeddings-B", alias="TEXT_MODEL_NAME")
    alt_large_text_model_name: str | None = Field(default="Marqo/marqo-ecommerce-embeddings-L", alias="ALT_LARGE_TEXT_MODEL_NAME")
    image_model_name: str = Field(default="ViT-B-32", alias="IMAGE_MODEL_NAME")
    image_model_pretrained: str = Field(default="laion2b_s34b_b79k", alias="IMAGE_MODEL_PRETRAINED")
    use_text_model_for_images: bool = Field(default=False, alias="USE_TEXT_MODEL_FOR_IMAGES")
    device: str = Field(default="cpu", alias="DEVICE")  # cpu | cuda | cuda:0 etc.
    huggingface_token: str | None = Field(default=None, alias="HUGGINGFACE_TOKEN")
    hf_home: str | None = Field(default=None, alias="HF_HOME")
    default_query_strategy: str = Field(default="WEIGHTED_SUM", alias="DEFAULT_QUERY_STRATEGY")
    enable_query_normalization: bool = Field(default=True, alias="ENABLE_QUERY_NORMALIZATION")
    mongodb_username: str | None = Field(default=None, alias="MONGODB_USERNAME")
    mongodb_password: str | None = Field(default=None, alias="MONGODB_PASSWORD")
    mongodb_auth_source: str | None = Field(default=None, alias="MONGODB_AUTH_SOURCE")

    class Config:
        env_file = ".env"
        case_sensitive = False

    @property
    def models_path(self) -> Path:
        p = Path(self.models_cache_dir)
        p.mkdir(parents=True, exist_ok=True)
        return p

    def apply_side_effects(self):
        # Sanitize accidentally duplicated env assignment like 'MONGODB_URI=MONGODB_URI=mongodb://...'
        if self.mongodb_uri.startswith("MONGODB_URI="):
            original = self.mongodb_uri
            self.mongodb_uri = self.mongodb_uri.split("MONGODB_URI=", 1)[1]
            logging.warning(f"Sanitized malformed MONGODB_URI value: '{original}' -> '{self.mongodb_uri}'")
        # Validate scheme early
        if not (self.mongodb_uri.startswith("mongodb://") or self.mongodb_uri.startswith("mongodb+srv://")):
            logging.error(
                "Invalid MONGODB_URI scheme. Must start with 'mongodb://' or 'mongodb+srv://'. Got: %s",
                self.mongodb_uri,
            )
        # Configure huggingface cache/token if provided
        if self.hf_home:
            os.environ.setdefault("HF_HOME", self.hf_home)
            Path(self.hf_home).mkdir(parents=True, exist_ok=True)
        if self.huggingface_token:
            os.environ.setdefault("HUGGINGFACE_HUB_TOKEN", self.huggingface_token)
        # Mirror cache dir to env vars commonly respected by libs
        # TRANSFORMERS_CACHE deprecated; rely on HF_HOME and model cache dir
        os.environ.setdefault("TORCH_HOME", str(self.models_path))

    def build_mongo_uri(self) -> str:
        if self.mongodb_username and self.mongodb_password and self.mongodb_uri.startswith("mongodb://"):
            after = self.mongodb_uri.split("//", 1)[1]
            if "@" not in after:
                prefix, rest = self.mongodb_uri.split("//", 1)
                auth_src = f"?authSource={self.mongodb_auth_source}" if self.mongodb_auth_source else ""
                return f"{prefix}//{self.mongodb_username}:{self.mongodb_password}@{rest}{auth_src}"
        return self.mongodb_uri


settings = Settings()  # type: ignore
settings.apply_side_effects()
