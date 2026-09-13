import os
DATA = os.environ.get('B1_DATA', 'data')
import json, urllib.request, urllib.parse
BASE = 'https://vdmojjszvvcithuxwexx.supabase.co/rest/v1/'
KEY  = os.environ['SB_ANON']

def get(table, params):
    """PostgREST caps at 1000 rows whatever limit says. Page explicitly."""
    out, offset = [], 0
    while True:
        p = dict(params); p['offset'] = offset; p['limit'] = 1000
        url = BASE + table + '?' + urllib.parse.urlencode(p)
        req = urllib.request.Request(url, headers={'apikey': KEY, 'Authorization': 'Bearer ' + KEY})
        rows = json.load(urllib.request.urlopen(req, timeout=60))
        out += rows
        if len(rows) < 1000: break
        offset += 1000
    return out

eq  = get('portfolio_equity_curve', {'select': 'ts,equity,data_quality', 'order': 'ts.asc'})
spy = get('market_prices', {'select': 'date,adj_close,close', 'symbol': 'eq.SPY', 'order': 'date.asc'})
ax  = get('factor_axis_scores', {'select': 'date,axis_key,score,score_20d', 'order': 'date.asc'})
bet = get('book_factor_betas', {'select': '*', 'order': 'estimated_at.desc'})
for name, rows in [('eq', eq), ('spy', spy), ('ax', ax), ('bet', bet)]:
    os.makedirs(DATA, exist_ok=True); json.dump(rows, open(DATA + '/%s.json' % name, 'w'))
    print(name, len(rows))
