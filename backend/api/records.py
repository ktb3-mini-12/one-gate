"""
Core record management and upload endpoints.

This module handles:
- Record creation and AI analysis trigger
- SSE real-time updates stream
- Record CRUD operations
- Integrated upload to Google Calendar or Notion
"""

import asyncio
import uuid
from datetime import datetime
from typing import Optional, Dict, Any

from fastapi import APIRouter, Header, HTTPException, Form, File, UploadFile, BackgroundTasks, Request, Query
from fastapi.responses import StreamingResponse
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from notion_client import Client as NotionClient

from database import supabase
from models.schemas import AIAnalysisData, UpdateRecordRequest, UploadRequest
from helpers.ai_helpers import _run_ai_analysis
from helpers.calendar_helpers import _convert_recurrence_to_rrule
from helpers.notion_helpers import (
    get_notion_properties_cached,
    add_notion_property,
    _notion_property_cache,
    build_notion_page_blocks,
)


router = APIRouter(prefix="/records", tags=["Records"])


# Import _broker from main at module level
# This is safe because main.py defines _broker before importing this module
def get_broker():
    """Lazy import to avoid circular dependency."""
    from main import _broker
    return _broker


@router.post("/analyze")
async def analyze_content(
    background_tasks: BackgroundTasks,
    user_id: str = Form(...),
    text: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None)
):
    """
    Analyze text and/or image content.

    - Accepts FormData with user_id, text (optional), and image (optional)
    - Uploads image to Supabase Storage
    - Saves record with PENDING status
    - Publishes record_created SSE event immediately
    - Triggers background AI analysis
    - Returns record data immediately without waiting for analysis
    """
    display_text = text[:30] if text else "(이미지만)"
    print(f"[분석] user_id: {user_id}, 내용: {display_text}..., 이미지: {'있음' if image else '없음'}")

    # Process image
    image_url = None
    image_bytes = None
    image_mime_type = None

    if image:
        try:
            # Read image bytes for AI analysis
            image_bytes = await image.read()
            image_mime_type = image.content_type or "image/jpeg"

            # Generate file name: user_id/timestamp_uuid.ext
            file_ext = image.filename.split('.')[-1] if '.' in image.filename else 'png'
            file_name = f"{user_id}/{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}.{file_ext}"

            # Upload to Supabase Storage (bucket: images)
            storage_response = supabase.storage.from_('images').upload(
                path=file_name,
                file=image_bytes,
                file_options={"content-type": image_mime_type}
            )

            # Get public URL for database storage
            image_url = supabase.storage.from_('images').get_public_url(file_name)
            print(f"[분석] 이미지 업로드 완료: {image_url}")

        except Exception as e:
            print(f"[분석] 이미지 업로드 오류: {e}")
            # Continue with AI analysis even if upload fails (image_bytes already read)
            if not image_bytes:
                try:
                    await image.seek(0)
                    image_bytes = await image.read()
                    image_mime_type = image.content_type or "image/jpeg"
                except Exception as e2:
                    print(f"[분석] 이미지 읽기 실패: {e2}")

    # Require either text or image
    if not text and not image_bytes:
        raise HTTPException(status_code=400, detail="텍스트 또는 이미지가 필요합니다")

    # Initial type estimation (will be updated by AI analysis)
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

        # Publish record_created SSE event immediately
        broker = get_broker()
        await broker.publish(
            user_id,
            "record_created",
            {
                "record_id": record_id,
                "status": "PENDING",
                "type": input_type,
                "text": text,
                "image_url": image_url,
                "created_at": record.get("created_at"),
            },
        )

        # Start background AI analysis
        background_tasks.add_task(
            _run_ai_analysis,
            broker,
            record_id,
            user_id,
            text,
            image_bytes,
            image_mime_type,
        )

        return {
            "status": "success",
            "data": {
                "id": record_id,
                "type": input_type,
                "text": text,
                "has_image": image_bytes is not None,
                "image_url": image_url,
                "status": "PENDING",
                "created_at": record.get("created_at"),
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stream")
async def stream_records(user_id: str, request: Request):
    """
    Server-Sent Events (SSE) stream for real-time record updates.

    - Subscribes to user-specific event queue
    - Sends connected event on connection
    - Sends ping events every 15 seconds for keepalive
    - Handles client disconnection gracefully
    - Events: connected, ping, record_created, analysis_completed, analysis_failed, record_updated
    """
    broker = get_broker()
    queue = await broker.subscribe(user_id)

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
            await broker.unsubscribe(user_id, queue)

    return StreamingResponse(
        _event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@router.patch("/{record_id}")
async def update_record(record_id: int, request: UpdateRecordRequest):
    """
    Update record text or analysis data.

    - Allows manual edits to AI analysis results
    - Validates analysis data against AIAnalysisData schema
    - Updates type and status based on analysis_data
    - Publishes record_updated SSE event
    """
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

    broker = get_broker()
    await broker.publish(
        str(user_id),
        "record_updated",
        {
            "record_id": record_id,
            "status": update_payload.get("status"),
            "analysis_data": update_payload.get("result"),
        },
    )
    return {"status": "success", "data": updated.data[0]}


@router.get("")
async def get_records(user_id: str, status: Optional[str] = None):
    """
    Get user's records with optional status filter.

    - Filters by user_id and non-deleted records
    - Optional status filter (PENDING/ANALYZED/COMPLETED/CANCELED)
    - Joins with category table
    - Returns records ordered by creation date (descending)
    """
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


@router.delete("/{record_id}")
async def delete_record(record_id: int):
    """
    Soft delete a record.

    - Sets status to CANCELED
    - Sets deleted_at timestamp
    - Does not physically delete from database
    """
    result = (
        supabase.table("inputs")
        .update({"status": "CANCELED", "deleted_at": datetime.utcnow().isoformat()})
        .eq("id", record_id)
        .execute()
    )
    if result.data:
        return {"status": "success", "message": "Record canceled"}
    return {"status": "error", "message": "Record not found"}


@router.post("/{record_id}/upload")
async def upload_record(
    record_id: int,
    request: UploadRequest,
    google_token: str = Header(None, alias="X-Google-Token"),
):
    """
    Integrated upload endpoint for Calendar and Notion.

    - Saves final_data to final_result field (preserves original result)
    - Routes to Google Calendar for CALENDAR type (requires X-Google-Token header)
    - Routes to Notion for MEMO type (uses user's OAuth token from database)
    - On success: Updates status to COMPLETED, sets completed_at and deleted_at, publishes SSE
    - On failure: Keeps status as ANALYZED, publishes SSE with error

    Google Calendar:
    - Creates event with summary, description, start/end times
    - Supports calendar selection by name
    - Supports location and recurrence rules (RRULE)

    Notion:
    - Detects/creates Category property if needed
    - Creates page with title, category, and content blocks
    - Includes image and original text in page body
    - Uses user's notion_access_token and notion_database_id
    """
    # 1. Fetch record
    fetch = supabase.table("inputs").select("*").eq("id", record_id).limit(1).execute()
    record = fetch.data[0] if fetch.data else None
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")

    if record.get("status") != "ANALYZED":
        raise HTTPException(status_code=400, detail="Only ANALYZED records can be uploaded")

    # 2. Save final_data to final_result if provided
    upload_data = request.final_data if request.final_data else record.get("result", {})
    if request.final_data:
        supabase.table("inputs").update({"final_result": request.final_data}).eq("id", record_id).execute()

    record_type = upload_data.get("type") or record.get("type")

    # 3. Perform upload
    try:
        if record_type == "CALENDAR":
            if not google_token:
                raise HTTPException(status_code=400, detail="Google token required for calendar upload")

            # AIAnalysisData → CalendarData mapping
            summary = upload_data.get("summary") or record.get("text", "")[:50]
            description = upload_data.get("content") or upload_data.get("body") or ""

            # Time fallback
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

            # Convert recurrence to RRULE format
            recurrence = _convert_recurrence_to_rrule(upload_data.get("recurrence"))
            if recurrence:
                event_body["recurrence"] = recurrence

            event = service.events().insert(calendarId=calendar_id, body=event_body).execute()
            upload_result = {"type": "calendar", "link": event.get("htmlLink"), "event_id": event.get("id")}

        else:  # MEMO → Notion
            # Extract user_id from record
            user_id = record.get("user_id")
            if not user_id:
                raise HTTPException(status_code=400, detail="Record has no user_id")

            # Fetch user's Notion credentials
            user_result = supabase.table("users")\
                .select("notion_access_token, notion_database_id")\
                .eq("id", user_id)\
                .single()\
                .execute()

            if not user_result.data:
                raise HTTPException(status_code=404, detail="User not found")

            notion_token = user_result.data.get("notion_access_token")
            notion_db_id = user_result.data.get("notion_database_id")

            # Check if user has connected Notion
            if not notion_token:
                raise HTTPException(
                    status_code=400,
                    detail="Notion이 연결되지 않았습니다. 설정에서 Notion을 연결해주세요."
                )

            if not notion_db_id:
                raise HTTPException(
                    status_code=400,
                    detail="Notion 데이터베이스가 설정되지 않았습니다."
                )

            # Create user-specific Notion client
            user_notion = NotionClient(auth=notion_token)

            # AIAnalysisData → MemoData mapping
            title = upload_data.get("summary") or record.get("text", "")[:100]
            content = upload_data.get("body") or upload_data.get("content") or record.get("text", "")
            category = upload_data.get("category") or "아이디어"

            # Detect or create required properties
            props_info = get_notion_properties_cached(user_notion, notion_db_id)

            # If Category property doesn't exist, add it
            if props_info["needs_category"]:
                try:
                    add_notion_property(
                        user_notion,
                        notion_db_id,
                        "Category",
                        {
                            "select": {
                                "options": [
                                    {"name": "아이디어", "color": "blue"},
                                    {"name": "할 일", "color": "green"},
                                    {"name": "메모", "color": "yellow"},
                                    {"name": "일정", "color": "red"},
                                    {"name": "기타", "color": "gray"}
                                ]
                            }
                        }
                    )
                    print(f"[Notion] Added 'Category' property to database {notion_db_id}")
                    # Invalidate cache so next call detects the new property
                    if notion_db_id in _notion_property_cache:
                        del _notion_property_cache[notion_db_id]
                    props_info = get_notion_properties_cached(user_notion, notion_db_id)
                except Exception as e:
                    print(f"[Notion] Failed to add Category property: {e}")
                    # Continue anyway, might fail at page creation

            # Create page with detected property names
            print(f"[Upload] Starting Notion upload for record {record_id}")
            print(f"[Upload] User: {user_id}, DB: {notion_db_id}")
            print(f"[Upload] Title: {title}, Category: {category}")

            # Build page body blocks (image + analysis + original text)
            children_blocks = build_notion_page_blocks(record, upload_data)

            page = user_notion.pages.create(
                parent={"database_id": notion_db_id},
                properties={
                    props_info["title_property"]: {
                        "title": [{"type": "text", "text": {"content": title}}]
                    },
                    props_info["category_property"]: {
                        "select": {"name": category}
                    },
                },
                children=children_blocks,
            )
            upload_result = {"type": "notion", "page_id": page.get("id"), "url": page.get("url")}

            # Validate page was actually created
            if not page.get("id") or not page.get("url"):
                raise ValueError("Notion page creation returned no ID or URL")

            print(f"[Upload] Notion page created: {page.get('id')}")
            print(f"[Upload] Notion URL: {page.get('url')}")

        # 4. Mark as completed on success
        supabase.table("inputs").update({
            "status": "COMPLETED",
            "completed_at": datetime.utcnow().isoformat(),
            "deleted_at": datetime.utcnow().isoformat(),
        }).eq("id", record_id).execute()

        # 5. Publish SSE event for frontend update
        broker = get_broker()
        await broker.publish(
            str(record.get("user_id")),
            "record_updated",
            {
                "record_id": record_id,
                "status": "COMPLETED",
                "upload_result": upload_result
            }
        )
        print(f"[Upload] SSE event published for record {record_id}")

        return {"status": "success", "data": upload_result}

    except HTTPException:
        raise
    except Exception as e:
        # On failure, keep status as ANALYZED (final_result already saved)
        print(f"[Upload] Failed for record {record_id}: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()

        # Publish SSE event on failure
        try:
            broker = get_broker()
            await broker.publish(
                str(record.get("user_id")),
                "record_updated",
                {
                    "record_id": record_id,
                    "status": "ANALYZED",
                    "error": str(e)
                }
            )
            print(f"[Upload] SSE failure event published for record {record_id}")
        except Exception as sse_error:
            print(f"[Upload] Failed to publish SSE event: {sse_error}")

        raise HTTPException(status_code=500, detail=str(e))
