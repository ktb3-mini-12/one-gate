"""
Date/time parsing utilities.
"""

from datetime import datetime


def _parse_iso_datetime(value: str) -> datetime:
    """Parse ISO datetime string, handling Z timezone suffix."""
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    return datetime.fromisoformat(value)


def _parse_iso_date(value: str) -> datetime:
    """Parse ISO date string, adding time component if needed."""
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return datetime.fromisoformat(value + "T00:00:00")
