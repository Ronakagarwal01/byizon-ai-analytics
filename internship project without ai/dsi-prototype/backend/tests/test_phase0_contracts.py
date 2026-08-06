from __future__ import annotations

import asyncio
import hashlib
import json
import tempfile
import unittest
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch

from backend.analytics import dataset_store
from backend.analytics.evidence_builder import build_evidence
from backend.analytics.query_planner import build_query_context
from backend.analytics.service import analyze_file


FIXTURE_DIR = Path(__file__).parent / "fixtures"
CSV_PATH = FIXTURE_DIR / "analytics_contract.csv"
EXPECTED_PATH = FIXTURE_DIR / "analytics_contract.expected.json"


def _contains_key(value: object, forbidden_key: str) -> bool:
    if isinstance(value, dict):
        return forbidden_key in value or any(
            _contains_key(child, forbidden_key) for child in value.values()
        )
    if isinstance(value, list):
        return any(_contains_key(child, forbidden_key) for child in value)
    return False


def _contains_secret_key(value: object) -> bool:
    forbidden_keys = {
        "access_token",
        "refresh_token",
        "client_secret",
        "client_secret_enc",
        "password",
        "cookie",
        "authorization",
    }
    if isinstance(value, dict):
        for key, child in value.items():
            if str(key).lower() in forbidden_keys:
                return True
            if _contains_secret_key(child):
                return True
    if isinstance(value, list):
        return any(_contains_secret_key(child) for child in value)
    return False


class DeterministicAnalyticsContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.content = CSV_PATH.read_bytes()
        cls.expected = json.loads(EXPECTED_PATH.read_text(encoding="utf-8"))
        cls.analysis = analyze_file(cls.expected["fileName"], cls.content)

    def test_exact_fixture_totals_are_preserved(self) -> None:
        self.assertEqual(self.analysis["fileName"], self.expected["fileName"])
        self.assertEqual(self.analysis["rowCount"], self.expected["rowCount"])
        self.assertEqual(self.analysis["colCount"], self.expected["colCount"])

        actual = {
            item["column"]: {
                key: item[key]
                for key in ("count", "sum", "mean", "median", "min", "max")
            }
            for item in self.analysis["columnAggregates"]
        }
        self.assertEqual(actual, self.expected["numericAggregates"])

    def test_llm_context_never_contains_raw_rows(self) -> None:
        llm_context = self.analysis["llmContext"]
        self.assertFalse(_contains_key(llm_context, "rows"))
        self.assertNotIn("R001", json.dumps(llm_context, sort_keys=True))

        query_context, audit = build_query_context(
            "What is the total amount?",
            self.analysis,
        )
        self.assertFalse(_contains_key(query_context, "rows"))
        self.assertFalse(audit["rawRowsIncluded"])
        self.assertFalse(audit["fullDatasetIncluded"])
        self.assertNotIn("R001", json.dumps(query_context, sort_keys=True))


class DatabaseBoundaryContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_data_dir = dataset_store.DATA_DIR
        self.original_database_path = dataset_store.DATABASE_PATH
        isolated_dir = Path(self.temp_dir.name)
        dataset_store.DATA_DIR = isolated_dir
        dataset_store.DATABASE_PATH = isolated_dir / "contract.sqlite3"
        original_database = dataset_store._database

        @contextmanager
        def closing_database():
            database = original_database()
            try:
                yield database
            finally:
                database.close()

        self.database_patch = patch.object(
            dataset_store,
            "_database",
            closing_database,
        )
        self.database_patch.start()

    def tearDown(self) -> None:
        self.database_patch.stop()
        dataset_store.DATA_DIR = self.original_data_dir
        dataset_store.DATABASE_PATH = self.original_database_path
        self.temp_dir.cleanup()

    def test_dataset_and_session_access_is_owner_scoped(self) -> None:
        content = CSV_PATH.read_bytes()
        dataset = dataset_store.store_dataset(
            "analytics_contract.csv",
            content,
            "owner-a",
        )
        self.assertEqual(
            dataset_store.load_dataset_bytes(dataset["datasetId"], "owner-a"),
            content,
        )
        with self.assertRaisesRegex(ValueError, "not found"):
            dataset_store.load_dataset_bytes(dataset["datasetId"], "owner-b")

        session = {
            "sessionId": "session-contract",
            "datasetId": dataset["datasetId"],
            "ownerUserId": "owner-a",
            "fileMetadata": {"fileName": "analytics_contract.csv"},
            "analysis": {"rowCount": 4},
            "chatHistory": [],
            "analysisStatus": "complete",
            "createdAt": 1.0,
            "updatedAt": 1.0,
        }
        dataset_store.save_session(session, dataset["datasetId"])
        self.assertIsNotNone(
            dataset_store.load_session("session-contract", "owner-a")
        )
        self.assertIsNone(
            dataset_store.load_session("session-contract", "owner-b")
        )

    def test_pipeline_reads_the_committed_database_copy(self) -> None:
        from backend import app as app_module

        content = CSV_PATH.read_bytes()
        digest = hashlib.sha256(content).hexdigest()

        def deterministic_stub(file_name: str, stored_content: bytes) -> dict:
            self.assertEqual(file_name, "analytics_contract.csv")
            self.assertEqual(stored_content, content)
            return {
                "fileName": file_name,
                "rowCount": 4,
                "colCount": 6,
            }

        with patch.object(app_module, "analyze_file", deterministic_stub):
            analysis, dataset = app_module._store_then_analyze(
                "analytics_contract.csv",
                content,
                "owner-a",
                "manual_upload",
                content_type="text/csv",
            )

        self.assertEqual(analysis["storagePolicy"], "database-first")
        self.assertEqual(
            analysis["pipelineTrace"][:2],
            ["source_committed_to_database", "stored_source_verified"],
        )
        self.assertIn("pipelineRunId", analysis)
        self.assertIn("dataArchitecture", analysis)
        self.assertIn("raw_database_storage", analysis["dataArchitecture"]["flow"])
        self.assertIn("raw", analysis["dataArchitecture"]["layers"])
        self.assertTrue(analysis["securityPolicy"]["rawRowsNeverSentToModel"])
        self.assertEqual(
            analysis["sourceProvenance"]["databaseRecordId"],
            dataset["datasetId"],
        )
        self.assertEqual(analysis["sourceProvenance"]["databaseSha256"], digest)

    def test_query_evidence_is_database_first_and_model_safe(self) -> None:
        from backend import app as app_module

        analysis, _dataset = app_module._store_then_analyze(
            "analytics_contract.csv",
            CSV_PATH.read_bytes(),
            "owner-a",
            "manual_upload",
            content_type="text/csv",
        )

        evidence, audit = build_evidence(
            "What is the total amount?",
            analysis,
            "owner-a",
            session_id="session-contract",
        )

        self.assertEqual(evidence["dataset"]["datasetId"], analysis["datasetId"])
        self.assertFalse(evidence["security"]["rawRowsIncluded"])
        self.assertFalse(evidence["security"]["fullDatasetIncluded"])
        self.assertTrue(evidence["security"]["sensitiveColumnsRemoved"])
        self.assertEqual(
            evidence["security"]["modelReceivesOnly"],
            "compact_structured_json_evidence",
        )
        self.assertFalse(audit["rawRowsIncluded"])
        self.assertFalse(_contains_key(evidence, "rows"))
        self.assertNotIn("R001", json.dumps(evidence, sort_keys=True))

    def test_runtime_query_pipeline_uses_safe_sql_and_compact_evidence(self) -> None:
        from backend import app as app_module

        analysis, _dataset = app_module._store_then_analyze(
            "analytics_contract.csv",
            CSV_PATH.read_bytes(),
            "owner-a",
            "manual_upload",
            content_type="text/csv",
        )

        evidence, audit = build_evidence(
            "Show the total amount",
            analysis,
            "owner-a",
            session_id="session-contract",
        )

        flow = evidence["mandatoryFlow"]
        self.assertIn("safe_sql_generator", flow)
        self.assertIn("sql_validation", flow)
        self.assertIn("structured_json", flow)
        self.assertIn("evidence_validation", flow)
        safe_sql = evidence["sqlExecution"]["safeSql"]
        self.assertTrue(safe_sql["usesParameterizedSql"])
        self.assertNotIn("SELECT *", safe_sql["template"].upper())
        self.assertTrue(evidence["sqlExecution"]["validation"]["ok"])
        self.assertTrue(evidence["sqlExecution"]["fetchedOnlyRequiredData"])
        self.assertFalse(evidence["security"]["rawRowsIncluded"])
        self.assertFalse(evidence["security"]["fullDatasetIncluded"])
        self.assertTrue(evidence["evidenceValidation"]["sufficientForModel"])
        self.assertNotIn("R001", json.dumps(evidence, sort_keys=True))

    def test_only_ai_orchestrator_contains_external_model_endpoints(self) -> None:
        repo_root = Path(__file__).parents[2]
        endpoint_hits: list[str] = []
        for file_path in repo_root.rglob("*"):
            if file_path.suffix not in {".py", ".js", ".jsx", ".ts", ".tsx"}:
                continue
            if any(part in {"node_modules", "__pycache__", ".git", "dist"} for part in file_path.parts):
                continue
            relative = file_path.relative_to(repo_root).as_posix()
            if relative.startswith("backend/tests/"):
                continue
            text = file_path.read_text(encoding="utf-8", errors="ignore")
            if "api.openai.com" in text or "router.huggingface.co" in text:
                endpoint_hits.append(relative)

        self.assertEqual(endpoint_hits, ["backend/ai/orchestrator.py"])

    def test_ai_prompt_builder_sends_only_structured_business_evidence(self) -> None:
        from backend import app as app_module
        from backend.ai.prompt_builder import build_prompt

        analysis, _dataset = app_module._store_then_analyze(
            "analytics_contract.csv",
            CSV_PATH.read_bytes(),
            "owner-a",
            "manual_upload",
            content_type="text/csv",
        )
        evidence, _audit = build_evidence(
            "Explain the total amount",
            analysis,
            "owner-a",
            session_id="session-contract",
        )

        prompt_bundle = build_prompt(
            user_question="Explain the total amount",
            evidence=evidence,
            business_context={"purpose": "test"},
            workspace_context={"ownerUserId": "owner-a", "datasetId": analysis["datasetId"]},
        )
        prompt = prompt_bundle["prompt"]

        self.assertTrue(prompt_bundle["allowed"])
        self.assertIn("structuredJson", prompt)
        self.assertIn("Never generate SQL", prompt)
        self.assertNotIn("sqlExecution", prompt)
        self.assertNotIn("safeSql", prompt)
        self.assertNotIn("SELECT", prompt.upper())
        self.assertNotIn("owner-a", prompt)
        self.assertNotIn("R001", prompt)

    def test_ai_response_validator_blocks_unsupported_numbers(self) -> None:
        from backend.ai.response_validator import INSUFFICIENT, validate_ai_response

        result = validate_ai_response(
            response_text="Revenue is 999 and increased by 42%.",
            structured_json={"kpis": [{"label": "Revenue", "value": 100}]},
            fallback=INSUFFICIENT,
        )

        self.assertFalse(result["ok"])
        self.assertEqual(result["text"], INSUFFICIENT)

    def test_analytics_dataset_is_shared_by_dashboard_powerbi_ai_reports_and_exports(self) -> None:
        from backend import app as app_module
        from backend.analytics.analytics_dataset import (
            build_power_bi_manifest,
            get_analytics_dataset,
            get_power_bi_semantic_view,
        )

        analysis, _dataset = app_module._store_then_analyze(
            "analytics_contract.csv",
            CSV_PATH.read_bytes(),
            "owner-a",
            "manual_upload",
            content_type="text/csv",
        )

        analytics_dataset = analysis["analyticsDataset"]
        self.assertEqual(
            analysis["analyticsDatasetId"],
            analytics_dataset["analyticsDatasetId"],
        )
        self.assertEqual(
            analytics_dataset["metricContract"]["sourceOfTruth"],
            "analytics_dataset",
        )
        self.assertEqual(
            analytics_dataset["metricContract"]["requiredProductionStore"],
            "postgresql_after_preprocessing",
        )
        self.assertFalse(analytics_dataset["metricContract"]["dashboardMayRecalculate"])
        self.assertFalse(analytics_dataset["metricContract"]["powerBiMayRecalculate"])
        self.assertFalse(analytics_dataset["metricContract"]["openAIMayRecalculate"])

        self.assertEqual(
            analytics_dataset["dashboard"]["kpis"],
            analytics_dataset["openAI"]["structuredJson"]["kpis"],
        )
        self.assertEqual(
            analytics_dataset["dashboard"]["kpis"],
            analytics_dataset["reports"]["kpis"],
        )
        self.assertEqual(
            analytics_dataset["dashboard"]["kpis"],
            analytics_dataset["exports"]["kpis"],
        )
        self.assertFalse(_contains_secret_key(analytics_dataset))

        loaded = get_analytics_dataset(
            analytics_dataset["analyticsDatasetId"],
            "owner-a",
            page=1,
            page_size=2,
        )
        self.assertEqual(
            loaded["analyticsDatasetId"],
            analytics_dataset["analyticsDatasetId"],
        )
        self.assertEqual(loaded["dashboard"]["pagination"]["pageSize"], 2)

        manifest = build_power_bi_manifest(
            analytics_dataset["analyticsDatasetId"],
            "owner-a",
        )
        self.assertFalse(manifest["model"]["rawTablesExposed"])
        self.assertFalse(manifest["model"]["oauthDataExposed"])
        self.assertFalse(manifest["model"]["temporaryTablesExposed"])

        kpi_view = get_power_bi_semantic_view(
            analytics_dataset["analyticsDatasetId"],
            "owner-a",
            "kpis",
        )
        self.assertEqual(kpi_view["rows"], analytics_dataset["dashboard"]["kpis"])
        self.assertFalse(kpi_view["mayRecalculate"])

        preview_view = get_power_bi_semantic_view(
            analytics_dataset["analyticsDatasetId"],
            "owner-a",
            "table_preview",
            page=1,
            page_size=2,
        )
        self.assertEqual(len(preview_view["rows"]), 2)
        self.assertEqual(preview_view["pagination"]["pageSize"], 2)
        self.assertIsNone(
            get_power_bi_semantic_view(
                analytics_dataset["analyticsDatasetId"],
                "owner-a",
                "raw_connector_rows",
            )
        )


class ApiContractTests(unittest.TestCase):
    def test_health_endpoint_contract(self) -> None:
        from backend.app import app

        sent: list[dict] = []
        incoming = [{"type": "http.request", "body": b"", "more_body": False}]

        async def receive() -> dict:
            return incoming.pop(0)

        async def send(message: dict) -> None:
            sent.append(message)

        scope = {
            "type": "http",
            "method": "GET",
            "path": "/api/health",
            "query_string": b"",
            "headers": [],
        }
        asyncio.run(app(scope, receive, send))

        start = next(item for item in sent if item["type"] == "http.response.start")
        body = b"".join(
            item.get("body", b"")
            for item in sent
            if item["type"] == "http.response.body"
        )
        payload = json.loads(body)
        self.assertEqual(start["status"], 200)
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["engine"], "Universal File Analytics Engine")
        self.assertIn("version", payload)


if __name__ == "__main__":
    unittest.main()
