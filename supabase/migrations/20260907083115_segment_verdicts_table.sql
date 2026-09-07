-- ============================================================
-- segment_verdicts (perf three-level spec §2.4)
-- ------------------------------------------------------------
-- A history, like `position_verdicts`: a row records what was known on
-- `as_of` under `logic_version` and is never updated. Everything below
-- follows from that -- a history cannot be backfilled, so the columns have
-- to be right from row one and the invariants have to be constraints the
-- job cannot forget rather than assertions it might.
--
-- ## `grouping` is in the key, against §2.4's stated key
--
-- §2.4 keys on (as_of, logic_version, segment_id); §2.3 then adds the
-- BY BET | BY THEME toggle, which collides with it. Under BY BET a name with
-- no partition cluster falls to its theme, so `theme:Industrials /
-- electrification` is a segment of one (KMTUY); under BY THEME the same id
-- names the whole theme. Same id, different membership, different risk share.
-- See the header of vw_position_segments.
--
-- ## `sub_threshold` is absent on purpose
--
-- §2.4's field list still carries it and §2.5 still has a sentence keyed on
-- it, but §2.3 deletes it: "a workaround for a grouping the toggle now
-- supplies directly". The later correction wins. Do not re-add it.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.segment_verdicts (
    segment_verdict_id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    as_of                   date NOT NULL,
    logic_version           text NOT NULL,

    grouping                text NOT NULL,
    segment_id              text NOT NULL,
    segment_kind            text NOT NULL,
    segment_label           text NOT NULL,

    member_count            int  NOT NULL,
    members                 text[] NOT NULL,
    members_measured        int  NOT NULL,
    members_withheld        int  NOT NULL,
    withheld_symbols        text[] NOT NULL DEFAULT '{}',

    weight_share            numeric,
    risk_share              numeric,
    return_contribution_share numeric,
    net_pnl_usd             numeric,

    traded_mwr_pct          double precision,
    cf_mwr_pct              double precision,
    excess_vs_book_pct      numeric,
    cf_status               text,
    cf_reason               text,

    dispersion              numeric,
    best_member             text,
    best_member_excess_pct  numeric,
    worst_member            text,
    worst_member_excess_pct numeric,
    dispersion_basis        text,

    thesis_coverage         numeric,
    verdict_counts          jsonb,

    computed_at             timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT segment_verdicts_key UNIQUE (as_of, logic_version, grouping, segment_id),

    CONSTRAINT segment_verdicts_grouping_known
        CHECK (grouping IN ('bet', 'theme')),
    CONSTRAINT segment_verdicts_kind_known
        CHECK (segment_kind IN ('cluster', 'theme', 'unpaired')),

    -- A segment with no members is not a segment.
    CONSTRAINT segment_verdicts_has_members
        CHECK (member_count > 0 AND array_length(members, 1) = member_count),

    -- The roster must account for every member. This is what stops a
    -- shrinking denominator going unnoticed -- the failure behind
    -- `price_coverage` counting holdings while the universe froze.
    CONSTRAINT segment_verdicts_roster_closes
        CHECK (members_measured + members_withheld = member_count
               AND members_measured >= 0 AND members_withheld >= 0),
    CONSTRAINT segment_verdicts_withheld_named
        CHECK (COALESCE(array_length(withheld_symbols, 1), 0) = members_withheld),

    -- An excess figure exists only when the counterfactual actually resolved.
    -- A number published beside a non-measured status is the fabricated
    -- benchmark this engine refuses to produce.
    CONSTRAINT segment_verdicts_excess_needs_measured
        CHECK ((excess_vs_book_pct IS NULL) OR (cf_status = 'measured')),
    CONSTRAINT segment_verdicts_measured_has_reason_or_none
        CHECK ((cf_status = 'measured') = (cf_reason IS NULL)),

    -- Dispersion over member excesses is meaningless on one member, and the
    -- basis must always be named beside it -- members would otherwise be
    -- averaged across a cluster-median and a rest-of-book excess, which is
    -- the mixed-basis failure this project has caught four times.
    CONSTRAINT segment_verdicts_dispersion_needs_two
        CHECK (dispersion IS NULL OR member_count >= 2),
    CONSTRAINT segment_verdicts_dispersion_names_basis
        CHECK ((dispersion IS NULL) OR (dispersion_basis IS NOT NULL)),

    CONSTRAINT segment_verdicts_thesis_coverage_is_a_share
        CHECK (thesis_coverage IS NULL OR (thesis_coverage >= 0 AND thesis_coverage <= 1)),
    CONSTRAINT segment_verdicts_weight_share_is_a_share
        CHECK (weight_share IS NULL OR (weight_share >= 0 AND weight_share <= 1))
);

CREATE INDEX IF NOT EXISTS segment_verdicts_as_of_grouping_idx
    ON public.segment_verdicts (as_of DESC, grouping, risk_share DESC);

COMMENT ON TABLE public.segment_verdicts IS
'Nightly segment aggregates for the Performance level-2 view (spec 2.4). '
'Append-only history keyed (as_of, logic_version, grouping, segment_id) - '
'`grouping` is part of the key because BY BET and BY THEME produce colliding '
'segment_ids with different membership.';

COMMENT ON COLUMN public.segment_verdicts.risk_share IS
'Sum of POSITION-level weighted marginal_vol_contribution over the segment, '
'divided by the book total (spec 2.4b). Never a sum of cluster_risk_share - '
'that column is per-cluster and repeated on every member row, so summing it '
'across cluster 199''s eight members returns 3.53. Euler additivity is what '
'makes this close to 1.0 under any grouping, and therefore what makes the '
'BY BET | BY THEME toggle possible at all.';

COMMENT ON COLUMN public.segment_verdicts.excess_vs_book_pct IS
'Segment-scope counterfactual from atlas_counterfactual_segment: the '
'segment''s pooled cash flows run into the book excluding the whole segment. '
'NOT an average of member excesses.';

COMMENT ON COLUMN public.segment_verdicts.return_contribution_share IS
'Share of book P&L in DOLLARS, not a weighted average of rates. Rates do not '
'add up and dollars do - the trading-effect drill-down found the per-position '
'rates summing to -160.76pp against a book effect of -1.03pp.';

GRANT SELECT ON public.segment_verdicts TO anon, authenticated, service_role;
