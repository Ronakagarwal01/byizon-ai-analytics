from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier, GradientBoostingRegressor, RandomForestClassifier, RandomForestRegressor
from sklearn.linear_model import Lasso, LinearRegression, LogisticRegression, Ridge
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.neighbors import KNeighborsClassifier, KNeighborsRegressor
from sklearn.pipeline import Pipeline
from sklearn.svm import SVC, SVR
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor

from .model_evaluator import evaluate_classification, evaluate_regression
from .preprocessing_engine import make_preprocessor, split_features_target
from .data_profiler import clean_numeric


def _classification_models(row_count: int) -> dict[str, Any]:
    models: dict[str, Any] = {
        "Logistic Regression": LogisticRegression(max_iter=1000, class_weight="balanced"),
        "Decision Tree": DecisionTreeClassifier(max_depth=8, random_state=42, class_weight="balanced"),
        "Random Forest": RandomForestClassifier(n_estimators=120, random_state=42, class_weight="balanced", n_jobs=-1),
        "Gradient Boosting": GradientBoostingClassifier(random_state=42),
        "KNN": KNeighborsClassifier(n_neighbors=5),
    }
    if row_count <= 5000:
        models["SVM"] = SVC(probability=True, class_weight="balanced", random_state=42)
    return models


def _regression_models(row_count: int) -> dict[str, Any]:
    models: dict[str, Any] = {
        "Linear Regression": LinearRegression(),
        "Ridge": Ridge(alpha=1.0),
        "Lasso": Lasso(alpha=0.001, max_iter=5000),
        "Decision Tree Regressor": DecisionTreeRegressor(max_depth=8, random_state=42),
        "Random Forest Regressor": RandomForestRegressor(n_estimators=120, random_state=42, n_jobs=-1),
        "Gradient Boosting Regressor": GradientBoostingRegressor(random_state=42),
        "KNN Regressor": KNeighborsRegressor(n_neighbors=5),
    }
    if row_count <= 3000:
        models["SVM Regressor"] = SVR()
    return models


def _feature_importance(fitted_pipeline: Pipeline, top_n: int = 20) -> list[dict[str, Any]]:
    try:
        preprocessor = fitted_pipeline.named_steps["preprocessor"]
        model = fitted_pipeline.named_steps["model"]
        names = list(preprocessor.get_feature_names_out())
        values = None
        if hasattr(model, "feature_importances_"):
            values = model.feature_importances_
        elif hasattr(model, "coef_"):
            coef = model.coef_
            values = np.abs(coef[0] if getattr(coef, "ndim", 1) > 1 else coef)
        if values is None:
            return []
        pairs = sorted(zip(names, values), key=lambda item: abs(float(item[1])), reverse=True)[:top_n]
        return [{"feature": str(name), "importance": round(float(value), 6)} for name, value in pairs]
    except Exception:
        return []


def train_models(df: pd.DataFrame, task: dict[str, Any], preprocessing_plan: dict[str, Any]) -> dict[str, Any]:
    task_type = task.get("taskType")
    target_col = task.get("targetColumn")
    if task_type in {"clustering", "unsupported"} or not target_col:
        return {
            "trained": False,
            "reason": task.get("reason", "No supervised target available."),
            "modelComparison": [],
            "bestModel": None,
            "featureImportance": [],
        }

    x, y = split_features_target(df, target_col)
    usable = y.notna()
    x = x.loc[usable]
    y = y.loc[usable]
    if task_type == "regression":
        numeric_y = clean_numeric(y)
        usable_numeric = numeric_y.notna()
        x = x.loc[usable_numeric]
        y = numeric_y.loc[usable_numeric]
    if len(x) < 30:
        return {
            "trained": False,
            "reason": "Dataset has fewer than 30 labelled rows after preprocessing; ML metrics would be unreliable.",
            "modelComparison": [],
            "bestModel": None,
            "featureImportance": [],
        }
    if not preprocessing_plan["numericFeatures"] and not preprocessing_plan["categoricalFeatures"]:
        return {
            "trained": False,
            "reason": "No usable feature columns remained after removing IDs/contact/high-cardinality fields.",
            "modelComparison": [],
            "bestModel": None,
            "featureImportance": [],
        }

    is_classification = task_type in {"binary_classification", "multiclass_classification"}
    stratify = y if is_classification and y.nunique() > 1 and y.value_counts().min() >= 2 else None
    x_train, x_test, y_train, y_test = train_test_split(x, y, test_size=0.25, random_state=42, stratify=stratify)
    model_defs = _classification_models(len(x)) if is_classification else _regression_models(len(x))
    comparison: list[dict[str, Any]] = []
    fitted: dict[str, Pipeline] = {}

    for name, estimator in model_defs.items():
        try:
            pipeline = Pipeline([
                ("preprocessor", make_preprocessor(preprocessing_plan)),
                ("model", estimator),
            ])
            pipeline.fit(x_train, y_train)
            if is_classification:
                metrics = evaluate_classification(pipeline, x_test, y_test, task_type)
                scoring = "f1_weighted"
                score_for_selection = metrics.get("rocAuc") if task_type == "binary_classification" and metrics.get("rocAuc") is not None else metrics["f1"]
            else:
                metrics = evaluate_regression(pipeline, x_test, y_test)
                scoring = "r2"
                score_for_selection = metrics["r2"]
            cv_folds = min(5, max(2, int(y.value_counts().min()) if is_classification else 5))
            try:
                cv_scores = cross_val_score(pipeline, x, y, cv=cv_folds, scoring=scoring)
                metrics["crossValidationScore"] = round(float(np.nanmean(cv_scores)), 4)
            except Exception:
                metrics["crossValidationScore"] = None
            comparison.append({
                "model": name,
                "metrics": metrics,
                "selectionScore": round(float(score_for_selection), 6),
            })
            fitted[name] = pipeline
        except Exception as exc:
            comparison.append({"model": name, "error": str(exc), "metrics": {}, "selectionScore": None})

    valid = [row for row in comparison if row.get("selectionScore") is not None]
    if not valid:
        return {
            "trained": False,
            "reason": "All model training attempts failed.",
            "modelComparison": comparison,
            "bestModel": None,
            "featureImportance": [],
        }
    if is_classification:
        best_row = max(valid, key=lambda row: row["selectionScore"])
        selectionMetric = "ROC-AUC" if task_type == "binary_classification" and best_row["metrics"].get("rocAuc") is not None else "F1-score"
    else:
        best_row = max(valid, key=lambda row: (row["metrics"].get("r2", -999), -row["metrics"].get("rmse", 999999999)))
        selectionMetric = "R2 with RMSE tie-break"
    best_pipeline = fitted.get(best_row["model"])

    return {
        "trained": True,
        "taskType": task_type,
        "targetColumn": target_col,
        "rowCountUsed": int(len(x)),
        "trainRows": int(len(x_train)),
        "testRows": int(len(x_test)),
        "selectionMetric": selectionMetric,
        "modelComparison": comparison,
        "bestModel": best_row,
        "featureImportance": _feature_importance(best_pipeline) if best_pipeline else [],
    }
