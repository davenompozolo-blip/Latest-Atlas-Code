-- Bisection ran a fixed 300 iterations per position: 86 calls at ~8ms each was
-- ~690ms of the view's 863ms. The bracket is [-0.999999, 1e7], so it is already
-- narrower than 1e-12 after ~63 halvings and every iteration after that is
-- refining digits that round(…, 6) discards. Exit on convergence instead.

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
        -- converged: the remaining interval is far below reporting precision
        EXIT WHEN (hi - lo) <= 1e-12 * GREATEST(1.0, abs(mid));
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
