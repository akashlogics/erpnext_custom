import requests
import json
import logging

def setup_webhook():
    """Setup webhook with proper headers to avoid 417 errors"""
    TELEGRAM_TOKEN = "8263345147:AAHap__09QMcE_KYZiVhaA8JpaI8OR4QYIM"
    
    # Get ngrok URL
    ngrok_url = input("Enter your ngrok URL: ").strip()
    if not ngrok_url.startswith('https://'):
        print("❌ URL must start with https://")
        return
    
    webhook_url = f"{ngrok_url}/api/method/erpnext_customisation.telegram.webhook.telegram_webhook"
    
    # Create session with proper headers
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Expect": ""  # Prevent 417 errors
    })
    
    # Delete existing webhook first
    print(" Removing existing webhook...")
    delete_url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/deleteWebhook"
    session.post(delete_url)
    
    # Set new webhook
    print("  Setting up new webhook...")
    set_url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/setWebhook"
    
    payload = {
        "url": webhook_url,
        "max_connections": 10,
        "allowed_updates": ["message", "callback_query"],
        "drop_pending_updates": True
    }
    
    try:
        response = session.post(
            set_url, 
            json=payload, 
            timeout=30,
            headers={
                "Expect": "",
                "Content-Type": "application/json"
            }
        )
        result = response.json()
        
        if result.get("ok"):
            print(" Webhook set successfully!")
            print(f" URL: {webhook_url}")
            
            # Test the webhook
            test_response = session.get(
                f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/getWebhookInfo",
                headers={"Expect": ""}
            )
            if test_response.status_code == 200:
                info = test_response.json()["result"]
                print(f"Status: {info.get('url', 'Not set')}")
                print(f"  Errors: {info.get('last_error_message', 'None')}")
            
            return True
        else:
            print(f" Failed: {result.get('description')}")
            return False
            
    except Exception as e:
        print(f" Error: {e}")
        return False

if __name__ == "__main__":
    setup_webhook()
