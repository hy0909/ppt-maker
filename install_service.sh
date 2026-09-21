#!/bin/sh
# PPT Maker 서버를 macOS 로그인 서비스(launchd)로 등록/해제. 항상 켜져 있고, 죽으면 자동 재시작.
# 사용: ./install_service.sh          (등록 + 시작)
#       ./install_service.sh remove   (해제)
#       ./install_service.sh restart  (코드 수정 후 재시작)
LABEL="local.ppt-maker"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
ROOT="$(cd "$(dirname "$0")" && pwd)"
APP="$ROOT/skills/ppt-maker"
PORT="${PORT:-3790}"
NODE="$(command -v node || echo /usr/local/bin/node)"
UID_="$(id -u)"
LOG="$APP/app/workspace/server.log"

case "$1" in
  remove)
    launchctl bootout "gui/$UID_/$LABEL" 2>/dev/null; rm -f "$PLIST"; echo "해제했습니다."; exit 0;;
  restart)
    launchctl kickstart -k "gui/$UID_/$LABEL" && echo "재시작 → http://localhost:$PORT"; exit 0;;
esac

ls "$HOME/Library/Fonts" 2>/dev/null | grep -qi '^Pretendard' || "$ROOT/install_fonts.sh"
[ -d "$APP/scripts/node_modules" ] || (cd "$APP/scripts" && npm install && npx playwright install chromium)
[ -d "$APP/app/node_modules" ] || (cd "$APP/app" && npm install)

cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>$APP/app/server.mjs</string><string>$PORT</string></array>
  <key>WorkingDirectory</key><string>$APP</string>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>$HOME/.local/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
    <key>HOME</key><string>$HOME</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>5</integer>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
PL

launchctl bootout "gui/$UID_/$LABEL" 2>/dev/null
launchctl bootstrap "gui/$UID_" "$PLIST" && launchctl kickstart "gui/$UID_/$LABEL"
sleep 1.5
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "등록 완료. 로그인하면 자동으로 켜지고, 꺼지면 다시 살아납니다 → http://localhost:$PORT"
  echo "로그: $LOG   해제: ./install_service.sh remove"
else
  echo "시작 실패. 로그 확인: tail -50 $LOG"; exit 1
fi
