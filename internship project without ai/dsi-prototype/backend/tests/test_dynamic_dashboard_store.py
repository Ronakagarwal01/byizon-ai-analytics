import importlib
import os
import tempfile
import unittest


def sample_analysis():
    return {
        "sessionId": "session-json-dashboard",
        "datasetId": "dataset-json-dashboard",
        "fileName": "sales.csv",
        "rowCount": 3,
        "colCount": 3,
        "columns": ["Region", "Revenue", "Status"],
        "rows": [
            {"Region": "North", "Revenue": 1200, "Status": "Won"},
            {"Region": "South", "Revenue": 800, "Status": "Lost"},
            {"Region": "North", "Revenue": 1700, "Status": "Won"},
        ],
        "semanticColumns": [
            {"name": "Region", "isDimension": True, "uniqueCount": 2},
            {"name": "Status", "isDimension": True, "uniqueCount": 2},
        ],
        "dashboardPlan": {
            "overview_cards": [
                {"id": "records", "label": "Total Records", "value": "3", "desc": "Rows available."},
                {"id": "revenue", "label": "Revenue", "value": "$3,700", "desc": "Total revenue."},
            ],
            "story_cards": [],
            "charts": [
                {
                    "id": "revenue_by_region",
                    "type": "bar",
                    "title": "Revenue by Region",
                    "description": "Compares revenue by region.",
                    "data": [{"name": "North", "value": 2900}, {"name": "South", "value": 800}],
                }
            ],
        },
        "insightObjects": [
            {"type": "top_segment", "observation": "North leads revenue.", "priority": 90}
        ],
    }


class DynamicDashboardStoreTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        os.environ["BYIZON_DATA_DIR"] = self.temp_dir.name
        import backend.dynamic_dashboard_store as store
        self.store = importlib.reload(store)

    def tearDown(self):
        self.temp_dir.cleanup()
        os.environ.pop("BYIZON_DATA_DIR", None)

    def test_dashboard_is_json_only_password_protected_and_versioned(self):
        created = self.store.create_dashboard(sample_analysis(), "owner-a", password="strong-pass-123")
        self.assertEqual(created["version"], 1)
        metadata = self.store.get_dashboard_metadata(created["dashboardId"])
        self.assertTrue(metadata["requiresPassword"])
        self.assertNotIn("dashboardJson", metadata)

        unlocked = self.store.verify_dashboard_password(created["dashboardId"], "strong-pass-123")
        dashboard_json = unlocked["dashboard"]["dashboardJson"]
        self.assertEqual(dashboard_json["generation"]["mode"], "json-only")
        self.assertEqual(dashboard_json["kind"], "byizon.dynamic-dashboard")
        self.assertGreaterEqual(len(dashboard_json["dashboard"]["widgets"]), 3)

        loaded = self.store.get_dashboard_json(created["dashboardId"], unlocked["accessToken"])
        self.assertEqual(loaded["dashboardJson"]["dashboard"]["title"], dashboard_json["dashboard"]["title"])

        regenerated = self.store.regenerate_dashboard(created["dashboardId"], sample_analysis(), "owner-a", "try a new layout")
        self.assertNotEqual(regenerated["dashboardId"], created["dashboardId"])
        self.assertEqual(regenerated["version"], 2)

        old_metadata = self.store.get_dashboard_metadata(created["dashboardId"])
        self.assertEqual(old_metadata["version"], 1)


if __name__ == "__main__":
    unittest.main()
