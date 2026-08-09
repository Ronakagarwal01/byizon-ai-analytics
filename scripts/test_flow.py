import requests
import json
import time
import sys

BASE_URL = "http://127.0.0.1:8000"

def run_tests():
    session = requests.Session()
    
    print("1. Testing Signup...")
    email = f"test_{int(time.time())}@example.com"
    res = session.post(f"{BASE_URL}/api/auth/signup", json={
        "firstName": "John",
        "lastName": "Doe",
        "workEmail": email,
        "companyName": "Test Inc",
        "phoneCountryCode": "+1",
        "phoneNumber": "1234567890",
        "password": "Password123!",
        "termsAccepted": True
    })
    
    if res.status_code != 201:
        print(f"Signup failed: {res.text}")
        sys.exit(1)
        
    data = res.json()
    print("Signup success:", data)
    
    # We need the OTP. Since we are testing, let's see if we can get the OTP from the database.
    import sqlite3
    db_path = "backend/data/workspace_accounts.sqlite3"
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    # OTP is hashed in DB, so we can't easily read it. We might need to look at the outbox.
    outbox_path = "backend/data/email_outbox.jsonl"
    otp = None
    with open(outbox_path, "r") as f:
        lines = f.readlines()
        for line in reversed(lines):
            try:
                outbox_data = json.loads(line)
                if outbox_data.get("to") == email:
                    otp = outbox_data.get("otp")
                    break
            except:
                pass
                
    if not otp:
        print("OTP not found in outbox!")
        sys.exit(1)
        
    print(f"Got OTP: {otp}")
    
    print("2. Testing Verify Email...")
    res = session.post(f"{BASE_URL}/api/auth/verify-email", json={
        "email": email,
        "otp": otp
    })
    
    if res.status_code != 200:
        print(f"Verify failed: {res.text}")
        sys.exit(1)
        
    print("Verify success:", res.json())
    
    print("3. Testing Login...")
    res = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": email,
        "password": "Password123!"
    })
    
    if res.status_code != 200:
        print(f"Login failed: {res.text}")
        sys.exit(1)
        
    print("Login success:", res.json())
    
    print("4. Testing Company Onboarding...")
    res = session.post(f"{BASE_URL}/api/onboarding/company", json={
        "companyName": "Test Inc Updated",
        "industry": "SaaS / Software",
        "companySize": "1-10",
        "defaultCurrency": "USD",
        "timeZone": "UTC",
        "accuracyConfirmed": True
    })
    
    if res.status_code != 200:
        print(f"Company onboarding failed: {res.text}")
        sys.exit(1)
        
    print("Company onboarding success:", res.json())
    
    print("5. Testing Team Onboarding...")
    res = session.post(f"{BASE_URL}/api/onboarding/team", json={
        "invites": [
            {"email": "colleague@example.com", "role": "Admin"}
        ],
        "personalMessage": "Join my team!"
    })
    
    if res.status_code != 200:
        print(f"Team onboarding failed: {res.text}")
        sys.exit(1)
        
    print("Team onboarding success:", res.json())
    
    print("6. Testing AI Workspace Onboarding...")
    res = session.post(f"{BASE_URL}/api/onboarding/ai-workspace", json={
        "businessType": "B2B SaaS",
        "primaryDepartment": "Engineering",
        "industry": "Technology",
        "preferredLanguage": "English",
        "timeZone": "UTC",
        "currency": "USD"
    })
    
    if res.status_code != 200:
        print(f"AI Workspace onboarding failed: {res.text}")
        sys.exit(1)
        
    print("AI Workspace onboarding success:", res.json())
    
    print("All backend tests passed successfully!")

if __name__ == "__main__":
    run_tests()
