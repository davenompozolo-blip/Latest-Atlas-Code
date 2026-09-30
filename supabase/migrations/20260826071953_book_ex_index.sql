DROP MATERIALIZED VIEW IF EXISTS public.mv_book_ex_index CASCADE;

CREATE MATERIALIZED VIEW public.mv_book_ex_index AS
WITH day AS (
    SELECT price_date, sum(w) AS f, sum(wr) AS s
      FROM public.mv_book_daily_weights
     GROUP BY price_date
),
universe AS (
    SELECT DISTINCT asset_id, symbol FROM public.mv_book_daily_weights
),
grid AS (
    SELECT u.asset_id, u.symbol, d.price_date, d.f, d.s,
           COALESCE(m.w, 0::numeric)  AS w_i,
           COALESCE(m.wr, 0::numeric) AS wr_i,
           (m.asset_id IS NOT NULL)   AS present
      FROM universe u
      CROSS JOIN day d
      LEFT JOIN public.mv_book_daily_weights m
             ON m.asset_id = u.asset_id AND m.price_date = d.price_date
),
ex AS (
    SELECT g.*,
           CASE
               -- The rest of the book is not defined when the excluded name
               -- IS most of the book. 2% of surviving weight is the floor.
               WHEN (g.f - g.w_i) < 0.02 THEN NULL::numeric
               ELSE (g.s - g.wr_i) / (g.f - g.w_i)
           END AS r_ex
      FROM grid g
)
SELECT asset_id,
       symbol,
       price_date,
       r_ex,
       present            AS asset_priced_that_day,
       (f - w_i)          AS surviving_weight,
       exp(sum(ln(1 + r_ex)) OVER (PARTITION BY asset_id ORDER BY price_date
                                   ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW))
                          AS ex_index
  FROM ex
 WHERE r_ex IS NOT NULL AND r_ex > -1;

CREATE UNIQUE INDEX mv_book_ex_index_uniq
    ON public.mv_book_ex_index (asset_id, price_date);

COMMENT ON MATERIALIZED VIEW public.mv_book_ex_index IS
 'Tier 2 substrate (step 4 addendum rev. B §2.3): for each held asset, a total-return index of THE REST OF THE BOOK at prevailing weights, with that asset excluded. Computed by the identity r_ex = (S - w_i*r_i) / (F - w_i) off one pass of mv_book_daily_weights, so all 63 exclusions cost one scan rather than 63. NULL where the excluded name leaves under 2% of surviving weight - a rest-of-book that is almost nothing is not an alternative.';

GRANT SELECT ON public.mv_book_ex_index TO anon, authenticated, service_role;
