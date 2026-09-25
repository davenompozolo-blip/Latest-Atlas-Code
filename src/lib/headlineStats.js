// The Performance header's statistics, gated on the history they need.
//
// A new account (Atlas Secondary, 2 sessions) rendered "ANN. RETURN +1121.4%
// CAGR p.a.", "SHARPE 11.22 Excellent risk-adj.", "MAX DRAWDOWN 0.00%" and
// "DAY WIN RATE 50.0%". Each is the right arithmetic on two returns and none
// is a measurement of anything: annualising two sessions compounds one day's
// move over 252, and a Sharpe over two points has no sampling distribution to
// speak of. The return engine already refuses annualised figures under 90 days
// held; the header never got the rule.
//
// A figure below its floor is ABSENT from the result, never null or 0, and
// the reason names what it needs -- the rule nexusReturnBasis.js and the
// verdict layer already follow. A genuine 0.00% drawdown on a long history is
// still a measurement and still renders.

// ~90 calendar days -- the return engine's floor for an annualised figure.
export const MIN_ANNUALISED_SESSIONS = 60;
// A drawdown or a win rate over a handful of days describes the handful.
export const MIN_DISTRIBUTION_SESSIONS = 20;

function finite(v) {
    const n = typeof v === 'string' ? Number(v) : v;
    return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

// sessions: number of daily RETURNS the statistics rest on.
// metrics:  computePortfolioMetrics output; sharpeOverride: the database's
//           own Sharpe (vw_command_centre), gated on the same history.
export function gateHeadline(metrics, sessions, sharpeOverride) {
    const n = Number.isFinite(sessions) ? sessions : 0;
    const out = { sessions: n, withheld: {} };
    const m = metrics || {};
    const put = (key, value, floor) => {
        if (n < floor) {
            out.withheld[key] = 'needs ' + floor + ' sessions (' + n + ' so far)';
            return;
        }
        const v = finite(value);
        if (v != null) out[key] = v;
    };
    put('annReturn', m.annReturn, MIN_ANNUALISED_SESSIONS);
    put('annVol', m.annVol, MIN_ANNUALISED_SESSIONS);
    put('sharpe', sharpeOverride != null ? sharpeOverride : m.sharpe, MIN_ANNUALISED_SESSIONS);
    put('maxDD', m.maxDD, MIN_DISTRIBUTION_SESSIONS);
    put('winRate', m.winRate, MIN_DISTRIBUTION_SESSIONS);
    return out;
}
