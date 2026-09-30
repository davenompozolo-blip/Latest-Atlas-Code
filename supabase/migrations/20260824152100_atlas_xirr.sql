-- Money-weighted return (XIRR) over an irregular dated cash-flow schedule.
--
-- Bisection, not Newton. n is at most ~30 flows per position and 98 positions,
-- so 200 iterations costs nothing, and bisection cannot diverge, oscillate or
-- depend on a seed guess the way Newton does on the sign-flipping schedules a
-- partially-sold position produces. Precision after 200 halvings of a
-- [-0.9999, 100] bracket is far below anything reportable.
--
-- Returns NULL rather than a number whenever the rate is not defined:
--   * fewer than two flows
--   * mismatched array lengths
--   * no sign change (all money out, or all money in) - IRR does not exist
--   * the root is not bracketed in [-0.9999, 100], which is an unconventional
--     schedule with multiple sign changes and therefore potentially multiple
--     roots. Returning one of them silently would be worse than returning none.
--
-- Rate is annualised on an ACT/365 basis from the first flow date.

CREATE OR REPLACE FUNCTION public.atlas_xirr(
    p_dates   date[],
    p_amounts numeric[]
) RETURNS double precision
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    n        int;
    t0       date;
    lo       double precision := -0.9999;
    hi       double precision := 100.0;
    mid      double precision;
    f_lo     double precision;
    f_mid    double precision;
    has_pos  boolean := false;
    has_neg  boolean := false;
    i        int;
    iter     int;

    FUNCTION_NPV double precision;
BEGIN
    n := array_length(p_dates, 1);
    IF n IS NULL OR n < 2 THEN RETURN NULL; END IF;
    IF array_length(p_amounts, 1) IS DISTINCT FROM n THEN RETURN NULL; END IF;

    FOR i IN 1..n LOOP
        IF p_dates[i] IS NULL OR p_amounts[i] IS NULL THEN RETURN NULL; END IF;
        IF p_amounts[i] > 0 THEN has_pos := true; END IF;
        IF p_amounts[i] < 0 THEN has_neg := true; END IF;
    END LOOP;
    IF NOT (has_pos AND has_neg) THEN RETURN NULL; END IF;

    t0 := p_dates[1];

    -- NPV at the bracket ends
    f_lo := 0;
    FOR i IN 1..n LOOP
        f_lo := f_lo + p_amounts[i]::double precision
                     / power(1 + lo, (p_dates[i] - t0)::double precision / 365.0);
    END LOOP;

    FUNCTION_NPV := 0;
    FOR i IN 1..n LOOP
        FUNCTION_NPV := FUNCTION_NPV + p_amounts[i]::double precision
                     / power(1 + hi, (p_dates[i] - t0)::double precision / 365.0);
    END LOOP;

    IF f_lo * FUNCTION_NPV > 0 THEN
        RETURN NULL;   -- not bracketed: refuse rather than pick a root
    END IF;

    FOR iter IN 1..200 LOOP
        mid := (lo + hi) / 2.0;
        f_mid := 0;
        FOR i IN 1..n LOOP
            f_mid := f_mid + p_amounts[i]::double precision
                          / power(1 + mid, (p_dates[i] - t0)::double precision / 365.0);
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

COMMENT ON FUNCTION public.atlas_xirr(date[], numeric[]) IS
 'Annualised money-weighted return (XIRR) over dated cash flows, ACT/365. Sign convention: money out negative, money in positive. NULL when the rate is undefined - no sign change, or a root not bracketed in [-0.9999, 100].';
