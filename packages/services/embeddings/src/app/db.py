from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from .settings import settings
import logging

_client: AsyncIOMotorClient | None = None


def get_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        uri = settings.build_mongo_uri()
        if not (uri.startswith("mongodb://") or uri.startswith("mongodb+srv://")):
            raise ValueError(f"Invalid MongoDB URI after build_mongo_uri(): {uri}")
        try:
            _client = AsyncIOMotorClient(uri)
        except Exception as e:
            logging.exception("Failed to create Mongo client with URI %s", uri)
            raise
    return _client


def get_db() -> AsyncIOMotorDatabase:
    return get_client()[settings.mongodb_db]
