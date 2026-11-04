"""US presidential-cycle calendar.

Year type is fixed by ``year % 4``:
    0 -> election, 1 -> post_election, 2 -> midterm, 3 -> pre_election

Election day is the Tuesday after the first Monday of November. The same rule
gives a date in every year (off-year elections are held that day too), so
"election day" windows work for any cycle filter.
"""
from __future__ import annotations

import datetime as dt

CYCLE_NAMES = {0: "election", 1: "post_election", 2: "midterm", 3: "pre_election"}
CYCLES = ("election", "post_election", "midterm", "pre_election")
ALL = "all"


def cycle_of(year: int) -> str:
    return CYCLE_NAMES[year % 4]


def election_day(year: int) -> dt.date:
    nov1 = dt.date(year, 11, 1)
    # weekday(): Monday == 0. First Monday of November:
    first_monday = nov1 + dt.timedelta(days=(0 - nov1.weekday()) % 7)
    return first_monday + dt.timedelta(days=1)


def years_for(cycle: str, first: int, last: int) -> list[int]:
    if cycle == ALL:
        return list(range(first, last + 1))
    if cycle not in CYCLES:
        raise ValueError(f"unknown cycle {cycle!r}; choose from {CYCLES + (ALL,)}")
    return [y for y in range(first, last + 1) if cycle_of(y) == cycle]
