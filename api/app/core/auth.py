import time
from dataclasses import dataclass
from typing import Any

import httpx
from fastapi import Depends, HTTPException, Request, status
from jose import jwt
from jose import jwk as jose_jwk

from .config import get_settings


@dataclass
class JWKSCache:
    keys: dict[str, Any]
    fetched_at: float


_jwks_cache: JWKSCache | None = None


async def _fetch_jwks(jwks_url: str) -> dict[str, Any]:
    settings = get_settings()
    headers = {"Accept": "application/json"}
    # Some Supabase projects require an API key even for JWKS endpoint.
    if settings.supabase_service_role_key:
        api_key = settings.supabase_service_role_key.split('\n')[0].strip()
        headers["apikey"] = api_key
        headers["Authorization"] = f"Bearer {api_key}"
    from .http_client import HTTPClient
    client = HTTPClient.get_client()
    res = await client.get(jwks_url, headers=headers)
    # Backward-compatibility fallback:
    # some older configs use /auth/v1/keys, while newer Supabase uses
    # /auth/v1/.well-known/jwks.json.
    if res.status_code == 404 and jwks_url.endswith("/auth/v1/keys"):
        fallback_url = jwks_url.replace("/auth/v1/keys", "/auth/v1/.well-known/jwks.json")
        res = await client.get(fallback_url, headers=headers)
    res.raise_for_status()
    return res.json()


async def _get_jwks() -> dict[str, Any]:
    global _jwks_cache
    settings = get_settings()
    
    supa_url = (settings.supabase_url or "").split('\n')[0].strip()
    jwks_url_setting = (settings.supabase_jwks_url or "").split('\n')[0].strip()
    
    if not supa_url and not jwks_url_setting:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "API is not configured for Supabase JWT verification. "
                "Set SUPABASE_URL (and SUPABASE_SERVICE_ROLE_KEY) in the API `api/.env`, "
                "then restart the server. JWKS defaults to YOUR_SUPABASE_URL/auth/v1/keys."
            ),
        )
    jwks_url = jwks_url_setting or f"{supa_url.rstrip('/')}/auth/v1/.well-known/jwks.json"

    now = time.time()
    if _jwks_cache and (now - _jwks_cache.fetched_at) < 3600:
        return _jwks_cache.keys

    jwks = await _fetch_jwks(jwks_url)
    _jwks_cache = JWKSCache(keys=jwks, fetched_at=now)
    return jwks


async def verify_supabase_jwt(token: str) -> dict[str, Any]:
    """
    Verifies a Supabase JWT using the project's JWKS.
    Returns decoded claims (including `sub` as the user id).
    """
    try:
        unverified = jwt.get_unverified_header(token)
        kid = unverified.get("kid")
        alg = str(unverified.get("alg") or "")
        if not kid:
            raise ValueError("Missing kid in JWT header")
        if not alg:
            raise ValueError("Missing alg in JWT header")
        if alg not in {"RS256", "ES256", "EdDSA"}:
            raise ValueError(f"Unsupported JWT alg: {alg}")

        jwks = await _get_jwks()
        keys = jwks.get("keys", [])
        key_for_kid = next((k for k in keys if k.get("kid") == kid), None)
        if not key_for_kid:
            raise ValueError("No matching JWKS key for kid")

        jwk_obj = jose_jwk.construct(key_for_kid)
        pem = jwk_obj.to_pem().decode("utf-8")

        decoded = jwt.decode(
            token,
            pem,
            algorithms=[alg],
            options={"verify_aud": False},  # Supabase aud differs by token type
        )
        return decoded
    except HTTPException:
        # e.g. missing Supabase URL / JWKS misconfiguration — do not mask as bad JWT
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {str(e)}",
        ) from e


async def get_current_user(request: Request) -> dict[str, Any]:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Bearer token")

    token = auth_header.split(" ", 1)[1].strip()
    claims = await verify_supabase_jwt(token)

    user_id = claims.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing sub")

    return {"user_id": user_id, "claims": claims}

