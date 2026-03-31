import json
import urllib.parse
from typing import Any

import httpx

from ..core.config import get_settings


def _supabase_headers() -> dict[str, str]:
    settings = get_settings()
    if not settings.supabase_service_role_key or not settings.supabase_url:
        raise RuntimeError("Supabase configuration missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.")
    return {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


async def rest_list(table: str, query: str) -> list[dict[str, Any]]:
    settings = get_settings()
    url = f"{settings.supabase_url.rstrip('/')}/rest/v1/{table}?{query}"
    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.get(url, headers=_supabase_headers())
        res.raise_for_status()
        return res.json()


async def rest_insert(table: str, payload: list[dict[str, Any]]) -> dict[str, Any]:
    settings = get_settings()
    url = f"{settings.supabase_url.rstrip('/')}/rest/v1/{table}"
    headers = _supabase_headers() | {"Prefer": "return=representation"}
    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(url, headers=headers, content=json.dumps(payload))
        res.raise_for_status()
        data = res.json()
        if not data:
            raise ValueError("Supabase insert returned empty response")
        return data[0]


async def rest_patch(table: str, where_query: str, payload: dict[str, Any]) -> dict[str, Any]:
    settings = get_settings()
    url = f"{settings.supabase_url.rstrip('/')}/rest/v1/{table}?{where_query}"
    headers = _supabase_headers() | {"Prefer": "return=representation"}
    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.patch(url, headers=headers, content=json.dumps(payload))
        res.raise_for_status()
        data = res.json()
        if not data:
            raise ValueError("Supabase patch returned empty response")
        return data[0]


async def rest_delete(table: str, where_query: str) -> None:
    settings = get_settings()
    url = f"{settings.supabase_url.rstrip('/')}/rest/v1/{table}?{where_query}"
    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.delete(url, headers=_supabase_headers())
        res.raise_for_status()


async def storage_list(bucket: str, prefix: str, *, limit: int = 1000, offset: int = 0) -> list[dict[str, Any]]:
    """
    Lists objects under a prefix. Returns objects with at least `name`.
    """
    settings = get_settings()
    url = f"{settings.supabase_url.rstrip('/')}/storage/v1/object/list/{bucket}"
    headers = _supabase_headers()
    payload = {"prefix": prefix, "limit": limit, "offset": offset}
    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(url, headers=headers, content=json.dumps(payload))
        res.raise_for_status()
        return res.json()


async def storage_download(bucket: str, object_path: str) -> bytes:
    settings = get_settings()
    encoded_path = urllib.parse.quote(object_path, safe="")
    url = f"{settings.supabase_url.rstrip('/')}/storage/v1/object/{bucket}/{encoded_path}"
    headers = _supabase_headers() | {"Accept": "*/*"}
    async with httpx.AsyncClient(timeout=60) as client:
        res = await client.get(url, headers=headers)
        res.raise_for_status()
        return res.content


async def storage_remove(bucket: str, object_path: str) -> None:
    settings = get_settings()
    encoded_path = urllib.parse.quote(object_path, safe="")
    url = f"{settings.supabase_url.rstrip('/')}/storage/v1/object/{bucket}/{encoded_path}"
    headers = _supabase_headers() | {"Accept": "application/json"}
    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.delete(url, headers=headers)
        # Best-effort cleanup: treat not-found or invalid-path style responses as success.
        if res.status_code not in (200, 204, 400, 404):
            res.raise_for_status()


async def storage_upload(
    bucket: str,
    object_path: str,
    *,
    content: bytes,
    content_type: str,
) -> None:
    settings = get_settings()
    if not settings.supabase_service_role_key or not settings.supabase_url:
        raise RuntimeError("Supabase configuration missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.")

    encoded_path = urllib.parse.quote(object_path, safe="")
    url = f"{settings.supabase_url.rstrip('/')}/storage/v1/object/{bucket}/{encoded_path}"
    headers = {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "Content-Type": content_type,
    }
    async with httpx.AsyncClient(timeout=120) as client:
        res = await client.put(url, headers=headers, content=content)
        res.raise_for_status()

