from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from fastapi import Header

from database import supabase

app = FastAPI()

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- [DTO: 데이터 전송 객체 정의] ---

class AnalyzeRequest(BaseModel):
    type: str
    content: str
    user_id: str  # UUID string
    image_url: Optional[str] = None
    tag_id: Optional[int] = None

class TagRequest(BaseModel):
    name: str
    category_type: str

# ----------------------------------

@app.post("/analyze")
async def analyze_content(request: AnalyzeRequest):
    print(f"[분석] user_id: {request.user_id}, 내용: {request.content[:30]}...")

    # Mock 분석 로직
    is_calendar = "내일" in request.content or "시" in request.content or "일정" in request.content
    category = "CALENDAR" if is_calendar else "MEMO"

    # DB에 저장
    input_data = {
        "user_id": request.user_id,
        "category": category,
        "tag_id": request.tag_id,
        "content": request.content,
        "image_url": request.image_url,
    }

    try:
        result = supabase.table("inputs").insert(input_data).execute()
        record = result.data[0] if result.data else None

        return {
            "status": "success",
            "data": {
                "id": record["id"] if record else None,
                "category": category,
                "content": request.content,
                "created_at": record["created_at"] if record else None
            }
        }
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/records")
async def get_records(user_id: str):
    result = supabase.table("inputs")\
        .select("*, tags(id, name, category_type)")\
        .eq("user_id", user_id)\
        .order("created_at", desc=True)\
        .execute()

    return {"status": "success", "data": result.data}

@app.delete("/records/{record_id}")
async def delete_record(record_id: int):
    result = supabase.table("inputs").delete().eq("id", record_id).execute()

    if result.data:
        return {"status": "success", "message": "Record deleted"}
    return {"status": "error", "message": "Record not found"}

@app.get("/tags")
async def get_tags(category_type: Optional[str] = None):
    query = supabase.table("tags").select("*")
    if category_type:
        query = query.eq("category_type", category_type)
    result = query.execute()
    return {"status": "success", "data": result.data}

@app.post("/tags")
async def create_tag(request: TagRequest):
    result = supabase.table("tags").insert({
        "name": request.name,
        "category_type": request.category_type
    }).execute()

    return {"status": "success", "data": result.data[0] if result.data else None}

class CalendarEvent(BaseModel):
    summary: str
    description: str
    start_time: str # "2025-12-20T10:00:00" 형식
    end_time: str

@app.post("/calendar/test-create")
async def create_google_event(
    event_data: CalendarEvent, 
    # 프론트에서 헤더로 'Google-Token'을 보내줄 겁니다.
    google_token: str = Header(None, alias="X-Google-Token") 
):
    try:
        # 1. 구글 자격 증명(Credentials) 객체 생성
        creds = Credentials(token=google_token)
        
        # 2. 구글 캘린더 서비스 빌드
        service = build('calendar', 'v3', credentials=creds)

        # 3. 구글에 보낼 JSON 데이터 조립
        event_body = {
            'summary': event_data.summary,
            'description': event_data.description,
            'start': {
                'dateTime': event_data.start_time,
                'timeZone': 'Asia/Seoul',
            },
            'end': {
                'dateTime': event_data.end_time,
                'timeZone': 'Asia/Seoul',
            },
        }

        # 4. 실제 API 호출 (primary 캘린더에 일정 추가)
        event = service.events().insert(calendarId='primary', body=event_body).execute()

        print(f"일정 생성 완료: {event.get('htmlLink')}")
        return {"status": "success", "link": event.get('htmlLink')}

    except Exception as e:
        print(f"에러 발생: {e}")
        return {"status": "error", "message": str(e)}

# 실행: uvicorn main:app --reload
