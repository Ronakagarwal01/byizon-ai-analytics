from __future__ import annotations

import io
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import pandas as pd

from backend.ai.prompt_builder import build_structured_json
from backend.analytics.file_parser import parse_file
from backend.analytics.sql_warehouse import (
    QUERY_CATALOG,
    ingest_parsed_dataset,
    query_dataset_evidence,
)


class SqlWarehouseContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.environment = patch.dict(
            os.environ,
            {
                "DATABASE_URL": "",
                "BYIZON_SQLITE_ANALYTICS_PATH": str(Path(self.temp_dir.name) / "warehouse.sqlite3"),
            },
        )
        self.environment.start()

    def tearDown(self) -> None:
        self.environment.stop()
        self.temp_dir.cleanup()

    @staticmethod
    def _workbook_bytes() -> bytes:
        output = io.BytesIO()
        dataframe = pd.DataFrame(
            {
                "Department": ["Cardiology", "Cardiology", "General", "General", "General"],
                "Bill Amount": [1200, 1800, 700, 900, 1100],
                "Visit Date": ["2026-01-01", "2026-01-02", "2026-01-02", "2026-01-03", "2026-01-04"],
                "Patient Email": [
                    "private1@example.com",
                    "private2@example.com",
                    "private3@example.com",
                    "private4@example.com",
                    "private5@example.com",
                ],
            }
        )
        with pd.ExcelWriter(output, engine="openpyxl") as writer:
            dataframe.to_excel(writer, sheet_name="Hospital Visits", index=False)
        return output.getvalue()

    def _ingest(self) -> dict:
        content = self._workbook_bytes()
        parsed = parse_file("hospital.xlsx", content)
        return ingest_parsed_dataset(
            dataset={
                "datasetId": "dataset-hospital",
                "ownerUserId": "owner-a",
                "fileName": "hospital.xlsx",
                "contentType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "sourceKind": "manual_upload",
                "sha256": "fixture-sha",
                "metadata": {"purpose": "test"},
            },
            content=content,
            parsed=parsed,
        )

    def test_every_excel_row_is_stored_and_sql_evidence_is_compact(self) -> None:
        manifest = self._ingest()
        self.assertEqual(manifest["fullRowsStored"], 5)
        self.assertEqual(manifest["backend"], "sqlite-fallback")
        self.assertEqual(manifest["bulkLoadMethod"], "sqlite-executemany")
        self.assertFalse(manifest["rawRowsSentToModel"])

        evidence = query_dataset_evidence(
            "dataset-hospital",
            "owner-a",
            "Average bill amount and visits by department",
        )
        self.assertTrue(evidence["available"])
        self.assertEqual(evidence["policy"], "prebuilt-parameterized-sql-only")
        self.assertEqual(evidence["dataset"]["rowCount"], 5)
        self.assertIn("Bill Amount", [item["metric"] for item in evidence["aggregations"]])
        self.assertIn("Department", [item["column"] for item in evidence["topValues"]])
        self.assertTrue(evidence["queryAudit"]["parameterized"])
        self.assertTrue(evidence["queryAudit"]["bounded"])

        encoded = json.dumps(evidence, sort_keys=True)
        self.assertNotIn("private1@example.com", encoded)
        self.assertNotIn("Patient Email", json.dumps(evidence["topValues"], sort_keys=True))

    def test_workspace_scope_prevents_cross_user_reads(self) -> None:
        self._ingest()
        other_owner = query_dataset_evidence(
            "dataset-hospital",
            "owner-b",
            "Show all details",
        )
        self.assertFalse(other_owner["available"])

    def test_query_catalog_is_static_parameterized_and_model_payload_has_no_rows(self) -> None:
        self._ingest()
        sql_evidence = query_dataset_evidence(
            "dataset-hospital",
            "owner-a",
            "Show hospital performance",
        )
        for query in QUERY_CATALOG.values():
            self.assertIn("?", query)
            self.assertNotIn("SELECT *", query.upper())

        structured = build_structured_json(
            {
                "question": "Show hospital performance",
                "policy": "database-first-sql-evidence-pipeline",
                "dataset": sql_evidence["dataset"],
                "runtimeEvidence": {
                    "kpis": sql_evidence["kpis"],
                    "aggregations": sql_evidence["aggregations"],
                    "topValues": sql_evidence["topValues"],
                    "timeCoverage": sql_evidence["timeCoverage"],
                    "dataQuality": sql_evidence["dataQuality"],
                    "sqlPolicy": sql_evidence["policy"],
                },
                "sqlWarehouseEvidence": sql_evidence,
            }
        )
        payload = json.dumps(structured, sort_keys=True)
        self.assertNotIn("private1@example.com", payload)
        self.assertNotIn('"rows"', payload)
        self.assertLessEqual(len(payload.encode("utf-8")), 18000)


if __name__ == "__main__":
    unittest.main()
