-- Byizon domain-agnostic analytics warehouse.
-- The API applies the same idempotent schema automatically at startup/use.

CREATE TABLE IF NOT EXISTS analytics_sources (
    dataset_id TEXT NOT NULL,
    owner_user_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    content_type TEXT,
    source_kind TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    raw_blob BYTEA NOT NULL,
    metadata_json TEXT NOT NULL,
    domain TEXT,
    dataset_type TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (dataset_id, owner_user_id)
);

CREATE TABLE IF NOT EXISTS analytics_tables (
    table_id TEXT PRIMARY KEY,
    dataset_id TEXT NOT NULL,
    owner_user_id TEXT NOT NULL,
    table_name TEXT NOT NULL,
    source_type TEXT NOT NULL,
    row_count INTEGER NOT NULL,
    column_count INTEGER NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS analytics_columns (
    table_id TEXT NOT NULL,
    dataset_id TEXT NOT NULL,
    owner_user_id TEXT NOT NULL,
    table_name TEXT NOT NULL,
    column_name TEXT NOT NULL,
    column_position INTEGER NOT NULL,
    data_type TEXT NOT NULL,
    semantic_type TEXT NOT NULL,
    is_sensitive INTEGER NOT NULL,
    non_null_count INTEGER NOT NULL,
    unique_count INTEGER NOT NULL,
    PRIMARY KEY (table_id, column_name)
);

CREATE TABLE IF NOT EXISTS analytics_rows (
    table_id TEXT NOT NULL,
    dataset_id TEXT NOT NULL,
    owner_user_id TEXT NOT NULL,
    row_number INTEGER NOT NULL,
    row_json TEXT NOT NULL,
    PRIMARY KEY (table_id, row_number)
);

CREATE TABLE IF NOT EXISTS analytics_cells (
    table_id TEXT NOT NULL,
    dataset_id TEXT NOT NULL,
    owner_user_id TEXT NOT NULL,
    row_number INTEGER NOT NULL,
    column_name TEXT NOT NULL,
    text_value TEXT,
    numeric_value DOUBLE PRECISION,
    date_value TEXT,
    is_null INTEGER NOT NULL,
    PRIMARY KEY (table_id, row_number, column_name)
);

CREATE TABLE IF NOT EXISTS analytics_query_audit (
    query_run_id TEXT PRIMARY KEY,
    dataset_id TEXT NOT NULL,
    owner_user_id TEXT NOT NULL,
    question_hash TEXT NOT NULL,
    query_ids_json TEXT NOT NULL,
    result_count INTEGER NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_analytics_tables_scope
    ON analytics_tables (dataset_id, owner_user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_columns_scope
    ON analytics_columns (dataset_id, owner_user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_rows_scope
    ON analytics_rows (dataset_id, owner_user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_cells_scope
    ON analytics_cells (dataset_id, owner_user_id, column_name);
CREATE INDEX IF NOT EXISTS idx_analytics_cells_numeric
    ON analytics_cells (dataset_id, owner_user_id, numeric_value);
CREATE INDEX IF NOT EXISTS idx_analytics_cells_date
    ON analytics_cells (dataset_id, owner_user_id, date_value);
