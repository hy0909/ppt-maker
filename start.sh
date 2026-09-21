#!/bin/sh
# PPT Maker 웹 화면을 터미널에서 잠깐 실행(창을 닫으면 꺼짐). 항상 켜 두려면 ./install_service.sh 사용.
# 사용: ./start.sh   (API 키가 있으면: ANTHROPIC_API_KEY=sk-ant-... ./start.sh)
export PATH="$HOME/.local/bin:$PATH"
ROOT="$(cd "$(dirname "$0")" && pwd)"

# 글꼴이 없으면 물어보고 깐다. 설치 스크립트가 공식 배포처에서 받아 온다.
if ! ls "$HOME/Library/Fonts" "$HOME/.local/share/fonts" 2>/dev/null | grep -qi '^Pretendard'; then
  printf '본문 글꼴 Pretendard 가 없습니다. 지금 받을까요? (y/n) '
  read -r YN
  case "$YN" in y|Y) "$ROOT/install_fonts.sh" || exit 1 ;; esac
fi

cd "$ROOT/skills/ppt-maker"
PORT="${PORT:-3790}"
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "이미 실행 중입니다 → http://localhost:$PORT"
  open "http://localhost:$PORT"
  exit 0
fi
[ -d scripts/node_modules ] || (cd scripts && npm install && npx playwright install chromium)
[ -d app/node_modules ] || (cd app && npm install)
echo "→ http://localhost:$PORT  (종료: Ctrl+C)"
( sleep 1.5 && open "http://localhost:$PORT" ) &
exec node app/server.mjs "$PORT"
