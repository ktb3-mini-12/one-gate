"""
Google Calendar API endpoints.
"""

from fastapi import APIRouter, Header
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from database import supabase
from models.schemas import CalendarEvent
from helpers.calendar_helpers import CATEGORY_COLOR_MAP


router = APIRouter()


@router.post("/sync/calendars")
async def sync_google_calendars(
    user_id: str,
    google_token: str = Header(None, alias="X-Google-Token"),
):
    """
    Sync Google Calendar list and update user categories.

    - Filters out non-owner, primary, and system calendars
    - Adds/removes categories based on available calendars
    - Returns sync summary with added, deleted, kept, and skipped calendars
    """
    if not google_token:
        return {"status": "error", "message": "Google token required"}

    try:
        creds = Credentials(token=google_token)
        service = build("calendar", "v3", credentials=creds)
        calendar_list = service.calendarList().list().execute()
        calendars = calendar_list.get("items", [])

        valid_calendar_names = []
        skipped = []
        for cal in calendars:
            cal_name = cal.get("summary", "Untitled")
            cal_id = cal.get("id")
            access_role = cal.get("accessRole", "")
            is_primary = cal.get("primary", False)

            if access_role != "owner":
                skipped.append({"name": cal_name, "reason": "not owner"})
                continue
            if is_primary:
                skipped.append({"name": cal_name, "reason": "primary calendar"})
                continue
            if "holiday" in cal_id.lower() or "#contacts" in cal_id:
                skipped.append({"name": cal_name, "reason": "system calendar"})
                continue

            valid_calendar_names.append(cal_name)

        # Fetch user's existing CALENDAR categories
        existing_categories = (
            supabase.table("category")
            .select("*")
            .eq("user_id", user_id)
            .eq("type", "CALENDAR")
            .execute()
        )
        existing_names = {cat["name"] for cat in existing_categories.data} if existing_categories.data else set()
        valid_names_set = set(valid_calendar_names)

        # Delete categories that no longer exist in Google Calendar
        deleted = []
        to_delete = existing_names - valid_names_set
        for name in to_delete:
            supabase.table("category").delete().eq("name", name).eq("user_id", user_id).eq("type", "CALENDAR").execute()
            deleted.append(name)

        # Add new categories from Google Calendar
        to_add = valid_names_set - existing_names
        added = []
        for name in to_add:
            supabase.table("category").insert({"name": name, "type": "CALENDAR", "user_id": user_id}).execute()
            added.append(name)

        kept = valid_names_set & existing_names

        return {
            "status": "success",
            "added": list(added),
            "deleted": list(deleted),
            "kept": list(kept),
            "skipped": skipped,
            "total_synced": len(valid_calendar_names),
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/calendar/create")
async def create_calendar_event(
    event_data: CalendarEvent, google_token: str = Header(None, alias="X-Google-Token")
):
    """
    Create a Google Calendar event.

    - Uses X-Google-Token header for authentication
    - Finds target calendar by name (defaults to primary)
    - Applies category color if specified
    - Returns event link and IDs on success
    """
    if not google_token:
        return {"status": "error", "message": "Google token required"}

    try:
        creds = Credentials(token=google_token)
        service = build("calendar", "v3", credentials=creds)

        calendar_id = "primary"
        if event_data.calendar_name:
            calendar_list = service.calendarList().list().execute()
            for cal in calendar_list.get("items", []):
                if cal.get("summary") == event_data.calendar_name:
                    calendar_id = cal.get("id")
                    break

        event_body = {
            "summary": event_data.summary,
            "description": event_data.description or "",
            "start": {"dateTime": event_data.start_time, "timeZone": "Asia/Seoul"},
            "end": {"dateTime": event_data.end_time, "timeZone": "Asia/Seoul"},
        }

        if event_data.category:
            color_id = CATEGORY_COLOR_MAP.get(event_data.category.lower(), CATEGORY_COLOR_MAP["default"])
            event_body["colorId"] = color_id

        event = service.events().insert(calendarId=calendar_id, body=event_body).execute()
        return {"status": "success", "link": event.get("htmlLink"), "calendar_id": calendar_id, "event_id": event.get("id")}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/calendar/test-create")
async def create_google_event_legacy(
    event_data: CalendarEvent,
    google_token: str = Header(None, alias="X-Google-Token"),
):
    """
    [DEPRECATED] Legacy endpoint for backward compatibility.
    Use POST /calendar/create instead.
    """
    return await create_calendar_event(event_data, google_token)
