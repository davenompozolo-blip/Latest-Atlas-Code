// ============================================================
// ATLAS Nexus — flagship portfolio cards (F-4; F2 §2, F3 §2.3). Pure.
// ------------------------------------------------------------
// F2 §2 promotes the seven metrics that sat in a dense text strip beneath
// the four decision tiles into cards in the same grid. Everything here is
// formatting and absence; no metric is computed in this file that was not
// already on the model.
//
// THE POINT OF THE UNIT IS THE ABSENT STATE. F2 §2: "A metric that cannot
// be computed renders as absent, not as zero or a dash-with-value", and
// F3 §2.3 makes that a named variant rather than an ad-hoc branch inside
// each card. So a card is either measured — and carries a value — or it
// is absent and carries a REASON and no value at all. There is no third
// shape, and `value` is undefined on an absent card so a renderer cannot
// print one it was never handed.
// ============================================================

export const ACCOUNT_LOADING = 'loading';
export const ACCOUNT_OK = 'ok';
export const ACCOUNT_FAILED = 'failed';

// The four that carried a decision before this unit existed. They are
// listed here only so their order is stable at the front of the grid —
// their styling and content are untouched (F2 §5 clause 4).
export const DECISION_KEYS = ['dayPnl', 'unrealised', 'longExposure', 'atRisk'];

const num = v => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

const money = v => '$' + Math.round(v).toLocaleString('en-US');
// A balance is not a P&L, so it takes no `+` — but a negative one reads as
// `$-73,058` under plain `money()`, with the sign stranded inside the
// amount. The minus belongs in front of the unit.
const balance = v => (v < 0 ? '−$' + Math.round(Math.abs(v)).toLocaleString('en-US') : money(v));
const sgnMoney = v => (v >= 0 ? '+$' : '−$') + Math.round(Math.abs(v)).toLocaleString('en-US');
const sgnPct = (v, d = 1) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d) + '%';

const moveTone = v => (v == null ? '' : v > 0 ? 'tone-up' : v < 0 ? 'tone-down' : '');
const winTone = w => (w == null ? '' : w >= 55 ? 'tone-up' : w >= 45 ? 'tone-warn' : 'tone-down');
const qualityTone = q => (q == null ? '' : q >= 80 ? 'tone-up' : q >= 65 ? 'tone-warn' : 'tone-down');

// A measured card. `value` is always a string here, never null — the
// absent path is the only way to produce a card without one.
const card = (key, label, value, sub, tone) => ({ key, label, value, sub: sub ?? null, tone: tone || '', absent: false });

// An absent card. No `value` key at all, so `'value' in card` is the test
// and a renderer has nothing to fall back to.
const absent = (key, label, reason) => ({ key, label, sub: null, tone: '', absent: true, reason });

// Why the account block has nothing to show. Distinguishing these two is
// the whole reason `accountStatus` is threaded through: a feed that did
// not answer and a feed that has not answered YET are different facts,
// and rendering both as one dash is how a transport failure ends up
// reading as a statement about the book.
function accountReason(status) {
    if (status === ACCOUNT_FAILED) return 'broker account feed did not answer';
    if (status === ACCOUNT_LOADING) return 'waiting on the broker account';
    return 'no broker account on file';
}

export function portfolioCards({ portfolio, account, accountStatus } = {}) {
    const p = portfolio;
    if (!p) return [];

    const a = account || null;
    const status = accountStatus || (a ? ACCOUNT_OK : ACCOUNT_LOADING);
    const haveAccount = status === ACCOUNT_OK && !!a;
    const aReason = accountReason(status);

    const equity = haveAccount ? num(a.equity) : null;
    const longMv = haveAccount ? num(a.long_market_value) : null;
    const cash = haveAccount ? num(a.cash) : null;
    const dayPnl = haveAccount ? num(a.dayPnl) : null;
    const dayPnlPct = haveAccount ? num(a.dayPnlPct) : null;
    // Leverage needs BOTH legs. A present long value over an absent or
    // zero equity is a division, not a measurement.
    const lev = longMv != null && equity ? longMv / equity : null;

    const unrealised = num(p.unrealisedPnl);
    const onCost = num(p.onCostReturnPct ?? p.totalReturnPct);
    const winRate = num(p.winRate);
    const atRisk = num(p.atRisk);
    const topWeight = num(p.topWeightPct);
    const top5 = num(p.top5WeightPct);
    const quality = num(p.wtdQuality);
    const upDown = num(p.todayUp) != null && num(p.todayDown) != null;

    const out = [];

    // ── The four originals, unchanged in content and order ──
    out.push(dayPnl == null
        ? absent('dayPnl', 'Day P&L', aReason)
        : card('dayPnl', 'Day P&L', sgnMoney(dayPnl),
            dayPnlPct == null ? null : sgnPct(dayPnlPct) + ' today', moveTone(dayPnl)));

    out.push(unrealised == null
        ? absent('unrealised', 'Unrealised P&L', 'no marked positions')
        : card('unrealised', 'Unrealised P&L', sgnMoney(unrealised),
            // "on cost", never "total return": this is the mark against
            // average cost on what is still held, and the holdings table's
            // column is the return since first fill. They disagree in sign
            // on a real share of the book.
            onCost == null ? null : sgnPct(onCost) + ' on cost', moveTone(unrealised)));

    out.push(longMv == null
        ? absent('longExposure', 'Long exposure', aReason)
        : card('longExposure', 'Long exposure', money(longMv),
            p.positions + ' positions' + (lev ? ' · ' + lev.toFixed(2) + '× lev' : '')));

    out.push(atRisk == null
        ? absent('atRisk', 'At risk', 'position returns not measured')
        : card('atRisk', 'At risk', String(atRisk), 'positions down > 10%',
            atRisk > 0 ? 'tone-down' : 'tone-up'));

    // ── The seven promoted out of the strip (F2 §2) ──
    out.push(equity == null
        ? absent('accountEquity', 'Account equity', aReason)
        : card('accountEquity', 'Account equity', money(equity), 'cash + longs − margin', 'accent'));

    out.push(cash == null
        ? absent('cash', 'Cash / margin', aReason)
        : card('cash', 'Cash / margin', balance(cash),
            cash < 0 ? 'on margin' : 'uninvested', cash < 0 ? 'tone-down' : ''));

    out.push(winRate == null
        ? absent('winRate', 'Win rate', 'no closed or marked positions')
        : card('winRate', 'Win rate', winRate + '%',
            p.winners + ' winners · ' + p.losers + ' losers', winTone(winRate)));

    // A pair stays in ONE card: splitting today's up and down loses the
    // comparison that is the only reason either number is interesting.
    out.push(!upDown
        ? absent('today', 'Today', 'no marked positions')
        : card('today', 'Today', p.todayUp + ' / ' + p.todayDown, 'up / down',
            p.todayUp > p.todayDown ? 'tone-up' : p.todayUp < p.todayDown ? 'tone-down' : ''));

    out.push(!p.topSymbol || topWeight == null
        ? absent('concentration', 'Top concentration', 'no weighted book')
        : card('concentration', 'Top concentration', p.topSymbol + ' ' + topWeight + '%',
            top5 == null ? null : 'top 5 = ' + top5 + '% of book',
            top5 != null && top5 >= 35 ? 'tone-warn' : ''));

    // The other pair. Rendered as a structured node rather than a string
    // because its two halves are toned opposite ways.
    if (!p.best || !p.worst) {
        out.push(absent('bestWorst', 'Best / worst', 'no ranked positions'));
    } else {
        const c = card('bestWorst', 'Best / worst', null,
            num(p.worst.pct) == null ? null : 'worst ' + sgnPct(num(p.worst.pct)));
        c.pair = {
            best: { tk: p.best.tk, pct: num(p.best.pct) == null ? null : sgnPct(num(p.best.pct)) },
            worst: { tk: p.worst.tk },
        };
        out.push(c);
    }

    out.push(quality == null
        ? absent('quality', 'Wtd quality', 'no graded positions')
        : card('quality', 'Wtd quality', String(quality), 'of 100 · grade-weighted', qualityTone(quality)));

    return out;
}

// Published so a surface can state its denominator rather than showing a
// shorter grid with nothing to say why.
export function cardCoverage(cards) {
    const all = cards || [];
    const missing = all.filter(c => c.absent);
    return {
        total: all.length,
        measured: all.length - missing.length,
        absentCount: missing.length,
        absentKeys: missing.map(c => c.key),
    };
}
