import httpx
from ..settings import settings


async def push_index_config_to_search(application_id: str, config: dict):
    """Placeholder for integration with Rust search service.

    Once the search service exposes an endpoint (e.g., /internal/index/config), update this.
    """
    url = f"{settings.search_service_url.rstrip('/')}/internal/index/config/{application_id}"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(url, json=config)
    except Exception:
        # Log in real implementation; swallow for now to avoid failing primary flow
        pass
