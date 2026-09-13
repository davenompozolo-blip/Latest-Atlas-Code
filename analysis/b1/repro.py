import os
DATA     = os.environ.get('B1_DATA', 'data')       # fetched json lands here
DATA_SRC = os.path.dirname(os.path.abspath(__file__))
import json, numpy as np
exec(open(DATA_SRC + '/panel.py').read())

pub = {r['factor']: r for r in json.load(open(DATA + '/bet.json'))
       if r['estimated_at'].startswith('2026-09-09')}
print('published estimate set: n_obs', pub['market']['n_obs'], 'R2', pub['market']['r_squared'])

for use_adj in (True, False):
    p = build(use_adj=use_adj)
    y, X = design(p)
    b, se, t, r2, u, lag = ols_nw(y, X)
    tag = 'adj_close' if use_adj else 'close'
    print('\n== SPY %s ==  n=%d  R2=%.6f  NW lag=%d' % (tag, len(p), r2, lag))
    print('%-14s %14s %14s %10s %10s' % ('factor', 'reproduced', 'published', 'diff', 'se diff'))
    for i, nm in enumerate(NAMES):
        pb, ps = float(pub[nm]['beta']), float(pub[nm]['std_error'])
        print('%-14s %14.8f %14.8f %10.1e %10.1e' % (nm, b[i], pb, abs(b[i] - pb), abs(se[i] - ps)))
