import msgpack
from starlette.responses import Response


class MessagePackResponse(Response):
    media_type = "application/x-msgpack"

    def render(self, content: any) -> bytes:
        return msgpack.packb(content, use_bin_type=True)
