import os
DATA     = os.environ.get('B1_DATA', 'data')
DATA_SRC = os.path.dirname(os.path.abspath(__file__))
import json, numpy as np
from datetime import datetime, timedelta, timezone

def et_date(ts):
    """Cast a timestamptz to the EXCHANGE's date, never the server's.
    portfolio_equity_curve.ts is stamped after the US close (22:00/00:00 UTC),
    so ts::date in UTC pushes a third of the series onto the next calendar day."""
    s = ts.replace('Z', '+00:00')
    dt = datetime.fromisoformat(s).astimezone(timezone.utc)
    # US Eastern over this window: EDT (-4) until 2026-11-01, EST (-5) after.
    # The whole estimation window (2025-12..2026-09) straddles the March DST
    # change, so compute the offset properly rather than assuming one.
    y = dt.year
    def nth_sunday(year, month, n):
        d = datetime(year, month, 1, tzinfo=timezone.utc)
        while d.weekday() != 6: d += timedelta(days=1)
        return d + timedelta(days=7 * (n - 1))
    dst_start = nth_sunday(y, 3, 2) + timedelta(hours=7)   # 2am ET
    dst_end   = nth_sunday(y, 11, 1) + timedelta(hours=6)
    off = -4 if dst_start <= dt < dst_end else -5
    return (dt + timedelta(hours=off)).date().isoformat()

eq  = json.load(open(DATA + '/eq.json'))
spy = json.load(open(DATA + '/spy.json'))
ax  = json.load(open(DATA + '/ax.json'))

spy_ac = {r['date']: float(r['adj_close']) for r in spy if r['adj_close'] is not None}
spy_cl = {r['date']: float(r['close'])     for r in spy if r['close']     is not None}
axd = {}
for r in ax:
    axd.setdefault(r['date'], {})[r['axis_key']] = float(r['score'])

rows = []
for r in eq:
    d = et_date(r['ts'])
    rows.append((d, float(r['equity']), r['data_quality']))
rows.sort(key=lambda x: x[0])
# One row per ET date (the curve is daily; guard against a duplicate).
seen, uniq = set(), []
for d, e, q in rows:
    if d in seen: continue
    seen.add(d); uniq.append((d, e, q))

def build(window_end='2026-09-04', use_adj=True):
    px = spy_ac if use_adj else spy_cl
    out = []
    for i in range(1, len(uniq)):
        d, e, q = uniq[i]
        dp, ep, qp = uniq[i - 1]
        if d > window_end: continue
        # C1: exclude stale_snapshot rows AND the row immediately after one.
        # The provider computes the next day's change against the carried
        # level, so the return OUT of a stale row is a two-day move reported
        # as one day's.
        if q == 'stale_snapshot' or qp == 'stale_snapshot': continue
        if d not in px or dp not in px: continue
        if d not in axd: continue
        a = axd[d]
        if not all(k in a for k in ('cyclical', 'concentration', 'dollar')): continue
        out.append(dict(d=d, rb=np.log(e / ep), rm=np.log(px[d] / px[dp]),
                        cyc=a['cyclical'], con=a['concentration'], dol=a['dollar']))
    return out

def ols_nw(y, X, lag=None):
    n, k = X.shape
    XtXi = np.linalg.inv(X.T @ X)
    b = XtXi @ X.T @ y
    u = y - X @ b
    if lag is None:
        lag = int(np.floor(4 * (n / 100.0) ** (2.0 / 9.0)))
    S = (X * u[:, None]).T @ (X * u[:, None])
    for L in range(1, lag + 1):
        w = 1.0 - L / (lag + 1.0)
        G = (X[L:] * u[L:, None]).T @ (X[:-L] * u[:-L, None])
        S += w * (G + G.T)
    V = XtXi @ S @ XtXi
    se = np.sqrt(np.diag(V))
    ybar = y.mean()
    r2 = 1 - (u @ u) / ((y - ybar) @ (y - ybar))
    return b, se, b / se, r2, u, lag

def design(p):
    X = np.column_stack([np.ones(len(p)),
                         [r['rm'] for r in p], [r['cyc'] for r in p],
                         [r['con'] for r in p], [r['dol'] for r in p]])
    y = np.array([r['rb'] for r in p])
    return y, X

NAMES = ['alpha', 'market', 'cyclical', 'concentration', 'dollar']
