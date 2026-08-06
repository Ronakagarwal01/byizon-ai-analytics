from __future__ import annotations

from typing import Any

from .clustering_engine import run_clustering
from .dashboard_renderer import build_data_science_dashboard
from .eda_engine import build_eda
from .feature_engineering import apply_feature_engineering
from .insight_generator import generate_data_science_insights
from .model_trainer import train_models
from .preprocessing_engine import build_preprocessing_plan
from .task_detector import detect_ml_task
from .visualization_engine import generate_visualizations


def run_data_science_workflow(
    parsed: dict[str, Any],
    schema: dict[str, Any],
    profile: dict[str, Any],
    stats: dict[str, Any],
    anomaly_result: dict[str, Any],
) -> dict[str, Any]:
    primary = next(table for table in parsed["tables"] if table.name == schema["primaryTable"])
    raw_df = primary.dataframe.copy()

    eda = build_eda(parsed, schema, profile, stats, anomaly_result)
    task = detect_ml_task(raw_df, schema)
    engineered_df, engineered_features = apply_feature_engineering(raw_df, schema, task.get("targetColumn"))
    preprocessing_plan = build_preprocessing_plan(engineered_df, schema, task.get("targetColumn"))

    model_result = train_models(engineered_df, task, preprocessing_plan)
    clustering_result = run_clustering(engineered_df, task, preprocessing_plan) if task.get("taskType") == "clustering" else {"trained": False, "reason": "Supervised task detected; clustering skipped.", "models": [], "bestModel": None}
    visualization_result = generate_visualizations(engineered_df, schema, eda, task, model_result, clustering_result)
    insight_result = generate_data_science_insights(eda, task, preprocessing_plan, engineered_features, model_result, clustering_result)

    output = {
        "enabled": True,
        "eda": eda,
        "taskDetection": task,
        "featureEngineering": {
            "createdFeatures": engineered_features,
            "featureCount": len(engineered_features),
        },
        "preprocessing": preprocessing_plan,
        "modelTraining": model_result,
        "clustering": clustering_result,
        "visualizations": visualization_result,
        "insights": insight_result["insights"],
        "recommendations": insight_result["recommendations"],
        "conclusion": insight_result["conclusion"],
    }
    output["dashboard"] = build_data_science_dashboard(output)
    return output
