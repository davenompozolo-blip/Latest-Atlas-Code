-- ============================================================
-- Segment assignment (perf three-level spec §2.1, §2.3)
-- ------------------------------------------------------------
-- Two gates, kept separate on purpose (§2.0):
--
--   cluster_id      -> which SEGMENT a position belongs to (level 2 grouping)
--   cluster_eligible-> which COUNTERFACTUAL its card is measured against (L3)
--
-- A two-member segment is a bet at level 2 and its cards still read
-- TIER 2 - REST OF BOOK at level 3, because a median over two names is
-- noise. GS+MS group together and are still graded against the book.
-- That looks inconsistent to anyone assuming one gate governs both; it
-- is not. This view implements the first gate only and must never be
-- filtered on cluster_eligible.
--
-- ## Why `grouping` is part of the key, against the spec's stated key
--
-- §2.4 keys segment_verdicts on (as_of, logic_version, segment_id); §2.3
-- then introduces the BY BET | BY THEME toggle, which collides with that
-- key. Under BY BET, KMTUY has no cluster so it falls to rule 2 and its
-- segment is `theme:Industrials / electrification` -- a segment of ONE.
-- Under BY THEME that same segment_id holds the whole theme. Same id,
-- different membership, different risk share. Keying without `grouping`
-- would silently merge them.
--
-- ## Segment counts are a display problem (§2.3b)
--
-- 44 segments on the 2026-09-06 book, 37 of them singletons. Do not
-- collapse the grouping to reach a nicer number; rank by risk share and
-- collapse at render. Effective bets (~3.9) is a concentration statistic,
-- not a segment count.
-- ============================================================

CREATE OR REPLACE VIEW public.vw_position_segments AS
WITH clus AS (
    SELECT u.symbol, u.cluster_id
      FROM public.universe_clusters u
     WHERE u.as_of_date = (SELECT max(u2.as_of_date) FROM public.universe_clusters u2)
),
open_book AS (
    SELECT r.asset_id, r.symbol
      FROM public.mv_position_returns r
     WHERE r.position_state = 'open'
),
base AS (
    SELECT o.asset_id, o.symbol, c.cluster_id, pt.theme
      FROM open_book o
      LEFT JOIN clus c ON c.symbol = o.symbol
      LEFT JOIN public.position_themes pt ON pt.symbol = o.symbol
)
-- BY BET: the partition wins wherever it exists, regardless of eligibility.
SELECT b.asset_id,
       b.symbol,
       'bet'::text AS grouping,
       CASE WHEN b.cluster_id IS NOT NULL THEN 'cluster:' || b.cluster_id::text
            WHEN b.theme      IS NOT NULL THEN 'theme:'   || b.theme
            ELSE 'unpaired' END AS segment_id,
       CASE WHEN b.cluster_id IS NOT NULL THEN 'cluster'
            WHEN b.theme      IS NOT NULL THEN 'theme'
            ELSE 'unpaired' END AS segment_kind,
       CASE WHEN b.cluster_id IS NOT NULL THEN 'Cluster ' || b.cluster_id::text
            WHEN b.theme      IS NOT NULL THEN b.theme
            ELSE 'Unpaired' END AS segment_label,
       b.cluster_id,
       b.theme
  FROM base b
UNION ALL
-- BY THEME: the narrative grouping, ignoring the partition entirely.
-- Pharma reads as one bet here and as four separate clusters above.
-- Both are internally consistent; neither is ever mixed with the other.
SELECT b.asset_id,
       b.symbol,
       'theme'::text,
       CASE WHEN b.theme IS NOT NULL THEN 'theme:' || b.theme ELSE 'unpaired' END,
       CASE WHEN b.theme IS NOT NULL THEN 'theme' ELSE 'unpaired' END,
       COALESCE(b.theme, 'Unpaired'),
       b.cluster_id,
       b.theme
  FROM base b;

COMMENT ON VIEW public.vw_position_segments IS
'Segment membership per open position under both groupings (spec 2.1/2.3). '
'Keyed (grouping, segment_id) - segment_id alone collides, because a name '
'with no cluster falls to its theme under BY BET and that id names the whole '
'theme under BY THEME. Membership only: never filter this on cluster_eligible, '
'which gates the level-3 counterfactual basis and not the level-2 grouping.';

GRANT SELECT ON public.vw_position_segments TO anon, authenticated, service_role;
