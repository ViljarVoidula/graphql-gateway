from __future__ import annotations
from pydantic import BaseModel, Field
from typing import Optional, List, Any
from datetime import datetime
from bson import ObjectId


class PyObjectId(ObjectId):
    @classmethod
    def __get_validators__(cls):
        yield cls.validate

    @classmethod
    def validate(cls, v, info=None):  # type: ignore
        # Accept existing ObjectId
        if isinstance(v, ObjectId):
            return v
        # Ignore None (let optional field handle)
        if v is None:
            return v
        # Convert from string
        return ObjectId(str(v))


class VectorFieldConfig(BaseModel):
    name: str
    dimensions: int
    weight: float = 1.0


class ApplicationIndexConfig(BaseModel):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    applicationId: str
    tenantId: Optional[str] = None
    clusterId: str
    # Default to TEXT_MODEL_NAME env var (or built-in fallback) if present when instance created
    activeModel: Optional[str] = Field(
        default_factory=lambda: (__import__("os").getenv("TEXT_MODEL_NAME") or "Marqo/marqo-ecommerce-embeddings-B")
    )  # name of active model (text) for this index config
    # Use internal attribute schemaText with external alias "schema" to avoid shadowing BaseModel.schema()
    schemaText: Optional[str] = Field(default=None, alias="schema")  # stored Vespa schema (product.sd) as string
    servicesXml: Optional[str] = None  # backup of generated services.xml
    hostsXml: Optional[str] = None  # backup of generated hosts.xml
    vectorFields: List[VectorFieldConfig]
    # List of document field paths whose values are extracted and concatenated to build autocomplete suggestions
    autocompletePaths: List[str] = Field(default_factory=list)
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        arbitrary_types_allowed = True
        populate_by_name = True


class SystemModel(BaseModel):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    name: str
    type: str  # text | image
    active: bool = False
    loaded: bool = False
    version: Optional[str] = None
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        arbitrary_types_allowed = True
        populate_by_name = True
