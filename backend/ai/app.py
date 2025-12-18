"""
ai/app.py

Gemini 기반 입력 분석 서비스 (텍스트 / 이미지 / PDF)
- 'CALENDAR' 또는 'MEMO' JSON을 반환
- main.py에서 라우터로 통합: from ai.app import router

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
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from zoneinfo import ZoneInfo

# google-genai 패키지 import (설치 필요: pip install google-genai)
try:
    from google import genai
    from google.genai import types
    GENAI_AVAILABLE = True
except ImportError:
    GENAI_AVAILABLE = False
    genai = None
    types = None

load_dotenv(override=True)

# ============ Logging ============
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

KST = ZoneInfo("Asia/Seoul")
MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

API_KEY = os.getenv("GOOGLE_API_KEY")
client = None

if GENAI_AVAILABLE and API_KEY:
    client = genai.Client(api_key=API_KEY)
elif not GENAI_AVAILABLE:
    logger.warning("google-genai 패키지가 설치되지 않았습니다. pip install google-genai")
elif not API_KEY:
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


# ============ APIRouter ============
router = APIRouter(prefix="/ai", tags=["AI"])


# ============ Prompt ============
def _load_prompt(filename: str) -> str:
    """ai 폴더에서 프롬프트 파일을 읽어옵니다."""
    path = os.path.join(os.path.dirname(__file__), filename)
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


ANALYSIS_PROMPT = _load_prompt("analysis_prompt.md")


# ============ Helpers ============
def _today_kst_str() -> str:
    return datetime.now(KST).strftime("%Y-%m-%d")


def _parse_json_response(text: str) -> dict:
    """모델이 ```json ...``` 으로 감싸거나, 앞/뒤에 설명을 붙여도 최대한 JSON만 뽑아냅니다."""
    try:
        m = re.search(r"```json\s*([\s\S]*?)\s*```", text)
        if m:
            return json.loads(m.group(1))

        m = re.search(r"\{[\s\S]*\}", text)
        if m:
            return json.loads(m.group(0))

        return {"error": "JSON 파싱 실패", "raw": text}
    except Exception:
        return {"error": "JSON 파싱 실패", "raw": text}


def _require_client():
    if not GENAI_AVAILABLE:
        raise HTTPException(
            status_code=500,
            detail="google-genai 패키지가 설치되지 않았습니다. pip install google-genai",
        )
    if client is None:
        raise HTTPException(
            status_code=500,
            detail="Gemini API 키가 없습니다. GOOGLE_API_KEY를 .env에 설정하세요.",
        )
    return client


def _guess_image_mime(upload: UploadFile) -> str:
    ct = (upload.content_type or "").lower()
    if ct.startswith("image/"):
        return ct
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


def _gemini_generate(contents: list) -> dict:
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


# ============ API Endpoints ============
InputType = Literal["text", "image", "pdf"]


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze(
    type: InputType = Form(..., description="입력 타입: text, image, pdf"),
    content: Optional[str] = Form(None, description="텍스트 내용 (type=text일 때)"),
    file: Optional[UploadFile] = File(None, description="파일 (type=image/pdf일 때)"),
):
    """입력을 분석하여 CALENDAR 또는 MEMO로 분류"""
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


@router.get("/health")
async def health():
    return {
        "status": "ok",
        "genai_available": GENAI_AVAILABLE,
        "has_api_key": bool(API_KEY),
        "model": MODEL,
    }
