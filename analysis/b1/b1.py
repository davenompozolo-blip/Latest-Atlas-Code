import os
DATA     = os.environ.get('B1_DATA', 'data')       # fetched json lands here
DATA_SRC = os.path.dirname(os.path.abspath(__file__))
import json, numpy as np
from scipy import stats
exec(open(DATA_SRC + '/panel.py').read())

ANN = np.sqrt(252.0)
p = build()                      # SPY adj_close, C1-cleaned, window ends 2026-09-04
y, X = design(p)
b, se, t, r2, u, lag = ols_nw(y, X)
n = len(p)
dates = [r['d'] for r in p]

print('=' * 74)
print('B1 · FACTOR MODEL VALIDATION')
print('=' * 74)
print('window %s .. %s   n=%d   R2=%.6f   NW lag=%d' % (dates[0], dates[-1], n, r2, lag))

# ---- 2.1 predicted -------------------------------------------------------
# sigma^2_pred = b' Sigma b + sigma^2_resid, over the four FACTORS (alpha is
# not a factor and carries no variance).
F = X[:, 1:]                                    # market, cyclical, concentration, dollar
beta4 = b[1:]
Sigma = np.cov(F, rowvar=False, ddof=1)
var_factor = float(beta4 @ Sigma @ beta4)
var_resid  = float(u @ u) / (n - X.shape[1])    # residual variance, dof-corrected
var_pred   = var_factor + var_resid
sd_pred, sd_f, sd_r = np.sqrt(var_pred), np.sqrt(var_factor), np.sqrt(var_resid)

print('\n-- 2.1 predicted volatility ------------------------------------------')
print('  factor component    %.8f daily   %6.2f%% annualised   %5.1f%% of variance'
      % (sd_f, sd_f * ANN * 100, 100 * var_factor / var_pred))
print('  residual component  %.8f daily   %6.2f%% annualised   %5.1f%% of variance'
      % (sd_r, sd_r * ANN * 100, 100 * var_resid / var_pred))
print('  TOTAL predicted     %.8f daily   %6.2f%% annualised'
      % (sd_pred, sd_pred * ANN * 100))

# ---- 2.2 realised --------------------------------------------------------
def roll_sd(a, w):
    return np.array([np.std(a[i - w + 1:i + 1], ddof=1) if i >= w - 1 else np.nan
                     for i in range(len(a))])
r20, r60 = roll_sd(y, 20), roll_sd(y, 60)
sd_full = float(np.std(y, ddof=1))
print('\n-- 2.2 realised volatility (C1-cleaned returns) ----------------------')
print('  full-window sd      %.8f daily   %6.2f%% annualised' % (sd_full, sd_full * ANN * 100))
print('  rolling 20d  mean   %.8f   (%5.2f%% ann)  min %5.2f%%  max %5.2f%%'
      % (np.nanmean(r20), np.nanmean(r20) * ANN * 100,
         np.nanmin(r20) * ANN * 100, np.nanmax(r20) * ANN * 100))
print('  rolling 60d  mean   %.8f   (%5.2f%% ann)  min %5.2f%%  max %5.2f%%'
      % (np.nanmean(r60), np.nanmean(r60) * ANN * 100,
         np.nanmin(r60) * ANN * 100, np.nanmax(r60) * ANN * 100))

# ---- 2.3 bias ratio ------------------------------------------------------
bias20, bias60 = r20 / sd_pred, r60 / sd_pred
bias_full = sd_full / sd_pred
print('\n-- 2.3 bias ratio (realised / predicted) -----------------------------')
print('  full window                 %.4f' % bias_full)
print('  mean of rolling 20d         %.4f   range %.4f .. %.4f'
      % (np.nanmean(bias20), np.nanmin(bias20), np.nanmax(bias20)))
print('  mean of rolling 60d         %.4f   range %.4f .. %.4f'
      % (np.nanmean(bias60), np.nanmin(bias60), np.nanmax(bias60)))
print('  share of 20d windows > 1.2  %.1f%%' % (100 * np.nanmean(bias20 > 1.2)))
print('  share of 20d windows < 0.8  %.1f%%' % (100 * np.nanmean(bias20 < 0.8)))

# ---- 3 residual diagnostics ---------------------------------------------
def ljung_box(x, lags=10):
    x = x - x.mean(); N = len(x); c0 = (x @ x) / N
    q = 0.0
    for k in range(1, lags + 1):
        rk = (x[k:] @ x[:-k]) / N / c0
        q += rk * rk / (N - k)
    q *= N * (N + 2)
    return q, 1 - stats.chi2.cdf(q, lags)

def arch_lm(e, lags=5):
    """Engle's ARCH-LM: regress e^2 on its own lags, test N*R^2 ~ chi2(lags)."""
    e2 = e ** 2; N = len(e2)
    Z = np.column_stack([np.ones(N - lags)] + [e2[lags - j - 1:N - j - 1] for j in range(lags)])
    w = e2[lags:]
    bb = np.linalg.lstsq(Z, w, rcond=None)[0]
    res = w - Z @ bb
    R2 = 1 - (res @ res) / ((w - w.mean()) @ (w - w.mean()))
    stat = (N - lags) * R2
    return stat, 1 - stats.chi2.cdf(stat, lags)

lb_q,  lb_p  = ljung_box(u, 10)
lb2_q, lb2_p = ljung_box(u ** 2, 10)
al_s,  al_p  = arch_lm(u, 5)
jb_s,  jb_p  = stats.jarque_bera(u)
sk = float(stats.skew(u)); ku = float(stats.kurtosis(u))   # kurtosis() is EXCESS

print('\n-- 3 residual diagnostics --------------------------------------------')
print('  ARCH-LM(5)            stat %8.3f   p = %.6f   %s'
      % (al_s, al_p, 'SIGNIFICANT - volatility clusters' if al_p < 0.05 else 'not significant'))
print('  Ljung-Box e^2 (10)    stat %8.3f   p = %.6f   %s'
      % (lb2_q, lb2_p, 'SIGNIFICANT' if lb2_p < 0.05 else 'not significant'))
print('  Ljung-Box e   (10)    stat %8.3f   p = %.6f   %s'
      % (lb_q, lb_p, 'SIGNIFICANT' if lb_p < 0.05 else 'not significant'))
print('  Jarque-Bera           stat %8.3f   p = %.6f   %s'
      % (jb_s, jb_p, 'SIGNIFICANT - non-normal' if jb_p < 0.05 else 'not significant'))
print('  skewness              %8.4f' % sk)
print('  excess kurtosis       %8.4f' % ku)

# ---- 4 stability ---------------------------------------------------------
h = n // 2
print('\n-- 4 split-sample stability ------------------------------------------')
print('  half 1: %s .. %s (n=%d)   half 2: %s .. %s (n=%d)'
      % (dates[0], dates[h - 1], h, dates[h], dates[-1], n - h))
res = {}
for nm_h, sl in (('h1', slice(0, h)), ('h2', slice(h, n))):
    bh, seh, th, r2h, uh, lh = ols_nw(y[sl], X[sl])
    res[nm_h] = (bh, seh, r2h)
    print('    %s R2 = %.4f  (NW lag %d)' % (nm_h, r2h, lh))
print('\n  %-14s %11s %11s %11s %11s   %s'
      % ('factor', 'h1 beta', 'h1 se', 'h2 beta', 'h2 se', '95% CIs'))
overlap = {}
for i, nm in enumerate(NAMES):
    b1_, s1_, _ = res['h1']; b2_, s2_, _ = res['h2']
    lo1, hi1 = b1_[i] - 1.96 * s1_[i], b1_[i] + 1.96 * s1_[i]
    lo2, hi2 = b2_[i] - 1.96 * s2_[i], b2_[i] + 1.96 * s2_[i]
    ov = not (hi1 < lo2 or hi2 < lo1)
    overlap[nm] = ov
    print('  %-14s %11.6f %11.6f %11.6f %11.6f   %s'
          % (nm, b1_[i], s1_[i], b2_[i], s2_[i], 'overlap' if ov else 'DISJOINT'))

# ---- 4b sub-window axis correlations ------------------------------------
print('\n-- 4b axis correlations, full window and within each half ------------')
lab = ['market', 'cyclical', 'concentration', 'dollar']
def cors(M):
    C = np.corrcoef(M, rowvar=False)
    return {(lab[i], lab[j]): C[i, j] for i in range(4) for j in range(i + 1, 4)}
cf, c1, c2 = cors(F), cors(F[:h]), cors(F[h:])
print('  %-32s %8s %8s %8s' % ('pair', 'full', 'half 1', 'half 2'))
for k in cf:
    print('  %-32s %8.3f %8.3f %8.3f' % (k[0] + ' / ' + k[1], cf[k], c1[k], c2[k]))

json.dump(dict(
    window_start=dates[0], window_end=dates[-1], n_obs=n, r2=r2, nw_lag=lag,
    sigma_pred=sd_pred, sigma_pred_factor=sd_f, sigma_pred_residual=sd_r,
    var_share_factor=var_factor / var_pred,
    sigma_realised_20d_mean=float(np.nanmean(r20)), sigma_realised_60d_mean=float(np.nanmean(r60)),
    sigma_realised_full=sd_full,
    bias_ratio=bias_full, bias20_mean=float(np.nanmean(bias20)),
    bias20_min=float(np.nanmin(bias20)), bias20_max=float(np.nanmax(bias20)),
    bias60_mean=float(np.nanmean(bias60)),
    ljung_box_p=lb_p, ljung_box_sq_p=lb2_p, arch_lm_p=al_p, arch_lm_stat=al_s,
    jarque_bera_p=float(jb_p), skew=sk, excess_kurtosis=ku,
    overlap={k: bool(v) for k, v in overlap.items()},
    half1=[float(x) for x in res['h1'][0]], half1_se=[float(x) for x in res['h1'][1]],
    half2=[float(x) for x in res['h2'][0]], half2_se=[float(x) for x in res['h2'][1]],
    corr_full={'/'.join(k): v for k, v in cf.items()},
    corr_h1={'/'.join(k): v for k, v in c1.items()},
    corr_h2={'/'.join(k): v for k, v in c2.items()},
), open(DATA + '/result.json', 'w'), indent=1)
print('\nwrote b1/result.json')
