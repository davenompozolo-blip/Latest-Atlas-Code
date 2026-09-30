DROP MATERIALIZED VIEW IF EXISTS public.mv_book_daily_weights CASCADE;

CREATE MATERIALIZED VIEW public.mv_book_daily_weights AS
WITH held AS (
    SELECT DISTINCT asset_id FROM public.vw_position_nav_daily
),
px AS (
    SELECT ph.asset_id, ph.price_date, ph.close,
           lag(ph.close) OVER (PARTITION BY ph.asset_id ORDER BY ph.price_date) AS prev_close
      FROM public.price_history ph
      JOIN held h ON h.asset_id = ph.asset_id
     WHERE ph."interval" = '1d'
       AND ph.price_date >= (SELECT min(price_date) - 10 FROM public.vw_position_nav_daily)
),
ret AS (
    SELECT asset_id, price_date, (close / prev_close - 1)::numeric AS r
      FROM px
     WHERE prev_close > 0
),
wt AS (
    SELECT n.asset_id, n.symbol, n.price_date,
           (n.position_value / NULLIF(sum(n.position_value) OVER (PARTITION BY n.price_date), 0))::numeric AS w
      FROM public.vw_position_nav_daily n
     WHERE n.position_value IS NOT NULL
)
SELECT w.price_date,
       w.asset_id,
       w.symbol,
       w.w,
       r.r,
       (w.w * r.r) AS wr
  FROM wt w
  JOIN ret r ON r.asset_id = w.asset_id AND r.price_date = w.price_date;

CREATE UNIQUE INDEX mv_book_daily_weights_uniq
    ON public.mv_book_daily_weights (price_date, asset_id);
CREATE INDEX mv_book_daily_weights_asset_idx
    ON public.mv_book_daily_weights (asset_id, price_date);

COMMENT ON MATERIALIZED VIEW public.mv_book_daily_weights IS
 'Per (date, held asset): prevailing weight, that day''s price return, and their product. Substrate for the Tier 2 rest-of-book counterfactual (step 4 addendum rev. B §2.3). Returns come from consecutive price_history bars, never from a carried-forward close - a name with no bar that day has no row and is renormalised out, rather than publishing a zero move off a dead print.';

GRANT SELECT ON public.mv_book_daily_weights TO anon, authenticated, service_role;
