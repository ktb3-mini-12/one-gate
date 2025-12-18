"""
Pydantic models for request/response validation.
"""

from pydantic import BaseModel, field_validator
from typing import Optional, List, Dict, Any, Literal


class AIAnalysisData(BaseModel):
    # ========== 공통 필수 ==========
    type: Literal["CALENDAR", "MEMO"] = "MEMO"
    summary: str

    # ========== 공통 선택 ==========
    content: Optional[str] = None
    category: Optional[str] = None
    priority: Optional[Literal["low", "medium", "high"]] = None
    url: Optional[str] = None
    attachments: Optional[List[str]] = None

    # ========== CALENDAR 전용 ==========
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    all_day: Optional[bool] = None
    timezone: Optional[str] = None
    location: Optional[str] = None
    attendees: Optional[List[str]] = None
    reminders: Optional[List[dict]] = None
    recurrence: Optional[str] = None
    meeting_url: Optional[str] = None
    create_meet: Optional[bool] = None
    status: Optional[str] = None
    visibility: Optional[str] = None
    busy: Optional[bool] = None

    # ========== MEMO 전용 ==========
    body: Optional[str] = None
    due_date: Optional[str] = None
    assignee: Optional[str] = None
    memo_status: Optional[str] = None
    icon: Optional[str] = None

    @field_validator("start_time", "end_time", mode="before")
    @classmethod
    def validate_datetime_format(cls, value: Any) -> Any:
        if value is None:
            return value
        if not isinstance(value, str):
            raise ValueError("must be a string datetime")
        # Import here to avoid circular dependency
        from helpers.date_utils import _parse_iso_datetime
        _parse_iso_datetime(value)
        return value

    @field_validator("due_date", mode="before")
    @classmethod
    def validate_due_date_format(cls, value: Any) -> Any:
        if value is None:
            return value
        if not isinstance(value, str):
            raise ValueError("must be a string date")
        # Import here to avoid circular dependency
        from helpers.date_utils import _parse_iso_date
        _parse_iso_date(value)
        return value


class UpdateRecordRequest(BaseModel):
    analysis_data: Optional[Dict[str, Any]] = None
    text: Optional[str] = None


class NotionMemoRequest(BaseModel):
    content: str
    category: str = "아이디어"


class CategoryRequest(BaseModel):
    name: str
    type: str  # MEMO / CALENDAR
    user_id: Optional[str] = None


class CalendarEvent(BaseModel):
    summary: str
    description: Optional[str] = ""
    start_time: str
    end_time: str
    calendar_name: Optional[str] = None
    category: Optional[str] = None


class UploadRequest(BaseModel):
    final_data: Optional[Dict[str, Any]] = None


class TokenUpdateRequest(BaseModel):
    user_id: str
    token: Optional[str] = None


class CreateDatabaseRequest(BaseModel):
    user_id: str
    parent_page_id: str
    database_name: str = "One Gate 메모"


class SaveMemoRequest(BaseModel):
    user_id: str
    title: str
    category: str = "메모"
    content_type: str = "MEMO"  # MEMO or CALENDAR
    body: Optional[str] = None
