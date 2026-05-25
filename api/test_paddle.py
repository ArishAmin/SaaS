import asyncio
from app.core.config import get_settings
from app.services.paddle_billing import create_checkout

async def main():
    settings = get_settings()
    print("Paddle Environment:", settings.paddle_environment)
    print("API Key:", settings.paddle_api_key[:10] if settings.paddle_api_key else None)
    
    # We will create a checkout for user 'test_user'
    try:
        url = await create_checkout(
            user_id="test_user_id",
            email="test@example.com",
            plan="pro",
            interval="monthly",
            success_url="https://acutize.com/dashboard?checkout=success"
        )
        print("Generated Checkout URL:", url)
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    asyncio.run(main())
