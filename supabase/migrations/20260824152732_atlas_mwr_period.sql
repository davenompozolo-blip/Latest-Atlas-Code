-- Money-weighted return solved over the HOLDING PERIOD, not annualised.
--
-- `atlas_xirr` discounts in years, so the rate it solves for is annualised and
-- a short window pushes the root outside any sane bracket. Two live cases:
--   CRWV  -6.35% over 2 days  -> annualised root below -0.9999
--   OILK  +3572% over 3 days  -> annualised root above 100
-- Both returned NULL from a guard meant to catch unconventional schedules, so
-- a numeric-conditioning problem was being reported as an undefined rate.
--
-- Discounting in units of the total window instead puts every exponent in
-- [0, 1]. The solved rate is the period return directly - well conditioned for
-- any window length, and for a single-flow-pair position it collapses exactly
-- to the simple return. The annualised figure is then derived from this root
-- rather than the other way round.
--
-- Same refusals as atlas_xirr: fewer than two flows, mismatched arrays, no
-- sign change, zero-length window, or a root not bracketed (multiple sign
-- changes, hence potentially multiple roots - returning one silently is worse
-- than returning none).

CREATE OR REPLACE FUNCTION public.atlas_mwr_period(
    p_dates   date[],
    p_amounts numeric[]
) RETURNS double precision
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    n       int;
    t0      date;
    t1      date;
    span    double precision;
    lo      double precision := -0.999999;
    hi      double precision := 10000000.0;
    mid     double precision;
    f_lo    double precision;
    f_hi    double precision;
    f_mid   double precision;
    has_pos boolean := false;
    has_neg boolean := false;
    i       int;
    iter    int;
BEGIN
    n := array_length(p_dates, 1);
    IF n IS NULL OR n < 2 THEN RETURN NULL; END IF;
    IF array_length(p_amounts, 1) IS DISTINCT FROM n THEN RETURN NULL; END IF;

    t0 := p_dates[1];
    t1 := p_dates[1];
    FOR i IN 1..n LOOP
        IF p_dates[i] IS NULL OR p_amounts[i] IS NULL THEN RETURN NULL; END IF;
        IF p_dates[i] < t0 THEN t0 := p_dates[i]; END IF;
        IF p_dates[i] > t1 THEN t1 := p_dates[i]; END IF;
        IF p_amounts[i] > 0 THEN has_pos := true; END IF;
        IF p_amounts[i] < 0 THEN has_neg := true; END IF;
    END LOOP;
    IF NOT (has_pos AND has_neg) THEN RETURN NULL; END IF;

    span := (t1 - t0)::double precision;
    IF span <= 0 THEN RETURN NULL; END IF;

    f_lo := 0; f_hi := 0;
    FOR i IN 1..n LOOP
        f_lo := f_lo + p_amounts[i]::double precision
                     / power(1 + lo, (p_dates[i] - t0)::double precision / span);
        f_hi := f_hi + p_amounts[i]::double precision
                     / power(1 + hi, (p_dates[i] - t0)::double precision / span);
    END LOOP;
    IF f_lo * f_hi > 0 THEN RETURN NULL; END IF;

    FOR iter IN 1..300 LOOP
        mid := (lo + hi) / 2.0;
        f_mid := 0;
        FOR i IN 1..n LOOP
            f_mid := f_mid + p_amounts[i]::double precision
                          / power(1 + mid, (p_dates[i] - t0)::double precision / span);
        END LOOP;
        IF f_mid = 0 THEN RETURN mid; END IF;
        IF f_lo * f_mid < 0 THEN
            hi := mid;
        ELSE
            lo := mid;
            f_lo := f_mid;
        END IF;
    END LOOP;

    RETURN (lo + hi) / 2.0;
END;
$$;

COMMENT ON FUNCTION public.atlas_mwr_period(date[], numeric[]) IS
 'Money-weighted return over the holding period (not annualised), solved by bisection with exponents normalised to the window so it is well conditioned at any window length. Money out negative, money in positive. NULL where the rate is undefined.';
