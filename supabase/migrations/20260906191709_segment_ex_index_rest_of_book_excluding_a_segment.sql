-- ============================================================
-- Rest-of-book index EXCLUDING a whole segment
-- ------------------------------------------------------------
-- `mv_book_ex_index` answers "the book without asset i" for every i in one
-- pass, using S(t) = SUM(w_j r_j) and F(t) = SUM(w_j) over names priced that
-- day:
--
--     r_ex_i(t) = (S - w_i r_i) / (F - w_i)
--
-- The identity generalises to any subset with no extra cost -- subtract the
-- segment's daily sums instead of one name's row. One grouped scan of
-- `mv_book_daily_weights` yields every segment under both groupings, which
-- is what makes the BY BET | BY THEME toggle affordable at all.
--
-- Guards carried over deliberately, not re-derived:
--   * surviving weight >= 0.02 -- the rest of the book is not an alternative
--     when the excluded segment IS most of the book. Cluster 199 is 19.3% of
--     weight, so this bites nowhere today; it will if a segment ever grows.
--   * a name with no bar gets no row and is renormalised out, never carried
--     forward. Differencing a LATERAL top-1 close would publish a 0.00% move
--     for a name that did not trade.
-- ============================================================

DROP MATERIALIZED VIEW IF EXISTS public.mv_segment_ex_index;

CREATE MATERIALIZED VIEW public.mv_segment_ex_index AS
WITH day AS (
    SELECT b.price_date, sum(b.w) AS f, sum(b.wr) AS s
      FROM public.mv_book_daily_weights b
     GROUP BY b.price_date
),
segs AS (
    SELECT DISTINCT p.grouping, p.segment_id FROM public.vw_position_segments p
),
seg_day AS (
    -- One grouped pass, not one lateral per (segment, day).
    SELECT p.grouping, p.segment_id, b.price_date,
           sum(b.w) AS w_s, sum(b.wr) AS wr_s
      FROM public.mv_book_daily_weights b
      JOIN public.vw_position_segments p ON p.asset_id = b.asset_id
     GROUP BY p.grouping, p.segment_id, b.price_date
),
grid AS (
    SELECT s.grouping, s.segment_id, d.price_date, d.f, d.s AS s_tot,
           COALESCE(sd.w_s, 0)  AS w_s,
           COALESCE(sd.wr_s, 0) AS wr_s,
           sd.segment_id IS NOT NULL AS segment_priced_that_day
      FROM segs s
      CROSS JOIN day d
      LEFT JOIN seg_day sd
             ON sd.grouping = s.grouping
            AND sd.segment_id = s.segment_id
            AND sd.price_date = d.price_date
),
ex AS (
    SELECT g.*,
           CASE WHEN (g.f - g.w_s) < 0.02 THEN NULL::numeric
                ELSE (g.s_tot - g.wr_s) / (g.f - g.w_s)
           END AS r_ex
      FROM grid g
)
SELECT grouping,
       segment_id,
       price_date,
       r_ex,
       segment_priced_that_day,
       f - w_s AS surviving_weight,
       exp(sum(ln(1::numeric + r_ex)) OVER (PARTITION BY grouping, segment_id
                                                ORDER BY price_date
                                                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW))
         AS ex_index
  FROM ex
 WHERE r_ex IS NOT NULL AND r_ex > -1::numeric;

CREATE UNIQUE INDEX mv_segment_ex_index_pk
    ON public.mv_segment_ex_index (grouping, segment_id, price_date);

COMMENT ON MATERIALIZED VIEW public.mv_segment_ex_index IS
'Rest-of-book total-return index excluding an entire segment, for every '
'segment under both groupings. Same exclusion identity as mv_book_ex_index, '
'with the segment''s daily weight and weighted-return sums subtracted instead '
'of one asset''s row. Guarded at 0.02 surviving weight.';

GRANT SELECT ON public.mv_segment_ex_index TO anon, authenticated, service_role;
