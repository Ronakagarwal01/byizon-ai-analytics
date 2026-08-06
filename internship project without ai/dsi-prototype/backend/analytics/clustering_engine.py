from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from sklearn.cluster import DBSCAN, KMeans
from sklearn.decomposition import PCA
from sklearn.metrics import silhouette_score

from .preprocessing_engine import make_preprocessor


def run_clustering(df: pd.DataFrame, task: dict[str, Any], preprocessing_plan: dict[str, Any]) -> dict[str, Any]:
    if not preprocessing_plan["numericFeatures"] and not preprocessing_plan["categoricalFeatures"]:
        return {"trained": False, "reason": "No usable features available for clustering.", "models": [], "bestModel": None}
    if len(df) < 10:
        return {"trained": False, "reason": "At least 10 rows are needed for useful clustering.", "models": [], "bestModel": None}

    x = df.drop(columns=[task["targetColumn"]], errors="ignore") if task.get("targetColumn") else df.copy()
    try:
        matrix = make_preprocessor(preprocessing_plan).fit_transform(x)
    except Exception as exc:
        return {"trained": False, "reason": f"Preprocessing failed for clustering: {exc}", "models": [], "bestModel": None}

    if matrix.shape[0] < 10 or matrix.shape[1] < 1:
        return {"trained": False, "reason": "Not enough usable rows/features after preprocessing.", "models": [], "bestModel": None}

    models: list[dict[str, Any]] = []
    max_k = min(6, max(2, matrix.shape[0] // 5))
    for k in range(2, max_k + 1):
        try:
            labels = KMeans(n_clusters=k, random_state=42, n_init=10).fit_predict(matrix)
            score = float(silhouette_score(matrix, labels)) if len(set(labels)) > 1 else None
            models.append({"model": f"KMeans k={k}", "clusters": k, "silhouetteScore": round(score, 4) if score is not None else None})
        except Exception as exc:
            models.append({"model": f"KMeans k={k}", "error": str(exc), "silhouetteScore": None})

    if matrix.shape[0] <= 3000:
        try:
            labels = DBSCAN(eps=0.8, min_samples=5).fit_predict(matrix)
            clusters = len(set(labels) - {-1})
            score = float(silhouette_score(matrix, labels)) if clusters >= 2 else None
            models.append({"model": "DBSCAN", "clusters": clusters, "noiseRows": int((labels == -1).sum()), "silhouetteScore": round(score, 4) if score is not None else None})
        except Exception as exc:
            models.append({"model": "DBSCAN", "error": str(exc), "silhouetteScore": None})

    valid = [row for row in models if row.get("silhouetteScore") is not None]
    best = max(valid, key=lambda row: row["silhouetteScore"]) if valid else None
    pca_points: list[dict[str, Any]] = []
    if best and best["model"].startswith("KMeans"):
        k = int(str(best["model"]).split("=")[-1])
        labels = KMeans(n_clusters=k, random_state=42, n_init=10).fit_predict(matrix)
        points = PCA(n_components=2, random_state=42).fit_transform(matrix)
        pca_points = [
            {"x": float(x), "y": float(y), "cluster": int(label)}
            for (x, y), label in zip(points[:500], labels[:500])
        ]

    return {
        "trained": bool(best),
        "reason": "No target was detected, so unsupervised clustering was evaluated." if task.get("requiresTargetSelection") else "Clustering evaluated.",
        "models": models,
        "bestModel": best,
        "pcaPlotData": pca_points,
    }
