from __future__ import annotations

from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from ..core.auth import get_current_user
from ..core.config import get_settings
from ..core.rate_limit import limiter
from ..services.activity_logs import log_user_activity
from ..services.supabase import rest_list

router = APIRouter(prefix="/assistant", tags=["assistant"])
_rate = get_settings().rate_limit_per_minute


class ChatMessage(BaseModel):
    role: str = Field(..., pattern="^(user|assistant|system)$")
    content: str = Field(..., min_length=1, max_length=10_000)


class ChatRequest(BaseModel):
    dataset_id: UUID | None = None
    message: str = Field(..., min_length=1, max_length=10_000)
    history: list[ChatMessage] = Field(default_factory=list, max_length=20)


class ChatResponse(BaseModel):
    reply: str


@router.post("/chat", response_model=ChatResponse)
@limiter.limit(_rate)
async def chat(
    request: Request,
    payload: ChatRequest,
    user=Depends(get_current_user),
) -> ChatResponse:
    settings = get_settings()
    if not settings.openai_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI assistant not configured. Set OPENAI_API_KEY on the API service.",
        )

    user_id = user["user_id"]
    dataset_snapshot: dict | None = None

    if payload.dataset_id:
        rows = await rest_list(
            "datasets",
            query=(
                f"dataset_id=eq.{payload.dataset_id}"
                f"&select=dataset_id,user_id,status,analysis_json,cleaned_params,cleaned_target_column,engineered_params,quick_evaluation_json"
            ),
        )
        if not rows:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")
        ds = rows[0]
        if str(ds["user_id"]) != str(user_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

        dataset_snapshot = {
            "dataset_id": str(payload.dataset_id),
            "status": ds.get("status"),
            "analysis": ds.get("analysis_json"),
            "cleaning": {
                "params": ds.get("cleaned_params"),
                "target_column": ds.get("cleaned_target_column"),
            },
            "feature_engineering": {"params": ds.get("engineered_params")},
            "quick_evaluation": ds.get("quick_evaluation_json"),
        }

    system_prompt = (
        "You are Acutize, an assistant for dataset preparation and model testing. "
        "Be concise, practical, and safe. If you don't have enough info, ask one clarifying question. "
        "When giving suggestions, prefer actionable steps and explain trade-offs."
    )

    context_block = ""
    if dataset_snapshot is not None:
        context_block = f"\n\nDATASET_SNAPSHOT_JSON:\n{dataset_snapshot}"

    messages = [{"role": "system", "content": system_prompt + context_block}]
    for m in payload.history[-20:]:
        messages.append({"role": m.role, "content": m.content})
    messages.append({"role": "user", "content": payload.message})

    url = settings.openai_base_url.rstrip("/") + "/chat/completions"
    headers = {"Authorization": f"Bearer {settings.openai_api_key}"}
    body = {
        "model": settings.openai_model,
        "messages": messages,
        "temperature": 0.2,
    }

    try:
        from ..core.http_client import HTTPClient
        client = HTTPClient.get_client()
        res = await client.post(url, headers=headers, json=body)
        if res.status_code >= 400:
            text = res.text
            raise HTTPException(status_code=502, detail=f"LLM error: {text[:500]}")
        data = res.json()
        reply = (
            ((data.get("choices") or [{}])[0].get("message") or {}).get("content")
            or "No reply generated."
        )
        await log_user_activity(
            user_id=str(user_id),
            action="assistant_chat_used",
            dataset_id=str(payload.dataset_id) if payload.dataset_id else None,
            metadata={"history_count": len(payload.history)},
        )
        return ChatResponse(reply=str(reply))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM request failed: {e}")

