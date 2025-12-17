from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional

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
    type: str  # "text" 또는 "image"
    content: str
    image_url: Optional[str] = None
    tag_id: Optional[int] = None

class TagRequest(BaseModel):
    name: str
    category_type: str

# ----------------------------------

@app.post("/analyze")
async def analyze_content(request: AnalyzeRequest):
    # 로그인 전이므로 user_id를 1로 고정
    current_user_id = 1 
    
    print(f"[TEST MODE] 데이터 수신: {request.type}, 내용: {request.content}")

    # Mock 분석 로직 (간단한 키워드 체크)
    is_calendar = "내일" in request.content or "시" in request.content or "일정" in request.content
    category = "CALENDAR" if is_calendar else "MEMO"

    # DB에 저장
    input_data = {
        "user_id": current_user_id,
        "category": category,
        "tag_id": request.tag_id,
        "content": request.content,
        "image_url": request.image_url,
    }

    try:
        result = supabase.table("inputs").insert(input_data).execute()
        record = result.data[0] if result.data else None

        # FastAPI가 알아서 JSON으로 변환해주므로 dict 상태로 리턴합니다.
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
async def get_records():
    current_user_id = 1
    
    # tags(...) 부분은 Supabase의 Foreign Key 관계가 맺어져 있어야 작동합니다.
    result = supabase.table("inputs")\
        .select("*, tags(id, name, category_type)")\
        .eq("user_id", current_user_id)\
        .order("created_at", desc=True)\
        .execute()

    return {"status": "success", "data": result.data}

@app.delete("/records/{record_id}")
async def delete_record(record_id: int):
    # 실제 앱에서는 내 글인지 확인하는 로직이 필요하지만, 지금은 생략
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
async def create_tag(request: TagRequest): # Body로 받도록 수정
    result = supabase.table("tags").insert({
        "name": request.name,
        "category_type": request.category_type
    }).execute()
    
    return {"status": "success", "data": result.data[0] if result.data else None}

# 실행: uvicorn main:app --reload