"""Scanner: every ticker x monthly window x cycle year, ranked - plus the
numbers that tell you how much of the ranking is luck.

For each (ticker, window) the engine computes the return in EVERY year once.
A cycle filter (say, midterm) then just picks n of those N years. The null
hypothesis is "the cycle label is irrelevant: these n years are no different
from any n years drawn at random from the N". Under that null:

* hit-rate p-value is exact: the number of positive years in a random
  n-subset is hypergeometric(N, k, n), where k = positive years overall.
* avg-return p-value is a permutation test (random n-subsets).
* q-value is the Benjamini-Hochberg false-discovery-rate adjustment across
  every combination tested - the honest number once you've scanned thousands.

``expected_perfect`` sums, over every combination, the probability that a
random n-subset would be 100% positive. Compare it with how many 100%
combinations the scan actually found: if the two are close, the "perfect"
patterns are about what luck alone would serve up.
"""
from __future__ import annotations

from math import comb

import numpy as np
import pandas as pd

from . import cycles
from .backtest import LOW_CONFIDENCE_N, per_year, stats
from .windows import Window, monthly_windows


def hypergeom_sf(x: int, N: int, k: int, n: int) -> float:
    """P(X >= x) for X ~ Hypergeometric(population N, k successes, n draws)."""
    total = comb(N, n)
    return sum(comb(k, i) * comb(N - k, n - i) for i in range(x, min(k, n) + 1)) / total


def prob_p_below(alpha: float, N: int, k: int, n: int) -> float:
    """Chance, under the null, that this combination would show p_hit < alpha.

    The hypergeometric is discrete, so this is usually well under alpha; summing
    it gives the exact expected count of "significant" hits from luck alone.
    """
    for x in range(0, n + 1):
        sf = hypergeom_sf(x, N, k, n)
        if sf < alpha:
            return sf
    return 0.0


def perm_p_mean(all_rets: np.ndarray, n: int, observed: float, rng, B: int) -> float:
    N = len(all_rets)
    if n >= N or n == 0:
        return float("nan")
    picks = np.argsort(rng.random((B, N)), axis=1)[:, :n]
    means = all_rets[picks].mean(axis=1)
    return float((np.sum(means >= observed - 1e-12) + 1) / (B + 1))


def bh_qvalues(p: pd.Series) -> pd.Series:
    p = p.astype(float)
    ok = p.notna()
    q = pd.Series(np.nan, index=p.index)
    if ok.sum() == 0:
        return q
    ps = p[ok].sort_values()
    m = len(ps)
    ranked = ps.values * m / np.arange(1, m + 1)
    ranked = np.minimum.accumulate(ranked[::-1])[::-1]
    q[ps.index] = np.minimum(ranked, 1.0)
    return q


def scan(prices: pd.DataFrame, tickers, windows: list[Window] | None = None,
         cycle_list=cycles.CYCLES, regime_filters=(), permutations: int = 1000,
         seed: int = 7, min_n: int = 3) -> tuple[pd.DataFrame, dict]:
    windows = windows or monthly_windows()
    rng = np.random.default_rng(seed)
    out = []
    for w in windows:
        rows = per_year(prices, w, cycles.ALL, tickers, regime_filters)
        rows = rows[rows.complete]
        for t, g in rows.groupby("ticker", sort=False):
            all_r = g["ret"].to_numpy(float)
            N, k = len(all_r), int((all_r > 0).sum())
            base = stats(g["ret"], g["excess"])
            for c in cycle_list:
                sub = g if c == cycles.ALL else g[g.cycle == c]
                n = len(sub)
                if n < min_n:
                    continue
                st = stats(sub["ret"], sub["excess"])
                x = int((sub["ret"] > 0).sum())
                is_subset = c != cycles.ALL and n < N
                out.append({
                    "ticker": t, "window": w.label, "spec": w.spec, "cycle": c,
                    **{kk: st[kk] for kk in ("n", "hit_rate", "avg_ret", "median_ret",
                                              "worst_ret", "best_ret", "avg_excess",
                                              "beat_bench_rate", "low_confidence")},
                    "worst_year": int(sub.loc[sub.ret.idxmin(), "year"]),
                    "base_n": N, "base_hit_rate": base["hit_rate"], "base_avg_ret": base["avg_ret"],
                    "p_hit": hypergeom_sf(x, N, k, n) if is_subset else np.nan,
                    "p_avg": perm_p_mean(all_r, n, st["avg_ret"], rng, permutations)
                             if is_subset and permutations else np.nan,
                    "p_all_positive_by_luck": (comb(k, n) / comb(N, n)) if is_subset else np.nan,
                    "_p05_by_luck": prob_p_below(0.05, N, k, n) if is_subset else np.nan,
                })
    df = pd.DataFrame(out)
    if df.empty:
        return df, {"combinations_tested": 0}
    df["q_hit"] = bh_qvalues(df["p_hit"])
    df = df.sort_values(["hit_rate", "avg_ret"], ascending=False).reset_index(drop=True)
    df.insert(0, "rank", np.arange(1, len(df) + 1))
    tested = df[df.p_hit.notna()]
    df = df.drop(columns="_p05_by_luck")
    meta = {
        "combinations_tested": int(len(df)),
        "tickers": int(df.ticker.nunique()),
        "ticker_list": [t for t in tickers if t in set(df.ticker)],
        "windows": len(windows),
        "cycles": list(cycle_list),
        "regime_filters": list(regime_filters),
        "perfect_found": int((tested.hit_rate == 1.0).sum()),
        "perfect_expected_by_luck": float(tested.p_all_positive_by_luck.sum()),
        "p_hit_lt_05_found": int((tested.p_hit < 0.05).sum()),
        "p_hit_lt_05_expected_by_luck": float(tested["_p05_by_luck"].sum()),
        "survive_fdr_10pct": int((df.q_hit < 0.10).sum()),
        "low_confidence_share": float(df.low_confidence.mean()),
        "low_confidence_n": LOW_CONFIDENCE_N,
    }
    return df, meta
