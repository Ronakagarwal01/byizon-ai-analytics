from __future__ import annotations

from typing import Any


def build_data_science_dashboard(data_science: dict[str, Any]) -> dict[str, Any]:
    task = data_science.get("taskDetection", {})
    model = data_science.get("modelTraining", {})
    clustering = data_science.get("clustering", {})
    visuals = data_science.get("visualizations", {}).get("plots", [])

    cards = [
        {"label": "ML Task", "value": task.get("taskType", "not detected"), "reason": task.get("reason", "")},
        {"label": "Target", "value": task.get("targetColumn") or "Not selected", "reason": "Detected target for supervised learning." if task.get("targetColumn") else "No confident target detected."},
        {"label": "Models Trained", "value": len([row for row in model.get("modelComparison", []) if not row.get("error")]), "reason": "Actual sklearn models that completed training."},
    ]
    if model.get("trained") and model.get("bestModel"):
        cards.append({"label": "Best Model", "value": model["bestModel"].get("model"), "reason": model.get("selectionMetric")})
    elif clustering.get("trained") and clustering.get("bestModel"):
        cards.append({"label": "Best Cluster Model", "value": clustering["bestModel"].get("model"), "reason": "Selected by silhouette score."})

    return {
        "cards": cards,
        "plots": visuals,
        "sections": [
            "Universal EDA",
            "Visual EDA",
            "Feature Engineering",
            "Preprocessing Pipeline",
            "Model Training Results" if model.get("trained") else "Clustering / Target Selection",
            "Risks and Limitations",
        ],
    }
