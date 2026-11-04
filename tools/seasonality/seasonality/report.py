"""Self-contained HTML reports (no external assets, works offline).

Two builders, both return a string:
    backtest_html(title, sections, notes)  - per-ticker stats + per-year tables
    scan_html(ranked, meta, cycle)         - heatmaps + ranked table + data-mining box
"""
from __future__ import annotations

import html
import json
import math

import pandas as pd

from .backtest import LOW_CONFIDENCE_N
from .windows import MONTHS

CSS = """
:root{color-scheme:light;--page:#f9f9f7;--surface:#fcfcfb;--ink:#0b0b0b;--ink2:#52514e;
--muted:#898781;--grid:#e1e0d9;--pos:#2a78d6;--neg:#e34948;--mid:#f0efec;--good:#0a7d0a;--bad:#c23434}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;--page:#0d0d0d;
--surface:#1a1a19;--ink:#f0efec;--ink2:#c3c2b7;--muted:#898781;--grid:#2c2c2a;--pos:#3987e5;
--neg:#e66767;--mid:#383835;--good:#3fbf3f;--bad:#e66767}}
:root[data-theme="dark"]{color-scheme:dark;--page:#0d0d0d;--surface:#1a1a19;--ink:#f0efec;
--ink2:#c3c2b7;--muted:#898781;--grid:#2c2c2a;--pos:#3987e5;--neg:#e66767;--mid:#383835;
--good:#3fbf3f;--bad:#e66767}
*{box-sizing:border-box}
body{margin:0;background:var(--page);color:var(--ink);font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1180px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:32px 0 8px}h3{font-size:14px;margin:20px 0 6px;color:var(--ink2)}
p,li{color:var(--ink2)}.muted{color:var(--muted)}
.card{background:var(--surface);border:1px solid var(--grid);border-radius:8px;padding:14px 16px;margin:12px 0}
.scroll{overflow-x:auto}
table{border-collapse:collapse;font-variant-numeric:tabular-nums;width:100%}
th,td{padding:5px 8px;border-bottom:1px solid var(--grid);text-align:right;white-space:nowrap}
th{color:var(--ink2);font-weight:600;font-size:12px}
td:first-child,th:first-child{text-align:left}
.pos{color:var(--good)}.neg{color:var(--bad)}
.flag{display:inline-block;font-size:11px;padding:1px 6px;border-radius:9px;border:1px solid var(--muted);color:var(--ink2)}
.kpis{display:flex;flex-wrap:wrap;gap:12px}.kpi{flex:1 1 160px}.kpi b{display:block;font-size:22px}
.hm{border-collapse:separate;border-spacing:2px;width:auto}
.hm td{width:52px;height:30px;text-align:center;border:0;border-radius:4px;font-size:12px;padding:0;position:relative;cursor:default}
.hm td.lbl{width:auto;text-align:left;padding-right:8px;color:var(--ink2);background:none}
.hm td.low::after{content:"";position:absolute;right:3px;top:3px;width:5px;height:5px;border-radius:50%;background:currentColor;opacity:.55}
.hm td.na{background:none;color:var(--muted)}
.legend{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--ink2);margin:6px 0}
.ramp{width:180px;height:10px;border-radius:5px;background:linear-gradient(90deg,var(--neg),var(--mid),var(--pos))}
#tip{position:fixed;pointer-events:none;background:var(--surface);color:var(--ink);border:1px solid var(--grid);
border-radius:6px;padding:6px 8px;font-size:12px;box-shadow:0 2px 8px rgba(0,0,0,.15);display:none;z-index:9;white-space:pre}
"""

TIP_JS = """
const tip=document.getElementById('tip');
document.addEventListener('mousemove',e=>{const c=e.target.closest('[data-tip]');
if(!c){tip.style.display='none';return}tip.textContent=c.dataset.tip;tip.style.display='block';
const x=Math.min(e.clientX+14,innerWidth-tip.offsetWidth-8);tip.style.left=x+'px';tip.style.top=(e.clientY+14)+'px'});
"""


def _pct(v, signed=True, digits=1):
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return "—"
    return f"{v * 100:+.{digits}f}%" if signed else f"{v * 100:.0f}%"


def _cls(v):
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return ""
    return "pos" if v > 0 else "neg" if v < 0 else ""


def _page(title: str, body: str) -> str:
    return (f"<!doctype html><html lang='en'><head><meta charset='utf-8'>"
            f"<meta name='viewport' content='width=device-width,initial-scale=1'>"
            f"<title>{html.escape(title)}</title><style>{CSS}</style></head>"
            f"<body><main>{body}</main><div id='tip'></div><script>{TIP_JS}</script></body></html>")


def summary_table(summary: pd.DataFrame) -> str:
    h = ("<div class='scroll'><table><tr><th>Ticker</th><th>n</th><th>Hit rate</th><th>Avg</th>"
         "<th>Median</th><th>Worst (yr)</th><th>Best (yr)</th><th>Avg excess vs SPY</th>"
         "<th>Beat SPY</th><th></th></tr>")
    for r in summary.itertuples():
        flag = f"<span class='flag'>low confidence · n&lt;{LOW_CONFIDENCE_N}</span>" if r.low_confidence else ""
        prog = f" <span class='flag'>{r.in_progress} in progress</span>" if getattr(r, "in_progress", 0) else ""
        wy = f" ({r.worst_year})" if pd.notna(r.worst_year) else ""
        by = f" ({r.best_year})" if pd.notna(r.best_year) else ""
        h += (f"<tr><td><b>{html.escape(r.ticker)}</b></td><td>{r.n}</td><td>{_pct(r.hit_rate, False)}</td>"
              f"<td class='{_cls(r.avg_ret)}'>{_pct(r.avg_ret)}</td><td class='{_cls(r.median_ret)}'>{_pct(r.median_ret)}</td>"
              f"<td class='{_cls(r.worst_ret)}'>{_pct(r.worst_ret)}{wy}</td><td class='{_cls(r.best_ret)}'>{_pct(r.best_ret)}{by}</td>"
              f"<td class='{_cls(r.avg_excess)}'>{_pct(r.avg_excess)}</td><td>{_pct(r.beat_bench_rate, False)}</td>"
              f"<td>{flag}{prog}</td></tr>")
    return h + "</table></div>"


def rows_table(rows: pd.DataFrame) -> str:
    h = ("<div class='scroll'><table><tr><th>Ticker</th><th>Year</th><th>Entry</th><th>Entry px</th>"
         "<th>Exit</th><th>Exit px</th><th>Return</th><th>SPY</th><th>Excess</th>"
         "<th>SPY &gt; 200d</th><th>10Y 3m Δ</th><th></th></tr>")
    for r in rows.itertuples():
        reg = "—" if r.spy_above_200 is None or pd.isna(r.spy_above_200) else ("yes" if r.spy_above_200 else "no")
        tnx = "—" if r.tnx_3m_change is None or pd.isna(r.tnx_3m_change) else f"{r.tnx_3m_change:+.2f}"
        st = "" if r.complete else "<span class='flag'>in progress</span>"
        h += (f"<tr><td>{html.escape(r.ticker)}</td><td>{r.year}</td><td>{r.entry_date}</td><td>{r.entry_px:.2f}</td>"
              f"<td>{r.exit_date}</td><td>{r.exit_px:.2f}</td><td class='{_cls(r.ret)}'>{_pct(r.ret)}</td>"
              f"<td class='{_cls(r.bench_ret)}'>{_pct(r.bench_ret)}</td><td class='{_cls(r.excess)}'>{_pct(r.excess)}</td>"
              f"<td>{reg}</td><td>{tnx}</td><td>{st}</td></tr>")
    return h + "</table></div>"


def backtest_html(title: str, sections: list[tuple[str, pd.DataFrame, pd.DataFrame]],
                  notes: list[str] = ()) -> str:
    body = f"<h1>{html.escape(title)}</h1>"
    if notes:
        body += "<div class='card'><ul>" + "".join(f"<li>{n}</li>" for n in notes) + "</ul></div>"
    for heading, summary, rows in sections:
        body += f"<h2>{html.escape(heading)}</h2>" + summary_table(summary)
        body += "<h3>Every year</h3>" + rows_table(rows)
    return _page(title, body)


def _cell(hit, n, avg, excess, p, q, worst, ticker, label, mark_low=True):
    if hit is None or (isinstance(hit, float) and math.isnan(hit)):
        return "<td class='na'>·</td>"
    d = hit - 0.5  # diverging around a coin flip
    pole = "--pos" if d >= 0 else "--neg"
    share = min(abs(d) / 0.5, 1.0) * 100
    ink = "#ffffff" if share > 60 else "var(--ink)"
    low = " low" if mark_low and n < LOW_CONFIDENCE_N else ""
    tip = (f"{ticker} · {label}\nhit {hit * 100:.0f}% of n={n}\navg {_pct(avg)}  worst {_pct(worst)}\n"
           f"vs SPY {_pct(excess)}\np(hit) {_fmt_p(p)}  q {_fmt_p(q)}")
    return (f"<td class='c{low}' style='background:color-mix(in oklab,var({pole}) {share:.0f}%,var(--mid));"
            f"color:{ink}' data-tip='{html.escape(tip, quote=True)}'>{hit * 100:.0f}</td>")


def _fmt_p(p):
    return "—" if p is None or (isinstance(p, float) and math.isnan(p)) else f"{p:.3f}"


def heatmap(ranked: pd.DataFrame, cycle: str, length: int, tickers: list[str],
            mark_low: bool = True) -> str:
    sub = ranked[ranked.cycle == cycle]
    lab = {}
    for m in range(12):
        e = (m + length - 1) % 12
        lab[m] = MONTHS[m] if length == 1 else f"{MONTHS[m]}–{MONTHS[e]}"
    h = "<div class='scroll'><table class='hm'><tr><td class='lbl'></td>"
    h += "".join(f"<td class='lbl' style='text-align:center;font-size:11px'>{lab[m]}</td>" for m in range(12)) + "</tr>"
    idx = {(r.ticker, r.window): r for r in sub.itertuples()}
    for t in tickers:
        h += f"<tr><td class='lbl'><b>{html.escape(t)}</b></td>"
        for m in range(12):
            r = idx.get((t, lab[m]))
            h += (_cell(r.hit_rate, r.n, r.avg_ret, r.avg_excess, r.p_hit, r.q_hit, r.worst_ret, t, lab[m], mark_low)
                  if r is not None else "<td class='na'>·</td>")
        h += "</tr>"
    return h + "</table></div>"


def scan_html(ranked: pd.DataFrame, meta: dict, cycle: str, top: int = 40) -> str:
    title = f"Seasonality scan — {cycle.replace('_', '-')} years"
    tickers = meta.get("ticker_list") or list(dict.fromkeys(ranked.ticker))
    shown = ranked[ranked.cycle == cycle]
    all_low = bool(len(shown)) and bool(shown.low_confidence.all())
    low_note = (f"every cell has n &lt; {LOW_CONFIDENCE_N} (low confidence)" if all_low
                else f"● corner = n &lt; {LOW_CONFIDENCE_N}")
    lengths = sorted({1 + _len(s) for s in ranked.spec.unique() if _is_monthly(s)})
    pf, pe = meta["perfect_found"], meta["perfect_expected_by_luck"]
    sf, se = meta["p_hit_lt_05_found"], meta["p_hit_lt_05_expected_by_luck"]
    body = f"<h1>{html.escape(title)}</h1><p class='muted'>Regime filters: {', '.join(meta['regime_filters']) or 'none'}</p>"
    body += (
        "<div class='card'><h3 style='margin-top:0'>How much of this is luck?</h3><div class='kpis'>"
        f"<div class='kpi'><b>{meta['combinations_tested']:,}</b>combinations tested "
        f"({meta['tickers']} tickers × {meta['windows']} windows × {len(meta['cycles'])} cycle filters)</div>"
        f"<div class='kpi'><b>{pf} found · {pe:.0f} expected</b>100%-hit-rate combos vs what random year-picks produce</div>"
        f"<div class='kpi'><b>{sf} found · {se:.0f} expected</b>combos with p(hit) &lt; 0.05 vs luck</div>"
        f"<div class='kpi'><b>{meta['survive_fdr_10pct']}</b>survive a 10% false-discovery-rate cut</div>"
        "</div><p>“Expected” assumes the cycle label is meaningless: each combination's cycle years are "
        "treated as a random draw from all years of the same ticker and window. If found ≈ expected, "
        "the scan is mostly finding noise. "
        f"{meta['low_confidence_share'] * 100:.0f}% of combinations have n &lt; {meta['low_confidence_n']}.</p></div>")
    body += (f"<h2>Hit rate by start month — {html.escape(cycle.replace('_', '-'))} years</h2>"
             "<div class='legend'><span>0%</span><span class='ramp'></span><span>100%</span>"
             f"<span style='margin-left:12px'>grey = 50% (coin flip) · {low_note} · hover for n, p, q</span></div>")
    for L in lengths:
        body += f"<h3>{L}-month windows</h3>" + heatmap(ranked, cycle, L, tickers, not all_low)
    sub = ranked[ranked.cycle == cycle].head(top)
    body += f"<h2>Top {len(sub)} — {html.escape(cycle.replace('_', '-'))}, ranked by hit rate then average</h2>"
    body += ("<div class='scroll'><table><tr><th>#</th><th>Ticker</th><th>Window</th><th>n</th><th>Hit</th>"
             "<th>Avg</th><th>Worst (yr)</th><th>vs SPY</th><th>All-years hit</th><th>p(hit)</th>"
             "<th>p(avg)</th><th>q</th></tr>")
    for i, r in enumerate(sub.itertuples(), 1):
        body += (f"<tr><td>{i}</td><td><b>{html.escape(r.ticker)}</b></td><td>{html.escape(r.window)}</td><td>{r.n}</td>"
                 f"<td>{_pct(r.hit_rate, False)}</td><td class='{_cls(r.avg_ret)}'>{_pct(r.avg_ret)}</td>"
                 f"<td class='{_cls(r.worst_ret)}'>{_pct(r.worst_ret)} ({r.worst_year})</td>"
                 f"<td class='{_cls(r.avg_excess)}'>{_pct(r.avg_excess)}</td>"
                 f"<td>{_pct(r.base_hit_rate, False)} of {r.base_n}</td><td>{_fmt_p(r.p_hit)}</td>"
                 f"<td>{_fmt_p(r.p_avg)}</td><td>{_fmt_p(r.q_hit)}</td></tr>")
    body += "</table></div>"
    body += f"<script type='application/json' id='meta'>{json.dumps(meta)}</script>"
    return _page(title, body)


def _is_monthly(spec: str) -> bool:
    p = spec.split(":")
    return len(p) == 4 and p[0] == "som" and p[2] == "eom"


def _len(spec: str) -> int:
    # spec is som:MM:eom:MM
    parts = spec.split(":")
    a, b = int(parts[1]), int(parts[3])
    return (b - a) % 12
