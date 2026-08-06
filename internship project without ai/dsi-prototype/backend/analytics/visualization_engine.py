from __future__ import annotations

import base64
import io
from typing import Any

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns

from .data_profiler import clean_numeric


def _fig_to_data_uri(fig) -> str:
    buffer = io.BytesIO()
    fig.tight_layout()
    fig.savefig(buffer, format="png", dpi=95, bbox_inches="tight")
    plt.close(fig)
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def _plot(plot_id: str, title: str, plot_type: str, source_columns: list[str], image: str, reason: str) -> dict[str, Any]:
    return {
        "id": plot_id,
        "title": title,
        "type": plot_type,
        "sourceColumns": source_columns,
        "image": image,
        "reason": reason,
    }


def _semantic_columns(schema: dict[str, Any]) -> list[dict[str, Any]]:
    table = next((item for item in schema.get("tables", []) if item.get("name") == schema.get("primaryTable")), {})
    return list(table.get("columns", []))


def generate_visualizations(
    df: pd.DataFrame,
    schema: dict[str, Any],
    eda: dict[str, Any],
    task: dict[str, Any],
    model_result: dict[str, Any],
    clustering_result: dict[str, Any],
) -> dict[str, Any]:
    columns = _semantic_columns(schema)
    measures = [column["name"] for column in columns if column.get("isMeasure") and column["name"] in df.columns][:5]
    dimensions = [column["name"] for column in columns if column.get("isDimension") and column["name"] in df.columns and 1 < column.get("uniqueCount", 0) <= 25][:5]
    target = task.get("targetColumn")
    plots: list[dict[str, Any]] = []

    missing_cols = [row for row in eda.get("missingValues", []) if row.get("missingCount", 0) > 0]
    if missing_cols:
        fig, ax = plt.subplots(figsize=(8, 3))
        sns.heatmap(df.isna(), cbar=False, ax=ax)
        ax.set_title("Missing Values Heatmap")
        plots.append(_plot("missing_heatmap", "Missing Values Heatmap", "heatmap", list(df.columns), _fig_to_data_uri(fig), "Missing values exist in the uploaded data."))

    for column in dimensions[:3]:
        counts = df[column].astype(str).str.strip().replace("", "Unknown").value_counts().head(12)
        if len(counts) > 1:
            fig, ax = plt.subplots(figsize=(7, 3.8))
            sns.barplot(x=counts.values, y=counts.index, ax=ax)
            ax.set_title(f"Count Plot: {column}")
            ax.set_xlabel("Count")
            ax.set_ylabel(column)
            plots.append(_plot(f"count_{column}", f"Count Plot: {column}", "countplot", [column], _fig_to_data_uri(fig), "Categorical column has meaningful repeated groups."))

    for column in measures[:3]:
        values = clean_numeric(df[column]).dropna()
        if len(values) >= 5:
            fig, ax = plt.subplots(figsize=(7, 3.8))
            sns.histplot(values, kde=True, ax=ax)
            ax.set_title(f"Histogram: {column}")
            plots.append(_plot(f"hist_{column}", f"Histogram: {column}", "histogram", [column], _fig_to_data_uri(fig), "Numeric measure supports distribution analysis."))

            fig, ax = plt.subplots(figsize=(7, 2.8))
            sns.boxplot(x=values, ax=ax)
            ax.set_title(f"Boxplot: {column}")
            plots.append(_plot(f"box_{column}", f"Boxplot: {column}", "boxplot", [column], _fig_to_data_uri(fig), "Numeric measure supports outlier inspection."))

    numeric_df = pd.DataFrame({column: clean_numeric(df[column]) for column in measures}).dropna(axis=1, how="all")
    if numeric_df.shape[1] >= 2:
        fig, ax = plt.subplots(figsize=(6, 4.5))
        sns.heatmap(numeric_df.corr().fillna(0), annot=True, fmt=".2f", cmap="vlag", ax=ax)
        ax.set_title("Correlation Heatmap")
        plots.append(_plot("correlation_heatmap_img", "Correlation Heatmap", "heatmap", list(numeric_df.columns), _fig_to_data_uri(fig), "At least two valid numeric measures exist."))
        if numeric_df.shape[1] <= 5 and len(numeric_df.dropna()) <= 1000:
            grid = sns.pairplot(numeric_df.dropna().sample(min(500, len(numeric_df.dropna())), random_state=42))
            grid.fig.suptitle("Pairplot: Important Numeric Columns", y=1.02)
            plots.append(_plot("pairplot_numeric", "Pairplot: Important Numeric Columns", "pairplot", list(numeric_df.columns), _fig_to_data_uri(grid.fig), "Small numeric feature set supports pairwise visual inspection."))

    if target and target in df.columns:
        values = df[target].dropna()
        if values.nunique() <= 30:
            counts = values.astype(str).value_counts()
            fig, ax = plt.subplots(figsize=(7, 3.8))
            sns.barplot(x=counts.values, y=counts.index, ax=ax)
            ax.set_title(f"Target Distribution: {target}")
            plots.append(_plot("target_distribution_plot", f"Target Distribution: {target}", "target_distribution", [target], _fig_to_data_uri(fig), "Detected target supports outcome distribution analysis."))
            for dimension in dimensions[:2]:
                fig, ax = plt.subplots(figsize=(8, 4))
                sns.countplot(data=df, y=dimension, hue=target, order=df[dimension].astype(str).value_counts().head(10).index, ax=ax)
                ax.set_title(f"{target} by {dimension}")
                plots.append(_plot(f"target_by_{dimension}", f"{target} by {dimension}", "target_vs_categorical", [target, dimension], _fig_to_data_uri(fig), "Target and categorical column support grouped comparison."))
        for measure in measures[:2]:
            fig, ax = plt.subplots(figsize=(7, 4))
            plot_df = pd.DataFrame({target: df[target], measure: clean_numeric(df[measure])}).dropna()
            if not plot_df.empty and plot_df[target].nunique() <= 30:
                sns.boxplot(data=plot_df, x=target, y=measure, ax=ax)
                ax.set_title(f"{measure} by {target}")
                plots.append(_plot(f"{measure}_by_target", f"{measure} by {target}", "target_vs_numeric", [target, measure], _fig_to_data_uri(fig), "Target and numeric measure support distribution comparison."))

    if model_result.get("featureImportance"):
        rows = model_result["featureImportance"][:15]
        fig, ax = plt.subplots(figsize=(7, 4.5))
        sns.barplot(x=[row["importance"] for row in rows], y=[row["feature"] for row in rows], ax=ax)
        ax.set_title("Feature Importance")
        plots.append(_plot("feature_importance_plot", "Feature Importance", "feature_importance", [row["feature"] for row in rows], _fig_to_data_uri(fig), "A trained model exposed feature importance or coefficients."))

    best = model_result.get("bestModel") or {}
    metrics = best.get("metrics") or {}
    if metrics.get("confusionMatrix"):
        fig, ax = plt.subplots(figsize=(4.5, 4))
        sns.heatmap(metrics["confusionMatrix"], annot=True, fmt="g", cmap="Blues", ax=ax)
        ax.set_title("Confusion Matrix")
        plots.append(_plot("confusion_matrix_plot", "Confusion Matrix", "confusion_matrix", [target] if target else [], _fig_to_data_uri(fig), "Classification model was actually trained and evaluated."))
    if metrics.get("actualVsPredicted"):
        points = metrics["actualVsPredicted"]
        fig, ax = plt.subplots(figsize=(5, 5))
        sns.scatterplot(x=[p["actual"] for p in points], y=[p["predicted"] for p in points], ax=ax)
        ax.set_title("Actual vs Predicted")
        ax.set_xlabel("Actual")
        ax.set_ylabel("Predicted")
        plots.append(_plot("actual_vs_predicted_plot", "Actual vs Predicted", "actual_vs_predicted", [target] if target else [], _fig_to_data_uri(fig), "Regression model was actually trained and evaluated."))

    if clustering_result.get("pcaPlotData"):
        points = pd.DataFrame(clustering_result["pcaPlotData"])
        fig, ax = plt.subplots(figsize=(6, 4.5))
        sns.scatterplot(data=points, x="x", y="y", hue="cluster", palette="tab10", ax=ax)
        ax.set_title("PCA Cluster Visualization")
        plots.append(_plot("pca_cluster_plot", "PCA Cluster Visualization", "pca", [], _fig_to_data_uri(fig), "Clustering was evaluated and PCA projection was created."))

    return {"plots": plots[:14], "plotCount": min(len(plots), 14)}
