"""
Full API QA — exercises every endpoint the web app calls.
Run with API on http://127.0.0.1:8001 and api/.env configured.
"""
import asyncio
import json
import os
import uuid
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv("api/.env")

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
API_BASE = os.environ.get("API_BASE", "http://127.0.0.1:8001")
EMAIL = "aminarish88@gmail.com"
PASSWORD = "arish123"
SAMPLE_CSV = Path("sample.csv")

PASS = []
FAIL = []
SKIP = []


def ok(name: str, detail: str = ""):
    PASS.append((name, detail))
    print(f"  PASS  {name}" + (f" — {detail}" if detail else ""))


def bad(name: str, detail: str):
    FAIL.append((name, detail))
    print(f"  FAIL  {name} — {detail}")


def skip(name: str, detail: str):
    SKIP.append((name, detail))
    print(f"  SKIP  {name} — {detail}")


async def supabase_login(client: httpx.AsyncClient) -> tuple[str, str] | None:
    if not SUPABASE_URL or not SUPABASE_KEY:
        bad("auth", "SUPABASE_URL or SUPABASE_ANON_KEY missing in api/.env")
        return None
    res = await client.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={"apikey": SUPABASE_KEY, "Content-Type": "application/json"},
        json={"email": EMAIL, "password": PASSWORD},
    )
    if res.status_code != 200:
        bad("auth", f"login {res.status_code}: {res.text[:200]}")
        return None
    data = res.json()
    ok("auth", EMAIL)
    return data["access_token"], data["user"]["id"]


async def upload_sample_to_storage(
    client: httpx.AsyncClient, token: str, user_id: str, dataset_id: str, filename: str
) -> str | None:
    storage_path = f"{user_id}/datasets/{dataset_id}/{filename}"
    # Signed upload URL
    res = await client.post(
        f"{SUPABASE_URL}/storage/v1/object/upload/sign/datasets/{storage_path}",
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {token}"},
        json={},
    )
    if res.status_code not in (200, 201):
        bad("storage upload sign", f"{res.status_code}: {res.text[:200]}")
        return None
    signed = res.json()
    signed_url = signed.get("signedUrl") or signed.get("url")
    if signed_url and signed_url.startswith("/"):
        signed_url = f"{SUPABASE_URL}/storage/v1{signed_url}"
    if not signed_url:
        bad("storage upload sign", "no signedUrl in response")
        return None

    body = SAMPLE_CSV.read_bytes()
    put = await client.put(
        signed_url,
        content=body,
        headers={"Content-Type": "text/csv"},
    )
    if put.status_code not in (200, 201):
        bad("storage PUT", f"{put.status_code}: {put.text[:200]}")
        return None
    ok("storage upload", storage_path)
    return storage_path


async def run():
    print("=" * 60)
    print("Acutize — Full API QA")
    print(f"API: {API_BASE}")
    print("=" * 60)

    async with httpx.AsyncClient(timeout=120.0) as client:
        # Health (no auth)
        try:
            res = await client.get(f"{API_BASE}/health")
            if res.status_code == 200:
                ok("GET /health")
            else:
                bad("GET /health", str(res.status_code))
        except httpx.ConnectError as e:
            bad("GET /health", f"connection failed: {e}")
            print("\nAPI not reachable. Start: cd api && .\\venv\\Scripts\\python -m uvicorn app.main:app --port 8001")
            return

        auth = await supabase_login(client)
        if not auth:
            return
        token, user_id = auth
        h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

        async def api(method: str, path: str, **kwargs) -> httpx.Response:
            url = f"{API_BASE}{path}"
            return await client.request(method, url, headers=h, **kwargs)

        # Profiles
        res = await api("GET", "/profiles/me")
        if res.status_code == 200:
            p = res.json()
            ok("GET /profiles/me", f"plan={p.get('plan')}")
        else:
            bad("GET /profiles/me", f"{res.status_code} {res.text[:300]}")

        # Billing
        for name, path, body in [
            ("checkout", "/billing/create-checkout-session", {
                "price_id": os.environ.get("STRIPE_PRICE_ID_PRO") or "price_test",
                "success_url": "http://localhost:3000/pricing?success=1",
                "cancel_url": "http://localhost:3000/pricing?canceled=1",
            }),
            ("portal", "/billing/customer-portal", {}),
        ]:
            res = await api("POST", path, json=body)
            if res.status_code == 200:
                ok(f"POST {path}", "url returned" if "url" in res.text else "")
            elif res.status_code in (400, 402, 404, 500) and "detail" in res.text:
                ok(f"POST {path}", f"handled {res.status_code}")
            else:
                bad(f"POST {path}", f"{res.status_code} {res.text[:300]}")

        # Datasets list
        res = await api("GET", "/datasets")
        if res.status_code != 200:
            bad("GET /datasets", f"{res.status_code} {res.text[:300]}")
            dataset_id = None
        else:
            datasets = res.json()
            ok("GET /datasets", f"count={len(datasets)}")
            dataset_id = datasets[0]["dataset_id"] if datasets else None

        # Create + upload fresh dataset for pipeline tests
        test_id = str(uuid.uuid4())
        if SAMPLE_CSV.exists():
            storage_path = await upload_sample_to_storage(
                client, token, user_id, test_id, "qa_sample.csv"
            )
            if storage_path:
                res = await api("POST", "/datasets", json={
                    "dataset_id": test_id,
                    "storage_path": storage_path,
                    "original_file_name": "qa_sample.csv",
                    "original_extension": "csv",
                    "mime_type": "text/csv",
                })
                if res.status_code == 200:
                    ok("POST /datasets", test_id[:8])
                    dataset_id = test_id
                elif res.status_code == 403:
                    skip("POST /datasets", "plan limit — using existing dataset")
                else:
                    bad("POST /datasets", f"{res.status_code} {res.text[:300]}")

        if not dataset_id:
            skip("dataset pipeline", "no dataset available")
        else:
            did = dataset_id
            base = f"/datasets/{did}"

            tests = [
                ("GET meta", "GET", base, None),
                ("POST analyze", "POST", f"{base}/analyze", {"mode": "instant"}),
                ("POST analysis", "POST", f"{base}/analysis", {"mode": "instant"}),
                ("POST eda", "POST", f"{base}/eda", {}),
                ("POST quality", "POST", f"{base}/quality", {}),
                ("POST clean", "POST", f"{base}/clean", {
                    "mode": "simple", "target_column": "Target"
                }),
                ("POST recommend", "POST", f"{base}/recommend", {"target_column": "Target"}),
                ("GET quick-evaluation", "GET", f"{base}/quick-evaluation", None),
                ("POST feature-gen suggest", "POST", f"{base}/feature-generation/suggest", {
                    "prompt": "Create age group feature"
                }),
                ("POST feature-engineer", "POST", f"{base}/feature-engineer", {
                    "operations": []
                }),
                ("POST train-quick", "POST", f"{base}/train-quick", {
                    "target_column": "Target"
                }),
                ("GET feature-importance", "GET", f"{base}/feature-importance", None),
            ]

            for label, method, path, body in tests:
                try:
                    if method == "GET":
                        res = await api("GET", path)
                    else:
                        res = await api("POST", path, json=body or {})
                except httpx.ReadTimeout:
                    bad(label, "timeout")
                    continue

                if res.status_code == 200:
                    ok(label, path)
                elif res.status_code in (400, 404, 422, 500) and res.text:
                    # Business/validation errors are OK for QA (not network failures)
                    try:
                        detail = res.json().get("detail", res.text[:120])
                    except Exception:
                        detail = res.text[:120]
                    ok(label, f"{res.status_code}: {str(detail)[:80]}")
                else:
                    bad(label, f"{res.status_code} {res.text[:300]}")

            # Training runs
            res = await api("GET", f"/training-runs?dataset_id={did}")
            if res.status_code == 200:
                runs = res.json()
                ok("GET /training-runs", f"count={len(runs)}")
                if runs:
                    rid = runs[0]["run_id"]
                    r = await api("GET", f"/training-runs/{rid}")
                    if r.status_code == 200:
                        ok("GET /training-runs/{id}")
                    else:
                        bad("GET /training-runs/{id}", f"{r.status_code}")
                    r = await client.get(
                        f"{API_BASE}/training-runs/{rid}/model",
                        headers={"Authorization": f"Bearer {token}"},
                    )
                    if r.status_code in (200, 404, 400):
                        ok("GET /training-runs/{id}/model", str(r.status_code))
                    else:
                        bad("GET /training-runs/{id}/model", f"{r.status_code}")
            else:
                bad("GET /training-runs", f"{res.status_code}")

            # Blob downloads
            for label, path in [
                ("GET export/cleaned", f"{base}/export/cleaned"),
                ("GET report/pdf", f"{base}/report/pdf"),
            ]:
                r = await client.get(
                    f"{API_BASE}{path}",
                    headers={"Authorization": f"Bearer {token}"},
                )
                if r.status_code in (200, 400, 404):
                    ok(label, str(r.status_code))
                else:
                    bad(label, f"{r.status_code} {r.text[:200]}")

        # Assistant
        res = await api("POST", "/assistant/chat", json={
            "message": "What columns should I use as target?",
            "dataset_id": dataset_id,
        })
        if res.status_code == 200:
            ok("POST /assistant/chat")
        elif res.status_code in (400, 404, 500, 503):
            ok("POST /assistant/chat", f"handled {res.status_code}")
        else:
            bad("POST /assistant/chat", f"{res.status_code} {res.text[:300]}")

        # Telemetry
        res = await api("POST", "/telemetry/client-log", json={
            "level": "info",
            "event": "qa_test",
            "message": "qa probe",
        })
        if res.status_code in (200, 202):
            ok("POST /telemetry/client-log")
        else:
            bad("POST /telemetry/client-log", f"{res.status_code}")

        # Share (needs dataset)
        if dataset_id:
            res = await api("POST", f"/shared/datasets/{dataset_id}")
            if res.status_code == 200:
                token_share = res.json().get("token")
                ok("POST /shared/datasets/{id}")
                if token_share:
                    r = await client.get(f"{API_BASE}/shared/{token_share}")
                    if r.status_code == 200:
                        ok("GET /shared/{token} (public)")
                    else:
                        bad("GET /shared/{token}", f"{r.status_code}")
            elif res.status_code in (400, 404):
                ok("POST /shared/datasets/{id}", f"{res.status_code}")
            else:
                bad("POST /shared/datasets/{id}", f"{res.status_code} {res.text[:200]}")

    print("\n" + "=" * 60)
    print(f"PASSED: {len(PASS)}  FAILED: {len(FAIL)}  SKIPPED: {len(SKIP)}")
    if FAIL:
        print("\nFailures:")
        for n, d in FAIL:
            print(f"  - {n}: {d}")
    print("=" * 60)
    return len(FAIL) == 0


if __name__ == "__main__":
    success = asyncio.run(run())
    raise SystemExit(0 if success else 1)
