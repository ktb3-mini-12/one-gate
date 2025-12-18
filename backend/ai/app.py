"""
ai/app.py

Gemini 기반 입력 분석 서비스 (텍스트 / 이미지 / PDF)
- 'CALENDAR' 또는 'MEMO' JSON을 반환
- main.py에서 라우터로 통합: from ai.app import router

환경변수 (둘 중 하나 필수):
- GOOGLE_APPLICATION_CREDENTIALS: 서비스 계정 JSON 파일 경로
- GOOGLE_API_KEY: API 키 (서비스 계정이 없을 경우 사용)
- GEMINI_MODEL (선택, 기본: gemini-2.0-flash)
"""

from __future__ import annotations

import io
import json
import logging
import os
import re
from datetime import datetime
from typing import Literal, Optional, Tuple

from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from zoneinfo import ZoneInfo

# Pillow for image preprocessing
try:
    from PIL import Image
    PILLOW_AVAILABLE = True
except ImportError:
    PILLOW_AVAILABLE = False
    Image = None

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
CREDENTIALS_PATH = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
VERTEX_LOCATION = os.getenv("VERTEX_LOCATION", "us-central1")
client = None


def _load_project_id_from_credentials(path: str) -> str | None:
    """서비스 계정 JSON 파일에서 project_id를 읽어옵니다."""
    try:
        with open(path, "r") as f:
            data = json.load(f)
            return data.get("project_id")
    except Exception as e:
        logger.error(f"서비스 계정 JSON 파일 읽기 실패: {e}")
        return None


if GENAI_AVAILABLE:
    if CREDENTIALS_PATH and os.path.exists(CREDENTIALS_PATH):
        # 서비스 계정 JSON 파일 사용 (Vertex AI 방식)
        project_id = _load_project_id_from_credentials(CREDENTIALS_PATH)
        if project_id:
            client = genai.Client(
                vertexai=True,
                project=project_id,
                location=VERTEX_LOCATION,
            )
            logger.info(f"Vertex AI 인증 사용 - project: {project_id}, location: {VERTEX_LOCATION}")
        else:
            logger.warning("서비스 계정 JSON에서 project_id를 찾을 수 없습니다.")
    elif API_KEY:
        # API 키 방식 사용
        client = genai.Client(api_key=API_KEY)
        logger.info("API 키 인증 사용")
    else:
        logger.warning("인증 정보가 없습니다. GOOGLE_APPLICATION_CREDENTIALS 또는 GOOGLE_API_KEY를 설정하세요.")
elif not GENAI_AVAILABLE:
    logger.warning("google-genai 패키지가 설치되지 않았습니다. pip install google-genai")


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


def _fix_truncated_json(text: str) -> str:
    """잘린 JSON을 최대한 복구합니다. 문자열 내 개행도 이스케이프 처리."""
    if not text:
        return text

    # 문자열 내부의 실제 개행(\n, \r)을 이스케이프 처리
    result = []
    in_string = False
    escape_next = False
    i = 0

    while i < len(text):
        char = text[i]

        if escape_next:
            result.append(char)
            escape_next = False
            i += 1
            continue

        if char == '\\':
            result.append(char)
            escape_next = True
            i += 1
            continue

        if char == '"':
            in_string = not in_string
            result.append(char)
            i += 1
            continue

        # 문자열 내부에서 실제 개행 문자를 이스케이프
        if in_string and char in ('\n', '\r'):
            if char == '\n':
                result.append('\\n')
            elif char == '\r':
                result.append('\\r')
            i += 1
            continue

        result.append(char)
        i += 1

    text = ''.join(result)

    # 문자열이 닫히지 않았으면 " 추가
    if in_string:
        text += '"'

    # 불완전한 키-값 쌍 제거 (예: ,"key 또는 , "key": 로 끝나는 경우)
    # 패턴: 마지막 완전한 값 이후의 불완전한 부분 제거
    text = re.sub(r',\s*"[^"]*"\s*:\s*$', '', text)  # "key": 로 끝남
    text = re.sub(r',\s*"[^"]*"\s*$', '', text)      # "key" 로 끝남 (콜론 없음)
    text = re.sub(r',\s*"[^"]*$', '', text)          # "key 로 끝남 (닫는 따옴표 없음)
    text = re.sub(r',\s*$', '', text)                # 쉼표로 끝남

    # 괄호 개수 맞추기
    open_braces = text.count('{') - text.count('}')
    open_brackets = text.count('[') - text.count(']')

    # 닫는 괄호 추가
    text += ']' * open_brackets
    text += '}' * open_braces

    return text


def _extract_partial_fields(text: str) -> dict | None:
    """
    JSON 파싱 실패 시 정규식으로 주요 필드를 추출하여 부분 데이터라도 반환.
    최소 type과 summary가 있어야 유효한 결과로 인정.
    """
    result = {}

    # type 추출: "type": "MEMO" 또는 "type": "CALENDAR"
    type_match = re.search(r'"type"\s*:\s*"(MEMO|CALENDAR)"', text, re.IGNORECASE)
    if type_match:
        result["type"] = type_match.group(1).upper()

    # summary 추출: "summary": "..."
    summary_match = re.search(r'"summary"\s*:\s*"([^"]*)"', text)
    if summary_match:
        result["summary"] = summary_match.group(1)

    # content 추출: "content": "..." (값이 잘린 경우도 포함)
    content_match = re.search(r'"content"\s*:\s*"([^"]*)"?', text)
    if content_match:
        result["content"] = content_match.group(1)

    # category 추출
    category_match = re.search(r'"category"\s*:\s*"([^"]*)"', text)
    if category_match:
        result["category"] = category_match.group(1)

    # 최소 type과 summary가 있어야 유효
    if result.get("type") and result.get("summary"):
        # 누락된 필수 필드 기본값 설정
        if "content" not in result:
            result["content"] = result["summary"]
        if "category" not in result:
            result["category"] = "일정" if result["type"] == "CALENDAR" else "메모"

        logger.warning(f"부분 필드 추출 성공: {list(result.keys())}")
        return result

    return None


def _parse_json_response(text: str) -> dict:
    """모델이 ```json ...``` 으로 감싸거나, 앞/뒤에 설명을 붙여도 최대한 JSON만 뽑아냅니다."""
    # 1차: ```json...``` 패턴
    m = re.search(r"```json\s*([\s\S]*?)\s*```", text)
    if m:
        json_str = m.group(1)
    else:
        # 2차: {...} 또는 {... 패턴
        m = re.search(r"\{[\s\S]*", text)
        if m:
            json_str = m.group(0)
        else:
            return {"error": "JSON 파싱 실패", "raw": text}

    # 먼저 그대로 파싱 시도
    try:
        return json.loads(json_str)
    except json.JSONDecodeError:
        pass

    # 실패 시 복구 후 재시도 (개행 이스케이프 + 괄호 닫기)
    fixed = _fix_truncated_json(json_str)
    try:
        logger.warning("JSON 복구 적용됨 (개행/괄호 수정)")
        return json.loads(fixed)
    except json.JSONDecodeError as e:
        logger.error(f"JSON 복구 실패: {e}")

    # 최종 fallback: 정규식으로 부분 필드 추출
    partial = _extract_partial_fields(text)
    if partial:
        logger.warning("부분 필드 추출로 복구됨")
        return partial

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
            detail="인증 정보가 없습니다. GOOGLE_APPLICATION_CREDENTIALS 또는 GOOGLE_API_KEY를 .env에 설정하세요.",
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


def _preprocess_image(
    image_bytes: bytes,
    max_size: int = 1024,
    quality: int = 85
) -> Tuple[bytes, str]:
    """
    Pillow를 사용한 이미지 전처리.

    - 큰 이미지를 max_size로 리사이즈 (비율 유지)
    - RGBA → RGB 변환 (JPEG 호환)
    - JPEG로 압축하여 용량 최적화

    Args:
        image_bytes: 원본 이미지 바이트
        max_size: 최대 가로/세로 픽셀 (기본: 1024)
        quality: JPEG 압축 품질 (기본: 85)

    Returns:
        (processed_bytes, mime_type) 튜플
    """
    if not PILLOW_AVAILABLE:
        logger.warning("Pillow가 설치되지 않아 이미지 전처리를 건너뜁니다.")
        return image_bytes, "image/jpeg"

    try:
        img = Image.open(io.BytesIO(image_bytes))
        original_size = img.size
        original_format = img.format or "UNKNOWN"

        # RGBA/P 모드 → RGB 변환 (JPEG는 알파 채널 미지원)
        if img.mode in ("RGBA", "P"):
            # 알파 채널이 있으면 흰색 배경으로 합성
            background = Image.new("RGB", img.size, (255, 255, 255))
            if img.mode == "P":
                img = img.convert("RGBA")
            background.paste(img, mask=img.split()[-1] if img.mode == "RGBA" else None)
            img = background
        elif img.mode != "RGB":
            img = img.convert("RGB")

        # 리사이즈 (비율 유지, 큰 이미지만)
        if max(img.size) > max_size:
            img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
            logger.info(f"이미지 리사이즈: {original_size} → {img.size}")

        # JPEG로 압축
        output = io.BytesIO()
        img.save(output, format="JPEG", quality=quality, optimize=True)
        processed_bytes = output.getvalue()

        # 로그
        original_kb = len(image_bytes) / 1024
        processed_kb = len(processed_bytes) / 1024
        logger.info(
            f"이미지 전처리 완료: {original_format} → JPEG, "
            f"{original_kb:.1f}KB → {processed_kb:.1f}KB ({100 * processed_kb / original_kb:.0f}%)"
        )

        return processed_bytes, "image/jpeg"

    except Exception as e:
        logger.error(f"이미지 전처리 실패: {e}, 원본 사용")
        return image_bytes, "image/jpeg"


async def _read_upload_bytes(upload: UploadFile) -> bytes:
    data = await upload.read()
    if not data:
        raise HTTPException(status_code=400, detail="업로드된 파일이 비어있습니다.")
    return data


def _parse_categories(categories_input: str) -> list[str] | None:
    """카테고리 입력을 파싱. JSON array 또는 쉼표 구분 문자열 지원."""
    if not categories_input:
        return None
    try:
        parsed = json.loads(categories_input)
        if isinstance(parsed, list) and len(parsed) > 0:
            return parsed
    except (json.JSONDecodeError, TypeError):
        # 쉼표 구분 문자열로 처리
        items = [s.strip() for s in categories_input.split(",") if s.strip()]
        if items:
            return items
    return None


def _build_prompt(
    memo_categories: str = None,
    calendar_categories: str = None,
) -> str:
    """프롬프트 생성. 카테고리 유무에 따라 다른 지시사항 생성."""
    memo_cats = _parse_categories(memo_categories)
    calendar_cats = _parse_categories(calendar_categories)

    # 카테고리 지시사항 생성
    instructions = []

    if memo_cats:
        instructions.append(
            f"**MEMO 카테고리**: 반드시 다음 중에서 선택하세요: {', '.join(memo_cats)}"
        )
    else:
        instructions.append(
            "**MEMO 카테고리**: 내용에 가장 적합한 카테고리를 자유롭게 추천하세요. (예: 할 일, 아이디어, 쇼핑, 일상 등)"
        )

    if calendar_cats:
        instructions.append(
            f"**CALENDAR 카테고리**: 반드시 다음 중에서 선택하세요: {', '.join(calendar_cats)}"
        )
    else:
        instructions.append(
            "**CALENDAR 카테고리**: 내용에 가장 적합한 카테고리를 자유롭게 추천하세요. (예: 약속, 회의, 운동, 여행 등)"
        )

    category_instruction = "\n".join(instructions)

    return ANALYSIS_PROMPT.format(
        today=_today_kst_str(),
        category_instruction=category_instruction,
    )


MAX_RETRIES = 2


def _gemini_generate(
    contents: list,
    raise_http: bool = True,
    memo_categories: str = None,
    calendar_categories: str = None,
) -> dict:
    """google-genai SDK 호출 (JSON 응답 강제, 파싱 실패 시 재시도)"""
    c = _require_client()
    prompt = _build_prompt(memo_categories, calendar_categories)
    final_contents = list(contents) + [prompt]

    last_error = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            logger.info(f"Gemini API 호출 - 모델: {MODEL}, 시도: {attempt + 1}/{MAX_RETRIES + 1}")
            resp = c.models.generate_content(
                model=MODEL,
                contents=final_contents,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.2,
                    max_output_tokens=2048,
                ),
            )
            raw_text = resp.text or ""
            logger.info(f"Gemini 원본 응답:\n{raw_text[:2000]}")

            result = _parse_json_response(raw_text)

            # JSON 파싱 실패 시 재시도
            if "error" in result and attempt < MAX_RETRIES:
                logger.warning(f"JSON 파싱 실패, 재시도 ({attempt + 1}/{MAX_RETRIES})")
                last_error = result.get("raw", "JSON parsing failed")
                continue

            # type 필드 유효성 검사: 없거나 유효하지 않으면 MEMO로 설정
            valid_types = ("CALENDAR", "MEMO")
            if result.get("type") not in valid_types:
                logger.warning(f"유효하지 않은 type '{result.get('type')}' → 'MEMO'로 변경")
                result["type"] = "MEMO"

            logger.info(f"분석 완료 - 타입: {result.get('type')}")
            return result

        except Exception as e:
            logger.error(f"Gemini 호출 실패 (시도 {attempt + 1}): {e}")
            last_error = str(e)
            if attempt < MAX_RETRIES:
                continue
            if raise_http:
                raise HTTPException(status_code=500, detail=f"Gemini 호출 실패: {e}")
            raise

    # 모든 재시도 실패
    error_msg = f"최대 재시도 횟수 초과: {last_error}"
    logger.error(error_msg)
    if raise_http:
        raise HTTPException(status_code=500, detail=error_msg)
    raise Exception(error_msg)


# ============ Service Functions (내부 호출용) ============
async def analyze_text(
    text: str,
    memo_categories: str = None,
    calendar_categories: str = None,
) -> dict:
    """
    내부 호출용 AI 분석 함수.
    main.py의 BackgroundTasks에서 호출됨.

    Args:
        text: 분석할 텍스트
        memo_categories: JSON string array of user's MEMO categories
        calendar_categories: JSON string array of user's CALENDAR categories

    Returns:
        dict: AIAnalysisData 형식의 분석 결과
    Raises:
        Exception: Gemini 호출 실패 시
    """
    if not text or not text.strip():
        raise ValueError("분석할 텍스트가 비어있습니다.")

    return _gemini_generate(
        [f"분석할 내용:\n{text.strip()}"],
        raise_http=False,
        memo_categories=memo_categories,
        calendar_categories=calendar_categories,
    )


async def analyze_image_bytes(
    image_bytes: bytes,
    mime_type: str,
    text: Optional[str] = None,
    memo_categories: str = None,
    calendar_categories: str = None,
) -> dict:
    """
    이미지 바이트로 AI 분석 수행.
    main.py의 BackgroundTasks에서 호출됨.

    Args:
        image_bytes: 이미지 바이트 데이터
        mime_type: 이미지 MIME 타입 (image/jpeg, image/png 등)
        text: 추가 텍스트 (선택)
        memo_categories: JSON string array of user's MEMO categories
        calendar_categories: JSON string array of user's CALENDAR categories

    Returns:
        dict: AIAnalysisData 형식의 분석 결과
    """
    _require_client()

    # Pillow로 이미지 전처리 (리사이즈, 압축, 포맷 통일)
    processed_bytes, processed_mime = _preprocess_image(image_bytes)

    # Gemini에 이미지 전송
    image_part = types.Part.from_bytes(data=processed_bytes, mime_type=processed_mime)

    contents = [image_part]
    if text and text.strip():
        contents.append(f"추가 설명:\n{text.strip()}")
    contents.append("이 이미지를 분석해주세요.")

    return _gemini_generate(
        contents,
        raise_http=False,
        memo_categories=memo_categories,
        calendar_categories=calendar_categories,
    )


def is_ai_available() -> bool:
    """AI 분석 가능 여부 확인"""
    return GENAI_AVAILABLE and client is not None


# ============ API Endpoints ============
InputType = Literal["text", "image", "pdf"]


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze(
    type: InputType = Form(..., description="입력 타입: text, image, pdf"),
    content: Optional[str] = Form(None, description="텍스트 내용 (type=text일 때 필수, image/pdf일 때 선택)"),
    file: Optional[UploadFile] = File(None, description="파일 (type=image/pdf일 때 필수)"),
    memo_categories: Optional[str] = Form(None, description="MEMO 카테고리 목록 (JSON array 또는 쉼표 구분 문자열)"),
    calendar_categories: Optional[str] = Form(None, description="CALENDAR 카테고리 목록 (JSON array 또는 쉼표 구분 문자열)"),
):
    """입력을 분석하여 CALENDAR 또는 MEMO로 분류

    - type=text: 텍스트만 분석 (content 필수)
    - type=image: 이미지 분석 (file 필수, content 선택 - 있으면 함께 분석)
    - type=pdf: PDF 분석 (file 필수, content 선택 - 있으면 함께 분석)
    """
    logger.info(f"분석 요청 - 타입: {type}")

    if type == "text":
        if not content or not content.strip():
            raise HTTPException(status_code=400, detail="type=text인 경우 content가 필요합니다.")
        data = _gemini_generate(
            [f"분석할 내용:\n{content.strip()}"],
            memo_categories=memo_categories,
            calendar_categories=calendar_categories,
        )
        return AnalyzeResponse(status="success", data=data)

    if type in ("image", "pdf"):
        if file is None:
            raise HTTPException(status_code=400, detail=f"type={type}인 경우 file이 필요합니다.")

        file_bytes = await _read_upload_bytes(file)
        logger.info(f"파일 수신 - 크기: {len(file_bytes)} bytes")

        if type == "image":
            # Pillow로 이미지 전처리
            processed_bytes, processed_mime = _preprocess_image(file_bytes)
            part = types.Part.from_bytes(data=processed_bytes, mime_type=processed_mime)
            if content and content.strip():
                logger.info("이미지 + 텍스트 분석")
                data = _gemini_generate(
                    [part, f"이 이미지와 함께 다음 내용을 분석해주세요:\n{content.strip()}"],
                    memo_categories=memo_categories,
                    calendar_categories=calendar_categories,
                )
            else:
                data = _gemini_generate(
                    [part, "이 이미지를 분석해주세요."],
                    memo_categories=memo_categories,
                    calendar_categories=calendar_categories,
                )
        else:
            part = types.Part.from_bytes(data=file_bytes, mime_type="application/pdf")
            if content and content.strip():
                logger.info("PDF + 텍스트 분석")
                data = _gemini_generate(
                    [part, f"이 PDF 문서와 함께 다음 내용을 분석해주세요:\n{content.strip()}"],
                    memo_categories=memo_categories,
                    calendar_categories=calendar_categories,
                )
            else:
                data = _gemini_generate(
                    [part, "이 PDF 문서를 분석해주세요."],
                    memo_categories=memo_categories,
                    calendar_categories=calendar_categories,
                )

        return AnalyzeResponse(status="success", data=data)

    raise HTTPException(status_code=400, detail="지원하지 않는 type입니다. (text/image/pdf)")


@router.get("/health")
async def health():
    auth_method = None
    if CREDENTIALS_PATH and os.path.exists(CREDENTIALS_PATH):
        auth_method = "service_account"
    elif API_KEY:
        auth_method = "api_key"

    return {
        "status": "ok",
        "genai_available": GENAI_AVAILABLE,
        "auth_method": auth_method,
        "has_credentials": bool(client),
        "model": MODEL,
    }


# ============ FastAPI App (하위 호환 유지) ============
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

app.include_router(router)
