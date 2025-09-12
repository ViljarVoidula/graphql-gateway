from fastapi import FastAPI
from strawberry.fastapi import GraphQLRouter
from .graph.schema import schema
from .settings import settings
from .db import get_client
from .embeddings.model_manager import models_manager
from .middleware import MessagePackMiddleware

app = FastAPI(title="Embeddings Service", version="0.1.0")
app.add_middleware(MessagePackMiddleware)


@app.on_event("startup")
async def startup():
    # trigger client creation
    get_client()
    # preload default B model
    try:
        model_type = models_manager.get_model_type(settings.text_model_name)
        await models_manager.load_model(settings.text_model_name, model_type)
        await models_manager.sync_state_to_db()
    except Exception:
        # defer failure to first request rather than abort service
        import logging
        logging.exception("Failed to preload text model %s", settings.text_model_name)


@app.on_event("shutdown")
async def shutdown():
    get_client().close()


graphql_app = GraphQLRouter(schema)
app.include_router(graphql_app, prefix="/graphql")


@app.get("/healthz")
async def health():
    return {"status": "ok"}


@app.get("/info")
async def info():
    return {
        "service": "embeddings",
        "textModel": settings.text_model_name,
    "altLargeModel": settings.alt_large_text_model_name,
        "imageModel": f"{settings.image_model_name}:{settings.image_model_pretrained}",
    }
