import httpx
import asyncio
import os
import sys

async def check_stack():
    base_url = "http://127.0.0.1:8001"
    
    print("--- 🩺 Final Stack Verification 🩺 ---")
    
    # 1. API Reachability
    try:
        async with httpx.AsyncClient() as client:
            res = await client.get(f"{base_url}/health", timeout=5.0)
            if res.status_code == 200:
                print(f"✅ API Reachability: OK (Port 8001)")
            else:
                print(f"❌ API Reachability: FAILED (Status {res.status_code})")
                return
    except Exception as e:
        print(f"❌ API Connection: FAILED ({str(e)})")
        print("💡 Hint: Check if port 8001 is open.")
        return

    # 2. Detailed Verification (Optional: Test a protected endpoint if we had a token)
    # But just the health check + no immediate crash logs is a good sign.
    
    print("\n✅ All services appear to be initialized.")
    print("🚀 You can now proceed to test the website at http://localhost:3000")

if __name__ == "__main__":
    asyncio.run(check_stack())
