"""Core engine: one window x one cycle filter x many tickers -> per-year rows + stats.

Pure functions over a wide price frame, so the dashboard can call them
directly. Nothing here downloads anything.
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

from . import cycles, regime
from .data import BENCHMARK, TEN_YEAR
from .windows import Window

LOW_CONFIDENCE_N = 10


def per_year(prices: pd.DataFrame, window: Window, cycle: str = cycles.ALL,
             tickers=None, regime_filters=(), first_year: int | None = None,
             last_year: int | None = None, benchmark: str = BENCHMARK) -> pd.DataFrame:
    """One row per (ticker, year) instance of the window.

    Columns: ticker, year, cycle, entry_date, entry_px, exit_date, exit_px,
    ret, bench_ret, excess, complete, spy_above_200, rates_rising, tnx_3m_change.

    The benchmark is measured over exactly the same entry/exit dates as the
    ticker (not its own June high, say), so ``excess`` is a like-for-like
    comparison. Rows that fail a regime filter are dropped. Incomplete rows
    (window still running) are kept, flagged ``complete=False``.
    """
    tickers = [t for t in (tickers or prices.columns) if t != TEN_YEAR]
    bench = prices[benchmark].dropna() if benchmark in prices else None
    tnx = prices[TEN_YEAR].dropna() if TEN_YEAR in prices else None
    idx = prices.index
    y0 = first_year or idx[0].year
    y1 = last_year or idx[-1].year
    rows = []
    for t in tickers:
        s = prices[t].dropna()
        if s.empty:
            continue
        for y in cycles.years_for(cycle, y0, y1):
            r = window.resolve(s, y)
            if r is None:
                continue
            tags = regime.tag(r.entry.date, bench, tnx)
            if regime_filters and not regime.passes(tags, list(regime_filters)):
                continue
            b = _bench_ret(bench, r.entry.date, r.exit.date)
            rows.append({
                "ticker": t, "year": y, "cycle": cycles.cycle_of(y),
                "entry_date": r.entry.date.date(), "entry_px": r.entry.price,
                "exit_date": r.exit.date.date(), "exit_px": r.exit.price,
                "ret": r.ret, "bench_ret": b,
                "excess": (r.ret - b) if b is not None else None,
                "complete": r.complete, **tags,
            })
    cols = ["ticker", "year", "cycle", "entry_date", "entry_px", "exit_date", "exit_px",
            "ret", "bench_ret", "excess", "complete", "spy_above_200", "rates_rising",
            "tnx_3m_change"]
    return pd.DataFrame(rows, columns=cols)


def _bench_ret(bench, d0, d1):
    if bench is None:
        return None
    a, b = bench.loc[:d0], bench.loc[:d1]
    if a.empty or b.empty or a.index[-1] != d0 or b.index[-1] != d1:
        # benchmark missing a bar on one of the dates -> use as-of, but only if close
        if a.empty or b.empty or (d0 - a.index[-1]).days > 5 or (d1 - b.index[-1]).days > 5:
            return None
    return float(b.iloc[-1] / a.iloc[-1] - 1.0)


def summarize(rows: pd.DataFrame) -> pd.DataFrame:
    """Per-ticker stats over COMPLETE rows only."""
    out = []
    for t, g in rows.groupby("ticker", sort=False):
        done = g[g["complete"]]
        out.append({"ticker": t, **stats(done["ret"], done["excess"]),
                    "in_progress": int((~g["complete"]).sum())})
    cols = ["ticker", "n", "hit_rate", "avg_ret", "median_ret", "worst_ret", "worst_year",
            "best_ret", "best_year", "avg_excess", "beat_bench_rate", "low_confidence",
            "in_progress"]
    df = pd.DataFrame(out, columns=cols)
    # attach worst/best years
    for i, r in df.iterrows():
        g = rows[(rows.ticker == r.ticker) & rows.complete]
        if len(g):
            df.at[i, "worst_year"] = int(g.loc[g.ret.idxmin(), "year"])
            df.at[i, "best_year"] = int(g.loc[g.ret.idxmax(), "year"])
    return df


def stats(ret: pd.Series, excess: pd.Series | None = None) -> dict:
    ret = pd.Series(ret, dtype=float).dropna()
    n = len(ret)
    if n == 0:
        return {"n": 0, "hit_rate": math.nan, "avg_ret": math.nan, "median_ret": math.nan,
                "worst_ret": math.nan, "worst_year": None, "best_ret": math.nan,
                "best_year": None, "avg_excess": math.nan, "beat_bench_rate": math.nan,
                "low_confidence": True}
    ex = pd.Series(excess, dtype=float).dropna() if excess is not None else pd.Series(dtype=float)
    return {
        "n": n,
        "hit_rate": float((ret > 0).mean()),
        "avg_ret": float(ret.mean()),
        "median_ret": float(ret.median()),
        "worst_ret": float(ret.min()), "worst_year": None,
        "best_ret": float(ret.max()), "best_year": None,
        "avg_excess": float(ex.mean()) if len(ex) else math.nan,
        "beat_bench_rate": float((ex > 0).mean()) if len(ex) else math.nan,
        "low_confidence": n < LOW_CONFIDENCE_N,
    }


def run(prices: pd.DataFrame, window: Window, cycle: str = cycles.ALL, tickers=None,
        regime_filters=(), **kw) -> tuple[pd.DataFrame, pd.DataFrame]:
    rows = per_year(prices, window, cycle, tickers, regime_filters, **kw)
    return summarize(rows), rows


def to_json(summary: pd.DataFrame, rows: pd.DataFrame, **meta) -> dict:
    """JSON-safe payload for a dashboard panel."""
    def clean(df):
        return json_records(df)
    return {"meta": meta, "summary": clean(summary), "rows": clean(rows)}


def json_records(df: pd.DataFrame) -> list[dict]:
    recs = df.astype(object).where(pd.notna(df), None).to_dict("records")
    for r in recs:
        for k, v in r.items():
            if isinstance(v, (np.floating, float)) and not math.isfinite(v):
                r[k] = None
            elif isinstance(v, np.generic):
                r[k] = v.item()
            elif hasattr(v, "isoformat"):
                r[k] = v.isoformat()
    return recs
