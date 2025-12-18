from fastapi import FastAPI, HTTPException, Header, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, List
from datetime import datetime
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from notion_client import Client as NotionClient
import httpx
import base64

from database import (
    supabase, notion, NOTION_DB_ID,
    NOTION_CLIENT_ID, NOTION_CLIENT_SECRET, NOTION_REDIRECT_URI
)

app = FastAPI()

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

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
async def get_categories(user_id: str, type: Optional[str] = None): # user_id 인자 추가
    """
    내 카테고리만 조회
    """
    query = supabase.table("category").select("*").eq("user_id", user_id) # 필터링 추가
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
    user_id: str, 
    google_token: str = Header(None, alias="X-Google-Token")
):
    if not google_token:
        return {"status": "error", "message": "Google token required"}

    try:
        creds = Credentials(token=google_token)
        service = build('calendar', 'v3', credentials=creds)
        calendar_list = service.calendarList().list().execute()
        calendars = calendar_list.get('items', [])

        valid_calendar_names = []
        for cal in calendars:
            cal_name = cal.get('summary', 'Untitled')
            # 필터링 조건 유지...
            if cal.get('accessRole') == 'owner' and not cal.get('primary'):
                valid_calendar_names.append(cal_name)

        # 1. 내 카테고리만 조회
        existing_categories = supabase.table("category")\
            .select("*")\
            .eq("user_id", user_id)\
            .eq("type", "CALENDAR")\
            .execute()

        existing_names = {cat["name"] for cat in existing_categories.data} if existing_categories.data else set()
        valid_names_set = set(valid_calendar_names)

        # 2. 삭제 시 user_id 조건 반드시 추가 (보안 핵심)
        to_delete = existing_names - valid_names_set
        for name in to_delete:
            supabase.table("category")\
                .delete()\
                .eq("name", name)\
                .eq("user_id", user_id)\
                .eq("type", "CALENDAR")\
                .execute()

        # 3. 추가 시 user_id 포함 (잘 하셨습니다!)
        to_add = valid_names_set - existing_names
        added = []
        for name in to_add:
            supabase.table("category").insert({
                "name": name,
                "type": "CALENDAR",
                "user_id": user_id 
            }).execute()
            added.append(name)

        return {"status": "success", "added": list(added), "total": len(valid_calendar_names)}

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


# ----------------------------------
# Notion OAuth
# ----------------------------------

NOTION_AUTH_URL = "https://api.notion.com/v1/oauth/authorize"
NOTION_TOKEN_URL = "https://api.notion.com/v1/oauth/token"

@app.get("/auth/notion")
async def notion_auth(user_id: str):
    """
    Notion OAuth 인증 시작
    - user_id를 state에 포함시켜 콜백에서 사용자 식별
    """
    if not NOTION_CLIENT_ID or not NOTION_REDIRECT_URI:
        raise HTTPException(status_code=500, detail="Notion OAuth not configured")

    auth_url = (
        f"{NOTION_AUTH_URL}"
        f"?client_id={NOTION_CLIENT_ID}"
        f"&response_type=code"
        f"&owner=user"
        f"&redirect_uri={NOTION_REDIRECT_URI}"
        f"&state={user_id}"
    )

    return {"auth_url": auth_url}


@app.get("/auth/notion/callback")
async def notion_callback(
    code: str = Query(...),
    state: str = Query(...)  # user_id
):
    """
    Notion OAuth 콜백 처리
    - code를 access_token으로 교환
    - users 테이블에 토큰 저장
    """
    if not NOTION_CLIENT_ID or not NOTION_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Notion OAuth not configured")

    user_id = state

    try:
        # Basic Auth 헤더 생성
        credentials = f"{NOTION_CLIENT_ID}:{NOTION_CLIENT_SECRET}"
        encoded_credentials = base64.b64encode(credentials.encode()).decode()

        # Access Token 요청
        async with httpx.AsyncClient() as client:
            response = await client.post(
                NOTION_TOKEN_URL,
                headers={
                    "Authorization": f"Basic {encoded_credentials}",
                    "Content-Type": "application/json"
                },
                json={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": NOTION_REDIRECT_URI
                }
            )

        if response.status_code != 200:
            print(f"[Notion OAuth] Token error: {response.text}")
            raise HTTPException(status_code=400, detail="Failed to get access token")

        token_data = response.json()
        access_token = token_data.get("access_token")
        workspace_name = token_data.get("workspace_name")
        workspace_id = token_data.get("workspace_id")
        bot_id = token_data.get("bot_id")

        print(f"[Notion OAuth] Success - Workspace: {workspace_name}")

        # users 테이블에 토큰 저장
        result = supabase.table("users")\
            .update({"notion_access_token": access_token})\
            .eq("id", user_id)\
            .execute()

        if not result.data:
            # 사용자가 없으면 에러 (또는 upsert 처리)
            print(f"[Notion OAuth] User not found: {user_id}")

        # 프론트엔드로 리다이렉트 (성공)
        # Electron 앱의 경우 딥링크 또는 window.close() 페이지로 리다이렉트
        return RedirectResponse(
            url=f"http://localhost:5173?notion_connected=true&workspace={workspace_name}"
        )

    except httpx.HTTPError as e:
        print(f"[Notion OAuth] HTTP Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        print(f"[Notion OAuth] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/auth/notion/status")
async def notion_auth_status(user_id: str):
    """
    사용자의 Notion 연결 상태 확인
    """
    try:
        result = supabase.table("users")\
            .select("notion_access_token")\
            .eq("id", user_id)\
            .single()\
            .execute()

        if result.data and result.data.get("notion_access_token"):
            # 토큰 유효성 검증 (선택적)
            token = result.data["notion_access_token"]
            try:
                notion_client = NotionClient(auth=token)
                user_info = notion_client.users.me()
                return {
                    "status": "connected",
                    "user": user_info.get("name"),
                    "bot_id": user_info.get("bot", {}).get("owner", {}).get("user", {}).get("id")
                }
            except Exception:
                return {"status": "expired", "message": "Token expired or invalid"}

        return {"status": "not_connected"}

    except Exception as e:
        print(f"[Notion Status] Error: {e}")
        return {"status": "error", "message": str(e)}


@app.delete("/auth/notion/disconnect")
async def notion_disconnect(user_id: str):
    """
    Notion 연결 해제 (토큰 삭제)
    """
    try:
        result = supabase.table("users")\
            .update({"notion_access_token": None})\
            .eq("id", user_id)\
            .execute()

        if result.data:
            return {"status": "success", "message": "Notion disconnected"}
        return {"status": "error", "message": "User not found"}

    except Exception as e:
        print(f"[Notion Disconnect] Error: {e}")
        return {"status": "error", "message": str(e)}


@app.post("/notion/create-with-token")
async def create_notion_memo_with_token(
    request: NotionMemoRequest,
    user_id: str = Query(...)
):
    """
    사용자의 OAuth 토큰을 사용해서 노션에 메모 생성
    """
    try:
        # 사용자 토큰 조회
        user_result = supabase.table("users")\
            .select("notion_access_token")\
            .eq("id", user_id)\
            .single()\
            .execute()

        if not user_result.data or not user_result.data.get("notion_access_token"):
            return {"status": "error", "message": "Notion not connected"}

        token = user_result.data["notion_access_token"]
        user_notion = NotionClient(auth=token)

        # 사용자가 접근 가능한 데이터베이스 목록 조회
        search_result = user_notion.search(
            filter={"property": "object", "value": "database"}
        )

        databases = search_result.get("results", [])
        if not databases:
            return {"status": "error", "message": "No accessible databases found"}

        # 첫 번째 데이터베이스에 페이지 생성 (또는 특정 DB 지정)
        target_db = databases[0]
        db_id = target_db["id"]

        # 데이터베이스 스키마 확인
        db_info = user_notion.databases.retrieve(db_id)
        properties = db_info.get("properties", {})

        # 제목 속성 찾기
        title_prop = None
        for prop_name, prop_info in properties.items():
            if prop_info.get("type") == "title":
                title_prop = prop_name
                break

        if not title_prop:
            return {"status": "error", "message": "No title property found in database"}

        # 페이지 생성
        result = user_notion.pages.create(
            parent={"database_id": db_id},
            properties={
                title_prop: {
                    "title": [{"text": {"content": request.content}}]
                }
            }
        )

        notion_url = result.get("url")
        print(f"[Notion OAuth] 메모 생성 완료: {notion_url}")

        return {
            "status": "success",
            "url": notion_url,
            "page_id": result.get("id"),
            "database": target_db.get("title", [{}])[0].get("text", {}).get("content", "Unknown")
        }

    except Exception as e:
        print(f"[Notion OAuth Create] Error: {e}")
        return {"status": "error", "message": str(e)}


# backend/main.py

class TokenUpdateRequest(BaseModel):
    user_id: str
    token: Optional[str] = None  # None이면 DB에 null로 저장됨

@app.post("/auth/update-google-token")
async def update_google_token(request: TokenUpdateRequest):
    try:
        # provider_token을 google_refresh_token 컬럼에 저장
        supabase.table("users").update({
            "google_refresh_token": request.token
        }).eq("id", request.user_id).execute()
        return {"status": "success", "message": "Google token updated"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/auth/update-notion-token")
async def update_notion_token(request: TokenUpdateRequest):
    try:
        supabase.table("users").update({
            "notion_access_token": request.token
        }).eq("id", request.user_id).execute()
        return {"status": "success", "message": "Notion token updated"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# 실행: uvicorn main:app --reload
