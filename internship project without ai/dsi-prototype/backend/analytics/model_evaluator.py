from __future__ import annotations

from typing import Any

import numpy as np
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    mean_absolute_error,
    mean_squared_error,
    precision_score,
    r2_score,
    recall_score,
    roc_auc_score,
)


def evaluate_classification(model, x_test, y_test, task_type: str) -> dict[str, Any]:
    pred = model.predict(x_test)
    labels = sorted(list(set(y_test) | set(pred)), key=lambda value: str(value))
    average = "binary" if task_type == "binary_classification" and len(labels) == 2 else "weighted"
    positive_label = labels[-1] if average == "binary" else None
    metrics = {
        "accuracy": round(float(accuracy_score(y_test, pred)), 4),
        "precision": round(float(precision_score(y_test, pred, average=average, pos_label=positive_label, zero_division=0)), 4),
        "recall": round(float(recall_score(y_test, pred, average=average, pos_label=positive_label, zero_division=0)), 4),
        "f1": round(float(f1_score(y_test, pred, average=average, pos_label=positive_label, zero_division=0)), 4),
        "confusionMatrix": confusion_matrix(y_test, pred, labels=labels).tolist(),
        "labels": [str(label) for label in labels],
        "classificationReport": classification_report(y_test, pred, zero_division=0, output_dict=True),
    }
    if task_type == "binary_classification" and len(labels) == 2 and hasattr(model, "predict_proba"):
        try:
            proba = model.predict_proba(x_test)[:, 1]
            binary_y = [1 if value == positive_label else 0 for value in y_test]
            metrics["rocAuc"] = round(float(roc_auc_score(binary_y, proba)), 4)
            metrics["rocCurveAvailable"] = True
        except Exception:
            metrics["rocCurveAvailable"] = False
    return metrics


def evaluate_regression(model, x_test, y_test) -> dict[str, Any]:
    pred = model.predict(x_test)
    mse = float(mean_squared_error(y_test, pred))
    return {
        "mae": round(float(mean_absolute_error(y_test, pred)), 4),
        "mse": round(mse, 4),
        "rmse": round(float(np.sqrt(mse)), 4),
        "r2": round(float(r2_score(y_test, pred)), 4),
        "actualVsPredicted": [
            {"actual": float(actual), "predicted": float(predicted)}
            for actual, predicted in list(zip(y_test, pred))[:200]
        ],
    }
