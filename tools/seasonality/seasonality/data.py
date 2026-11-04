"""Price loading.

Everything downstream takes a wide DataFrame: DatetimeIndex (trading days),
one column per ticker, values = closes. Where it comes from is this module's
business only, so the dashboard can hand in its own frame later.

Sources:
  * yfinance (default), cached to ``.cache/<TICKER>.csv`` for a day
  * a local wide CSV (``--prices-csv``): first column = date, one column per ticker

``adjusted=True`` (default) uses dividend-adjusted closes, i.e. total return.
That is the honest way to compare XLU or XLRE against SPY. Use
``adjusted=False`` to match raw quoted closes (e.g. a chart or a monthly
table you're checking against).
"""
from __future__ import annotations

import time
from pathlib import Path

import pandas as pd

SECTOR_SPDRS = ["XLK", "XLV", "XLF", "XLE", "XLI", "XLY", "XLP", "XLU", "XLB", "XLRE", "XLC"]
DEFAULT_TICKERS = SECTOR_SPDRS + ["ITB", "XHB", "SPY", "QQQ", "GLD"]
BENCHMARK = "SPY"
TEN_YEAR = "^TNX"   # CBOE 10-year yield index; only its direction is used
DEFAULT_START = "1998-12-01"

CACHE_DIR = Path(__file__).resolve().parent.parent / ".cache"
CACHE_TTL_SECONDS = 20 * 3600


def _cache_path(ticker: str, adjusted: bool) -> Path:
    safe = ticker.replace("^", "_").replace("/", "_")
    return CACHE_DIR / f"{safe}{'' if adjusted else '.raw'}.csv"


def _download(ticker: str, start: str, adjusted: bool) -> pd.Series:
    try:
        import yfinance as yf
    except ImportError as e:  # pragma: no cover
        raise SystemExit("yfinance is not installed: pip install -r requirements.txt") from e
    df = yf.download(ticker, start=start, auto_adjust=adjusted, progress=False, actions=False)
    if df is None or df.empty:
        raise RuntimeError(f"no data returned for {ticker} (network blocked or bad symbol?)")
    close = df["Close"]
    if isinstance(close, pd.DataFrame):  # newer yfinance returns a column per ticker
        close = close.iloc[:, 0]
    close.index = pd.to_datetime(close.index).tz_localize(None).normalize()
    return close.rename(ticker).astype(float)


def load_one(ticker: str, start: str = DEFAULT_START, adjusted: bool = True,
             refresh: bool = False) -> pd.Series:
    path = _cache_path(ticker, adjusted)
    fresh = path.exists() and (time.time() - path.stat().st_mtime) < CACHE_TTL_SECONDS
    if fresh and not refresh:
        s = pd.read_csv(path, index_col=0, parse_dates=True).iloc[:, 0]
        if str(s.index[0].date()) <= start:
            return s.rename(ticker)
    s = _download(ticker, start, adjusted)
    CACHE_DIR.mkdir(exist_ok=True)
    s.to_frame().to_csv(path)
    return s


def load_prices(tickers, start: str = DEFAULT_START, adjusted: bool = True,
                refresh: bool = False, prices_csv: str | None = None,
                strict: bool = False) -> pd.DataFrame:
    """Wide close-price frame for ``tickers`` (benchmark is up to the caller)."""
    tickers = list(dict.fromkeys(tickers))
    if prices_csv:
        df = pd.read_csv(prices_csv, index_col=0, parse_dates=True)
        df.index = pd.to_datetime(df.index).normalize()
        missing = [t for t in tickers if t not in df.columns]
        if missing:
            raise SystemExit(f"{prices_csv} has no column(s) for: {', '.join(missing)}")
        return df[tickers].sort_index().loc[start:].astype(float)
    cols, failed = [], []
    for t in tickers:
        try:
            cols.append(load_one(t, start, adjusted, refresh))
        except Exception as e:  # keep going; a single bad symbol shouldn't kill a scan
            failed.append(f"{t}: {e}")
    if failed:
        msg = "could not load " + "; ".join(failed)
        if strict or not cols:
            raise SystemExit(msg)
        print(f"warning: {msg}")
    return pd.concat(cols, axis=1).sort_index()
