
CREATE TABLE IF NOT EXISTS portfolio_ips (
    id               serial      PRIMARY KEY,
    risk_tolerance   integer,
    risk_label       text,
    return_target    numeric,
    time_horizon     text,
    benchmark        text,
    concentration_limit numeric,
    liquidity_need   text,
    created_at       timestamptz DEFAULT now(),
    updated_at       timestamptz DEFAULT now()
);

-- Ensure RLS allows reads/writes from the anon key
ALTER TABLE portfolio_ips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "portfolio_ips_all" ON portfolio_ips FOR ALL USING (true) WITH CHECK (true);
