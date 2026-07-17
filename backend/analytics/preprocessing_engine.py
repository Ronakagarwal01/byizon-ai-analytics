from __future__ import annotations

from typing import Any

import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


def _semantic_columns(schema: dict[str, Any]) -> dict[str, dict[str, Any]]:
    table = next((item for item in schema.get("tables", []) if item.get("name") == schema.get("primaryTable")), {})
    return {column["name"]: column for column in table.get("columns", [])}


def build_preprocessing_plan(df: pd.DataFrame, schema: dict[str, Any], target_col: str | None = None) -> dict[str, Any]:
    semantics = _semantic_columns(schema)
    numeric_features: list[str] = []
    categorical_features: list[str] = []
    skipped: list[dict[str, str]] = []

    for column in df.columns:
        if column == target_col:
            continue
        semantic = semantics.get(column, {})
        if semantic.get("isIdentifier"):
            skipped.append({"column": column, "reason": "ID column removed from model features"})
            continue
        if semantic.get("semanticType") in {"email", "phone"}:
            skipped.append({"column": column, "reason": "Contact identifier removed"})
            continue
        if semantic.get("semanticType") == "free_text":
            if column.endswith("__text_length"):
                numeric_features.append(column)
            else:
                skipped.append({"column": column, "reason": "High-cardinality free text removed; engineered text length may be used"})
            continue
        if semantic.get("is_encoded_category"):
            categorical_features.append(column)
            continue

        if semantic.get("isMeasure") or pd.api.types.is_numeric_dtype(df[column]):
            numeric_features.append(column)
        else:
            unique_count = int(df[column].astype(str).nunique())
            if unique_count <= min(80, max(10, len(df) * 0.5)):
                categorical_features.append(column)
            else:
                skipped.append({"column": column, "reason": "High-cardinality categorical/text column removed"})

    numeric_features = [column for column in dict.fromkeys(numeric_features) if column in df.columns]
    categorical_features = [column for column in dict.fromkeys(categorical_features) if column in df.columns and column not in numeric_features]

    return {
        "numericFeatures": numeric_features,
        "categoricalFeatures": categorical_features,
        "skippedFeatures": skipped,
        "steps": [
            "ID/contact/high-cardinality text columns ignored",
            "Numeric missing values imputed with median",
            "Categorical missing values imputed with most frequent value",
            "Categorical values encoded with OneHotEncoder",
            "Numeric values scaled with StandardScaler",
        ],
    }


def make_preprocessor(plan: dict[str, Any]) -> ColumnTransformer:
    transformers = []
    if plan["numericFeatures"]:
        transformers.append((
            "numeric",
            Pipeline([
                ("imputer", SimpleImputer(strategy="median")),
                ("scaler", StandardScaler()),
            ]),
            plan["numericFeatures"],
        ))
    if plan["categoricalFeatures"]:
        transformers.append((
            "categorical",
            Pipeline([
                ("imputer", SimpleImputer(strategy="most_frequent")),
                ("encoder", OneHotEncoder(handle_unknown="ignore", sparse_output=False, max_categories=30)),
            ]),
            plan["categoricalFeatures"],
        ))
    return ColumnTransformer(transformers=transformers, remainder="drop", verbose_feature_names_out=False)


def split_features_target(df: pd.DataFrame, target_col: str | None) -> tuple[pd.DataFrame, pd.Series | None]:
    if target_col and target_col in df.columns:
        return df.drop(columns=[target_col]), df[target_col]
    return df.copy(), None
