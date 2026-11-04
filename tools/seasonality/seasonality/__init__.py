"""Seasonality & election-cycle backtester.

Library entry points (all take a wide close-price DataFrame, no I/O):
    backtest.run(prices, Window("eom:06:ED"), cycle="midterm") -> (summary, rows)
    scanner.scan(prices, tickers)                               -> (ranked, meta)
    report.backtest_html(...), report.scan_html(...)            -> str
Data: data.load_prices(tickers)
"""
from .windows import Window  # noqa: F401
