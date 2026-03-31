from slowapi import Limiter
from slowapi.util import get_remote_address
import socket
from urllib.parse import urlparse

from .config import get_settings

settings = get_settings()


def _redis_reachable(url: str, timeout_s: float = 1.0) -> bool:
    try:
        parsed = urlparse(url)
        host = parsed.hostname
        port = parsed.port or 6379
        if not host:
            return False
        with socket.create_connection((host, port), timeout=timeout_s):
            return True
    except Exception:
        return False


storage_uri = settings.redis_url if _redis_reachable(settings.redis_url) else "memory://"

limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=storage_uri,
)

