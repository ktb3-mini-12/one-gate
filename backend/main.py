from fastapi import FastAPI, HTTPException, Header, Query, File, UploadFile, Form
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, List
from datetime import datetime
import uuid
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from notion_client import Client as NotionClient
import httpx
import base64

from database import (
    supabase, notion, NOTION_DB_ID,
    NOTION_CLIENT_ID, NOTION_CLIENT_SECRET, NOTION_REDIRECT_URI
)

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
    user_id: Optional[str] = None

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
async def analyze_content(
    user_id: str = Form(...),
    text: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None)
):
    """
    텍스트 또는 이미지 분석 (FormData로 수신)
    """
    display_text = text[:30] if text else "(이미지만)"
    print(f"[분석] user_id: {user_id}, 내용: {display_text}..., 이미지: {'있음' if image else '없음'}")

    # 이미지 처리 - Supabase Storage에 업로드
    image_url = None
    if image:
        try:
            image_content = await image.read()

            # 파일명 생성: user_id/timestamp_uuid.확장자
            file_ext = image.filename.split('.')[-1] if '.' in image.filename else 'png'
            file_name = f"{user_id}/{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}.{file_ext}"

            # Supabase Storage에 업로드 (버킷: images)
            storage_response = supabase.storage.from_('images').upload(
                path=file_name,
                file=image_content,
                file_options={"content-type": image.content_type}
            )

            # 공개 URL 생성
            image_url = supabase.storage.from_('images').get_public_url(file_name)
            print(f"[분석] 이미지 업로드 완료: {image_url}")

        except Exception as e:
            print(f"[분석] 이미지 업로드 오류: {e}")
            # 업로드 실패 시 base64 폴백
            try:
                await image.seek(0)
                image_content = await image.read()
                image_base64 = base64.b64encode(image_content).decode('utf-8')
                image_url = f"data:{image.content_type};base64,{image_base64}"
                print(f"[분석] base64 폴백 사용")
            except Exception as e2:
                print(f"[분석] base64 폴백도 실패: {e2}")

    # 텍스트 또는 이미지가 없으면 에러
    if not text and not image_url:
        raise HTTPException(status_code=400, detail="텍스트 또는 이미지가 필요합니다")

    # 간단한 분류 로직 (추후 AI로 대체)
    text_for_analysis = text or ""
    is_calendar = "내일" in text_for_analysis or "시" in text_for_analysis or "일정" in text_for_analysis
    input_type = "CALENDAR" if is_calendar else "MEMO"

    input_data = {
        "user_id": user_id,
        "type": input_type,
        "text": text,
        "image_url": image_url,
        "status": "PENDING",
    }

    try:
        result = supabase.table("inputs").insert(input_data).execute()
        record = result.data[0] if result.data else None

        return {
            "status": "success",
            "data": {
                "id": record["id"] if record else None,
                "type": input_type,
                "text": text,
                "has_image": image_url is not None,
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
    data = {
        "name": request.name,
        "type": request.type
    }
    # user_id가 있으면 추가
    if request.user_id:
        data["user_id"] = request.user_id

    result = supabase.table("category").insert(data).execute()

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
            .select("notion_access_token, notion_database_id")\
            .eq("id", user_id)\
            .single()\
            .execute()

        print(f"[Notion Status] User {user_id}: token={'있음' if result.data and result.data.get('notion_access_token') else '없음'}")

        if result.data and result.data.get("notion_access_token"):
            token = result.data["notion_access_token"]
            try:
                notion_client = NotionClient(auth=token)
                user_info = notion_client.users.me()
                print(f"[Notion Status] API 호출 성공: {user_info.get('name')}")
                return {
                    "status": "connected",
                    "user": user_info.get("name"),
                    "bot_id": user_info.get("bot", {}).get("owner", {}).get("user", {}).get("id")
                }
            except Exception as e:
                print(f"[Notion Status] 토큰 검증 실패: {e}")
                return {"status": "expired", "message": "Token expired or invalid"}

        return {"status": "not_connected"}

    except Exception as e:
        print(f"[Notion Status] Error: {e}")
        return {"status": "error", "message": str(e)}


@app.delete("/auth/notion/disconnect")
async def notion_disconnect(user_id: str):
    """
    Notion 연결 해제 (토큰 및 데이터베이스 ID 모두 삭제)
    """
    try:
        result = supabase.table("users")\
            .update({
                "notion_access_token": None,
                "notion_database_id": None
            })\
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


# ----------------------------------
# Notion 페이지/데이터베이스 관리
# ----------------------------------

@app.get("/notion/pages")
async def get_notion_pages(user_id: str):
    """
    사용자가 접근 가능한 Notion 페이지 목록 조회
    (데이터베이스를 생성할 부모 페이지 선택용)
    """
    try:
        user_result = supabase.table("users")\
            .select("notion_access_token")\
            .eq("id", user_id)\
            .single()\
            .execute()

        if not user_result.data or not user_result.data.get("notion_access_token"):
            return {"status": "error", "message": "Notion not connected"}

        token = user_result.data["notion_access_token"]
        user_notion = NotionClient(auth=token)

        # 페이지 검색
        search_result = user_notion.search(
            filter={"property": "object", "value": "page"}
        )

        pages = []
        for page in search_result.get("results", []):
            # 페이지 제목 추출
            title = "Untitled"
            if page.get("properties"):
                for prop in page["properties"].values():
                    if prop.get("type") == "title" and prop.get("title"):
                        title = prop["title"][0]["text"]["content"] if prop["title"] else "Untitled"
                        break

            # 페이지 아이콘
            icon = None
            if page.get("icon"):
                if page["icon"]["type"] == "emoji":
                    icon = page["icon"]["emoji"]
                elif page["icon"]["type"] == "external":
                    icon = page["icon"]["external"]["url"]

            pages.append({
                "id": page["id"],
                "title": title,
                "icon": icon,
                "url": page.get("url")
            })

        return {"status": "success", "data": pages}

    except Exception as e:
        print(f"[Notion Pages] Error: {e}")
        return {"status": "error", "message": str(e)}


class CreateDatabaseRequest(BaseModel):
    user_id: str
    parent_page_id: str
    database_name: str = "One Gate 메모"


@app.post("/notion/setup-database")
async def setup_notion_database(request: CreateDatabaseRequest):
    """
    선택한 페이지에서 One Gate 데이터베이스 설정
    - 이미 있으면: 기존 데이터베이스 연결
    - 없으면: 새로 생성
    """
    try:
        user_result = supabase.table("users")\
            .select("notion_access_token")\
            .eq("id", request.user_id)\
            .single()\
            .execute()

        if not user_result.data or not user_result.data.get("notion_access_token"):
            return {"status": "error", "message": "Notion not connected"}

        token = user_result.data["notion_access_token"]
        user_notion = NotionClient(auth=token)

        # 1. 선택한 페이지의 하위 블록(데이터베이스) 검색
        existing_db = None
        try:
            children = user_notion.blocks.children.list(block_id=request.parent_page_id)
            for block in children.get("results", []):
                if block.get("type") == "child_database":
                    # 데이터베이스 제목 확인
                    db_id = block["id"]
                    db_info = user_notion.databases.retrieve(db_id)
                    db_title = ""
                    if db_info.get("title"):
                        db_title = db_info["title"][0]["text"]["content"] if db_info["title"] else ""

                    # "One Gate" 가 포함된 데이터베이스 찾기
                    if "One Gate" in db_title or "one gate" in db_title.lower():
                        existing_db = db_info
                        break
        except Exception as e:
            print(f"[Notion] 하위 블록 검색 중 오류 (무시): {e}")

        # 2. 기존 데이터베이스가 있으면 연결
        if existing_db:
            db_id = existing_db["id"]
            db_url = existing_db["url"]
            db_title = existing_db["title"][0]["text"]["content"] if existing_db.get("title") else "One Gate 메모"

            # 사용자 테이블에 데이터베이스 ID 저장
            supabase.table("users")\
                .update({"notion_database_id": db_id})\
                .eq("id", request.user_id)\
                .execute()

            print(f"[Notion] Existing database connected: {db_url}")

            return {
                "status": "success",
                "database_id": db_id,
                "url": db_url,
                "name": db_title,
                "created": False,
                "message": "기존 데이터베이스에 연결되었습니다"
            }

        # 3. 없으면 새로 생성
        new_db = user_notion.databases.create(
            parent={"type": "page_id", "page_id": request.parent_page_id},
            title=[{"type": "text", "text": {"content": request.database_name}}],
            icon={"type": "emoji", "emoji": "⚡"},
            properties={
                "제목": {"title": {}},
                "카테고리": {
                    "select": {
                        "options": [
                            {"name": "아이디어", "color": "blue"},
                            {"name": "할 일", "color": "green"},
                            {"name": "메모", "color": "yellow"},
                            {"name": "일정", "color": "red"},
                            {"name": "기타", "color": "gray"}
                        ]
                    }
                },
                "타입": {
                    "select": {
                        "options": [
                            {"name": "MEMO", "color": "purple"},
                            {"name": "CALENDAR", "color": "orange"}
                        ]
                    }
                },
                "상태": {
                    "select": {
                        "options": [
                            {"name": "대기", "color": "gray"},
                            {"name": "완료", "color": "green"}
                        ]
                    }
                },
                "생성일": {"date": {}}
            }
        )

        db_id = new_db["id"]
        db_url = new_db["url"]

        # 사용자 테이블에 데이터베이스 ID 저장
        supabase.table("users")\
            .update({"notion_database_id": db_id})\
            .eq("id", request.user_id)\
            .execute()

        print(f"[Notion] Database created: {db_url}")

        return {
            "status": "success",
            "database_id": db_id,
            "url": db_url,
            "name": request.database_name,
            "created": True,
            "message": "새 데이터베이스가 생성되었습니다"
        }

    except Exception as e:
        print(f"[Notion Setup DB] Error: {e}")
        return {"status": "error", "message": str(e)}


@app.get("/notion/database-status")
async def get_notion_database_status(user_id: str):
    """
    사용자의 Notion 데이터베이스 설정 상태 확인
    """
    try:
        user_result = supabase.table("users")\
            .select("notion_access_token, notion_database_id")\
            .eq("id", user_id)\
            .single()\
            .execute()

        if not user_result.data:
            return {"status": "error", "message": "User not found"}

        token = user_result.data.get("notion_access_token")
        db_id = user_result.data.get("notion_database_id")

        if not token:
            return {"status": "not_connected"}

        if not db_id:
            return {"status": "no_database", "message": "데이터베이스를 선택해주세요"}

        # 데이터베이스 정보 조회
        try:
            user_notion = NotionClient(auth=token)
            db_info = user_notion.databases.retrieve(db_id)

            db_title = "One Gate 메모"
            if db_info.get("title"):
                db_title = db_info["title"][0]["text"]["content"] if db_info["title"] else db_title

            # 부모 페이지 정보 가져오기
            page_name = None
            parent = db_info.get("parent", {})
            if parent.get("type") == "page_id":
                try:
                    parent_page = user_notion.pages.retrieve(parent["page_id"])
                    # 페이지 제목 추출
                    if parent_page.get("properties"):
                        for prop in parent_page["properties"].values():
                            if prop.get("type") == "title" and prop.get("title"):
                                page_name = prop["title"][0]["text"]["content"] if prop["title"] else None
                                break
                except Exception:
                    pass

            return {
                "status": "ready",
                "database_id": db_id,
                "database_name": db_title,
                "page_name": page_name,
                "url": db_info.get("url")
            }
        except Exception:
            # 데이터베이스가 삭제되었거나 접근 불가
            return {"status": "database_invalid", "message": "데이터베이스에 접근할 수 없습니다"}

    except Exception as e:
        print(f"[Notion DB Status] Error: {e}")
        return {"status": "error", "message": str(e)}


class SaveMemoRequest(BaseModel):
    user_id: str
    title: str
    category: str = "메모"
    content_type: str = "MEMO"  # MEMO or CALENDAR
    body: Optional[str] = None


@app.post("/notion/save-memo")
async def save_memo_to_notion(request: SaveMemoRequest):
    """
    One Gate 데이터베이스에 메모 저장
    """
    try:
        user_result = supabase.table("users")\
            .select("notion_access_token, notion_database_id")\
            .eq("id", request.user_id)\
            .single()\
            .execute()

        if not user_result.data:
            return {"status": "error", "message": "User not found"}

        token = user_result.data.get("notion_access_token")
        db_id = user_result.data.get("notion_database_id")

        if not token:
            return {"status": "error", "message": "Notion not connected"}

        if not db_id:
            return {"status": "error", "message": "데이터베이스가 설정되지 않았습니다"}

        user_notion = NotionClient(auth=token)

        # 페이지 생성 (본문 포함)
        children = []
        if request.body:
            children.append({
                "object": "block",
                "type": "paragraph",
                "paragraph": {
                    "rich_text": [{"type": "text", "text": {"content": request.body}}]
                }
            })

        new_page = user_notion.pages.create(
            parent={"database_id": db_id},
            properties={
                "제목": {
                    "title": [{"text": {"content": request.title}}]
                },
                "카테고리": {
                    "select": {"name": request.category}
                },
                "타입": {
                    "select": {"name": request.content_type}
                },
                "상태": {
                    "select": {"name": "대기"}
                },
                "생성일": {
                    "date": {"start": datetime.utcnow().isoformat()}
                }
            },
            children=children if children else None
        )

        print(f"[Notion] Memo saved: {new_page.get('url')}")

        return {
            "status": "success",
            "page_id": new_page["id"],
            "url": new_page["url"]
        }

    except Exception as e:
        print(f"[Notion Save Memo] Error: {e}")
        return {"status": "error", "message": str(e)}


# 실행: uvicorn main:app --reload
