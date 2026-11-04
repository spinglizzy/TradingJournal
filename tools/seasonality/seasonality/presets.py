"""Named studies from the handoff, so they're one command each."""
from __future__ import annotations

from .windows import Window

# Step 1: the XLV "June high -> midterms" claim, three ways.
XLV_DEFINITIONS = [
    Window("high:06:ED", label="June high → election day"),
    Window("eom:06:ED", label="June close → election day"),
    Window("high:06:11-30", label="June high → Nov 30"),
]
XLV_TICKERS = ["XLV"]
XLV_CYCLE = "midterm"
# Dates given in the handoff; tests assert cycles.election_day() reproduces them.
MIDTERM_ELECTION_DAYS = {
    2002: "2002-11-05", 2006: "2006-11-07", 2010: "2010-11-02", 2014: "2014-11-04",
    2018: "2018-11-06", 2022: "2022-11-08", 2026: "2026-11-03",
}

# Later: homebuilders after the midterms (election day -> +6 / +12 months vs SPY).
HOMEBUILDER_TICKERS = ["ITB", "XHB", "DHI", "LEN", "PHM"]
HOMEBUILDER_WINDOWS = [
    Window("ED:+6m", label="Election day → +6 months"),
    Window("ED:+12m", label="Election day → +12 months"),
]
HOMEBUILDER_CYCLE = "midterm"

# name -> (tickers, windows, cycle, report title)
PRESETS = {
    "xlv-midterm": (XLV_TICKERS, XLV_DEFINITIONS, XLV_CYCLE, "XLV June to midterms"),
    "homebuilders-midterm": (HOMEBUILDER_TICKERS, HOMEBUILDER_WINDOWS, HOMEBUILDER_CYCLE,
                             "Homebuilders after midterms"),
}
