# Seasonality & election-cycle backtester

A standalone Python tool. It doesn't touch the journal app. It tests calendar and
presidential-cycle claims ("XLV always rises from its June high into the midterms",
"homebuilders run after the midterms") and shows how much of a scan's ranking is luck.

```bash
cd tools/seasonality
pip install -r requirements.txt
python -m unittest discover -s tests        # offline, synthetic data

python -m seasonality verify                 # Step 1: XLV, June -> midterms, 3 definitions, vs SPY
python -m seasonality verify --preset homebuilders-midterm   # ITB XHB DHI LEN PHM, ED -> +6m / +12m
python -m seasonality backtest --window eom:06:ED --cycle midterm --regime spy_above_200
python -m seasonality scan --cycle midterm   # Step 3: 16 tickers x 72 windows x 4 cycles, ranked
```

Each command prints tables and writes CSVs plus an HTML report to `./out/`. Add `--json` to get a
payload a dashboard panel can consume.

## Inputs

| Flag | Meaning |
|---|---|
| `--tickers XLV,SPY` | default: XLK XLV XLF XLE XLI XLY XLP XLU XLB XLRE XLC ITB XHB SPY QQQ GLD |
| `--window START:END` | see the grammar below. `backtest` accepts it more than once |
| `--cycle` | `election` / `post_election` / `midterm` / `pre_election` / `all` (year % 4) |
| `--regime` | `spy_above_200`, `spy_below_200`, `rates_rising`, `rates_falling`, measured at the window's start. Can be repeated |
| `--raw` | use raw quoted closes. The default is dividend-adjusted closes, i.e. total return |
| `--prices-csv f.csv` | read a wide CSV (date + one column per ticker) instead of downloading from yfinance. Use this for S&P sector-index history later |

### Window grammar

| Anchor | Price used |
|---|---|
| `MM-DD` | close on that date, or on the last trading day before it |
| `eom:06` / `som:06` | last close of June / last close before June starts |
| `high:06` / `low:06` | highest / lowest close during June |
| `ED`, `ED+7`, `ED-30`, `ED+6m` | election-day close, ± calendar days / months |
| `+30`, `+6m` (END only) | N days / months after the entry date |

Examples: `high:06:ED` (June high → election day), `eom:06:ED` (June close → election day),
`high:06:11-30`, `ED:+12m`, `11-15:01-31` (wraps into the next year), `som:01:eom:12`
(calendar year).

## How results are counted

- **SPY is measured over exactly the ticker's entry and exit dates**, so excess is like-for-like.
- **`high:MM` uses information you only have after the fact.** You only know the June high
  once June is over, so it describes a pattern rather than an entry you could have taken.
- **Unfinished windows** (for example 2026 June high → Nov 30, while it's still November) appear
  in the per-year table marked *in progress*. They are left out of n and every statistic.
- **Any result with n < 10 is flagged low confidence.** Sector ETFs start in Dec 1998, so every
  single-cycle result has n ≤ 7.
- **Election day** is the Tuesday after the first Monday in November, every year. The tests
  check this against the seven midterm dates in the handoff.

## Scanner: the data-mining check

For each ticker × window, the scanner computes the return in every year. A cycle filter then
just picks n of those N years. The null hypothesis is that the cycle label doesn't matter, so
those n years are a random draw from the N. Under that null:

- `p_hit` is exact (hypergeometric). `p_avg` is a permutation test. `q_hit` is the
  Benjamini–Hochberg false-discovery-rate adjustment across **every** combination tested.
- The report header shows **100%-hit-rate combos found vs. expected by luck** and
  **p < 0.05 found vs. expected**. If found ≈ expected, the scan is surfacing noise.
- Each ranked row also shows `base_hit_rate`, the same ticker and window across all years.
  "Up 6/7 midterms" doesn't mean much if the window is up 80% of all years anyway.

On pure random-walk data, a full scan "finds" over a hundred perfect 100% patterns, roughly what
luck predicts, and none survive FDR. That's the baseline to compare real results against.

## Using it from the dashboard

The core modules (`windows`, `backtest`, `scanner`) are pure functions over a wide close-price
DataFrame and do no I/O. `data.load_prices()` is the only code that downloads anything.
`backtest.to_json()` and `backtest.json_records()` produce JSON-safe output.

```python
from seasonality import backtest, data
from seasonality.windows import Window
px = data.load_prices(["XLV", "SPY", "^TNX"])
summary, years = backtest.run(px, Window("high:06:ED"), cycle="midterm", tickers=["XLV"])
```
