#!/bin/bash

# AI 분석 서버 테스트용 더미 데이터 10개 시나리오
# 서버가 실행 중이어야 합니다 (기본 포트: 8000)

URL="http://localhost:8000/ai/analyze"

echo "=== AI 분석 서버 더미 데이터 테스트 시작 ==="

# 1. 텍스트 (명확한 일정)
echo -e "\n[테스트 1] 텍스트 (CALENDAR)"
curl -X POST $URL \
  -F "type=text" \
  -F "content=내일 오전 11시 치과 정기 검진 예약"

# 2. 텍스트 (메모)
echo -e "\n\n[테스트 2] 텍스트 (MEMO)"
curl -X POST $URL \
  -F "type=text" \
  -F "content=제주도 여행 숙소 예약하기 - 에어비앤비 확인"

# 3. 텍스트 (상대 시간 일정)
echo -e "\n\n[테스트 3] 텍스트 (상대 시간 CALENDAR)"
curl -X POST $URL \
  -F "type=text" \
  -F "content=다음주 수요일 저녁 7시 동창회 모임 장소는 강남역"

# 4. 텍스트 (할 일 메모)
echo -e "\n\n[테스트 4] 텍스트 (할 일 MEMO)"
curl -X POST $URL \
  -F "type=text" \
  -F "content=오늘의 할 일: 블로그 포스팅 작성, 운동 1시간"

# 5. 이미지 + 텍스트 (일정 추출)
echo -e "\n\n[테스트 5] 이미지 + 텍스트 (CALENDAR)"
curl -X POST $URL \
  -F "type=image" \
  -F "content=이 공연 토요일에 가자" \
  -F "file=@/Users/ijeonglim/.gemini/antigravity/brain/9f4f919e-db3f-4b67-bd99-52037e5b323f/test_concert_poster_1766076208757.png"

# 6. 이미지 + 텍스트 (메모/결제 정보)
echo -e "\n\n[테스트 6] 이미지 + 텍스트 (MEMO)"
curl -X POST $URL \
  -F "type=image" \
  -F "content=어제 먹은 고기값 정산하기" \
  -F "file=@/Users/ijeonglim/.gemini/antigravity/brain/9f4f919e-db3f-4b67-bd99-52037e5b323f/test_receipt_1766076229694.png"

# 7. 이미지 단독 (명함 분석)
echo -e "\n\n[테스트 7] 이미지 단독 (MEMO - 명함)"
curl -X POST $URL \
  -F "type=image" \
  -F "file=@/Users/ijeonglim/.gemini/antigravity/brain/9f4f919e-db3f-4b67-bd99-52037e5b323f/test_business_card_1766076250977.png"

# 8. 텍스트 (먼 미래 일정)
echo -e "\n\n[테스트 8] 텍스트 (CALENDAR - 미래)"
curl -X POST $URL \
  -F "type=text" \
  -F "content=2025년 5월 5일 어린이날 에버랜드 가기"

# 9. 텍스트 (아이디어 메모)
echo -e "\n\n[테스트 9] 텍스트 (MEMO - 아이디어)"
curl -X POST $URL \
  -F "type=text" \
  -F "content=아이디어: 인공지능을 활용한 요리 추천 앱"

# 10. 텍스트 (반복 일정)
echo -e "\n\n[테스트 10] 텍스트 (CALENDAR - 반복)"
curl -X POST $URL \
  -F "type=text" \
  -F "content=매주 월요일 오전 9시 주간 회의 (장소: 대회의실)"

echo -e "\n\n=== 모든 테스트 완료 ==="
