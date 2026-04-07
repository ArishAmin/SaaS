import httpx
import asyncio
import os

async def check_stack():
    base_url = "http://127.0.0.1:8001"
    
    print("--- 🩺 Stack Diagnostic 🩺 ---")
    
    # 1. API Health
    try:
        res = httpx.get(f"{base_url}/health", timeout=5.0)
        if res.status_code == 200:
            print(f"✅ API Health: OK ({res.json()})")
        else:
            print(f"❌ API Health: FAILED (Status {res.status_code})")
    except Exception as e:
        print(f"❌ API Connection: FAILED ({str(e)})")
        return

    # 2. Redis Check (via a simple endpoint if exists, otherwise we'll assume it's okay for now)
    # The health check usually includes redis status if implemented. 
    # Let's check the health router code.

if __name__ == "__main__":
    asyncio.run(check_stack())
