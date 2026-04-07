import httpx
import asyncio

async def test_error_cors():
    # Attempt to hit the train-quick endpoint with an invalid ID to trigger a 404/500
    # and verify that CORS headers are present in the response.
    url = "http://127.0.0.1:8001/datasets/00000000-0000-0000-0000-000000000000/train-quick"
    headers = {
        "Origin": "http://localhost:3000",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Authorization,Content-Type",
    }
    
    async with httpx.AsyncClient() as client:
        # 1. Test Preflight
        print("Testing OPTIONS preflight...")
        res_opt = await client.options(url, headers=headers)
        print(f"OPTIONS Status: {res_opt.status_code}")
        print(f"OPTIONS Headers: {dict(res_opt.headers)}")
        
        # 2. Test Actual Request (without Auth to trigger error)
        print("\nTesting POST error path...")
        res_post = await client.post(url, headers={"Origin": "http://localhost:3000"})
        print(f"POST Status: {res_post.status_code}")
        print(f"POST Headers: {dict(res_post.headers)}")
        
        if "access-control-allow-origin" in res_post.headers:
            print("\nSUCCESS: CORS headers present on error response.")
        else:
            print("\nFAILURE: CORS headers missing on error response.")

if __name__ == "__main__":
    asyncio.run(test_error_cors())
