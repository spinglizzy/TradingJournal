"""Offline tests on synthetic prices. Run: python -m unittest discover -s tests"""
import contextlib
import datetime as dt
import io
import itertools
import json
import os
import sys
import tempfile
import unittest
from math import comb
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from seasonality import backtest, cli, cycles, presets, regime, report, scanner  # noqa: E402
from seasonality.windows import Window, monthly_windows  # noqa: E402

DAYS = pd.bdate_range("1998-12-01", "2026-11-04")


def linear(start=DAYS[0], end=DAYS[-1], name="X"):
    """Price == 100 + business-day number: every return is positive and easy to check."""
    idx = DAYS[(DAYS >= start) & (DAYS <= end)]
    return pd.Series(100.0 + np.arange(len(idx)), index=idx, name=name)


def gbm(name, seed, vol=0.012, drift=0.0003):
    r = np.random.default_rng(seed).normal(drift, vol, len(DAYS))
    return pd.Series(100 * np.exp(np.cumsum(r)), index=DAYS, name=name)


class Cycles(unittest.TestCase):
    def test_election_days_match_handoff(self):
        for y, d in presets.MIDTERM_ELECTION_DAYS.items():
            self.assertEqual(cycles.election_day(y).isoformat(), d)
        self.assertEqual(cycles.election_day(2024), dt.date(2024, 11, 5))
        self.assertEqual(cycles.election_day(2020), dt.date(2020, 11, 3))
        self.assertEqual(cycles.election_day(2016), dt.date(2016, 11, 8))

    def test_cycle_labels(self):
        self.assertEqual([cycles.cycle_of(y) for y in (2024, 2025, 2026, 2027)],
                         ["election", "post_election", "midterm", "pre_election"])
        self.assertEqual(cycles.years_for("midterm", 1999, 2026), [2002, 2006, 2010, 2014, 2018, 2022, 2026])


class Windows(unittest.TestCase):
    def setUp(self):
        self.s = linear()

    def test_june_close_to_election_day(self):
        r = Window("eom:06:ED").resolve(self.s, 2022)
        self.assertEqual(r.entry.date, pd.Timestamp("2022-06-30"))
        self.assertEqual(r.exit.date, pd.Timestamp("2022-11-08"))
        self.assertTrue(r.complete)

    def test_month_end_on_weekend_uses_prior_friday(self):
        r = Window("eom:06:ED").resolve(self.s, 2018)  # 2018-06-30 was a Saturday
        self.assertEqual(r.entry.date, pd.Timestamp("2018-06-29"))

    def test_june_high_is_max_close_in_june(self):
        s = self.s.copy()
        s.loc["2014-06-11"] = 10_000.0
        r = Window("high:06:ED").resolve(s, 2014)
        self.assertEqual(r.entry.date, pd.Timestamp("2014-06-11"))
        self.assertEqual(r.entry.price, 10_000.0)
        self.assertLess(r.ret, 0)

    def test_som_eom_is_one_calendar_month(self):
        r = Window("som:03:eom:03").resolve(self.s, 2010)
        self.assertEqual(r.entry.date, pd.Timestamp("2010-02-26"))
        self.assertEqual(r.exit.date, pd.Timestamp("2010-03-31"))

    def test_relative_months_after_election(self):
        r = Window("ED:+6m").resolve(self.s, 2018)
        self.assertEqual(r.entry.date, pd.Timestamp("2018-11-06"))
        self.assertEqual(r.exit.date, pd.Timestamp("2019-05-06"))
        r = Window("ED+7:ED+30").resolve(self.s, 2018)
        self.assertEqual(r.entry.date, pd.Timestamp("2018-11-13"))

    def test_wraps_year_end(self):
        r = Window("11-15:01-31").resolve(self.s, 2010)
        self.assertEqual(r.entry.date, pd.Timestamp("2010-11-15"))
        self.assertEqual(r.exit.date, pd.Timestamp("2011-01-31"))
        r = Window("som:12:eom:02").resolve(self.s, 2010)
        self.assertEqual(r.exit.date, pd.Timestamp("2011-02-28"))

    def test_window_past_last_bar_is_incomplete(self):
        r = Window("high:06:11-30").resolve(self.s, 2026)  # data ends 2026-11-04
        self.assertFalse(r.complete)
        self.assertEqual(r.exit.date, pd.Timestamp("2026-11-04"))
        r = Window("eom:06:ED").resolve(self.s, 2026)
        self.assertTrue(r.complete)

    def test_entry_before_listing_is_skipped(self):
        late = linear(start=pd.Timestamp("2015-10-08"))
        self.assertIsNone(Window("eom:06:ED").resolve(late, 2014))
        self.assertIsNone(Window("eom:06:ED").resolve(late, 2015))  # June 2015 predates listing
        self.assertIsNotNone(Window("eom:06:ED").resolve(late, 2016))

    def test_bad_specs(self):
        for bad in ("06-31:ED", "nonsense", "+5:ED", "high:13:ED"):
            with self.assertRaises(ValueError):
                Window(bad)

    def test_monthly_windows_grid(self):
        ws = monthly_windows(6)
        self.assertEqual(len(ws), 72)
        self.assertEqual(ws[0].label, "Jan")
        self.assertIn("Nov–Feb", [w.label for w in ws])


class Engine(unittest.TestCase):
    def prices(self):
        return pd.concat([gbm("XLV", 1), gbm("SPY", 2), linear(name="UP"),
                          linear(start=pd.Timestamp("2015-10-08"), name="XLRE")], axis=1)

    def test_excess_uses_same_dates_as_ticker(self):
        p = self.prices()
        rows = backtest.per_year(p, Window("high:06:ED"), "midterm", ["XLV"])
        for r in rows.itertuples():
            spy = p["SPY"]
            exp = spy[pd.Timestamp(r.exit_date)] / spy[pd.Timestamp(r.entry_date)] - 1
            self.assertAlmostEqual(r.bench_ret, exp)
            self.assertAlmostEqual(r.excess, r.ret - exp)

    def test_summary_counts_and_flags(self):
        p = self.prices()
        summ, rows = backtest.run(p, Window("high:06:11-30"), "midterm", ["UP", "XLRE"])
        up = summ.set_index("ticker").loc["UP"]
        self.assertEqual(up.n, 6)           # 2002..2022; 2026 still running
        self.assertEqual(up.in_progress, 1)
        self.assertEqual(up.hit_rate, 1.0)
        self.assertTrue(up.low_confidence)
        self.assertEqual(summ.set_index("ticker").loc["XLRE"].n, 2)  # 2018, 2022 only

    def test_all_years_not_low_confidence(self):
        summ, _ = backtest.run(self.prices(), Window("som:01:eom:01"), "all", ["UP"])
        self.assertGreaterEqual(summ.iloc[0].n, 27)
        self.assertFalse(summ.iloc[0].low_confidence)

    def test_regime_filter(self):
        p = self.prices()
        p["SPY"] = linear(name="SPY")  # always rising -> always above its 200d
        rows = backtest.per_year(p, Window("eom:06:ED"), "all", ["XLV"])
        self.assertTrue(rows.spy_above_200.dropna().all())
        self.assertTrue(rows.spy_above_200.isna().any())  # 1999: < 200 bars of history
        below = backtest.per_year(p, Window("eom:06:ED"), "all", ["XLV"], ["spy_below_200"])
        self.assertTrue(below.empty)

    def test_rates_tag(self):
        tnx = pd.Series(np.linspace(1, 5, len(DAYS)), index=DAYS)
        t = regime.tag(pd.Timestamp("2010-06-30"), None, tnx)
        self.assertTrue(t["rates_rising"])
        self.assertTrue(regime.passes(t, ["rates_rising"]))
        self.assertFalse(regime.passes(t, ["rates_falling"]))

    def test_json_payload_is_serialisable(self):
        summ, rows = backtest.run(self.prices(), Window("eom:06:ED"), "midterm", ["XLV"])
        json.dumps(backtest.to_json(summ, rows, cycle="midterm"))


class Scanner(unittest.TestCase):
    def test_hypergeom_matches_brute_force(self):
        signs = [1] * 9 + [0] * 6  # N=15, k=9
        for n in (3, 5, 7):
            for x in range(n + 1):
                brute = sum(sum(c) >= x for c in itertools.combinations(signs, n)) / comb(15, n)
                self.assertAlmostEqual(scanner.hypergeom_sf(x, 15, 9, n), brute)

    def test_bh_qvalues(self):
        q = scanner.bh_qvalues(pd.Series([0.01, 0.04, 0.03, 0.5, np.nan]))
        self.assertTrue(np.allclose(q.values[:4], [0.04, 0.16 / 3, 0.16 / 3, 0.5]))
        self.assertTrue(np.isnan(q.values[4]))

    def test_pure_noise_finds_about_what_luck_predicts(self):
        tickers = [f"T{i}" for i in range(8)]
        p = pd.concat([gbm(t, 100 + i) for i, t in enumerate(tickers)] + [gbm("SPY", 99)], axis=1)
        ranked, meta = scanner.scan(p, tickers, monthly_windows(3), permutations=0)
        self.assertEqual(meta["combinations_tested"], 8 * 36 * 4)
        # random-walk data: "perfect" finds should be in the same ballpark as luck's expectation
        self.assertLess(abs(meta["perfect_found"] - meta["perfect_expected_by_luck"]),
                        4 * max(1.0, meta["perfect_expected_by_luck"]) ** 0.5 + 2)
        self.assertLessEqual(meta["survive_fdr_10pct"], 3)
        self.assertTrue(ranked.low_confidence.all())  # 7 years per cycle, max
        html = report.scan_html(ranked, meta, "midterm")
        self.assertIn("combinations tested", html)

    def test_planted_seasonality_is_found(self):
        base = gbm("PLANT", 5, vol=0.004, drift=0.0)
        bump = pd.Series(0.0, index=DAYS)
        m = (DAYS.month == 7) & (DAYS.year % 4 == 2)
        bump[m] = 0.01
        p = pd.concat([base * np.exp(bump.cumsum()), gbm("SPY", 6)], axis=1)
        p.columns = ["PLANT", "SPY"]
        ranked, _ = scanner.scan(p, ["PLANT"], monthly_windows(1), permutations=200)
        top = ranked[(ranked.cycle == "midterm") & (ranked.window == "Jul")].iloc[0]
        self.assertEqual(top.hit_rate, 1.0)
        self.assertLess(top.p_avg, 0.01)


class CLI(unittest.TestCase):
    def test_end_to_end_from_csv(self):
        p = pd.concat([gbm(t, i) for i, t in enumerate(["XLV", "SPY", "XLK", "^TNX"])], axis=1)
        with tempfile.TemporaryDirectory() as d:
            csv = os.path.join(d, "prices.csv")
            p.to_csv(csv)
            out = os.path.join(d, "out")
            with contextlib.redirect_stdout(io.StringIO()):
                self._run(csv, out)
            files = sorted(os.listdir(out))
            self.assertIn("scan_midterm.html", files)
            self.assertIn("xlv-midterm.html", files)
            self.assertIn("backtest-midterm-years.html", files)
            self.assertIn("high_06_ED_midterm_years.csv", files)

    def _run(self, csv, out):
        self.assertEqual(cli.main(["verify", "--prices-csv", csv, "--out", out]), 0)
        self.assertEqual(cli.main(["backtest", "--prices-csv", csv, "--out", out, "--tickers", "XLV,XLK",
                                   "--window", "ED:+6m", "--cycle", "midterm",
                                   "--regime", "rates_falling"]), 0)
        self.assertEqual(cli.main(["scan", "--prices-csv", csv, "--out", out, "--tickers", "XLV,XLK",
                                   "--max-len", "2", "--permutations", "50"]), 0)


if __name__ == "__main__":
    unittest.main()
