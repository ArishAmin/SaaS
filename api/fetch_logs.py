import httpx
import asyncio
import json

SUPABASE_URL = 'https://ihewvilbkhmrjnfjvtwo.supabase.co'
SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImloZXd2aWxia2htcmpuZmp2dHdvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDcxODQ2NywiZXhwIjoyMDkwMjk0NDY3fQ._CSY0XVq6MFPytdPPTs3MJYWbpIk3riCquBdQ__BCuI'

async def fetch_logs():
    async with httpx.AsyncClient() as client:
        url = f"{SUPABASE_URL}/rest/v1/app_logs?order=created_at.desc&limit=20"
        headers = {
            "apikey": SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
        }
        res = await client.get(url, headers=headers)
        if res.status_code == 200:
            logs = res.json()
            for log in logs:
                print(f"[{log.get('created_at')}] {log.get('level').upper()}: {log.get('event')} - {log.get('message')}")
                if log.get('error'):
                    print(f"  Error: {json.dumps(log.get('error'), indent=2)}")
        else:
            print(f"Failed to fetch logs: {res.status_code} {res.text}")

if __name__ == "__main__":
    asyncio.run(fetch_logs())
