#!/usr/bin/env python3
"""Retired NWv-7 market quote publisher.

The app's free/open-only policy prohibits redistributing Yahoo/yfinance,
NSE/BSE prices, bulk AMFI NAV and copied FX rates in static public assets.

This historical entrypoint is intentionally non-operational. Use direct
browser-initiated source lookups and the licensed provider-owned embeds.
Legacy output files are additionally rejected by the CI/Pages asset guard.
"""

from __future__ import annotations


def main() -> None:
    raise SystemExit(
        "DISABLED_FREE_OPEN_ONLY: legacy third-party market/FX publication "
        "is not authorized. No network request or file write was performed."
    )


if __name__ == "__main__":
    main()
