-- ============================================
-- ATLAS SYNC LOG — System Heartbeat
-- ============================================

CREATE TABLE atlas_sync_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sync_type TEXT NOT NULL,              -- 'positions', 'transactions', 'account_snapshot', 'orders', 'full'
  status TEXT NOT NULL DEFAULT 'started', -- 'started', 'running', 'completed', 'failed', 'partial'

  -- Metrics
  records_fetched INT DEFAULT 0,        -- what came from Alpaca
  records_upserted INT DEFAULT 0,       -- what was written to Supabase
  records_skipped INT DEFAULT 0,        -- duplicates or filtered out
  records_expected INT,                 -- if known ahead of time

  -- Validation
  validation_passed BOOLEAN,
  validation_errors JSONB DEFAULT '[]', -- array of { check, message, severity }

  -- Error handling
  error_message TEXT,
  error_stack TEXT,
  retry_count INT DEFAULT 0,

  -- Performance
  duration_ms INT,

  -- Context
  metadata JSONB DEFAULT '{}',          -- flexible: { trigger: 'scheduled', branch: 'main', etc }

  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Indexes for fast lookups
CREATE INDEX idx_sync_log_type ON atlas_sync_log(sync_type);
CREATE INDEX idx_sync_log_status ON atlas_sync_log(status);
CREATE INDEX idx_sync_log_started ON atlas_sync_log(started_at DESC);
CREATE INDEX idx_sync_log_type_started ON atlas_sync_log(sync_type, started_at DESC);

-- RLS
ALTER TABLE atlas_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON atlas_sync_log
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "anon_read_access" ON atlas_sync_log
  FOR SELECT USING (true);


-- ============================================
-- ATLAS SYNC STATUS — Current State Summary
-- ============================================
-- Single-row table that always reflects the latest sync state
-- Easier to query than scanning sync_log every time

CREATE TABLE atlas_sync_status (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- enforces single row
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT,
  last_sync_type TEXT,
  last_sync_duration_ms INT,
  last_sync_records INT,
  last_validation_passed BOOLEAN,
  consecutive_failures INT DEFAULT 0,
  last_failure_message TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed the single row
INSERT INTO atlas_sync_status (id) VALUES (1);

ALTER TABLE atlas_sync_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON atlas_sync_status
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "anon_read_access" ON atlas_sync_status
  FOR SELECT USING (true);


-- ============================================
-- ATLAS DATA VALIDATION LOG
-- ============================================
-- Separate from sync_log so validations can run independently

CREATE TABLE atlas_validation_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  check_name TEXT NOT NULL,             -- 'position_reconciliation', 'nav_drift', 'continuity', 'freshness'
  status TEXT NOT NULL,                 -- 'passed', 'warning', 'failed'
  severity TEXT DEFAULT 'warning',      -- 'info', 'warning', 'critical'
  message TEXT NOT NULL,
  details JSONB DEFAULT '{}',           -- { expected: 50, actual: 47, symbol: 'AAPL' }
  sync_log_id UUID REFERENCES atlas_sync_log(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_validation_status ON atlas_validation_log(status);
CREATE INDEX idx_validation_check ON atlas_validation_log(check_name);
CREATE INDEX idx_validation_created ON atlas_validation_log(created_at DESC);
CREATE INDEX idx_validation_severity ON atlas_validation_log(severity) WHERE severity = 'critical';

ALTER TABLE atlas_validation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON atlas_validation_log
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "anon_read_access" ON atlas_validation_log
  FOR SELECT USING (true);
