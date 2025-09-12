from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response, StreamingResponse
from .msgpack_response import MessagePackResponse
import json


class MessagePackMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        if request.headers.get("x-msgpack-enabled") == "1" and isinstance(response, StreamingResponse):
            # Read the streaming content
            body_bytes = b""
            async for chunk in response.body_iterator:
                body_bytes += chunk
            
            try:
                # Decode from UTF-8, parse JSON, then encode to MessagePack
                data = json.loads(body_bytes.decode("utf-8"))
                return MessagePackResponse(data)
            except (json.JSONDecodeError, UnicodeDecodeError):
                # If it's not valid JSON or can't be decoded, return the original response
                return response
        
        return response
