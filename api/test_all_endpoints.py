"""
End-to-end API test script.
Tests every feature endpoint against the running local API (http://127.0.0.1:8001).
Uses Supabase auth to get a valid JWT, then exercises the full pipeline:
  upload → analyze → analysis → eda → quality → clean → recommend → feature-engineer
  → train-quick → quick-evaluation → feature-importance → export → pdf-report → delete
"""

import asyncio
import json
import os
import sys
import uuid

import httpx

# ── Config ──────────────────────────────────────────────────────────────────
API = "http://127.0.0.1:8001"
SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip().strip("'\"")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "").strip().strip("'\"")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip().strip("'\"")

# Read from .env if not in environment
if not SUPABASE_URL or not SUPABASE_ANON_KEY or not SUPABASE_SERVICE_ROLE_KEY:
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line.startswith("#") or "=" not in line:
                    continue
                key, val = line.split("=", 1)
                val = val.strip().strip("'\"")
                if key.strip() == "SUPABASE_URL":
                    SUPABASE_URL = val
                elif key.strip() == "SUPABASE_SERVICE_ROLE_KEY":
                    SUPABASE_SERVICE_ROLE_KEY = val
                elif key.strip() == "SUPABASE_ANON_KEY":
                    SUPABASE_ANON_KEY = val

# Test user credentials — create a throwaway test user via Supabase signup
TEST_EMAIL = "test_api_runner@datapilot-test.local"
TEST_PASSWORD = "TestPassword123!@#"

# Sample CSV content for testing
SAMPLE_CSV = b"""age,salary,department,target
25,50000,Engineering,1
30,60000,Marketing,0
35,70000,Engineering,1
28,55000,Sales,0
40,80000,Engineering,1
32,62000,Marketing,0
45,90000,Sales,1
29,53000,Engineering,0
38,75000,Marketing,1
33,64000,Sales,0
27,51000,Engineering,1
36,72000,Marketing,0
42,85000,Sales,1
31,58000,Engineering,0
37,76000,Marketing,1
"""

passed = 0
failed = 0
results = []


def report(name: str, ok: bool, detail: str = ""):
    global passed, failed
    status = "✅ PASS" if ok else "❌ FAIL"
    if ok:
        passed += 1
    else:
        failed += 1
    msg = f"  {status}  {name}"
    if detail:
        msg += f"  →  {detail}"
    print(msg)
    results.append((name, ok, detail))


async def main():
    global passed, failed

    print("=" * 70)
    print("DataPilot AI — Full API Test Suite")
    print("=" * 70)

    # ── Step 0: Health check ────────────────────────────────────────────
    print("\n── Health ──")
    async with httpx.AsyncClient(timeout=15) as c:
        try:
            r = await c.get(f"{API}/health")
            report("GET /health", r.status_code == 200, f"status={r.status_code} body={r.text}")
        except Exception as e:
            report("GET /health", False, str(e))
            print("\n⛔ API not reachable. Aborting.")
            return

    # ── Step 1: Authenticate via Supabase ─────────────────────────────
    print("\n── Authentication ──")
    access_token = None
    user_id = None

    admin_headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=15) as c:
        # Create user via admin API (auto-confirmed)
        try:
            r = await c.post(
                f"{SUPABASE_URL}/auth/v1/admin/users",
                headers=admin_headers,
                json={
                    "email": TEST_EMAIL,
                    "password": TEST_PASSWORD,
                    "email_confirm": True,
                },
            )
            if r.status_code in (200, 201):
                report("Admin create user", True, f"status={r.status_code}")
            elif r.status_code == 422:
                report("Admin create user (already exists)", True, f"status={r.status_code}")
            else:
                report("Admin create user", True, f"status={r.status_code} body={r.text[:200]}")
        except Exception as e:
            report("Admin create user", False, str(e))

        # Login with anon key
        try:
            r = await c.post(
                f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
                headers={"apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json"},
                json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
            )
            if r.status_code == 200:
                data = r.json()
                access_token = data.get("access_token")
                user_id = data.get("user", {}).get("id")
                report("Login", True, f"user_id={user_id}")
            else:
                report("Login", False, f"status={r.status_code} body={r.text[:200]}")
        except Exception as e:
            report("Login", False, str(e))

    if not access_token or not user_id:
        print("\n⛔ Cannot authenticate. Aborting.")
        return

    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }

    dataset_id = str(uuid.uuid4())
    storage_path = f"{user_id}/datasets/{dataset_id}/raw.csv"

    # ── Step 2: Upload file to Supabase storage ──────────────────────
    print("\n── Upload to Storage ──")
    async with httpx.AsyncClient(timeout=30) as c:
        try:
            encoded_path = storage_path.replace("/", "%2F")
            upload_url = f"{SUPABASE_URL}/storage/v1/object/datasets/{encoded_path}"
            r = await c.put(
                upload_url,
                headers={
                    "apikey": SUPABASE_ANON_KEY,
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "text/csv",
                },
                content=SAMPLE_CSV,
            )
            report("Storage upload", r.status_code in (200, 201), f"status={r.status_code}")
        except Exception as e:
            report("Storage upload", False, str(e))

    # ── Step 3: Create dataset record ────────────────────────────────
    print("\n── Dataset CRUD ──")
    async with httpx.AsyncClient(timeout=15) as c:
        try:
            r = await c.post(
                f"{API}/datasets",
                headers=headers,
                json={
                    "dataset_id": dataset_id,
                    "storage_path": storage_path,
                    "original_file_name": "test_data.csv",
                    "original_extension": "csv",
                    "mime_type": "text/csv",
                },
            )
            report("POST /datasets (create)", r.status_code == 201, f"status={r.status_code} body={r.text[:200]}")
        except Exception as e:
            report("POST /datasets (create)", False, str(e))

    # List datasets
    async with httpx.AsyncClient(timeout=15) as c:
        try:
            r = await c.get(f"{API}/datasets", headers=headers)
            data = r.json()
            found = any(d.get("dataset_id") == dataset_id for d in data) if isinstance(data, list) else False
            report("GET /datasets (list)", r.status_code == 200 and found, f"status={r.status_code} count={len(data) if isinstance(data, list) else '?'}")
        except Exception as e:
            report("GET /datasets (list)", False, str(e))

    # ── Step 4: Analyze ──────────────────────────────────────────────
    print("\n── Analyze ──")
    async with httpx.AsyncClient(timeout=30) as c:
        try:
            r = await c.post(
                f"{API}/datasets/{dataset_id}/analyze",
                headers=headers,
                json={"mode": "instant"},
            )
            report("POST /datasets/{id}/analyze", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
        except Exception as e:
            report("POST /datasets/{id}/analyze", False, str(e))

    # ── Step 5: Get stored analysis ──────────────────────────────────
    print("\n── Analysis (stored) ──")
    async with httpx.AsyncClient(timeout=15) as c:
        try:
            r = await c.post(
                f"{API}/datasets/{dataset_id}/analysis",
                headers=headers,
                json={"mode": "instant"},
            )
            data = r.json()
            has_cols = "columns" in data
            report("POST /datasets/{id}/analysis", r.status_code == 200 and has_cols, f"status={r.status_code} has_columns={has_cols}")
        except Exception as e:
            report("POST /datasets/{id}/analysis", False, str(e))

    # ── Step 6: EDA report ───────────────────────────────────────────
    print("\n── EDA ──")
    async with httpx.AsyncClient(timeout=30) as c:
        try:
            r = await c.post(
                f"{API}/datasets/{dataset_id}/eda",
                headers=headers,
            )
            data = r.json()
            has_dist = "distributions" in data
            report("POST /datasets/{id}/eda", r.status_code == 200 and has_dist, f"status={r.status_code} has_distributions={has_dist}")
        except Exception as e:
            report("POST /datasets/{id}/eda", False, str(e))

    # ── Step 7: Quality score ────────────────────────────────────────
    print("\n── Quality ──")
    async with httpx.AsyncClient(timeout=30) as c:
        try:
            r = await c.post(
                f"{API}/datasets/{dataset_id}/quality",
                headers=headers,
            )
            data = r.json()
            has_score = "score" in data
            report("POST /datasets/{id}/quality", r.status_code == 200 and has_score, f"status={r.status_code} score={data.get('score')}")
        except Exception as e:
            report("POST /datasets/{id}/quality", False, str(e))

    # ── Step 8: Clean (Simple) ───────────────────────────────────────
    print("\n── Cleaning ──")
    async with httpx.AsyncClient(timeout=60) as c:
        try:
            r = await c.post(
                f"{API}/datasets/{dataset_id}/clean",
                headers=headers,
                json={"mode": "simple", "target_column": "target"},
            )
            data = r.json()
            is_cleaned = data.get("status") == "cleaned"
            report("POST /datasets/{id}/clean (simple)", r.status_code == 200 and is_cleaned, f"status={r.status_code} body={r.text[:300]}")
        except Exception as e:
            report("POST /datasets/{id}/clean (simple)", False, str(e))

    # ── Step 9: Recommend models ─────────────────────────────────────
    print("\n── Recommend ──")
    async with httpx.AsyncClient(timeout=30) as c:
        try:
            r = await c.post(
                f"{API}/datasets/{dataset_id}/recommend",
                headers=headers,
                json={},
            )
            data = r.json()
            has_suggestions = "suggestions" in data
            report("POST /datasets/{id}/recommend", r.status_code == 200 and has_suggestions, f"status={r.status_code} problem_type={data.get('problem_type')} suggestions={len(data.get('suggestions', []))}")
        except Exception as e:
            report("POST /datasets/{id}/recommend", False, str(e))

    # ── Step 10: Quick training ──────────────────────────────────────
    print("\n── Quick Training ──")
    async with httpx.AsyncClient(timeout=60) as c:
        try:
            r = await c.post(
                f"{API}/datasets/{dataset_id}/train-quick",
                headers=headers,
                json={"target_column": "target"},
            )
            data = r.json()
            has_eval = "quick_evaluation" in data
            report("POST /datasets/{id}/train-quick", r.status_code == 200 and has_eval, f"status={r.status_code} task_type={data.get('quick_evaluation', {}).get('task_type')}")
        except Exception as e:
            report("POST /datasets/{id}/train-quick", False, str(e))

    # ── Step 11: Get quick evaluation ────────────────────────────────
    print("\n── Quick Evaluation ──")
    async with httpx.AsyncClient(timeout=15) as c:
        try:
            r = await c.get(
                f"{API}/datasets/{dataset_id}/quick-evaluation",
                headers=headers,
            )
            data = r.json()
            has_eval = "quick_evaluation" in data
            report("GET /datasets/{id}/quick-evaluation", r.status_code == 200 and has_eval, f"status={r.status_code}")
        except Exception as e:
            report("GET /datasets/{id}/quick-evaluation", False, str(e))

    # ── Step 12: Feature importance ──────────────────────────────────
    print("\n── Feature Importance ──")
    async with httpx.AsyncClient(timeout=15) as c:
        try:
            r = await c.get(
                f"{API}/datasets/{dataset_id}/feature-importance",
                headers=headers,
            )
            data = r.json()
            has_features = "top_features" in data
            report("GET /datasets/{id}/feature-importance", r.status_code == 200 and has_features, f"status={r.status_code} top_features_count={len(data.get('top_features', []))}")
        except Exception as e:
            report("GET /datasets/{id}/feature-importance", False, str(e))

    # ── Step 13: Feature engineering ─────────────────────────────────
    print("\n── Feature Engineering ──")
    async with httpx.AsyncClient(timeout=30) as c:
        try:
            r = await c.post(
                f"{API}/datasets/{dataset_id}/feature-engineer",
                headers=headers,
                json={"top_k": 3, "dry_run": False},
            )
            data = r.json()
            applied = data.get("applied")
            report("POST /datasets/{id}/feature-engineer", r.status_code == 200 and applied, f"status={r.status_code} applied={applied} keep={len(data.get('keep_features', []))}")
        except Exception as e:
            report("POST /datasets/{id}/feature-engineer", False, str(e))

    # ── Step 14: Export cleaned CSV ──────────────────────────────────
    print("\n── Export ──")
    async with httpx.AsyncClient(timeout=15) as c:
        try:
            r = await c.get(
                f"{API}/datasets/{dataset_id}/export/cleaned?format=csv",
                headers=headers,
            )
            is_csv = "text/csv" in (r.headers.get("content-type", ""))
            report("GET /datasets/{id}/export/cleaned?format=csv", r.status_code == 200 and is_csv, f"status={r.status_code} content_type={r.headers.get('content-type')} bytes={len(r.content)}")
        except Exception as e:
            report("GET /datasets/{id}/export/cleaned?format=csv", False, str(e))

    # Export Python code
    async with httpx.AsyncClient(timeout=15) as c:
        try:
            r = await c.get(
                f"{API}/datasets/{dataset_id}/export/cleaned?format=python-code",
                headers=headers,
            )
            has_code = "import pandas" in r.text
            report("GET /datasets/{id}/export/cleaned?format=python-code", r.status_code == 200 and has_code, f"status={r.status_code} has_pandas_import={has_code}")
        except Exception as e:
            report("GET /datasets/{id}/export/cleaned?format=python-code", False, str(e))

    # ── Step 15: PDF report ──────────────────────────────────────────
    print("\n── PDF Report ──")
    async with httpx.AsyncClient(timeout=30) as c:
        try:
            r = await c.get(
                f"{API}/datasets/{dataset_id}/report/pdf",
                headers=headers,
            )
            is_pdf = r.headers.get("content-type", "").startswith("application/pdf")
            report("GET /datasets/{id}/report/pdf", r.status_code == 200 and is_pdf, f"status={r.status_code} content_type={r.headers.get('content-type')} bytes={len(r.content)}")
        except Exception as e:
            report("GET /datasets/{id}/report/pdf", False, str(e))

    # ── Step 16: Delete dataset ──────────────────────────────────────
    print("\n── Delete ──")
    async with httpx.AsyncClient(timeout=15) as c:
        try:
            r = await c.delete(
                f"{API}/datasets/{dataset_id}",
                headers=headers,
            )
            data = r.json()
            deleted = data.get("deleted")
            report("DELETE /datasets/{id}", r.status_code == 200 and deleted, f"status={r.status_code} deleted={deleted}")
        except Exception as e:
            report("DELETE /datasets/{id}", False, str(e))

    # Verify deletion
    async with httpx.AsyncClient(timeout=15) as c:
        try:
            r = await c.get(f"{API}/datasets", headers=headers)
            data = r.json()
            not_found = not any(d.get("dataset_id") == dataset_id for d in data) if isinstance(data, list) else True
            report("Verify deletion (list)", r.status_code == 200 and not_found, f"dataset gone={not_found}")
        except Exception as e:
            report("Verify deletion (list)", False, str(e))

    # ── Summary ──────────────────────────────────────────────────────
    print("\n" + "=" * 70)
    print(f"RESULTS: {passed} passed, {failed} failed, {passed + failed} total")
    print("=" * 70)

    if failed > 0:
        print("\nFailed tests:")
        for name, ok, detail in results:
            if not ok:
                print(f"  ❌ {name}: {detail}")

    sys.exit(1 if failed > 0 else 0)


if __name__ == "__main__":
    asyncio.run(main())
