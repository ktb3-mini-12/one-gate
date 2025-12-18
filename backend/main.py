from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, List
from datetime import datetime
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from database import supabase, notion, NOTION_DB_ID

# AI 라우터 (Gemini)
try:
    from ai.app import router as ai_router
except Exception as e:
    ai_router = None
    print(f"[AI] 라우터 로드 실패: {e}")

app = FastAPI()

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
if ai_router is not None:
    app.include_router(ai_router)
# --- [DTO] ---

class AnalyzeRequest(BaseModel):
    text: str
    user_id: str
    image_url: Optional[str] = None
    category_id: Optional[int] = None

class NotionMemoRequest(BaseModel):
    content: str
    category: str = "아이디어"

class CategoryRequest(BaseModel):
    name: str
    type: str  # MEMO / CALENDAR

class CalendarEvent(BaseModel):
    summary: str
    description: Optional[str] = ""
    start_time: str  # "2025-12-20T10:00:00"
    end_time: str
    calendar_name: Optional[str] = None  # 특정 캘린더 이름
    category: Optional[str] = None  # Work, Personal 등 -> colorId 매핑

# 카테고리 -> Google Calendar colorId 매핑
CATEGORY_COLOR_MAP = {
    "work": "11",      # Red
    "personal": "2",   # Green
    "meeting": "5",    # Yellow
    "important": "4",  # Pink
    "default": "1"     # Blue
}

# ----------------------------------

@app.post("/analyze")
async def analyze_content(request: AnalyzeRequest):
    print(f"[분석] user_id: {request.user_id}, 내용: {request.text[:30]}...")

    # 간단한 분류 로직 (추후 AI로 대체)
    is_calendar = "내일" in request.text or "시" in request.text or "일정" in request.text
    input_type = "CALENDAR" if is_calendar else "MEMO"

    input_data = {
        "user_id": request.user_id,
        "type": input_type,
        "category_id": request.category_id,
        "text": request.text,
        "image_url": request.image_url,
        "status": "PENDING",  # 초기 상태
    }

    try:
        result = supabase.table("inputs").insert(input_data).execute()
        record = result.data[0] if result.data else None

        return {
            "status": "success",
            "data": {
                "id": record["id"] if record else None,
                "type": input_type,
                "text": request.text,
                "status": "PENDING",
                "created_at": record["created_at"] if record else None
            }
        }
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/records")
async def get_records(user_id: str, status: Optional[str] = None):
    """
    사용자의 레코드 목록 조회 (soft delete 제외)
    - status: PENDING, ANALYZED, COMPLETED, CANCELED 필터링
    """
    query = supabase.table("inputs")\
        .select("*, category(id, name, type)")\
        .eq("user_id", user_id)\
        .is_("deleted_at", "null")

    if status:
        query = query.eq("status", status)

    result = query.order("created_at", desc=True).execute()

    return {"status": "success", "data": result.data}

@app.delete("/records/{record_id}")
async def delete_record(record_id: int):
    """
    레코드 소프트 삭제 (status=CANCELED, deleted_at 설정)
    """
    result = supabase.table("inputs")\
        .update({
            "status": "CANCELED",
            "deleted_at": datetime.utcnow().isoformat()
        })\
        .eq("id", record_id)\
        .execute()

    if result.data:
        return {"status": "success", "message": "Record canceled"}
    return {"status": "error", "message": "Record not found"}

@app.post("/records/{record_id}/complete")
async def complete_record(record_id: int):
    """
    레코드 완료 처리 (status=COMPLETED, 업로드 후 soft delete)
    """
    result = supabase.table("inputs")\
        .update({
            "status": "COMPLETED",
            "deleted_at": datetime.utcnow().isoformat(),
            "completed_at": datetime.utcnow().isoformat()
        })\
        .eq("id", record_id)\
        .execute()

    if result.data:
        return {"status": "success", "message": "Record completed", "data": result.data[0]}
    return {"status": "error", "message": "Record not found"}

@app.get("/categories")
async def get_categories(type: Optional[str] = None):
    """
    카테고리 목록 조회
    - type: MEMO / CALENDAR 필터링
    """
    query = supabase.table("category").select("*")
    if type:
        query = query.eq("type", type)
    result = query.execute()
    return {"status": "success", "data": result.data}

@app.post("/categories")
async def create_category(request: CategoryRequest):
    """
    카테고리 생성
    """
    result = supabase.table("category").insert({
        "name": request.name,
        "type": request.type
    }).execute()

    return {"status": "success", "data": result.data[0] if result.data else None}

@app.delete("/categories/{category_id}")
async def delete_category(category_id: int):
    """
    카테고리 삭제
    """
    result = supabase.table("category").delete().eq("id", category_id).execute()

    if result.data:
        return {"status": "success", "message": "Category deleted"}
    return {"status": "error", "message": "Category not found"}

# ----------------------------------
# Google Calendar APIs
# ----------------------------------

@app.post("/sync/calendars")
async def sync_google_calendars(
    google_token: str = Header(None, alias="X-Google-Token")
):
    """
    Google Calendar 목록을 category 테이블과 완전 동기화
    - 사용자가 직접 만든 캘린더만 (accessRole=owner, primary 제외)
    - Google에 없는 기존 카테고리는 삭제
    """
    if not google_token:
        return {"status": "error", "message": "Google token required"}

    try:
        creds = Credentials(token=google_token)
        service = build('calendar', 'v3', credentials=creds)

        calendar_list = service.calendarList().list().execute()
        calendars = calendar_list.get('items', [])

        # 유효한 캘린더 이름 수집
        valid_calendar_names = []
        skipped = []

        for cal in calendars:
            cal_name = cal.get('summary', 'Untitled')
            cal_id = cal.get('id')
            access_role = cal.get('accessRole', '')
            is_primary = cal.get('primary', False)

            # 필터링
            if access_role != 'owner':
                skipped.append({"name": cal_name, "reason": "not owner"})
                continue
            if is_primary:
                skipped.append({"name": cal_name, "reason": "primary calendar"})
                continue
            if 'holiday' in cal_id.lower() or '#contacts' in cal_id:
                skipped.append({"name": cal_name, "reason": "system calendar"})
                continue

            valid_calendar_names.append(cal_name)

        # 1. 기존 CALENDAR 카테고리 모두 가져오기
        existing_categories = supabase.table("category")\
            .select("*")\
            .eq("type", "CALENDAR")\
            .execute()

        existing_names = {cat["name"] for cat in existing_categories.data} if existing_categories.data else set()
        valid_names_set = set(valid_calendar_names)

        # 2. Google에 없는 카테고리 삭제
        to_delete = existing_names - valid_names_set
        deleted = []
        for name in to_delete:
            supabase.table("category")\
                .delete()\
                .eq("name", name)\
                .eq("type", "CALENDAR")\
                .execute()
            deleted.append(name)

        # 3. 새로운 캘린더 추가
        to_add = valid_names_set - existing_names
        added = []
        for name in to_add:
            supabase.table("category").insert({
                "name": name,
                "type": "CALENDAR"
            }).execute()
            added.append(name)

        # 4. 유지된 캘린더
        kept = valid_names_set & existing_names

        print(f"[Sync] Added: {len(added)}, Deleted: {len(deleted)}, Kept: {len(kept)}")
        return {
            "status": "success",
            "added": list(added),
            "deleted": list(deleted),
            "kept": list(kept),
            "skipped": skipped,
            "total_synced": len(valid_calendar_names)
        }

    except Exception as e:
        print(f"[Sync] Error: {e}")
        return {"status": "error", "message": str(e)}


@app.post("/calendar/create")
async def create_calendar_event(
    event_data: CalendarEvent,
    google_token: str = Header(None, alias="X-Google-Token")
):
    """
    Google Calendar에 일정 생성
    - calendar_name: 특정 캘린더에 추가
    - category: colorId로 매핑해서 primary에 추가
    """
    if not google_token:
        return {"status": "error", "message": "Google token required"}

    try:
        creds = Credentials(token=google_token)
        service = build('calendar', 'v3', credentials=creds)

        # 캘린더 ID 결정
        calendar_id = 'primary'

        if event_data.calendar_name:
            # 특정 캘린더 이름으로 ID 찾기
            calendar_list = service.calendarList().list().execute()
            for cal in calendar_list.get('items', []):
                if cal.get('summary') == event_data.calendar_name:
                    calendar_id = cal.get('id')
                    break

        # 이벤트 바디 생성
        event_body = {
            'summary': event_data.summary,
            'description': event_data.description or '',
            'start': {
                'dateTime': event_data.start_time,
                'timeZone': 'Asia/Seoul',
            },
            'end': {
                'dateTime': event_data.end_time,
                'timeZone': 'Asia/Seoul',
            },
        }

        # 카테고리 -> colorId 매핑
        if event_data.category:
            color_id = CATEGORY_COLOR_MAP.get(
                event_data.category.lower(),
                CATEGORY_COLOR_MAP["default"]
            )
            event_body['colorId'] = color_id

        # 이벤트 생성
        event = service.events().insert(
            calendarId=calendar_id,
            body=event_body
        ).execute()

        print(f"[Calendar] Event created: {event.get('htmlLink')}")
        return {
            "status": "success",
            "link": event.get('htmlLink'),
            "calendar_id": calendar_id,
            "event_id": event.get('id')
        }

    except Exception as e:
        print(f"[Calendar] Error: {e}")
        return {"status": "error", "message": str(e)}


# 기존 test-create 유지 (하위 호환)
@app.post("/calendar/test-create")
async def create_google_event_legacy(
    event_data: CalendarEvent,
    google_token: str = Header(None, alias="X-Google-Token")
):
    return await create_calendar_event(event_data, google_token)


# ----------------------------------
# Notion API
# ----------------------------------

@app.post("/notion/create")
async def create_notion_memo(request: NotionMemoRequest):
    """
    노션 DB에 메모 생성
    - 내용: 제목 컬럼
    - 카테고리: 선택 컬럼 (기본값: 아이디어)
    """
    if not notion or not NOTION_DB_ID:
        return {"status": "error", "message": "Notion not configured"}

    try:
        result = notion.pages.create(
            parent={"database_id": NOTION_DB_ID},
            properties={
                "내용": {
                    "title": [{"text": {"content": request.content}}]
                },
                "카테고리": {
                    "select": {"name": request.category}
                }
            }
        )

        notion_url = result.get("url")
        print(f"[Notion] 생성 완료: {notion_url}")

        return {
            "status": "success",
            "url": notion_url,
            "page_id": result.get("id")
        }

    except Exception as e:
        print(f"[Notion] Error: {e}")
        return {"status": "error", "message": str(e)}


# 실행: uvicorn main:app --reload
