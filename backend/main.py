import asyncio
import base64
import json
import os
import uuid
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

import httpx
from fastapi import BackgroundTasks, FastAPI, File, Form, Header, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from notion_client import Client as NotionClient
from pydantic import BaseModel, field_validator
from starlette.responses import StreamingResponse

from database import (
    NOTION_CLIENT_ID,
    NOTION_CLIENT_SECRET,
    NOTION_DB_ID,
    NOTION_REDIRECT_URI,
    notion,
    supabase,
)


def _load_ai_module():
    """AI 모듈 로드 (라우터 + 서비스 함수)"""
    try:
        from ai.app import router as ai_router, analyze_text, is_ai_available
        return ai_router, analyze_text, is_ai_available
    except Exception as e:
        print(f"[AI] 모듈 로드 실패: {e}")
        return None, None, lambda: False


ai_router, ai_analyze_text, ai_is_available = _load_ai_module()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

if ai_router is not None:
    app.include_router(ai_router)
    print("[AI] Gemini AI 라우터 활성화됨")
else:
    print("[AI] AI 라우터 비활성화 - fallback 분류 모드")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


class AnalyzeRequest(BaseModel):
    text: str
    user_id: str
    image_url: Optional[str] = None
    category_id: Optional[int] = None


def _parse_iso_datetime(value: str) -> datetime:
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    return datetime.fromisoformat(value)


def _parse_iso_date(value: str) -> datetime:
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return datetime.fromisoformat(value + "T00:00:00")


class AIAnalysisData(BaseModel):
    # ========== 공통 필수 ==========
    type: Literal["CALENDAR", "MEMO"]
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
        _parse_iso_datetime(value)
        return value

    @field_validator("due_date", mode="before")
    @classmethod
    def validate_due_date_format(cls, value: Any) -> Any:
        if value is None:
            return value
        if not isinstance(value, str):
            raise ValueError("must be a string date")
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


CATEGORY_COLOR_MAP = {
    "work": "11",
    "personal": "2",
    "meeting": "5",
    "important": "4",
    "default": "1",
}


def _convert_recurrence_to_rrule(recurrence: Optional[str]) -> Optional[List[str]]:
    """AI 출력(daily/weekly/monthly/yearly)을 Google Calendar RRULE 형식으로 변환"""
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


class _SseBroker:
    def __init__(self) -> None:
        self._queues_by_user: Dict[str, set[asyncio.Queue[str]]] = {}
        self._lock = asyncio.Lock()

    async def subscribe(self, user_id: str) -> asyncio.Queue[str]:
        queue: asyncio.Queue[str] = asyncio.Queue()
        async with self._lock:
            self._queues_by_user.setdefault(user_id, set()).add(queue)
        return queue

    async def unsubscribe(self, user_id: str, queue: asyncio.Queue[str]) -> None:
        async with self._lock:
            queues = self._queues_by_user.get(user_id)
            if not queues:
                return
            queues.discard(queue)
            if not queues:
                self._queues_by_user.pop(user_id, None)

    async def publish(self, user_id: str, event: str, data: Dict[str, Any]) -> None:
        payload = json.dumps(data, ensure_ascii=False)
        message = f"event: {event}\ndata: {payload}\n\n"
        async with self._lock:
            queues = list(self._queues_by_user.get(user_id, set()))
        for queue in queues:
            try:
                queue.put_nowait(message)
            except asyncio.QueueFull:
                pass


_broker = _SseBroker()


def _fallback_analyze(text: str) -> dict:
    """AI 분석 실패 시 키워드 기반 fallback 분류"""
    text_lower = text.lower()

    # 일정 키워드
    calendar_keywords = [
        "내일", "모레", "다음주", "이번주", "오늘",
        "시에", "시 ", "분에", "약속", "미팅", "회의",
        "점심", "저녁", "아침", "오전", "오후",
        "월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일",
        "일정", "예약", "방문", "출장", "면접",
    ]

    is_calendar = any(kw in text_lower for kw in calendar_keywords)
    input_type = "CALENDAR" if is_calendar else "MEMO"

    return {
        "type": input_type,
        "summary": text[:50] if len(text) > 50 else text,
        "content": text,
        "category": "일정" if is_calendar else "메모",
    }


async def _run_ai_analysis(record_id: int, user_id: str, text: str) -> None:
    """
    백그라운드에서 AI 분석을 수행하고 결과를 DB에 저장.
    분석 완료 후 SSE로 클라이언트에 알림.
    """
    try:
        # AI 모듈이 사용 가능한 경우 Gemini 분석
        if ai_analyze_text is not None and ai_is_available():
            print(f"[AI] 레코드 {record_id} Gemini 분석 시작")
            analysis_result = await ai_analyze_text(text)
        else:
            print(f"[AI] 레코드 {record_id} fallback 분류 사용")
            analysis_result = _fallback_analyze(text)

        # 분석 결과 검증 및 저장
        validated = AIAnalysisData(**analysis_result)
        analysis_payload = validated.model_dump(exclude_none=True)

        supabase.table("inputs").update({
            "status": "ANALYZED",
            "type": validated.type,
            "result": analysis_payload,
        }).eq("id", record_id).execute()

        # analysis_completed SSE 이벤트 발행
        await _broker.publish(
            str(user_id),
            "analysis_completed",
            {"record_id": record_id, "status": "ANALYZED", "analysis_data": analysis_payload},
        )
        print(f"[AI] 레코드 {record_id} 분석 완료: {validated.type}")

    except Exception as e:
        print(f"[AI] 레코드 {record_id} 분석 실패: {e}, fallback 적용")

        # 에러 발생 시 fallback 분류 적용
        fallback_result = _fallback_analyze(text)
        validated = AIAnalysisData(**fallback_result)
        analysis_payload = validated.model_dump(exclude_none=True)

        supabase.table("inputs").update({
            "status": "ANALYZED",
            "type": validated.type,
            "result": analysis_payload,
        }).eq("id", record_id).execute()

        await _broker.publish(
            str(user_id),
            "analysis_completed",
            {"record_id": record_id, "status": "ANALYZED", "analysis_data": analysis_payload},
        )


@app.post("/analyze")
async def analyze_content(
    background_tasks: BackgroundTasks,
    user_id: str = Form(...),
    text: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None)
):
    """
    텍스트 또는 이미지 분석 (FormData로 수신)
    DB에 PENDING 상태로 저장하고, 백그라운드에서 AI 분석을 시작.
    즉시 record_created SSE 이벤트를 발행하여 FE에서 카드를 표시할 수 있게 함.
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

    # 초기 타입은 키워드 기반으로 추정 (AI 분석 후 변경될 수 있음)
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

        if not record or record.get("id") is None:
            raise HTTPException(status_code=500, detail="레코드 생성 실패")

        record_id = int(record["id"])

        # record_created SSE 이벤트 즉시 발행
        await _broker.publish(
            request.user_id,
            "record_created",
            {
                "record_id": record_id,
                "status": "PENDING",
                "type": input_type,
                "text": request.text,
                "created_at": record.get("created_at"),
            },
        )

        # 백그라운드에서 AI 분석 시작
        background_tasks.add_task(
            _run_ai_analysis,
            record_id,
            request.user_id,
            request.text,
        )

        return {
            "status": "success",
            "data": {
                "id": record_id,
                "type": input_type,
                "text": text,
                "has_image": image_url is not None,
                "status": "PENDING",
                "created_at": record.get("created_at"),
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/records/stream")
async def stream_records(user_id: str, request: Request):
    queue = await _broker.subscribe(user_id)

    async def _event_generator():
        try:
            yield "event: connected\ndata: {}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    message = await asyncio.wait_for(queue.get(), timeout=15)
                    yield message
                except asyncio.TimeoutError:
                    yield "event: ping\ndata: {}\n\n"
                except asyncio.CancelledError:
                    break
        except asyncio.CancelledError:
            pass
        finally:
            await _broker.unsubscribe(user_id, queue)

    return StreamingResponse(
        _event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@app.post("/records/{record_id}/analysis")
async def receive_ai_analysis(record_id: int, analysis: AIAnalysisData):
    fetch = supabase.table("inputs").select("id,user_id").eq("id", record_id).limit(1).execute()
    record = fetch.data[0] if fetch.data else None
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")

    user_id = record.get("user_id")
    if not user_id:
        raise HTTPException(status_code=400, detail="Record missing user_id")

    analysis_payload = analysis.model_dump(exclude_none=True)
    update_payload = {"status": "ANALYZED", "result": analysis_payload, "type": analysis.type}

    updated = supabase.table("inputs").update(update_payload).eq("id", record_id).execute()
    if not updated.data:
        raise HTTPException(status_code=500, detail="Failed to update record")

    await _broker.publish(
        str(user_id),
        "analysis_completed",
        {"record_id": record_id, "status": "ANALYZED", "analysis_data": analysis_payload},
    )
    return {"status": "success"}


@app.patch("/records/{record_id}")
async def update_record(record_id: int, request: UpdateRecordRequest):
    fetch = (
        supabase.table("inputs").select("id,user_id,result").eq("id", record_id).limit(1).execute()
    )
    record = fetch.data[0] if fetch.data else None
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")

    user_id = record.get("user_id")
    if not user_id:
        raise HTTPException(status_code=400, detail="Record missing user_id")

    update_payload: Dict[str, Any] = {}
    if request.text is not None:
        update_payload["text"] = request.text
    if request.analysis_data is not None:
        validated = AIAnalysisData(**request.analysis_data).model_dump(exclude_none=True)
        update_payload["result"] = validated
        update_payload["type"] = validated["type"]
        update_payload["status"] = "ANALYZED"

    if not update_payload:
        return {"status": "success", "message": "No changes"}

    updated = supabase.table("inputs").update(update_payload).eq("id", record_id).execute()
    if not updated.data:
        raise HTTPException(status_code=500, detail="Failed to update record")

    await _broker.publish(
        str(user_id),
        "record_updated",
        {
            "record_id": record_id,
            "status": update_payload.get("status"),
            "analysis_data": update_payload.get("result"),
        },
    )
    return {"status": "success", "data": updated.data[0]}


@app.get("/records")
async def get_records(user_id: str, status: Optional[str] = None):
    query = (
        supabase.table("inputs")
        .select("*, category(id, name, type)")
        .eq("user_id", user_id)
        .is_("deleted_at", "null")
    )
    if status:
        query = query.eq("status", status)
    result = query.order("created_at", desc=True).execute()
    return {"status": "success", "data": result.data}


@app.delete("/records/{record_id}")
async def delete_record(record_id: int):
    result = (
        supabase.table("inputs")
        .update({"status": "CANCELED", "deleted_at": datetime.utcnow().isoformat()})
        .eq("id", record_id)
        .execute()
    )
    if result.data:
        return {"status": "success", "message": "Record canceled"}
    return {"status": "error", "message": "Record not found"}


@app.post("/records/{record_id}/complete")
async def complete_record(record_id: int):
    result = (
        supabase.table("inputs")
        .update(
            {
                "status": "COMPLETED",
                "deleted_at": datetime.utcnow().isoformat(),
                "completed_at": datetime.utcnow().isoformat(),
            }
        )
        .eq("id", record_id)
        .execute()
    )
    if result.data:
        return {"status": "success", "message": "Record completed", "data": result.data[0]}
    return {"status": "error", "message": "Record not found"}


class UploadRequest(BaseModel):
    final_data: Optional[Dict[str, Any]] = None


@app.post("/records/{record_id}/upload")
async def upload_record(
    record_id: int,
    request: UploadRequest,
    google_token: str = Header(None, alias="X-Google-Token"),
):
    """
    통합 업로드 엔드포인트
    - final_data가 있으면 final_result 필드에 저장 (원본 result는 유지)
    - type에 따라 Calendar/Notion 업로드
    - 성공 시 completed_at 업데이트, 실패 시 ANALYZED 상태 유지
    """
    # 1. 레코드 조회
    fetch = supabase.table("inputs").select("*").eq("id", record_id).limit(1).execute()
    record = fetch.data[0] if fetch.data else None
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")

    if record.get("status") != "ANALYZED":
        raise HTTPException(status_code=400, detail="Only ANALYZED records can be uploaded")

    # 2. final_data가 있으면 final_result에 저장
    upload_data = request.final_data if request.final_data else record.get("result", {})
    if request.final_data:
        supabase.table("inputs").update({"final_result": request.final_data}).eq("id", record_id).execute()

    record_type = upload_data.get("type") or record.get("type")

    # 3. 업로드 수행
    try:
        if record_type == "CALENDAR":
            if not google_token:
                raise HTTPException(status_code=400, detail="Google token required for calendar upload")

            # AIAnalysisData → CalendarData 매핑
            summary = upload_data.get("summary") or record.get("text", "")[:50]
            description = upload_data.get("content") or upload_data.get("body") or ""

            # 시간 fallback
            fallback_start = datetime.utcnow().replace(hour=14, minute=0, second=0, microsecond=0)
            fallback_end = fallback_start.replace(hour=15)
            start_time = upload_data.get("start_time") or fallback_start.isoformat()
            end_time = upload_data.get("end_time") or fallback_end.isoformat()

            creds = Credentials(token=google_token)
            service = build("calendar", "v3", credentials=creds)

            calendar_id = "primary"
            calendar_name = upload_data.get("category")
            if calendar_name:
                calendar_list = service.calendarList().list().execute()
                for cal in calendar_list.get("items", []):
                    if cal.get("summary") == calendar_name:
                        calendar_id = cal.get("id")
                        break

            event_body = {
                "summary": summary,
                "description": description,
                "start": {"dateTime": start_time, "timeZone": upload_data.get("timezone", "Asia/Seoul")},
                "end": {"dateTime": end_time, "timeZone": upload_data.get("timezone", "Asia/Seoul")},
            }

            if upload_data.get("location"):
                event_body["location"] = upload_data["location"]

            # recurrence → RRULE 변환
            recurrence = _convert_recurrence_to_rrule(upload_data.get("recurrence"))
            if recurrence:
                event_body["recurrence"] = recurrence

            event = service.events().insert(calendarId=calendar_id, body=event_body).execute()
            upload_result = {"type": "calendar", "link": event.get("htmlLink"), "event_id": event.get("id")}

        else:  # MEMO → Notion
            if not notion or not NOTION_DB_ID:
                raise HTTPException(status_code=500, detail="Notion integration not configured")

            # AIAnalysisData → MemoData 매핑
            title = upload_data.get("summary") or record.get("text", "")[:100]
            content = upload_data.get("body") or upload_data.get("content") or record.get("text", "")
            category = upload_data.get("category") or "아이디어"

            page = notion.pages.create(
                parent={"database_id": NOTION_DB_ID},
                properties={
                    "Name": {"title": [{"type": "text", "text": {"content": title}}]},
                    "Category": {"select": {"name": category}},
                },
                children=[
                    {
                        "object": "block",
                        "type": "paragraph",
                        "paragraph": {"rich_text": [{"type": "text", "text": {"content": content}}]},
                    }
                ],
            )
            upload_result = {"type": "notion", "page_id": page.get("id"), "url": page.get("url")}

        # 4. 성공 시 완료 처리
        supabase.table("inputs").update({
            "status": "COMPLETED",
            "completed_at": datetime.utcnow().isoformat(),
            "deleted_at": datetime.utcnow().isoformat(),
        }).eq("id", record_id).execute()

        return {"status": "success", "data": upload_result}

    except HTTPException:
        raise
    except Exception as e:
        # 실패 시 status는 ANALYZED 유지 (final_result는 이미 저장됨)
        print(f"[Upload] Failed for record {record_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/notion/create")
async def create_notion_memo(request: NotionMemoRequest):
    if not notion or not NOTION_DB_ID:
        return {"status": "error", "message": "Notion integration not configured"}

    try:
        title = request.content.strip().splitlines()[0][:100] if request.content.strip() else "OneGate Memo"
        page = notion.pages.create(
            parent={"database_id": NOTION_DB_ID},
            properties={
                "Name": {"title": [{"type": "text", "text": {"content": title}}]},
                "Category": {"select": {"name": request.category}},
            },
            children=[
                {
                    "object": "block",
                    "type": "paragraph",
                    "paragraph": {"rich_text": [{"type": "text", "text": {"content": request.content}}]},
                }
            ],
        )
        return {"status": "success", "data": {"page_id": page.get("id")}}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.get("/categories")
async def get_categories(user_id: str, type: Optional[str] = None):
    """내 카테고리만 조회"""
    query = supabase.table("category").select("*").eq("user_id", user_id)
    if type:
        query = query.eq("type", type)
    result = query.execute()
    return {"status": "success", "data": result.data}


@app.post("/categories")
async def create_category(request: CategoryRequest, user_id: str = Query(None)):
    """카테고리 생성 (user_id는 body 또는 query에서)"""
    final_user_id = request.user_id or user_id
    if not final_user_id:
        raise HTTPException(status_code=400, detail="user_id is required")

    result = supabase.table("category").insert({
        "name": request.name,
        "type": request.type,
        "user_id": final_user_id
    }).execute()
    return {"status": "success", "data": result.data[0] if result.data else None}


@app.delete("/categories/{category_id}")
async def delete_category(category_id: int):
    result = supabase.table("category").delete().eq("id", category_id).execute()
    if result.data:
        return {"status": "success", "message": "Category deleted"}
    return {"status": "error", "message": "Category not found"}


@app.post("/sync/calendars")
async def sync_google_calendars(
    user_id: str,
    google_token: str = Header(None, alias="X-Google-Token"),
):
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

        # 내 카테고리만 조회 (user_id 필터링)
        existing_categories = (
            supabase.table("category")
            .select("*")
            .eq("user_id", user_id)
            .eq("type", "CALENDAR")
            .execute()
        )
        existing_names = {cat["name"] for cat in existing_categories.data} if existing_categories.data else set()
        valid_names_set = set(valid_calendar_names)

        # 삭제 시 user_id 조건 포함 (보안)
        deleted = []
        to_delete = existing_names - valid_names_set
        for name in to_delete:
            supabase.table("category").delete().eq("name", name).eq("user_id", user_id).eq("type", "CALENDAR").execute()
            deleted.append(name)

        # 추가 시 user_id 포함
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


@app.post("/calendar/create")
async def create_calendar_event(
    event_data: CalendarEvent, google_token: str = Header(None, alias="X-Google-Token")
):
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


# 기존 test-create 유지 (하위 호환)
@app.post("/calendar/test-create")
async def create_google_event_legacy(
    event_data: CalendarEvent,
    google_token: str = Header(None, alias="X-Google-Token"),
):
    return await create_calendar_event(event_data, google_token)


# ----------------------------------
# Notion OAuth
# ----------------------------------

NOTION_AUTH_URL = "https://api.notion.com/v1/oauth/authorize"
NOTION_TOKEN_URL = "https://api.notion.com/v1/oauth/token"


@app.get("/auth/notion")
async def notion_auth(user_id: str):
    """Notion OAuth 인증 시작 - user_id를 state에 포함"""
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
async def notion_callback(code: str = Query(...), state: str = Query(...)):
    """Notion OAuth 콜백 처리 - code를 access_token으로 교환"""
    if not NOTION_CLIENT_ID or not NOTION_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Notion OAuth not configured")

    user_id = state

    try:
        credentials = f"{NOTION_CLIENT_ID}:{NOTION_CLIENT_SECRET}"
        encoded_credentials = base64.b64encode(credentials.encode()).decode()

        async with httpx.AsyncClient() as client:
            response = await client.post(
                NOTION_TOKEN_URL,
                headers={
                    "Authorization": f"Basic {encoded_credentials}",
                    "Content-Type": "application/json",
                },
                json={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": NOTION_REDIRECT_URI,
                },
            )

        if response.status_code != 200:
            print(f"[Notion OAuth] Token error: {response.text}")
            raise HTTPException(status_code=400, detail="Failed to get access token")

        token_data = response.json()
        access_token = token_data.get("access_token")
        workspace_name = token_data.get("workspace_name")

        print(f"[Notion OAuth] Success - Workspace: {workspace_name}")

        result = supabase.table("users").update({"notion_access_token": access_token}).eq("id", user_id).execute()
        if not result.data:
            print(f"[Notion OAuth] User not found: {user_id}")

        return RedirectResponse(url=f"http://localhost:5173?notion_connected=true&workspace={workspace_name}")

    except httpx.HTTPError as e:
        print(f"[Notion OAuth] HTTP Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        print(f"[Notion OAuth] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/auth/notion/status")
async def notion_auth_status(user_id: str):
    """사용자의 Notion 연결 상태 확인"""
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
                    "bot_id": user_info.get("bot", {}).get("owner", {}).get("user", {}).get("id"),
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
    """Notion 연결 해제 (토큰 및 데이터베이스 ID 모두 삭제)"""
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
async def create_notion_memo_with_token(request: NotionMemoRequest, user_id: str = Query(...)):
    """사용자의 OAuth 토큰을 사용해서 노션에 메모 생성"""
    try:
        user_result = supabase.table("users").select("notion_access_token").eq("id", user_id).single().execute()

        if not user_result.data or not user_result.data.get("notion_access_token"):
            return {"status": "error", "message": "Notion not connected"}

        token = user_result.data["notion_access_token"]
        user_notion = NotionClient(auth=token)

        search_result = user_notion.search(filter={"property": "object", "value": "database"})
        databases = search_result.get("results", [])
        if not databases:
            return {"status": "error", "message": "No accessible databases found"}

        target_db = databases[0]
        db_id = target_db["id"]
        db_info = user_notion.databases.retrieve(db_id)
        properties = db_info.get("properties", {})

        title_prop = None
        for prop_name, prop_info in properties.items():
            if prop_info.get("type") == "title":
                title_prop = prop_name
                break

        if not title_prop:
            return {"status": "error", "message": "No title property found in database"}

        result = user_notion.pages.create(
            parent={"database_id": db_id},
            properties={title_prop: {"title": [{"text": {"content": request.content}}]}},
        )

        notion_url = result.get("url")
        print(f"[Notion OAuth] 메모 생성 완료: {notion_url}")

        return {
            "status": "success",
            "url": notion_url,
            "page_id": result.get("id"),
            "database": target_db.get("title", [{}])[0].get("text", {}).get("content", "Unknown"),
        }

    except Exception as e:
        print(f"[Notion OAuth Create] Error: {e}")
        return {"status": "error", "message": str(e)}


# ----------------------------------
# Token Update APIs
# ----------------------------------


class TokenUpdateRequest(BaseModel):
    user_id: str
    token: Optional[str] = None


@app.post("/auth/update-google-token")
async def update_google_token(request: TokenUpdateRequest):
    try:
        supabase.table("users").update({"google_refresh_token": request.token}).eq("id", request.user_id).execute()
        return {"status": "success", "message": "Google token updated"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/auth/update-notion-token")
async def update_notion_token(request: TokenUpdateRequest):
    try:
        supabase.table("users").update({"notion_access_token": request.token}).eq("id", request.user_id).execute()
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
