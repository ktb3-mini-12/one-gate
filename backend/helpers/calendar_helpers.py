"""
Google Calendar utilities.
"""

from typing import Optional, List


# Color mapping for Google Calendar categories
CATEGORY_COLOR_MAP = {
    "work": "11",
    "personal": "2",
    "meeting": "5",
    "important": "4",
    "default": "1",
}


def _convert_recurrence_to_rrule(recurrence: Optional[str]) -> Optional[List[str]]:
    """Convert AI output (daily/weekly/monthly/yearly) to Google Calendar RRULE format."""
    if not recurrence:
        return None
    mapping = {
        "daily": "RRULE:FREQ=DAILY",
        "weekly": "RRULE:FREQ=WEEKLY",
        "monthly": "RRULE:FREQ=MONTHLY",
        "yearly": "RRULE:FREQ=YEARLY",
    }
    rrule = mapping.get(recurrence.lower())
    return [rrule] if rrule else None
