"""Regime tags measured at a window's entry date, using only data up to that day.

* ``spy_above_200``: SPY close > its 200-day SMA (needs 200 prior bars, else None)
* ``rates_rising``:  10Y yield higher than ~3 months (63 trading days) earlier
"""
from __future__ import annotations

import pandas as pd

SMA_LEN = 200
RATE_LOOKBACK = 63

REGIMES = {
    "spy_above_200": ("spy_above_200", True),
    "spy_below_200": ("spy_above_200", False),
    "rates_rising": ("rates_rising", True),
    "rates_falling": ("rates_rising", False),
}


def tag(entry_date: pd.Timestamp, spy: pd.Series | None, tnx: pd.Series | None) -> dict:
    out = {"spy_above_200": None, "rates_rising": None, "tnx_3m_change": None}
    if spy is not None:
        hist = spy.dropna().loc[:entry_date]
        if len(hist) >= SMA_LEN:
            out["spy_above_200"] = bool(hist.iloc[-1] > hist.iloc[-SMA_LEN:].mean())
    if tnx is not None:
        hist = tnx.dropna().loc[:entry_date]
        if len(hist) > RATE_LOOKBACK:
            chg = float(hist.iloc[-1] - hist.iloc[-1 - RATE_LOOKBACK])
            out["tnx_3m_change"] = chg
            out["rates_rising"] = chg > 0
    return out


def passes(tags: dict, regime_filters: list[str]) -> bool:
    """True if every filter holds. A tag that couldn't be computed fails the filter."""
    for f in regime_filters:
        if f not in REGIMES:
            raise ValueError(f"unknown regime {f!r}; choose from {sorted(REGIMES)}")
        key, want = REGIMES[f]
        if tags.get(key) is not want:
            return False
    return True
