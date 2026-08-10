from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from backend import account_store


class AccountLifecycleTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        data_dir = Path(self.temp_dir.name)
        self.original_paths = (
            account_store._DATA_DIR,
            account_store._DB_PATH,
            account_store._OUTBOX_PATH,
        )
        account_store._DATA_DIR = str(data_dir)
        account_store._DB_PATH = str(data_dir / "accounts.sqlite3")
        account_store._OUTBOX_PATH = str(data_dir / "email_outbox.jsonl")

    def tearDown(self) -> None:
        account_store._DATA_DIR, account_store._DB_PATH, account_store._OUTBOX_PATH = self.original_paths
        self.temp_dir.cleanup()

    def latest_otp(self) -> str:
        entries = Path(account_store._OUTBOX_PATH).read_text(encoding="utf-8").splitlines()
        return str(json.loads(entries[-1])["otp"])

    def test_signup_onboarding_activation_and_both_login_methods(self) -> None:
        email = "owner@example.com"
        password = "Strong@123"
        created = account_store.create_account({
            "firstName": "Ronak",
            "lastName": "Agarwal",
            "workEmail": email,
            "companyName": "Byizon",
            "phoneCountryCode": "+91",
            "phoneNumber": "9876543210",
            "password": password,
            "termsAccepted": True,
        })
        self.assertFalse(created["emailVerified"])

        verified = account_store.verify_email_otp(email, self.latest_otp())
        user_id = verified["workspaceUserId"]
        self.assertEqual(verified["onboarding"]["nextStep"], "/onboarding/company")

        account_store.save_company_onboarding(user_id, {
            "companyName": "Byizon",
            "industry": "Technology",
            "companySize": "1-10",
            "defaultCurrency": "INR",
            "timeZone": "Asia/Kolkata",
            "accuracyConfirmed": True,
        })
        account_store.save_team_invites(user_id, {"invites": [], "personalMessage": ""})
        account_store.save_data_source_onboarding(user_id, {"dataSource": "upload"})
        account_store.save_ai_workspace_onboarding(user_id, {
            "businessType": "B2B SaaS",
            "primaryDepartment": "Leadership",
            "industry": "Technology",
            "preferredLanguage": "English + Hindi",
            "timeZone": "Asia/Kolkata",
            "currency": "INR",
        })
        completed = account_store.complete_onboarding(user_id)
        self.assertTrue(completed["completed"])
        self.assertEqual(completed["nextStep"], "/dashboard")

        password_login = account_store.authenticate_account(email, password)
        self.assertTrue(password_login["onboarding"]["completed"])

        account_store.request_login_otp(email)
        otp_login = account_store.authenticate_account_otp(email, self.latest_otp())
        self.assertEqual(otp_login["workspaceUserId"], user_id)
        self.assertEqual(otp_login["onboarding"]["nextStep"], "/dashboard")

    def test_google_login_links_to_an_existing_email_account(self) -> None:
        created = account_store.create_account({
            "firstName": "Ronak",
            "lastName": "Agarwal",
            "workEmail": "linked@example.com",
            "companyName": "Byizon",
            "phoneCountryCode": "+91",
            "phoneNumber": "9876543210",
            "password": "Strong@123",
            "termsAccepted": True,
        })
        verified = account_store.verify_email_otp("linked@example.com", self.latest_otp())
        linked_id = account_store.resolve_oauth_account(
            "google", "google-subject-123", "linked@example.com", "Ronak Agarwal"
        )
        self.assertEqual(linked_id, verified["workspaceUserId"])
        self.assertEqual(linked_id, created["workspaceUserId"])

    def test_new_google_account_can_use_email_otp_login(self) -> None:
        user_id = account_store.resolve_oauth_account(
            "google", "new-google-subject", "google@example.com", "Google User"
        )
        account_store.request_login_otp("google@example.com")
        logged_in = account_store.authenticate_account_otp("google@example.com", self.latest_otp())
        self.assertEqual(logged_in["workspaceUserId"], user_id)
        self.assertEqual(logged_in["onboarding"]["nextStep"], "/onboarding/company")


if __name__ == "__main__":
    unittest.main()
