
-- ============================================================
-- ATLAS SQL Terminal — Supporting Tables & Functions
-- ============================================================

-- 1. Saved queries
CREATE TABLE IF NOT EXISTS saved_queries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    description     TEXT,
    sql_text        TEXT NOT NULL,
    tags            TEXT[]  DEFAULT '{}',
    is_pinned       BOOLEAN DEFAULT false,
    last_run_at     TIMESTAMPTZ,
    result_row_count INTEGER,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- 2. Query execution log
CREATE TABLE IF NOT EXISTS query_log (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sql_text         TEXT NOT NULL,
    execution_time_ms INTEGER,
    row_count        INTEGER,
    was_saved        BOOLEAN DEFAULT false,
    error            TEXT,
    executed_at      TIMESTAMPTZ DEFAULT now()
);

-- 3. Materialized insight registry
CREATE TABLE IF NOT EXISTS materialized_insights (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_query_id  UUID REFERENCES saved_queries(id) ON DELETE SET NULL,
    table_name       TEXT NOT NULL UNIQUE,
    refresh_schedule TEXT DEFAULT 'manual',
    last_refreshed_at TIMESTAMPTZ,
    row_count        INTEGER,
    created_at       TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_saved_queries_pinned
    ON saved_queries(is_pinned DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_query_log_executed
    ON query_log(executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_materialized_insights_schedule
    ON materialized_insights(refresh_schedule);

-- auto-update updated_at on saved_queries
CREATE OR REPLACE FUNCTION _set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_saved_queries_updated_at ON saved_queries;
CREATE TRIGGER trg_saved_queries_updated_at
    BEFORE UPDATE ON saved_queries
    FOR EACH ROW EXECUTE FUNCTION _set_updated_at();

-- ============================================================
-- RPC 1: run_read_sql — execute a read-only SQL statement
-- ============================================================
CREATE OR REPLACE FUNCTION public.run_read_sql(sql_text TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result   JSONB;
  norm     TEXT;
BEGIN
  SET LOCAL statement_timeout = '30000';   -- 30 s hard cap

  norm := upper(regexp_replace(sql_text, '\s+', ' ', 'g'));

  -- Belt-and-suspenders: block write keywords at DB level too
  IF norm ~ '\m(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|REPLACE|MERGE)\M' THEN
    RAISE EXCEPTION 'Write operations are not permitted in the SQL Terminal';
  END IF;

  -- Block dangerous system catalogues
  IF norm ~ '\m(PG_CATALOG|PG_CLASS|PG_PROC|PG_STAT_ACTIVITY|PG_TOAST)\M' THEN
    RAISE EXCEPTION 'Access to system catalogues is restricted';
  END IF;

  EXECUTE format(
    'SELECT jsonb_agg(row_to_json(t)) FROM (%s) t',
    sql_text
  ) INTO result;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_read_sql(TEXT) TO anon, authenticated;

-- ============================================================
-- RPC 2: materialize_insight — promote a query to a table
-- ============================================================
CREATE OR REPLACE FUNCTION public.materialize_insight(
    p_table_name      TEXT,
    p_sql_text        TEXT,
    p_source_query_id UUID    DEFAULT NULL,
    p_refresh_schedule TEXT   DEFAULT 'manual'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  full_table TEXT;
  row_count  INT;
BEGIN
  -- Strict name validation: lowercase letters/digits/underscores, max 55 chars
  IF p_table_name !~ '^[a-z][a-z0-9_]{0,54}$' THEN
    RAISE EXCEPTION 'Invalid table name. Use lowercase letters, numbers, and underscores (max 55 chars).';
  END IF;

  full_table := 'insight_' || p_table_name;

  EXECUTE format('DROP TABLE IF EXISTS %I', full_table);
  EXECUTE format('CREATE TABLE %I AS (%s)', full_table, p_sql_text);
  EXECUTE format('SELECT COUNT(*) FROM %I', full_table) INTO row_count;

  INSERT INTO materialized_insights
        (source_query_id, table_name, refresh_schedule, last_refreshed_at, row_count)
  VALUES (p_source_query_id, full_table, p_refresh_schedule, now(), row_count)
  ON CONFLICT (table_name) DO UPDATE
      SET last_refreshed_at = now(),
          row_count         = EXCLUDED.row_count,
          refresh_schedule  = EXCLUDED.refresh_schedule;

  RETURN jsonb_build_object('table_name', full_table, 'row_count', row_count);
END;
$$;

-- Only the service role (server-side Streamlit) may create tables
GRANT EXECUTE ON FUNCTION public.materialize_insight(TEXT, TEXT, UUID, TEXT) TO anon, authenticated;
