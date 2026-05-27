import json
import urllib.parse
from typing import Any

import httpx

from ..core.config import get_settings
from ..core.http_client import HTTPClient


def _supabase_headers() -> dict[str, str]:
    settings = get_settings()
    if not settings.supabase_service_role_key or not settings.supabase_url:
        raise RuntimeError("Supabase configuration missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.")
    
    api_key = settings.supabase_service_role_key.split('\n')[0].strip()
    return {
        "apikey": api_key,
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

def _clean_supabase_url() -> str:
    return get_settings().supabase_url.split('\n')[0].strip().rstrip('/')

async def rest_list(table: str, query: str) -> list[dict[str, Any]]:
    url = f"{_clean_supabase_url()}/rest/v1/{table}?{query}"
    client = HTTPClient.get_client()
    res = await client.get(url, headers=_supabase_headers())
    res.raise_for_status()
    return res.json()


async def rest_insert(table: str, payload: list[dict[str, Any]]) -> dict[str, Any]:
    url = f"{_clean_supabase_url()}/rest/v1/{table}"
    headers = _supabase_headers() | {"Prefer": "return=representation"}
    client = HTTPClient.get_client()
    res = await client.post(url, headers=headers, content=json.dumps(payload))
    res.raise_for_status()
    data = res.json()
    if not data:
        raise ValueError("Supabase insert returned empty response")
    return data[0]


async def rest_patch(table: str, where_query: str, payload: dict[str, Any]) -> dict[str, Any]:
    url = f"{_clean_supabase_url()}/rest/v1/{table}?{where_query}"
    headers = _supabase_headers() | {"Prefer": "return=representation"}
    client = HTTPClient.get_client()
    res = await client.patch(url, headers=headers, content=json.dumps(payload))
    res.raise_for_status()
    data = res.json()
    if not data:
        raise ValueError("Supabase patch returned empty response")
    return data[0]


async def rest_delete(table: str, where_query: str) -> None:
    url = f"{_clean_supabase_url()}/rest/v1/{table}?{where_query}"
    client = HTTPClient.get_client()
    res = await client.delete(url, headers=_supabase_headers())
    res.raise_for_status()


async def storage_list(bucket: str, prefix: str, *, limit: int = 1000, offset: int = 0) -> list[dict[str, Any]]:
    """
    Lists objects under a prefix. Returns objects with at least `name`.
    """
    url = f"{_clean_supabase_url()}/storage/v1/object/list/{bucket}"
    headers = _supabase_headers()
    payload = {"prefix": prefix, "limit": limit, "offset": offset}
    client = HTTPClient.get_client()
    res = await client.post(url, headers=headers, content=json.dumps(payload))
    res.raise_for_status()
    return res.json()


async def storage_download(bucket: str, object_path: str) -> bytes:
    encoded_path = urllib.parse.quote(object_path, safe="")
    url = f"{_clean_supabase_url()}/storage/v1/object/{bucket}/{encoded_path}"
    headers = _supabase_headers() | {"Accept": "*/*"}
    client = HTTPClient.get_client()
    res = await client.get(url, headers=headers)
    res.raise_for_status()
    return res.content


async def storage_remove(bucket: str, object_path: str) -> None:
    encoded_path = urllib.parse.quote(object_path, safe="")
    url = f"{_clean_supabase_url()}/storage/v1/object/{bucket}/{encoded_path}"
    headers = _supabase_headers() | {"Accept": "application/json"}
    client = HTTPClient.get_client()
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

    api_key = settings.supabase_service_role_key.split("\n")[0].strip()
    supabase_url = settings.supabase_url.split("\n")[0].strip().rstrip("/")
    encoded_path = urllib.parse.quote(object_path, safe="")
    url = f"{supabase_url}/storage/v1/object/{bucket}/{encoded_path}"
    headers = {
        "apikey": api_key,
        "Authorization": f"Bearer {api_key}",
        "Content-Type": content_type,
        "x-upsert": "true",
    }
    client = HTTPClient.get_client()
    res = await client.put(url, headers=headers, content=content)
    if res.status_code >= 400:
        raise RuntimeError(
            f"Supabase storage upload failed ({res.status_code}) for {bucket}/{object_path}: {res.text[:500]}"
        )
