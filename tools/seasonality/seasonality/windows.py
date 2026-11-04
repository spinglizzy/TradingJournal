"""Window grammar: where a trade starts and ends inside a given year.

A window is ``START:END``. Each side is an *anchor*:

    MM-DD        close on that date (or the last trading day before it)
    eom:MM       last close of month MM            ("June close" = eom:06)
    som:MM       last close before month MM starts (so som:06 -> eom:06 = June's return)
    high:MM      highest close during month MM     ("June high")
    low:MM       lowest close during month MM
    ED           election-day close
    ED+N / ED-N  N calendar days after/before election day
    ED+Nm        N calendar months after election day (ED+6m, ED+12m)
    +N / +Nm     END only: N calendar days / months after the entry date

Price convention: every anchor resolves to an *as-of* close - the close on the
anchor date, or on the last trading day before it if the market was shut. A
window whose END falls after the last bar in the data is returned as
incomplete (return-to-date) and excluded from the stats.

If END resolves before START inside the same year, END rolls into next year
(e.g. ``11-01:01-31`` is a November-to-January window).
"""
from __future__ import annotations

import datetime as dt
import re
from dataclasses import dataclass

import pandas as pd

from .cycles import election_day

_MD = re.compile(r"^(\d{1,2})-(\d{1,2})$")
_MONTH_OP = re.compile(r"^(eom|som|high|low):(\d{1,2})$", re.I)
_ED = re.compile(r"^ED(?:([+-])(\d+)(m?))?$", re.I)
_REL = re.compile(r"^\+(\d+)(m?)$", re.I)


@dataclass(frozen=True)
class Leg:
    """One side of a resolved window."""
    date: pd.Timestamp   # the trading day whose close is used
    price: float


@dataclass(frozen=True)
class Resolved:
    entry: Leg
    exit: Leg
    complete: bool       # False -> exit anchor is beyond the data (return-to-date)

    @property
    def ret(self) -> float:
        return self.exit.price / self.entry.price - 1.0


class Anchor:
    def __init__(self, text: str):
        self.text = text.strip()
        t = self.text
        if _MD.match(t):
            m, d = map(int, _MD.match(t).groups())
            dt.date(2000, m, d)  # validate (2000 is a leap year, so 02-29 is allowed)
            self.kind, self.args = "md", (m, d)
        elif _MONTH_OP.match(t):
            op, m = _MONTH_OP.match(t).groups()
            m = int(m)
            if not 1 <= m <= 12:
                raise ValueError(f"bad month in anchor {t!r}")
            self.kind, self.args = op.lower(), (m,)
        elif _ED.match(t):
            sign, n, months = _ED.match(t).groups()
            n = int(n or 0) * (-1 if sign == "-" else 1)
            self.kind, self.args = ("ed_m" if months else "ed_d"), (n,)
        elif _REL.match(t):
            n, months = _REL.match(t).groups()
            self.kind, self.args = ("rel_m" if months else "rel_d"), (int(n),)
        else:
            raise ValueError(f"can't parse window anchor {t!r} (see seasonality/windows.py)")

    @property
    def relative(self) -> bool:
        return self.kind in ("rel_d", "rel_m")

    def __repr__(self):
        return f"Anchor({self.text!r})"

    # --- resolution ---------------------------------------------------
    def target_date(self, year: int) -> pd.Timestamp:
        """Calendar date the anchor points at (for as-of anchors)."""
        k, a = self.kind, self.args
        if k == "md":
            m, d = a
            if m == 2 and d == 29 and not _leap(year):
                d = 28
            return pd.Timestamp(year, m, d)
        if k == "eom":
            return pd.Timestamp(year, a[0], 1) + pd.offsets.MonthEnd(0)
        if k == "som":
            return pd.Timestamp(year, a[0], 1) - pd.Timedelta(days=1)
        if k == "ed_d":
            return pd.Timestamp(election_day(year)) + pd.Timedelta(days=a[0])
        if k == "ed_m":
            return pd.Timestamp(election_day(year)) + pd.DateOffset(months=a[0])
        raise ValueError(f"{self} has no fixed target date")

    def resolve(self, s: pd.Series, year: int, after: pd.Timestamp | None = None):
        """Return (Leg, complete) or None if the anchor predates the series."""
        if self.kind in ("high", "low"):
            m = self.args[0]
            month = s[(s.index.year == year) & (s.index.month == m)]
            if month.empty:
                return None
            last_day = pd.Timestamp(year, m, 1) + pd.offsets.MonthEnd(0)
            complete = s.index[-1] >= last_day or _month_finished(s, year, m)
            d = month.idxmax() if self.kind == "high" else month.idxmin()
            return Leg(d, float(month[d])), complete
        if self.relative:
            n = self.args[0]
            target = after + (pd.DateOffset(months=n) if self.kind == "rel_m" else pd.Timedelta(days=n))
        else:
            target = self.target_date(year)
        return asof(s, target)


def _leap(y: int) -> bool:
    return y % 4 == 0 and (y % 100 != 0 or y % 400 == 0)


def _month_finished(s: pd.Series, year: int, month: int) -> bool:
    nxt = pd.Timestamp(year, month, 1) + pd.offsets.MonthBegin(1)
    return bool((s.index >= nxt).any())


def asof(s: pd.Series, target: pd.Timestamp):
    """As-of close for ``target``. None if before the first bar."""
    if target < s.index[0]:
        return None
    complete = target <= s.index[-1]
    # a target exactly on the last bar is complete; one after it is not
    i = s.index.searchsorted(target, side="right") - 1
    d = s.index[i]
    return Leg(d, float(s.iloc[i])), complete


class Window:
    def __init__(self, spec: str, label: str | None = None):
        if ":" not in spec or spec.count(":") < 1:
            raise ValueError(f"window {spec!r} must look like START:END")
        start, end = _split(spec)
        self.spec = spec
        self.label = label or spec
        self.start = Anchor(start)
        self.end = Anchor(end)
        if self.start.relative:
            raise ValueError("START can't be relative (+N); only END can")

    def __repr__(self):
        return f"Window({self.spec!r})"

    def resolve(self, s: pd.Series, year: int) -> Resolved | None:
        """Resolve against one price series. None if there is no data for it."""
        s = s.dropna()
        if s.empty:
            return None
        got = self.start.resolve(s, year)
        if got is None:
            return None
        entry, start_complete = got
        if not start_complete:
            return None  # can't even place the entry yet
        # entry must be a real bar in the requested year's neighbourhood: if the
        # as-of lookup walked back across a data gap of > 10 days, the data doesn't
        # really cover this year.
        if self.start.kind not in ("high", "low"):
            if (self.start.target_date(year) - entry.date).days > 10:
                return None
        got = self.end.resolve(s, year, after=entry.date)
        if got is None:
            return None
        exit_, complete = got
        if exit_.date <= entry.date:
            if self.end.relative:
                return None  # +0 days: nothing to measure
            got = self.end.resolve(s, year + 1, after=entry.date)  # END wraps into next year
            if got is None:
                return None
            exit_, complete = got
            if exit_.date <= entry.date:
                return None
        return Resolved(entry, exit_, complete)


def _split(spec: str) -> tuple[str, str]:
    # anchors themselves may contain ':' (eom:06). Split on the colon that leaves
    # two parseable halves.
    parts = spec.split(":")
    for i in range(1, len(parts)):
        a, b = ":".join(parts[:i]), ":".join(parts[i:])
        try:
            Anchor(a), Anchor(b)
            return a, b
        except ValueError:
            continue
    raise ValueError(f"can't split window {spec!r} into START:END")


MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def monthly_windows(max_len: int = 6) -> list[Window]:
    """Every 'start of month M -> end of month M+L-1' window, L = 1..max_len.

    som:MM -> eom:MM' is the standard monthly-return convention (prior
    month-end close to month-end close). Windows that cross December wrap into
    the next calendar year.
    """
    out = []
    for m in range(1, 13):
        for L in range(1, max_len + 1):
            e = (m + L - 2) % 12 + 1
            label = MONTHS[m - 1] if L == 1 else f"{MONTHS[m - 1]}–{MONTHS[e - 1]}"
            out.append(Window(f"som:{m:02d}:eom:{e:02d}", label=label))
    return out
