import streamlit as st
import base64
import json
import re
import time
from io import BytesIO
from PIL import Image
import os
from datetime import datetime
from dotenv import load_dotenv

load_dotenv(override=True)

# API clients
import anthropic
import openai

# Google Gemini
try:
    import google.generativeai as genai
    gemini_available = True
except ImportError:
    gemini_available = False

# PDF processing
try:
    import fitz  # PyMuPDF
    pdf_available = True
except ImportError:
    pdf_available = False

st.set_page_config(page_title="Smart Input Analyzer", layout="wide")
st.title("Smart Input Analyzer")
st.caption("이미지, 텍스트, PDF를 분석하여 일정 또는 메모로 분류합니다")

# Load API keys
anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "")
openai_key = os.environ.get("OPENAI_API_KEY", "")
google_api_key = os.environ.get("GOOGLE_API_KEY", "")

# Configure Gemini
if google_api_key and gemini_available:
    genai.configure(api_key=google_api_key)

# Sidebar
st.sidebar.header("API 상태")
st.sidebar.write("✅ Claude" if anthropic_key else "❌ Claude")
st.sidebar.write("✅ GPT-4" if openai_key else "❌ GPT-4")
st.sidebar.write("✅ Gemini" if (google_api_key and gemini_available) else "❌ Gemini")
st.sidebar.write("✅ PDF 처리" if pdf_available else "❌ PDF 처리")


# ============ Utility Functions ============

def image_to_base64(image: Image.Image) -> str:
    buffered = BytesIO()
    image.save(buffered, format="PNG")
    return base64.b64encode(buffered.getvalue()).decode("utf-8")


def pdf_to_images(pdf_bytes: bytes) -> list[Image.Image]:
    if not pdf_available:
        return []
    images = []
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    for page_num in range(len(doc)):
        page = doc[page_num]
        mat = fitz.Matrix(300/72, 300/72)
        pix = page.get_pixmap(matrix=mat)
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        images.append(img)
    doc.close()
    return images


def pdf_to_text(pdf_bytes: bytes) -> str:
    if not pdf_available:
        return ""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    text_parts = []
    for page_num in range(len(doc)):
        page = doc[page_num]
        text = page.get_text()
        if text.strip():
            text_parts.append(text)
    doc.close()
    return "\n\n".join(text_parts)


# ============ Analysis Prompt ============

ANALYSIS_PROMPT = """당신은 입력된 내용을 분석하여 '일정(schedule)' 또는 '메모(memo)'로 분류하는 AI입니다.

## 분류 기준:
- **일정(schedule)**: 시간, 장소, 할 일이 명확하게 포함된 경우
- **메모(memo)**: 그 외 모든 경우 (사진, 메모, 아이디어 등)

## 출력 형식 (반드시 JSON만 출력):

### 일정인 경우:
```json
{{
  "type": "schedule",
  "time": "2024-01-15 09:00",
  "place": "장소명",
  "summary": "일정 요약 (30자 이내)",
  "categories": ["카테고리1", "카테고리2"]
}}
```

### 메모인 경우:
```json
{{
  "type": "memo",
  "categories": [
    {{"category": "카테고리1", "confidence": 0.95}},
    {{"category": "카테고리2", "confidence": 0.87}}
  ]
}}
```

## 카테고리 예시:
- 일정: 회의, 개발, 업무, 약속, 병원, 운동, 공부, 여행, 가족, 친구
- 메모: 일상, 음식, 풍경, 아이디어, 영감, 쇼핑, 독서, 영화, 음악, 산책

## 주의사항:
- 시간 형식: "YYYY-MM-DD HH:MM" (24시간제)
- 시간이 "오전 9시"처럼 되어있으면 오늘 날짜 기준으로 변환
- 오늘 날짜: {today}
- confidence는 0~1 사이 값
- 메모의 카테고리는 최대 2개까지만 출력
- 반드시 유효한 JSON만 출력하세요. 다른 텍스트는 포함하지 마세요."""


# ============ AI Analysis Functions ============

def analyze_with_claude(content: str = None, image_base64: str = None, pdf_base64: str = None) -> tuple[dict, float]:
    start_time = time.time()
    client = anthropic.Anthropic(api_key=anthropic_key)
    today = datetime.now().strftime("%Y-%m-%d")
    prompt = ANALYSIS_PROMPT.format(today=today)

    messages_content = []

    # PDF 직접 전송
    if pdf_base64:
        messages_content.append({
            "type": "document",
            "source": {
                "type": "base64",
                "media_type": "application/pdf",
                "data": pdf_base64
            }
        })
        messages_content.append({"type": "text", "text": prompt + "\n\n이 PDF 문서를 분석해주세요."})
    # 이미지 전송
    elif image_base64:
        messages_content.append({
            "type": "image",
            "source": {"type": "base64", "media_type": "image/png", "data": image_base64}
        })
        messages_content.append({"type": "text", "text": prompt + "\n\n이 이미지를 분석해주세요."})
    # 텍스트 전송
    else:
        messages_content.append({"type": "text", "text": prompt + f"\n\n분석할 내용:\n{content}"})

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        messages=[{"role": "user", "content": messages_content}]
    )
    elapsed = time.time() - start_time
    return parse_json_response(response.content[0].text), elapsed


def analyze_with_gpt4(content: str = None, image_base64: str = None) -> tuple[dict, float]:
    """GPT-4는 PDF 직접 지원 안 함 - 이미지 또는 텍스트만"""
    start_time = time.time()
    client = openai.OpenAI(api_key=openai_key)
    today = datetime.now().strftime("%Y-%m-%d")
    prompt = ANALYSIS_PROMPT.format(today=today)

    messages_content = []
    if image_base64:
        messages_content.append({"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_base64}"}})
        messages_content.append({"type": "text", "text": prompt + "\n\n이 이미지를 분석해주세요."})
    else:
        messages_content.append({"type": "text", "text": prompt + f"\n\n분석할 내용:\n{content}"})

    response = client.chat.completions.create(
        model="gpt-4o",
        max_tokens=1024,
        messages=[{"role": "user", "content": messages_content}]
    )
    elapsed = time.time() - start_time
    return parse_json_response(response.choices[0].message.content), elapsed


def analyze_with_gemini(content: str = None, image: Image.Image = None, pdf_bytes: bytes = None) -> tuple[dict, float]:
    start_time = time.time()
    today = datetime.now().strftime("%Y-%m-%d")
    prompt = ANALYSIS_PROMPT.format(today=today)

    model = genai.GenerativeModel('gemini-2.0-flash-exp')

    # PDF 직접 전송
    if pdf_bytes:
        # Gemini는 파일 업로드 방식 사용
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(pdf_bytes)
            tmp_path = tmp.name

        uploaded_file = genai.upload_file(tmp_path, mime_type="application/pdf")
        response = model.generate_content([
            prompt + "\n\n이 PDF 문서를 분석해주세요.",
            uploaded_file
        ])
        # 임시 파일 삭제
        os.unlink(tmp_path)
    # 이미지 전송
    elif image:
        response = model.generate_content([
            prompt + "\n\n이 이미지를 분석해주세요.",
            image
        ])
    # 텍스트 전송
    else:
        response = model.generate_content(prompt + f"\n\n분석할 내용:\n{content}")

    elapsed = time.time() - start_time
    return parse_json_response(response.text), elapsed


def parse_json_response(text: str) -> dict:
    try:
        json_match = re.search(r'```json\s*([\s\S]*?)\s*```', text)
        if json_match:
            return json.loads(json_match.group(1))
        json_match = re.search(r'\{[\s\S]*\}', text)
        if json_match:
            return json.loads(json_match.group())
    except json.JSONDecodeError:
        pass
    return {"error": "JSON 파싱 실패", "raw": text}


# ============ Main App ============

# 입력 타입 선택
st.subheader("1. 입력")
input_type = st.radio("입력 타입", ["이미지", "텍스트", "PDF"], horizontal=True)

content_to_analyze = None
image_for_gemini = None
image_base64_for_vision = None
pdf_bytes_for_api = None
pdf_mode = None

if input_type == "이미지":
    uploaded_file = st.file_uploader("이미지 업로드", type=["png", "jpg", "jpeg", "webp", "gif", "bmp"])
    if uploaded_file:
        image = Image.open(uploaded_file)
        st.image(image, caption="업로드된 이미지", use_container_width=True)
        image_for_gemini = image
        image_base64_for_vision = image_to_base64(image)

elif input_type == "텍스트":
    text_input = st.text_area("텍스트 입력", height=150, placeholder="예: 내일 오전 9시 타운홀에서 개발 회의")
    if text_input:
        content_to_analyze = text_input

elif input_type == "PDF":
    if not pdf_available:
        st.error("PDF 처리를 위해 PyMuPDF가 필요합니다.")
    else:
        uploaded_pdf = st.file_uploader("PDF 업로드", type=["pdf"])
        if uploaded_pdf:
            pdf_bytes = uploaded_pdf.getvalue()

            # PDF 처리 방식 선택
            pdf_mode = st.radio(
                "PDF 처리 방식",
                ["PDF 직접 전송 (Claude, Gemini)", "이미지로 변환 (모든 AI)", "텍스트 추출 (빠름)"],
                horizontal=True
            )

            # 안내 메시지
            if pdf_mode == "PDF 직접 전송 (Claude, Gemini)":
                st.info("📄 PDF를 직접 API로 전송합니다. Claude와 Gemini만 지원됩니다.")
            elif pdf_mode == "이미지로 변환 (모든 AI)":
                st.info("🖼️ PDF를 이미지로 변환하여 분석합니다. 모든 AI에서 사용 가능합니다.")
            else:
                st.info("📝 PDF에서 텍스트만 추출합니다. 가장 빠르지만 이미지는 분석되지 않습니다.")

            # 미리보기
            col_preview1, col_preview2 = st.columns(2)

            # 텍스트 추출 미리보기
            extracted_text = pdf_to_text(pdf_bytes)
            with col_preview1:
                st.markdown("**추출된 텍스트:**")
                if extracted_text.strip():
                    st.text_area("텍스트 미리보기", extracted_text[:500], height=150, disabled=True)
                else:
                    st.warning("텍스트가 감지되지 않았습니다.")

            # 이미지 변환 미리보기
            pdf_images = pdf_to_images(pdf_bytes)
            with col_preview2:
                st.markdown("**PDF 이미지:**")
                if pdf_images:
                    st.image(pdf_images[0], caption=f"첫 페이지 (총 {len(pdf_images)}페이지)", use_container_width=True)

            # 선택에 따라 데이터 설정
            if pdf_mode == "PDF 직접 전송 (Claude, Gemini)":
                pdf_bytes_for_api = pdf_bytes

            elif pdf_mode == "이미지로 변환 (모든 AI)":
                if pdf_images:
                    image_for_gemini = pdf_images[0]
                    image_base64_for_vision = image_to_base64(pdf_images[0])
                else:
                    st.error("이미지 변환에 실패했습니다.")

            elif pdf_mode == "텍스트 추출 (빠름)":
                if extracted_text.strip():
                    content_to_analyze = extracted_text
                else:
                    st.warning("텍스트가 없습니다. 다른 방식을 선택해주세요.")

# AI 선택 및 분석
if content_to_analyze or image_base64_for_vision or pdf_bytes_for_api:
    st.subheader("2. AI 선택")

    # PDF 직접 전송 모드일 때 GPT-4 비활성화
    if pdf_mode == "PDF 직접 전송 (Claude, Gemini)":
        col1, col2, col3 = st.columns(3)
        with col1:
            use_claude = st.checkbox("Claude", value=bool(anthropic_key), disabled=not anthropic_key)
        with col2:
            use_gpt4 = st.checkbox("GPT-4 (미지원)", value=False, disabled=True)
            st.caption("PDF 직접 전송 미지원")
        with col3:
            use_gemini = st.checkbox("Gemini", value=bool(google_api_key and gemini_available), disabled=not (google_api_key and gemini_available))
    else:
        col1, col2, col3 = st.columns(3)
        with col1:
            use_claude = st.checkbox("Claude", value=bool(anthropic_key), disabled=not anthropic_key)
        with col2:
            use_gpt4 = st.checkbox("GPT-4", value=False, disabled=not openai_key)
        with col3:
            use_gemini = st.checkbox("Gemini", value=bool(google_api_key and gemini_available), disabled=not (google_api_key and gemini_available))

    if st.button("분석 시작", type="primary"):
        results = {}

        with st.spinner("분석 중..."):
            # PDF 직접 전송 모드
            if pdf_bytes_for_api:
                pdf_base64 = base64.b64encode(pdf_bytes_for_api).decode("utf-8")

                if use_claude:
                    try:
                        result, elapsed = analyze_with_claude(pdf_base64=pdf_base64)
                        results["Claude"] = {"data": result, "time": elapsed}
                    except Exception as e:
                        results["Claude"] = {"data": {"error": str(e)}, "time": 0}

                if use_gemini:
                    try:
                        result, elapsed = analyze_with_gemini(pdf_bytes=pdf_bytes_for_api)
                        results["Gemini"] = {"data": result, "time": elapsed}
                    except Exception as e:
                        results["Gemini"] = {"data": {"error": str(e)}, "time": 0}

            # 이미지 또는 텍스트 모드
            else:
                if use_claude:
                    try:
                        result, elapsed = analyze_with_claude(content_to_analyze, image_base64_for_vision)
                        results["Claude"] = {"data": result, "time": elapsed}
                    except Exception as e:
                        results["Claude"] = {"data": {"error": str(e)}, "time": 0}

                if use_gpt4:
                    try:
                        result, elapsed = analyze_with_gpt4(content_to_analyze, image_base64_for_vision)
                        results["GPT-4"] = {"data": result, "time": elapsed}
                    except Exception as e:
                        results["GPT-4"] = {"data": {"error": str(e)}, "time": 0}

                if use_gemini:
                    try:
                        result, elapsed = analyze_with_gemini(content_to_analyze, image_for_gemini)
                        results["Gemini"] = {"data": result, "time": elapsed}
                    except Exception as e:
                        results["Gemini"] = {"data": {"error": str(e)}, "time": 0}

        # ============ 결과 표시 ============
        st.subheader("3. 분석 결과")

        # 시간 비교 차트
        time_data = {name: info["time"] for name, info in results.items() if info["time"] > 0}
        if time_data:
            st.markdown("#### 소요 시간 비교")
            st.bar_chart(time_data)

        for ai_name, info in results.items():
            result = info["data"]
            elapsed_time = info["time"]

            with st.container():
                col_title, col_time = st.columns([3, 1])
                with col_title:
                    st.markdown(f"### {ai_name}")
                with col_time:
                    if elapsed_time > 0:
                        st.metric("소요 시간", f"{elapsed_time:.2f}초")

                if "error" in result:
                    st.error(f"오류: {result['error']}")
                    if "raw" in result:
                        st.text(result["raw"])
                    continue

                result_type = result.get("type", "")

                # 일정인 경우
                if result_type == "schedule":
                    st.markdown("#### 📅 일정")

                    col1, col2 = st.columns(2)
                    with col1:
                        st.markdown(f"""
| 항목 | 내용 |
|------|------|
| **시간** | {result.get('time', '-')} |
| **장소** | {result.get('place', '-')} |
| **요약** | {result.get('summary', '-')} |
                        """)

                    with col2:
                        categories = result.get('categories', [])
                        st.markdown("**카테고리**")
                        cat_html = ""
                        for cat in categories:
                            cat_html += f"<span style='background-color: #4A90D9; color: white; padding: 4px 12px; border-radius: 15px; margin-right: 8px; display: inline-block; margin-bottom: 4px;'>{cat}</span>"
                        st.markdown(cat_html, unsafe_allow_html=True)

                    with st.expander("JSON 보기"):
                        st.code(json.dumps(result, ensure_ascii=False, indent=2), language="json")

                # 메모인 경우
                elif result_type == "memo":
                    st.markdown("#### 📝 메모")

                    st.markdown("**카테고리**")
                    categories = result.get('categories', [])
                    for cat in categories:
                        if isinstance(cat, dict):
                            cat_name = cat.get('category', '')
                            conf = cat.get('confidence', 0)
                            bar_color = "#4CAF50" if conf >= 0.8 else "#FFC107" if conf >= 0.5 else "#F44336"
                            st.markdown(f"""
<div style="margin-bottom: 12px;">
    <span style='background-color: #9C27B0; color: white; padding: 4px 12px; border-radius: 15px; margin-right: 8px;'>{cat_name}</span>
    <span style="color: #888; margin-left: 8px;">{conf:.0%}</span>
    <div style="background-color: #eee; border-radius: 4px; height: 8px; margin-top: 8px; max-width: 300px;">
        <div style="background-color: {bar_color}; width: {conf*100}%; height: 8px; border-radius: 4px;"></div>
    </div>
</div>
                            """, unsafe_allow_html=True)

                    with st.expander("JSON 보기"):
                        st.code(json.dumps(result, ensure_ascii=False, indent=2), language="json")

                st.divider()
