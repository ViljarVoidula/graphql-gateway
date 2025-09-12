from __future__ import annotations
from enum import Enum
from pydantic import BaseModel
from typing import Optional


class ModelType(str, Enum):
    TEXT = "text"
    IMAGE = "image"
    MULTIMODAL = "multimodal"


class ModelInfo(BaseModel):
    name: str
    type: ModelType
    dimensions: int
    is_loaded: bool = False
    description: Optional[str] = None
