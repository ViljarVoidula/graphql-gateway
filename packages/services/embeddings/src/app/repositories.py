from __future__ import annotations
from typing import Optional
from .db import get_db
from .models import ApplicationIndexConfig, SystemModel
from datetime import datetime


class IndexConfigRepository:
    COLLECTION = "index_configs"

    @staticmethod
    async def upsert(config: ApplicationIndexConfig) -> ApplicationIndexConfig:
        db = get_db()
        config.updatedAt = datetime.utcnow()
        # Ensure activeModel fallback if still None (e.g., env not set at model instantiation)
        if config.activeModel is None:
            import os
            config.activeModel = os.getenv("TEXT_MODEL_NAME") or "Marqo/marqo-ecommerce-embeddings-B"
        payload = config.model_dump(by_alias=True)
        # Drop placeholder _id so MongoDB can auto-generate one on insert
        if payload.get("_id") is None:
            payload.pop("_id", None)
        await db[IndexConfigRepository.COLLECTION].update_one(
            {"applicationId": config.applicationId},
            {"$set": payload},
            upsert=True,
        )
        doc = await db[IndexConfigRepository.COLLECTION].find_one({"applicationId": config.applicationId})
        return ApplicationIndexConfig(**doc)  # type: ignore

    @staticmethod
    async def get_by_application(application_id: str) -> Optional[ApplicationIndexConfig]:
        db = get_db()
        doc = await db[IndexConfigRepository.COLLECTION].find_one({"applicationId": application_id})
        if doc:
            # legacy cleanup of deprecated fields
            doc.pop("termWeights", None)
            doc.pop("indexSchema", None)
        return ApplicationIndexConfig(**doc) if doc else None  # type: ignore

    @staticmethod
    async def find(application_id: str | None = None, tenant_id: str | None = None, cluster_id: str | None = None) -> list[ApplicationIndexConfig]:
        db = get_db()
        query: dict = {}
        if application_id:
            query["applicationId"] = application_id
        if tenant_id:
            query["tenantId"] = tenant_id
        if cluster_id:
            query["clusterId"] = cluster_id
        cursor = db[IndexConfigRepository.COLLECTION].find(query)
        results: list[ApplicationIndexConfig] = []
        async for d in cursor:
            d.pop("termWeights", None)
            d.pop("indexSchema", None)
            results.append(ApplicationIndexConfig(**d))  # type: ignore
        return results


class SystemModelRepository:
    COLLECTION = "system_models"

    @staticmethod
    async def list() -> list[SystemModel]:
        db = get_db()
        cursor = db[SystemModelRepository.COLLECTION].find()
        return [SystemModel(**d) async for d in cursor]  # type: ignore

    @staticmethod
    async def get_by_name(name: str) -> Optional[SystemModel]:
        db = get_db()
        doc = await db[SystemModelRepository.COLLECTION].find_one({"name": name})
        return SystemModel(**doc) if doc else None  # type: ignore

    @staticmethod
    async def save(model: SystemModel) -> SystemModel:
        db = get_db()
        model.updatedAt = datetime.utcnow()
        payload = model.model_dump(by_alias=True)
        # Remove None _id to avoid duplicate key error on upsert
        if payload.get("_id") is None:
            payload.pop("_id", None)
        await db[SystemModelRepository.COLLECTION].update_one(
            {"name": model.name}, {"$set": payload}, upsert=True
        )
        doc = await db[SystemModelRepository.COLLECTION].find_one({"name": model.name})
        return SystemModel(**doc)  # type: ignore

    @staticmethod
    async def list_active(model_type: str | None = None) -> list[SystemModel]:
        """Return active models, optionally filtered by type."""
        db = get_db()
        query: dict = {"active": True}
        if model_type:
            query["type"] = model_type
        cursor = db[SystemModelRepository.COLLECTION].find(query)
        return [SystemModel(**d) async for d in cursor]  # type: ignore

    @staticmethod
    async def ensure_active_if_none(model: SystemModel) -> SystemModel:
        """If there is no active model for this type, mark the provided one active.

        This helps first-loaded models become automatically 'active' for convenience.
        """
        db = get_db()
        existing_active = await db[SystemModelRepository.COLLECTION].count_documents({
            "type": model.type,
            "active": True,
        })
        if existing_active == 0:
            await db[SystemModelRepository.COLLECTION].update_one(
                {"name": model.name}, {"$set": {"active": True}}, upsert=True
            )
            doc = await db[SystemModelRepository.COLLECTION].find_one({"name": model.name})
            return SystemModel(**doc)  # type: ignore
        return model

    @staticmethod
    async def set_active(model_name: str) -> SystemModel:
        db = get_db()
        await db[SystemModelRepository.COLLECTION].update_many({}, {"$set": {"active": False}})
        await db[SystemModelRepository.COLLECTION].update_one({"name": model_name}, {"$set": {"active": True}})
        doc = await db[SystemModelRepository.COLLECTION].find_one({"name": model_name})
        return SystemModel(**doc)  # type: ignore
