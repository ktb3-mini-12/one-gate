"""
AI analysis utilities.
"""

import re

from database import supabase
from models.schemas import AIAnalysisData


def _load_ai_module():
    """Load AI module (router + service functions)"""
    try:
        from ai.app import router as ai_router, analyze_text, analyze_image_bytes, is_ai_available
        return ai_router, analyze_text, analyze_image_bytes, is_ai_available
    except Exception as e:
        print(f"[AI] 모듈 로드 실패: {e}")
        return None, None, None, lambda: False


# Load AI module on import
ai_router, ai_analyze_text, ai_analyze_image_bytes, ai_is_available = _load_ai_module()


def _fallback_analyze(text: str) -> dict:
    """Keyword-based fallback classification when AI analysis fails"""
    safe_text = text or ""
    text_lower = safe_text.lower()

    # Calendar keywords
    calendar_keywords = [
        "내일", "모레", "다음주", "이번주", "오늘",
        "시에", "시 ", "분에", "약속", "미팅", "회의",
        "점심", "저녁", "아침", "오전", "오후",
        "월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일",
        "일정", "예약", "방문", "출장", "면접",
    ]

    is_calendar = any(kw in text_lower for kw in calendar_keywords)
    input_type = "CALENDAR" if is_calendar else "MEMO"

    summary = safe_text[:50] if len(safe_text) > 50 else safe_text
    if not summary:
        summary = "이미지 메모" if input_type == "MEMO" else "이미지 일정"

    return {
        "type": input_type,
        "summary": summary,
        "content": safe_text or "(이미지)",
        "category": "일정" if is_calendar else "메모",
    }


def _clean_ai_response(raw_text: str) -> str:
    """
    Remove markdown code block markers from AI response.
    Handles ```json ... ``` or ``` ... ``` formats.
    """
    if not raw_text:
        return raw_text

    # Extract content from ```json or ``` blocks
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", raw_text)
    if match:
        return match.group(1).strip()

    # Try to extract JSON object only
    match = re.search(r"\{[\s\S]*\}", raw_text)
    if match:
        return match.group(0).strip()

    return raw_text.strip()


async def _run_ai_analysis(
    broker,  # Pass the _broker instance from main
    record_id: int,
    user_id: str,
    text: str,
    image_bytes: bytes = None,
    image_mime_type: str = None,
    memo_categories: str = None,
    calendar_categories: str = None,
) -> None:
    """
    Run AI analysis in background and save results to DB.
    Notify client via SSE when analysis is complete.

    Args:
        memo_categories: JSON string array of user's MEMO categories
        calendar_categories: JSON string array of user's CALENDAR categories

    Logic:
    1. Perform AI analysis
    2. Parse response and validate with AIAnalysisData
    3. On success: Update status='ANALYZED'
    4. On failure: Save error without calling AIAnalysisData
    """
    raw_response = None
    error_message = None

    try:
        # Step 1: Check if AI module is available
        if not ai_is_available():
            raise RuntimeError("AI 모듈이 사용 불가능합니다.")

        print(f"[AI] 레코드 {record_id} Gemini 분석 시작 (이미지: {'있음' if image_bytes else '없음'})")

        # Step 2: Perform AI analysis
        if image_bytes and ai_analyze_image_bytes is not None:
            analysis_result = await ai_analyze_image_bytes(
                image_bytes, image_mime_type, text,
                memo_categories=memo_categories,
                calendar_categories=calendar_categories,
            )
        elif text and ai_analyze_text is not None:
            analysis_result = await ai_analyze_text(
                text,
                memo_categories=memo_categories,
                calendar_categories=calendar_categories,
            )
        else:
            raise ValueError("분석할 텍스트 또는 이미지가 없습니다.")

        # Step 3: Check if AI response is an error dict
        # (ai/app.py's _parse_json_response returns {"error": ..., "raw": ...} on parse failure)
        if isinstance(analysis_result, dict) and "error" in analysis_result:
            raw_response = analysis_result.get("raw", str(analysis_result))
            raise ValueError(f"AI 응답 파싱 실패: {analysis_result.get('error')}")

        # Step 4: Validate with AIAnalysisData model (may raise pydantic ValidationError)
        validated = AIAnalysisData(**analysis_result)
        analysis_payload = validated.model_dump(exclude_none=True)

        # Step 5: Update DB on success
        supabase.table("inputs").update({
            "status": "ANALYZED",
            "type": validated.type,
            "result": analysis_payload,
        }).eq("id", record_id).execute()

        # analysis_completed SSE event
        await broker.publish(
            str(user_id),
            "analysis_completed",
            {"record_id": record_id, "status": "ANALYZED", "analysis_data": analysis_payload},
        )
        print(f"[AI] 레코드 {record_id} 분석 완료: {validated.type}")

    except Exception as e:
        # Step 6: On failure, save error without calling AIAnalysisData
        error_message = str(e)
        print(f"[AI] 레코드 {record_id} 분석 실패: {error_message}")

        # Save failure result (status stays PENDING due to DB CHECK constraint)
        fail_result = {
            "analysis_failed": True,
            "error": error_message,
        }
        # Include raw_response if available (for debugging)
        if raw_response:
            fail_result["raw_text"] = raw_response[:2000]  # Truncate if too long

        supabase.table("inputs").update({
            "result": fail_result,
        }).eq("id", record_id).execute()

        # analysis_failed SSE event
        await broker.publish(
            str(user_id),
            "analysis_failed",
            {"record_id": record_id, "error": error_message},
        )
