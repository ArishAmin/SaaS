from __future__ import annotations

import asyncio
import os
import time
from collections import Counter
from dataclasses import dataclass
from typing import Any

import httpx


API_URL = os.getenv("LOADTEST_API_URL", "http://127.0.0.1:8001").rstrip("/")
TOKEN = os.getenv("LOADTEST_ACCESS_TOKEN", "")
DATASET_IDS = [x.strip() for x in os.getenv("LOADTEST_DATASET_IDS", "").split(",") if x.strip()]
CONCURRENCY = int(os.getenv("LOADTEST_CONCURRENCY", "10"))
ROUNDS = int(os.getenv("LOADTEST_ROUNDS", "3"))


@dataclass
class Result:
    name: str
    status: int
    ms: int
    ok: bool
    detail: str = ""


def headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": "application/json",
        "X-Idempotency-Key": f"loadtest-{time.time_ns()}",
    }


async def call(client: httpx.AsyncClient, method: str, path: str, name: str, body: dict[str, Any] | None = None) -> Result:
    started = time.perf_counter()
    try:
        resp = await client.request(method, f"{API_URL}{path}", headers=headers(), json=body, timeout=120)
        ms = int((time.perf_counter() - started) * 1000)
        return Result(name=name, status=resp.status_code, ms=ms, ok=resp.status_code < 400, detail=resp.text[:180])
    except Exception as exc:
        ms = int((time.perf_counter() - started) * 1000)
        return Result(name=name, status=0, ms=ms, ok=False, detail=str(exc))


async def run_dataset_flow(client: httpx.AsyncClient, dataset_id: str) -> list[Result]:
    results: list[Result] = []
    results.append(await call(client, "GET", "/profiles/me", "profile"))
    results.append(await call(client, "GET", "/billing/account", "billing_account"))
    results.append(await call(client, "GET", "/datasets", "list_datasets"))
    results.append(await call(client, "POST", f"/datasets/{dataset_id}/analysis", "get_analysis", {"mode": "instant"}))
    results.append(await call(client, "GET", f"/datasets/{dataset_id}/schema", "schema"))
    results.append(await call(client, "GET", f"/datasets/{dataset_id}/quick-evaluation", "quick_eval"))
    return results


async def worker(client: httpx.AsyncClient, idx: int) -> list[Result]:
    all_results: list[Result] = []
    for round_idx in range(ROUNDS):
        if DATASET_IDS:
            dataset_id = DATASET_IDS[(idx + round_idx) % len(DATASET_IDS)]
            all_results.extend(await run_dataset_flow(client, dataset_id))
        else:
            all_results.append(await call(client, "GET", "/profiles/me", "profile"))
            all_results.append(await call(client, "GET", "/billing/account", "billing_account"))
            all_results.append(await call(client, "GET", "/datasets", "list_datasets"))
    return all_results


async def main() -> None:
    if not TOKEN:
        raise SystemExit("Set LOADTEST_ACCESS_TOKEN to a Supabase user access token.")

    async with httpx.AsyncClient() as client:
        batches = await asyncio.gather(*(worker(client, i) for i in range(CONCURRENCY)))

    results = [item for batch in batches for item in batch]
    by_name = Counter(result.name for result in results)
    failures = [result for result in results if not result.ok]
    latencies = sorted(result.ms for result in results)
    p95 = latencies[int(len(latencies) * 0.95) - 1] if latencies else 0

    print(f"API: {API_URL}")
    print(f"Requests: {len(results)}")
    print(f"Concurrency: {CONCURRENCY}")
    print(f"Rounds: {ROUNDS}")
    print(f"P95 latency: {p95}ms")
    print(f"Failures: {len(failures)}")
    print(f"By endpoint: {dict(by_name)}")
    for failure in failures[:20]:
        print(f"FAIL {failure.name} status={failure.status} ms={failure.ms} detail={failure.detail}")


if __name__ == "__main__":
    asyncio.run(main())
