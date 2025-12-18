#!/bin/bash

# ==========================================
#  One Gate AI Server 자동 배포 스크립트
# ==========================================

# 1. 변수 설정 (경로 및 포트)
PROJECT_DIR="/home/ubuntu/one-gate/backend"
LOG_FILE="$PROJECT_DIR/server.log"
PORT=8000

echo "🚀 [1/4] 배포를 시작합니다..."

# 2. 프로젝트 폴더로 이동
cd $PROJECT_DIR || { echo "❌ 폴더 이동 실패"; exit 1; }

# 3. Git Pull (최신 코드 받아오기)
echo "📥 [2/4] 최신 코드를 받아옵니다 (git pull)..."
git pull

# 4. 기존 서버 종료 (포트 8000번을 쓰는 프로세스 찾아서 죽이기)
# lsof -t -i:8000 은 PID 숫자만 깔끔하게 가져옵니다.
CURRENT_PID=$(lsof -t -i:$PORT)

if [ -z "$CURRENT_PID" ]; then
    echo "📭 실행 중인 서버가 없어 종료 절차를 건너뜁니다."
else
    echo "🛑 [3/4] 기존 서버(PID: $CURRENT_PID)를 종료합니다..."
    kill -9 $CURRENT_PID
    sleep 2 # 확실히 죽을 때까지 2초 대기
fi

# 5. 서버 재시작 (nohup)
echo "🔥 [4/4] 서버를 재시작합니다..."
source venv/bin/activate
nohup uvicorn main:app --reload --host 0.0.0.0 --port $PORT > $LOG_FILE 2>&1 &

echo "✅ 배포 완료! (잠시 후 로그가 출력됩니다. 나가려면 Ctrl+C)"
echo "-------------------------------------------------------"
sleep 1
tail -f $LOG_FILE