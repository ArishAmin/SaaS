import os
import requests
import sys

def main():
    api_url = os.environ.get('API_URL', '').rstrip('/')
    token = os.environ.get('ADMIN_CLEANUP_TOKEN')
    
    if not api_url or not token:
        print("Error: API_URL or ADMIN_CLEANUP_TOKEN environment variables are missing.")
        sys.exit(1)

    url = f"{api_url}/admin/cleanup-ttl"
    headers = {
        'Authorization': f'Bearer {token}'
    }
    
    print(f"Triggering TTL cleanup at {url}...")
    response = requests.post(url, headers=headers)
    
    if response.status_code >= 400:
        print(f"Failed to trigger cleanup. Status code: {response.status_code}")
        print(f"Response: {response.text}")
        response.raise_for_status()
    else:
        print("Cleanup triggered successfully.")
        print(f"Response: {response.json()}")

if __name__ == "__main__":
    main()
