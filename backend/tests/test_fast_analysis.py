from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from backend.analytics import dataset_store
from backend.analytics.file_parser import parse_file
from backend.analytics.service import build_analysis_result, prepare_analysis
from backend.analytics.session_manager import create_session, progress, update_progress


class FastAnalysisTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_data_dir = dataset_store.DATA_DIR
        self.original_database_path = dataset_store.DATABASE_PATH
        dataset_store.DATA_DIR = Path(self.temp_dir.name)
        dataset_store.DATABASE_PATH = Path(self.temp_dir.name) / "fast-analysis.sqlite3"

    def tearDown(self) -> None:
        dataset_store.DATA_DIR = self.original_data_dir
        dataset_store.DATABASE_PATH = self.original_database_path
        self.temp_dir.cleanup()

    def test_quick_result_keeps_dashboard_contract_without_training_models(self) -> None:
        content = (Path(__file__).parent / "fixtures" / "analytics_contract.csv").read_bytes()
        parsed = parse_file("analytics_contract.csv", content)
        prepared = prepare_analysis(parsed)
        result = build_analysis_result(prepared, include_data_science=False)

        self.assertEqual(result["rowCount"], 4)
        self.assertTrue(result["columns"])
        self.assertIn("dataQuality", result)
        self.assertIn("kpis", result)
        self.assertIn("charts", result)
        self.assertEqual(result["dataScience"]["status"], "processing")
        self.assertFalse(result["dataScience"]["modelTraining"]["trained"])

    def test_progress_uses_persisted_processing_state(self) -> None:
        session = create_session(
            {
                "fileName": "fast.csv",
                "fileType": ".csv",
                "rowCount": 2,
                "colCount": 2,
                "processing": {
                    "status": "processing",
                    "progress": 70,
                    "stage": "quick_dashboard_ready",
                    "message": "Dashboard ready.",
                },
            },
            owner_user_id="owner-fast",
            analysis_status="processing",
        )
        initial = progress(session["sessionId"], "owner-fast")
        self.assertEqual(initial["status"], "processing")
        self.assertEqual(initial["progress"], 70)

        update_progress(
            session["sessionId"],
            "owner-fast",
            92,
            "report_generation",
            "Preparing report.",
        )
        updated = progress(session["sessionId"], "owner-fast")
        self.assertEqual(updated["progress"], 92)
        self.assertEqual(updated["stage"], "report_generation")


if __name__ == "__main__":
    unittest.main()
