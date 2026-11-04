"""Command line.

    python -m seasonality verify                 # Step 1: XLV June -> midterms, 3 definitions
    python -m seasonality verify --preset homebuilders-midterm
    python -m seasonality backtest --window eom:06:ED --cycle midterm --regime spy_above_200
    python -m seasonality scan --cycle midterm   # Step 3: everything, ranked, with luck baselines

Outputs land in ./out (CSV + HTML). ``--json`` prints a dashboard-ready payload.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pandas as pd

from . import backtest, cycles, data, presets, regime, report, scanner
from .windows import Window, monthly_windows


def _common(p):
    p.add_argument("--tickers", help="comma-separated (default: sector SPDRs + ITB XHB SPY QQQ GLD)")
    p.add_argument("--start", default=data.DEFAULT_START, help="first date to load (default 1998-12-01)")
    p.add_argument("--raw", action="store_true", help="raw closes instead of dividend-adjusted (total return)")
    p.add_argument("--refresh", action="store_true", help="ignore the download cache")
    p.add_argument("--prices-csv", help="wide CSV (date, one column per ticker incl. SPY) instead of yfinance")
    p.add_argument("--regime", action="append", default=[], choices=sorted(regime.REGIMES),
                   help="regime filter at window start; repeatable")
    p.add_argument("--out", default="out", help="output directory (default ./out)")
    p.add_argument("--json", action="store_true", help="print a JSON payload instead of tables")


def _load(args, tickers):
    need = list(tickers) + [data.BENCHMARK]
    wants_rates = any(r.startswith("rates") for r in args.regime)
    if args.prices_csv:
        cols = pd.read_csv(args.prices_csv, index_col=0, nrows=0).columns
        if wants_rates or data.TEN_YEAR in cols:
            need.append(data.TEN_YEAR)
    else:
        need.append(data.TEN_YEAR)  # cheap; fills the 10Y column in every per-year table
    return data.load_prices(need, start=args.start, adjusted=not args.raw,
                            refresh=args.refresh, prices_csv=args.prices_csv)


def _tickers(args, default):
    return [t.strip().upper() for t in args.tickers.split(",")] if args.tickers else list(default)


def _print_summary(heading, summary, rows):
    fmt = lambda v: "—" if pd.isna(v) else f"{v * 100:+.1f}%"
    print(f"\n== {heading}")
    show = rows.copy()
    for c in ("ret", "bench_ret", "excess"):
        show[c] = show[c].map(fmt)
    show["spy_above_200"] = show["spy_above_200"].map({True: "yes", False: "no"}).fillna("—")
    show["complete"] = show["complete"].map({True: "", False: "IN PROGRESS"})
    print(show[["ticker", "year", "entry_date", "entry_px", "exit_date", "exit_px", "ret",
                "bench_ret", "excess", "spy_above_200", "complete"]]
          .rename(columns={"bench_ret": "SPY", "spy_above_200": "SPY>200d", "complete": ""})
          .to_string(index=False, float_format=lambda v: f"{v:.2f}"))
    for r in summary.itertuples():
        lc = f"  ⚠ LOW CONFIDENCE (n<{backtest.LOW_CONFIDENCE_N})" if r.low_confidence else ""
        print(f"  {r.ticker}: n={r.n}  hit={_p(r.hit_rate)}  avg={fmt(r.avg_ret)}  median={fmt(r.median_ret)}  "
              f"worst={fmt(r.worst_ret)} ({r.worst_year})  best={fmt(r.best_ret)} ({r.best_year})  "
              f"vs SPY avg={fmt(r.avg_excess)}  beat SPY={_p(r.beat_bench_rate)}{lc}")


def _p(v):
    return "—" if pd.isna(v) else f"{v * 100:.0f}%"


def _write(out: Path, name: str, df: pd.DataFrame):
    out.mkdir(parents=True, exist_ok=True)
    df.to_csv(out / name, index=False)
    return out / name


def cmd_study(args, tickers, windows, cycle, title, notes, slug=None):
    prices = _load(args, tickers)
    out = Path(args.out)
    sections, payload, files = [], [], []
    for w in windows:
        summary, rows = backtest.run(prices, w, cycle, tickers, args.regime)
        sections.append((w.label, summary, rows))
        stem = w.spec.replace(":", "_").replace("+", "p")
        files += [_write(out, f"{stem}_{cycle}_summary.csv", summary),
                  _write(out, f"{stem}_{cycle}_years.csv", rows)]
        if args.json:
            payload.append({"window": w.spec, "label": w.label,
                            **backtest.to_json(summary, rows, cycle=cycle, regime=args.regime)})
        else:
            _print_summary(f"{w.label}  [{w.spec}]  cycle={cycle}  regime={args.regime or 'none'}", summary, rows)
    last = prices.index[-1].date()
    notes = list(notes) + [f"Data through {last}; {'raw' if args.raw else 'dividend-adjusted'} closes. "
                           "In-progress windows are shown but excluded from the stats."]
    html_path = out / f"{slug or _slug(title)}.html"
    html_path.write_text(report.backtest_html(title, sections, notes), encoding="utf-8")
    if args.json:
        print(json.dumps(payload, indent=1))
    else:
        print(f"\nwrote {html_path} and {len(files)} CSVs in {out}/")
    return 0


def _slug(s):
    import re
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:60]


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="seasonality", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    v = sub.add_parser("verify", help="run a named study from the handoff")
    v.add_argument("--preset", default="xlv-midterm", choices=sorted(presets.PRESETS))
    _common(v)

    b = sub.add_parser("backtest", help="one or more windows x one cycle filter")
    b.add_argument("--window", action="append", required=True,
                   help="START:END, e.g. eom:06:ED, high:06:11-30, ED:+6m, 06-01:09-30 (repeatable)")
    b.add_argument("--cycle", default="all", choices=cycles.CYCLES + (cycles.ALL,))
    _common(b)

    s = sub.add_parser("scan", help="all tickers x monthly windows x cycle years, ranked")
    s.add_argument("--cycle", default="midterm", choices=cycles.CYCLES,
                   help="cycle year shown in the heatmap / top list (all four are scanned)")
    s.add_argument("--max-len", type=int, default=6, help="longest monthly window, in months (default 6)")
    s.add_argument("--permutations", type=int, default=1000, help="avg-return permutation draws (0 = skip)")
    s.add_argument("--top", type=int, default=40)
    _common(s)

    args = ap.parse_args(argv)

    if args.cmd == "verify":
        tickers, windows, cycle, title = presets.PRESETS[args.preset]
        tickers = _tickers(args, tickers)
        notes = []
        if args.preset == "xlv-midterm":
            notes = ["“June high” is the highest close in June. It is only known once June is over, so it is a "
                     "description of the pattern, not an entry you could have taken at the time.",
                     "SPY is measured over exactly the same dates as XLV, so “excess” is like-for-like.",
                     "“SPY &gt; 200d” is taken at the entry date and tests the “fails in bear markets” idea."]
        return cmd_study(args, tickers, windows, cycle, title, notes, slug=args.preset)

    if args.cmd == "backtest":
        tickers = _tickers(args, data.DEFAULT_TICKERS)
        windows = [Window(w) for w in args.window]
        return cmd_study(args, tickers, windows, args.cycle,
                         f"Backtest: {args.cycle} years", [])

    if args.cmd == "scan":
        tickers = _tickers(args, data.DEFAULT_TICKERS)
        prices = _load(args, tickers)
        ranked, meta = scanner.scan(prices, tickers, monthly_windows(args.max_len),
                                    regime_filters=args.regime, permutations=args.permutations)
        if ranked.empty:
            print("nothing to rank (no data?)", file=sys.stderr)
            return 1
        out = Path(args.out)
        csv = _write(out, "scan_ranked.csv", ranked)
        (out / "scan_meta.json").write_text(json.dumps(meta, indent=1))
        html_path = out / f"scan_{args.cycle}.html"
        html_path.write_text(report.scan_html(ranked, meta, args.cycle, args.top), encoding="utf-8")
        if args.json:
            print(json.dumps({"meta": meta, "ranked": backtest.json_records(ranked)}, indent=1))
            return 0
        print(f"\ncombinations tested: {meta['combinations_tested']:,}")
        print(f"100% hit-rate combos: {meta['perfect_found']} found vs {meta['perfect_expected_by_luck']:.1f} "
              "expected from random year-picks")
        print(f"p(hit) < 0.05: {meta['p_hit_lt_05_found']} found vs {meta['p_hit_lt_05_expected_by_luck']:.1f} expected")
        print(f"survive 10% FDR: {meta['survive_fdr_10pct']}")
        top = ranked[ranked.cycle == args.cycle].head(args.top).copy()
        for c in ("hit_rate", "base_hit_rate"):
            top[c] = top[c].map(_p)
        for c in ("avg_ret", "worst_ret", "avg_excess"):
            top[c] = top[c].map(lambda v: f"{v * 100:+.1f}%")
        print(f"\nTop {len(top)} — {args.cycle} years:")
        print(top[["ticker", "window", "n", "hit_rate", "avg_ret", "worst_ret", "worst_year", "avg_excess",
                   "base_hit_rate", "p_hit", "q_hit"]].to_string(index=False, float_format=lambda v: f"{v:.3f}"))
        print(f"\nwrote {csv}, {html_path}")
        return 0
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
