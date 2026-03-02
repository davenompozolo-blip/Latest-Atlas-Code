"""
ATLAS Quantitative Dashboard — Portfolio Structure Engine
Layer: Computation (stateless, pure functions)
Purpose: Concentration, diversification, redundancy, and structural analytics
"""
import numpy as np
import pandas as pd
from typing import List, Optional, Tuple
from scipy.cluster.hierarchy import linkage, dendrogram, fcluster
from scipy.spatial.distance import squareform
TRADING_DAYS = 252
# ─── CONCENTRATION METRICS ────────────────────────────────────────────────────
def herfindahl_index(weights: pd.Series) -> float:
    """
    Herfindahl-Hirschman Index (HHI) on portfolio weights.
    Range: 1/N (perfectly diversified) to 1.0 (100% in one position).
    HHI > 0.25 is typically considered highly concentrated.
    """
    w = weights.dropna()
    w = w / w.sum()  # normalise
    return float((w ** 2).sum())
def effective_number_of_bets(
    weights: pd.Series,
    correlation_matrix: Optional[pd.DataFrame] = None
) -> float:
    """
    Effective Number of Bets (ENB) — the most honest diversification metric.
    Without correlation: 1 / HHI (naive weight-based diversification).
    With correlation: uses the Choueifat-Lempérière methodology based on
    the eigenvalue distribution of the correlation-adjusted weight matrix.
    A portfolio with 40 names but ENB of 8 is taking 8 real independent bets.
    """
    w = weights.dropna()
    w = w / w.sum()
    if correlation_matrix is None:
        # Naive: inverse HHI
        return float(1.0 / (w ** 2).sum())
    # Correlation-adjusted ENB
    aligned_w = w.reindex(correlation_matrix.index).dropna()
    aligned_w = aligned_w / aligned_w.sum()
    C = correlation_matrix.loc[aligned_w.index, aligned_w.index].values
    w_arr = aligned_w.values
    # Decorrelate: transform to independent space
    eigenvalues, eigenvectors = np.linalg.eigh(C)
    eigenvalues = np.maximum(eigenvalues, 1e-10)
    # Portfolio weights in principal component space
    pc_weights = (eigenvectors.T @ w_arr) ** 2 * eigenvalues
    pc_weights = pc_weights / pc_weights.sum()
    return float(1.0 / (pc_weights ** 2).sum())
def concentration_metrics(weights: pd.Series) -> dict:
    """
    Full concentration analysis of portfolio weights.
    """
    w = weights.dropna().sort_values(ascending=False)
    w = w / w.sum()
    top5_names = w.head(5).index.tolist()
    top10_names = w.head(10).index.tolist()
    return {
        "n_positions": len(w),
        "hhi": round(herfindahl_index(w), 4),
        "enb_naive": round(1.0 / (w ** 2).sum(), 2),
        "top_1_pct": round(float(w.iloc[0]) * 100, 2) if len(w) >= 1 else 0,
        "top_5_pct": round(float(w.head(5).sum()) * 100, 2) if len(w) >= 5 else round(float(w.sum()) * 100, 2),
        "top_10_pct": round(float(w.head(10).sum()) * 100, 2) if len(w) >= 10 else round(float(w.sum()) * 100, 2),
        "top_5_names": top5_names,
        "top_10_names": top10_names,
    }
# ─── REDUNDANCY DETECTION ─────────────────────────────────────────────────────
def redundancy_pairs(
    weights: pd.Series,
    corr_matrix: pd.DataFrame,
    corr_threshold: float = 0.75,
    combined_weight_threshold: float = 0.05
) -> pd.DataFrame:
    """
    Identifies redundant position pairs:
    - Correlation above threshold (highly correlated = similar bets)
    - Combined weight above threshold (meaningful to the portfolio)
    Returns DataFrame of flagged pairs with their correlation and combined weight.
    Ranked by redundancy severity.
    """
    w = weights.reindex(corr_matrix.index).dropna()
    w = w / w.sum()
    pairs = []
    assets = w.index.tolist()
    for i in range(len(assets)):
        for j in range(i + 1, len(assets)):
            a1, a2 = assets[i], assets[j]
            corr = corr_matrix.loc[a1, a2]
            combined = w[a1] + w[a2]
            if corr >= corr_threshold and combined >= combined_weight_threshold:
                pairs.append({
                    "asset_1": a1,
                    "asset_2": a2,
                    "correlation": round(float(corr), 3),
                    "combined_weight": round(float(combined) * 100, 2),
                    "w1": round(float(w[a1]) * 100, 2),
                    "w2": round(float(w[a2]) * 100, 2),
                    "redundancy_score": round(float(corr * combined), 4),
                })
    if not pairs:
        return pd.DataFrame()
    return pd.DataFrame(pairs).sort_values("redundancy_score", ascending=False).reset_index(drop=True)
# ─── HIERARCHICAL CORRELATION CLUSTERING ──────────────────────────────────────
def hierarchical_cluster_order(corr_matrix: pd.DataFrame) -> List[str]:
    """
    Re-orders assets using hierarchical clustering so that correlated
    groups appear adjacent in the correlation heatmap.
    Returns ordered list of asset names.
    """
    dist = np.sqrt((1 - corr_matrix.values) / 2)
    np.fill_diagonal(dist, 0)
    dist = np.clip(dist, 0, 1)
    condensed = squareform(dist, checks=False)
    Z = linkage(condensed, method='ward')
    # Get optimal leaf order
    from scipy.cluster.hierarchy import optimal_leaf_ordering, leaves_list
    Z_opt = optimal_leaf_ordering(Z, condensed)
    order = leaves_list(Z_opt)
    return [corr_matrix.index[i] for i in order]
def pca_factor_clusters(
    returns: pd.DataFrame,
    n_components: int = 3
) -> dict:
    """
    Identifies latent factor clusters in the portfolio using PCA.
    Each principal component represents a hidden risk factor.
    Returns:
    - explained_variance_ratio: how much of total variance each PC explains
    - loadings: which assets load most heavily on each PC
    - dominant_cluster_per_asset: which PC most explains each asset
    """
    clean = returns.dropna(how='all', axis=1).fillna(0)
    corr = clean.corr().values
    eigenvalues, eigenvectors = np.linalg.eigh(corr)
    # Descending order
    idx = np.argsort(eigenvalues)[::-1]
    eigenvalues = eigenvalues[idx]
    eigenvectors = eigenvectors[:, idx]
    n = min(n_components, len(eigenvalues))
    total_var = eigenvalues.sum()
    loadings = {}
    for i in range(n):
        pc_loadings = pd.Series(eigenvectors[:, i], index=clean.columns)
        # Top 5 positive and negative contributors
        loadings[f"PC{i+1}"] = {
            "explained_variance": float(eigenvalues[i] / total_var),
            "top_positive": pc_loadings.nlargest(3).to_dict(),
            "top_negative": pc_loadings.nsmallest(3).to_dict(),
            "loadings": pc_loadings.to_dict(),
        }
    # Dominant cluster per asset
    loading_matrix = eigenvectors[:, :n]
    dominant = np.argmax(np.abs(loading_matrix), axis=1)
    dominant_map = {clean.columns[i]: f"PC{dominant[i]+1}" for i in range(len(clean.columns))}
    return {
        "n_components": n,
        "explained_variance_ratios": [eigenvalues[i] / total_var for i in range(n)],
        "cumulative_explained": float(eigenvalues[:n].sum() / total_var),
        "loadings": loadings,
        "dominant_cluster": dominant_map,
    }
# ─── CONCENTRATION DRIFT ──────────────────────────────────────────────────────
def concentration_drift(
    weights_history: pd.DataFrame,
    window: int = 21
) -> pd.DataFrame:
    """
    Tracks HHI and naive ENB over time.
    weights_history: DataFrame with dates as index, assets as columns,
                     each row summing to 1.0 (normalised weights).
    Returns DataFrame with date-indexed HHI and ENB series.
    """
    results = []
    for date, row in weights_history.iterrows():
        w = row.dropna()
        w = w[w > 0]
        if len(w) < 2:
            continue
        hhi = herfindahl_index(w)
        results.append({
            "date": date,
            "hhi": hhi,
            "enb": 1.0 / hhi,
        })
    return pd.DataFrame(results).set_index("date")
