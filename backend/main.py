from fastapi import FastAPI, Depends
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import json

from database import engine, get_db, Base
from models import AnalysisRecord

# DB 테이블 생성
Base.metadata.create_all(bind=engine)

app = FastAPI()

# CORS 설정 (Electron 통신 허용)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 데이터 구조 정의
class AnalyzeRequest(BaseModel):
    type: str  # "text" 또는 "image"
    content: str

@app.post("/analyze")
async def analyze_content(request: AnalyzeRequest, db: Session = Depends(get_db)):
    print(f"[TEST MODE] 데이터 수신: {request.type}")

    # 1. 텍스트가 들어온 경우
    if request.type == "text":
        is_calendar = "내일" in request.content or "시" in request.content

        mock_result = {
            "category": "CALENDAR" if is_calendar else "MEMO",
            "summary": f"[TEST] {request.content[:50]}..." if len(request.content) > 50 else f"[TEST] {request.content}",
            "date": "2025-12-25 19:00" if is_calendar else None,
            "tags": ["#테스트중", "#Echo모드"]
        }
    # 2. 이미지가 들어온 경우
    else:
        mock_result = {
            "category": "MEMO",
            "summary": "[TEST] 이미지 수신 성공!",
            "date": None,
            "tags": ["#이미지", "#테스트"]
        }

    # DB에 저장
    record = AnalysisRecord(
        type=request.type,
        content=request.content[:500],  # 내용은 500자까지만 저장
        category=mock_result["category"],
        summary=mock_result["summary"],
        date=mock_result["date"],
        tags=json.dumps(mock_result["tags"], ensure_ascii=False)
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    # 결과 반환 (id 포함)
    mock_result["id"] = record.id
    return {
        "status": "success",
        "data": json.dumps(mock_result, ensure_ascii=False)
    }

@app.get("/records")
async def get_records(db: Session = Depends(get_db)):
    records = db.query(AnalysisRecord).order_by(AnalysisRecord.created_at.desc()).all()

    result = []
    for record in records:
        result.append({
            "id": record.id,
            "type": record.type,
            "category": record.category,
            "summary": record.summary,
            "date": record.date,
            "tags": json.loads(record.tags) if record.tags else [],
            "created_at": record.created_at.isoformat() if record.created_at else None
        })

    return {"status": "success", "data": result}

@app.delete("/records/{record_id}")
async def delete_record(record_id: int, db: Session = Depends(get_db)):
    record = db.query(AnalysisRecord).filter(AnalysisRecord.id == record_id).first()

    if not record:
        return {"status": "error", "message": "Record not found"}

    db.delete(record)
    db.commit()

    return {"status": "success", "message": "Record deleted"}

# 실행 명령: uvicorn main:app --reload
