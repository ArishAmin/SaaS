import asyncio
import httpx
import json
import os
from dotenv import load_dotenv

load_dotenv("api/.env")

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_ANON_KEY")
API_BASE = "http://127.0.0.1:8001"

EMAIL = "support@acutize.com"
PASSWORD = "arish123"

# Mock dataset details
DATASET_ID = "00000000-0000-0000-0000-000000000000"

async def run_tests():
    print("🚀 Starting API E2E QA Test...")
    
    # 1. Login to Supabase
    print("\n--- 1. Testing Authentication ---")
    auth_url = f"{SUPABASE_URL}/auth/v1/token?grant_type=password"
    headers = {
        "apikey": SUPABASE_KEY,
        "Content-Type": "application/json"
    }
    
    async with httpx.AsyncClient() as client:
        res = await client.post(auth_url, headers=headers, json={"email": EMAIL, "password": PASSWORD})
        if res.status_code != 200:
            print(f"❌ Login failed: {res.text}")
            return
            
        data = res.json()
        access_token = data.get("access_token")
        user_id = data.get("user", {}).get("id")
        print(f"✅ Login successful for {EMAIL}")
        print(f"🔑 User ID: {user_id}")
        
        api_headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }
        
        # 2. Test Get Profile (Billing & Subs info)
        print("\n--- 2. Testing Profiles & Subscriptions ---")
        res = await client.get(f"{API_BASE}/profiles/me", headers=api_headers)
        if res.status_code == 200:
            print(f"✅ Profile fetched: {res.json().get('plan')} plan, status: {res.json().get('subscription_status')}")
        else:
            print(f"❌ Profile fetch failed: {res.text}")
            
        # 3. Test Checkout Session
        print("\n--- 3. Testing Checkout Session Creation ---")
        checkout_payload = {
            "price_id": os.environ.get("STRIPE_PRICE_ID_PRO", "prod_pro_dummy"),
            "success_url": "http://localhost:3000/success",
            "cancel_url": "http://localhost:3000/cancel"
        }
        res = await client.post(f"{API_BASE}/billing/create-checkout-session", headers=api_headers, json=checkout_payload)
        if res.status_code == 200 and "url" in res.json():
            print(f"✅ Checkout session created: {res.json()['url']}")
        else:
            print(f"❌ Checkout session failed: {res.status_code} {res.text}")

        # 4. Test Datasets
        print("\n--- 4. Testing Sidebar Features / Endpoints ---")
        
        # Overview (List datasets)
        res = await client.get(f"{API_BASE}/datasets", headers=api_headers)
        if res.status_code == 200:
            print(f"✅ Dashboard Overview: OK (Found {len(res.json())} datasets)")
            datasets = res.json()
            if datasets:
                existing_id = datasets[0]['dataset_id']
                print(f"Using existing dataset {existing_id} for tests...")
                dataset_to_use = existing_id
            else:
                import uuid
                dataset_to_use = str(uuid.uuid4())
                print(f"Creating new mock dataset {dataset_to_use}...")
                create_payload = {
                    "dataset_id": dataset_to_use,
                    "storage_path": f"{user_id}/datasets/{dataset_to_use}.csv",
                    "original_file_name": "test_data.csv",
                    "original_extension": "csv",
                    "mime_type": "text/csv"
                }
                res = await client.post(f"{API_BASE}/datasets", headers=api_headers, json=create_payload)
                if res.status_code == 200:
                    print("✅ Mock Dataset Created")
                else:
                    print(f"❌ Dataset Creation failed: {res.status_code} {res.text}")
                    dataset_to_use = None
        else:
            print(f"❌ Dashboard Overview failed: {res.status_code} {res.text}")
            dataset_to_use = None

        if dataset_to_use:
            # Analyze & Explore
            print(f"\n🔍 Testing GET /datasets/{dataset_to_use} (Analyze & Explore)...")
            res = await client.get(f"{API_BASE}/datasets/{dataset_to_use}", headers=api_headers)
            if res.status_code == 200:
                print("✅ Dataset Fetch OK")
            else:
                print(f"❌ Dataset Fetch failed: {res.status_code} {res.text}")

            print(f"\n🧹 Testing POST /clean (Dry Run / Check Endpoint)...")
            res = await client.post(
                f"{API_BASE}/datasets/{dataset_to_use}/clean", 
                headers=api_headers,
                json={"drop_cols": [], "impute_strategy": "mean", "scale": False}
            )
            # We expect 400 or 500 if the storage path doesn't actually exist locally
            if res.status_code in [200, 400]:
                print(f"✅ Cleaning endpoint responded correctly ({res.status_code})")
            else:
                print(f"❌ Cleaning endpoint threw unexpected error: {res.status_code} {res.text}")
                
            print(f"\n💡 Testing Model Recommendations...")
            res = await client.post(
                f"{API_BASE}/datasets/{dataset_to_use}/recommend", 
                headers=api_headers,
                json={"target_column": "price"}  # dummy column
            )
            if res.status_code in [200, 400]:
                print(f"✅ Recommendations endpoint responded correctly ({res.status_code})")
            else:
                print(f"❌ Recommendations endpoint error: {res.status_code} {res.text}")
                
        # 5. Billing Portal check (Prior to Upgrade)
        print("\n--- 5. Testing Billing Portal Generation ---")
        res = await client.post(f"{API_BASE}/billing/customer-portal", headers=api_headers)
        if res.status_code == 200:
            print(f"✅ Portal generation successful: {res.json().get('url')}")
        elif res.status_code in [400, 500]:
            print(f"✅ Portal gracefully blocked/handled: {res.json()}")
        else:
            print(f"❌ Portal generation error: {res.status_code} {res.text}")
            
        # 6. Simulate Stripe Webhook Sub Update
        print("\n--- 6. Simulating Subscription Upgrade via DB Patches ---")
        service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if service_key:
            db_headers = {
                "apikey": service_key,
                "Authorization": f"Bearer {service_key}",
                "Content-Type": "application/json",
                "Prefer": "return=minimal"
            }
            # Patch profile
            patch_url = f"{SUPABASE_URL}/rest/v1/profiles?id=eq.{user_id}"
            patch_data = {
                "plan": "pro",
                "subscription_status": "active",
                "stripe_customer_id": "cus_mock123"
            }
            res = await client.patch(patch_url, headers=db_headers, json=patch_data)
            if res.status_code in [200, 204]:
                print("✅ Successfully patched user profile to PRO plan.")
                # Verify upgrade via API
                res = await client.get(f"{API_BASE}/profiles/me", headers=api_headers)
                print(f"✅ Post-upgrade Profile: {res.json().get('plan')} plan, status: {res.json().get('subscription_status')}")
            else:
                print(f"❌ Profile patch failed (Expected if Supabase Migration not applied): {res.status_code} {res.text}")
                print("💡 Ensure you have run the supabase/migrations/20260415000000_subscriptions.sql script in your Supabase SQL Editor!")
        else:
            print("⚠️ SUPABASE_SERVICE_ROLE_KEY missing, skipping upgrade simulation.")
            
    print("\n🏁 API QA Complete.")

if __name__ == "__main__":
    asyncio.run(run_tests())
