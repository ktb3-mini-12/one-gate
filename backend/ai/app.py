"""
ai/app.py

Gemini 기반 입력 분석 서비스 (텍스트 / 이미지 / PDF)
- 'schedule' 또는 'memo' JSON을 반환
- 실행: uvicorn ai.app:app --reload

환경변수:
- GOOGLE_API_KEY (필수)
- GEMINI_MODEL (선택, 기본: gemini-2.0-flash)
"""

from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime
from typing import Literal, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from zoneinfo import ZoneInfo

from google import genai
from google.genai import types

load_dotenv(override=True)

# ============ Logging ============
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

KST = ZoneInfo("Asia/Seoul")
MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

API_KEY = os.getenv("GOOGLE_API_KEY")
client: Optional[genai.Client] = genai.Client(api_key=API_KEY) if API_KEY else None

if not API_KEY:
    logger.warning("GOOGLE_API_KEY가 설정되지 않았습니다.")


# ============ Pydantic Models ============
class CalendarData(BaseModel):
    """일정(CALENDAR) 응답 모델"""
    type: Literal["CALENDAR"]
    summary: str
    content: str
    category: str

    start_time: Optional[str] = None  # ISO 8601 형식
    end_time: Optional[str] = None
    all_day: Optional[bool] = None
    location: Optional[str] = None
    attendees: Optional[list[str]] = None
    recurrence: Optional[str] = None
    meeting_url: Optional[str] = None

    # CALENDAR에서는 사용하지 않음
    body: Optional[str] = None
    due_date: Optional[str] = None
    memo_status: Optional[str] = None


class MemoData(BaseModel):
    """메모(MEMO) 응답 모델"""
    type: Literal["MEMO"]
    summary: str
    content: str
    category: str

    # MEMO에서는 사용하지 않음
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    all_day: Optional[bool] = None
    location: Optional[str] = None
    attendees: Optional[list[str]] = None
    recurrence: Optional[str] = None
    meeting_url: Optional[str] = None

    # MEMO 전용 필드
    body: Optional[str] = None
    due_date: Optional[str] = None  # YYYY-MM-DD
    memo_status: Optional[str] = None  # "시작 전", "진행 중", "완료"
    confidence: float  # MEMO일 때만 필수


class AnalyzeResponse(BaseModel):
    status: str
    data: dict


class HealthResponse(BaseModel):
    status: str
    has_api_key: bool
    model: str


# ============ FastAPI App ============
app = FastAPI(
    title="AI Analyzer (Gemini)",
    description="텍스트/이미지/PDF를 분석하여 일정 또는 메모로 분류",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============ Prompt ============

ANALYSIS_PROMPT = """당신은 입력된 내용을 분석하여 'CALENDAR(일정)' 또는 'MEMO(메모)'로 분류하는 AI입니다.

## 분류 기준:
- **CALENDAR**: 특정 시간에 일어나는 일정, 약속, 미팅 등 (시간 정보가 명확한 경우)
- **MEMO**: 할 일, 아이디어, 메모, 사진 등 (시간 정보가 없거나 불명확한 경우)

## 출력 형식 (반드시 JSON만 출력):

### CALENDAR인 경우:
```json
{{
  "type": "CALENDAR",
  "summary": "민수와 홍대 저녁 약속",
  "content": "원본 입력 내용",
  "category": "약속",
  "start_time": "2025-12-19T19:00:00+09:00",
  "end_time": "2025-12-19T21:00:00+09:00",
  "all_day": false,
  "location": "홍대",
  "attendees": ["민수"],
  "recurrence": null,
  "meeting_url": null,
  "body": null,
  "due_date": null,
  "memo_status": null
}}
```

### MEMO인 경우:
```json
{{
  "type": "MEMO",
  "summary": "발표자료 제작",
  "content": "원본 입력 내용",
  "category": "할 일",
  "start_time": null,
  "end_time": null,
  "all_day": null,
  "location": null,
  "attendees": null,
  "recurrence": null,
  "meeting_url": null,
  "body": "발표자료를 완성해야 한다.",
  "due_date": "2025-12-19",
  "memo_status": "시작 전",
  "confidence": 0.91
}}
```

## 필드 설명:
- **type** (필수): "CALENDAR" 또는 "MEMO"
- **summary** (필수): 핵심 요약 (30자 이내)
- **content** (필수): 원본 입력 내용
- **category** (필수): 단일 카테고리 (약속, 회의, 업무, 할 일, 아이디어, 일상 등)

### CALENDAR 전용:
- **start_time**: ISO 8601 형식 (예: 2025-12-19T19:00:00+09:00)
- **end_time**: 종료 시간 (없으면 시작 후 2시간으로 설정)
- **all_day**: 종일 일정 여부
- **location**: 장소
- **attendees**: 참석자 목록 (배열)
- **recurrence**: 반복 규칙 (매일, 매주, 매월 등)
- **meeting_url**: 화상회의 URL

### MEMO 전용:
- **body**: 상세 내용 또는 정리된 메모
- **due_date**: 마감일 (YYYY-MM-DD 형식)
- **memo_status**: "시작 전", "진행 중", "완료" 중 하나
- **confidence** (필수): 분류 신뢰도 (0~1 사이)

## 카테고리 예시:
- CALENDAR: 약속, 회의, 미팅, 병원, 운동, 수업, 여행, 공연, 예약
- MEMO: 할 일, 아이디어, 영감, 쇼핑, 독서, 일상, 메모, 정보

## 주의사항:
- 오늘 날짜: {today}
- 시간대는 항상 한국 시간(+09:00) 사용
- "내일", "다음주" 등 상대 시간은 오늘 기준으로 계산
- 반드시 유효한 JSON만 출력하세요. 다른 텍스트는 포함하지 마세요."""


# ============ Helpers ============

def _today_kst_str() -> str:
    return datetime.now(KST).strftime("%Y-%m-%d")


def _parse_json_response(text: str) -> dict:
    """
    모델이 ```json ...``` 으로 감싸거나, 앞/뒤에 설명을 붙여도 최대한 JSON만 뽑아냅니다.
    """
    try:
        # ```json ... ```
        m = re.search(r"```json\s*([\s\S]*?)\s*```", text)
        if m:
            return json.loads(m.group(1))

        # 첫 { 부터 마지막 } 까지
        m = re.search(r"\{[\s\S]*\}", text)
        if m:
            return json.loads(m.group(0))

        return {"error": "JSON 파싱 실패", "raw": text}
    except Exception:
        return {"error": "JSON 파싱 실패", "raw": text}


def _require_client() -> genai.Client:
    if client is None:
        raise HTTPException(
            status_code=500,
            detail="Gemini API 키가 없습니다. GOOGLE_API_KEY 또는 GEMINI_API_KEY를 .env에 설정하세요.",
        )
    return client


def _guess_image_mime(upload: UploadFile) -> str:
    # FastAPI UploadFile.content_type을 최대한 신뢰하되, 없으면 기본값
    ct = (upload.content_type or "").lower()
    if ct.startswith("image/"):
        return ct
    # fallback: 확장자 기준
    name = (upload.filename or "").lower()
    if name.endswith(".png"):
        return "image/png"
    if name.endswith(".webp"):
        return "image/webp"
    return "image/jpeg"


async def _read_upload_bytes(upload: UploadFile) -> bytes:
    data = await upload.read()
    if not data:
        raise HTTPException(status_code=400, detail="업로드된 파일이 비어있습니다.")
    return data


def _build_prompt() -> str:
    return ANALYSIS_PROMPT.format(today=_today_kst_str())


def _gemini_generate(contents: list[types.Part | str]) -> dict:
    """google-genai SDK 호출 (JSON 응답 강제)"""
    c = _require_client()
    prompt = _build_prompt()
    final_contents = list(contents) + [prompt]

    try:
        logger.info(f"Gemini API 호출 - 모델: {MODEL}")
        resp = c.models.generate_content(
            model=MODEL,
            contents=final_contents,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.2,
                max_output_tokens=1024,
            ),
        )
        result = _parse_json_response(resp.text or "")
        logger.info(f"분석 완료 - 타입: {result.get('type', 'unknown')}")
        return result
    except Exception as e:
        logger.error(f"Gemini 호출 실패: {e}")
        raise HTTPException(status_code=500, detail=f"Gemini 호출 실패: {e}")


# ============ API ============

InputType = Literal["text", "image", "pdf"]


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(
    type: InputType = Form(..., description="입력 타입: text, image, pdf"),
    content: Optional[str] = Form(None, description="텍스트 내용 (type=text일 때)"),
    file: Optional[UploadFile] = File(None, description="파일 (type=image/pdf일 때)"),
):
    """입력을 분석하여 일정(schedule) 또는 메모(memo)로 분류"""
    logger.info(f"분석 요청 - 타입: {type}")

    if type == "text":
        if not content or not content.strip():
            raise HTTPException(status_code=400, detail="type=text인 경우 content가 필요합니다.")
        data = _gemini_generate([f"분석할 내용:\n{content.strip()}"])
        return AnalyzeResponse(status="success", data=data)

    if type in ("image", "pdf"):
        if file is None:
            raise HTTPException(status_code=400, detail=f"type={type}인 경우 file이 필요합니다.")

        file_bytes = await _read_upload_bytes(file)
        logger.info(f"파일 수신 - 크기: {len(file_bytes)} bytes")

        if type == "image":
            mime = _guess_image_mime(file)
            part = types.Part.from_bytes(data=file_bytes, mime_type=mime)
            data = _gemini_generate([part, "이 이미지를 분석해주세요."])
        else:
            part = types.Part.from_bytes(data=file_bytes, mime_type="application/pdf")
            data = _gemini_generate([part, "이 PDF 문서를 분석해주세요."])

        return AnalyzeResponse(status="success", data=data)

    raise HTTPException(status_code=400, detail="지원하지 않는 type입니다. (text/image/pdf)")


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "has_api_key": bool(API_KEY),
        "model": MODEL,
    }
