from __future__ import annotations

from typing import Any


def generate_data_science_insights(
    eda: dict[str, Any],
    task: dict[str, Any],
    preprocessing: dict[str, Any],
    features: list[dict[str, Any]],
    model_result: dict[str, Any],
    clustering_result: dict[str, Any],
) -> dict[str, Any]:
    insights: list[dict[str, Any]] = []
    recommendations: list[str] = []

    insights.append({
        "title": "Dataset Summary",
        "observation": f"Dataset has {eda['rows']:,} rows and {eda['columns']:,} columns.",
        "evidence": f"Detected semantic types: {eda.get('dataTypes', {})}.",
        "impact": "This defines the available sample size and feature space for analysis.",
        "recommendation": "Use larger samples and cleaner feature columns for stronger model reliability.",
    })

    if eda.get("missingValues"):
        top = eda["missingValues"][0]
        insights.append({
            "title": "Missing Value Issue",
            "observation": f"{top['column']} has the largest missing-value problem.",
            "evidence": f"{top['missingCount']:,} missing values ({top['missingPercent']}%).",
            "impact": "Missingness can bias model training and business conclusions.",
            "recommendation": f"Review why {top['column']} is missing and validate the imputation strategy.",
        })

    pairs = (eda.get("correlation") or {}).get("pairs") or []
    if pairs:
        pair = pairs[0]
        insights.append({
            "title": "Strongest Correlation",
            "observation": f"{pair['x']} and {pair['y']} have the strongest detected relationship.",
            "evidence": f"Correlation r={pair['correlation']} ({pair['direction']}, {pair['strength']}).",
            "impact": "This can indicate a driver, duplicate calculation, or data leakage candidate.",
            "recommendation": "Validate whether this relationship is expected before using both fields in a model.",
        })

    if eda.get("classImbalance"):
        item = eda["classImbalance"]
        insights.append({
            "title": "Class Imbalance",
            "observation": f"Target class distribution is {item['severity'].lower()} imbalance.",
            "evidence": f"Majority class {item['majorityClass']} is {item['majorityShare']}% of labelled rows.",
            "impact": "Accuracy alone may be misleading for classification.",
            "recommendation": "Use F1, recall, ROC-AUC, stratified validation, and possibly rebalancing.",
        })

    if eda.get("dataLeakageWarnings"):
        warning = eda["dataLeakageWarnings"][0]
        insights.append({
            "title": "Data Leakage Risk",
            "observation": f"{warning['column']} may leak target information.",
            "evidence": warning["reason"],
            "impact": "Leakage can produce fake model performance.",
            "recommendation": "Remove or validate this column before trusting model metrics.",
        })

    if features:
        insights.append({
            "title": "Feature Engineering",
            "observation": f"{len(features)} engineered features were created.",
            "evidence": ", ".join(item["feature"] for item in features[:6]),
            "impact": "Engineered features may expose time, text, ratio, or binned patterns.",
            "recommendation": "Review engineered features for leakage and business validity.",
        })

    if model_result.get("trained"):
        best = model_result.get("bestModel") or {}
        insights.append({
            "title": "Best Model",
            "observation": f"{best.get('model')} performed best for {model_result.get('taskType')}.",
            "evidence": f"Selection metric: {model_result.get('selectionMetric')}; metrics: {best.get('metrics', {})}.",
            "impact": "This is the strongest baseline model trained on the uploaded data.",
            "recommendation": "Treat this as a baseline; validate on fresh holdout data before production use.",
        })
        if model_result.get("featureImportance"):
            top = model_result["featureImportance"][0]
            insights.append({
                "title": "Top Driver",
                "observation": f"{top['feature']} is the strongest model driver.",
                "evidence": f"Importance score {top['importance']}.",
                "impact": "This feature contributes most to the current best model.",
                "recommendation": "Validate this driver with domain knowledge and leakage checks.",
            })
    elif clustering_result.get("trained"):
        best = clustering_result.get("bestModel") or {}
        insights.append({
            "title": "Clustering Result",
            "observation": f"{best.get('model')} was the best unsupervised clustering option.",
            "evidence": f"Silhouette score {best.get('silhouetteScore')}.",
            "impact": "Clusters may reveal natural groups, but they are not predictive labels.",
            "recommendation": "Profile clusters and decide whether they correspond to real-world segments.",
        })
    else:
        insights.append({
            "title": "Model Training Status",
            "observation": "No supervised ML result was produced.",
            "evidence": model_result.get("reason") or task.get("reason"),
            "impact": "The system did not fabricate model metrics.",
            "recommendation": "Select a clear target column or provide more labelled rows for supervised training.",
        })

    if preprocessing.get("skippedFeatures"):
        recommendations.append("Review skipped ID/contact/high-cardinality columns so useful information is not accidentally discarded.")
    if eda.get("dataLeakageWarnings"):
        recommendations.append("Resolve leakage warnings before trusting model evaluation.")
    if task.get("requiresTargetSelection"):
        recommendations.append("Select a target column to enable supervised classification or regression.")
    if model_result.get("trained"):
        recommendations.append("Use the best model only as a baseline until tested on fresh unseen data.")
    if not recommendations:
        recommendations.append("Continue with domain validation and collect more labelled data if model deployment is planned.")

    return {
        "insights": insights,
        "recommendations": recommendations,
        "conclusion": _conclusion(task, model_result, clustering_result),
    }


def _conclusion(task: dict[str, Any], model_result: dict[str, Any], clustering_result: dict[str, Any]) -> str:
    if model_result.get("trained"):
        best = model_result.get("bestModel") or {}
        return f"Supervised {task.get('taskType')} training completed. Best model: {best.get('model')}."
    if clustering_result.get("trained"):
        best = clustering_result.get("bestModel") or {}
        return f"No confident target was detected, so clustering was run. Best clustering: {best.get('model')}."
    return "Data science workflow completed without fake ML metrics; target or data limitations prevented reliable model training."
