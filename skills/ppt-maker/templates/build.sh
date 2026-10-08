#!/usr/bin/env bash
# 템플릿 24종 견본 덱을 다시 만든다.
#   원본: skills/ppt-maker/templates/outline.json (레이아웃마다 한 장, 장마다 notes 에 "TPL 번호")
#   결과: docs/templates/deck.html + thumbs/NN.png  → 디자인 시스템 화면 "템플릿 24종" 이 이 썸네일을 쓴다
# 디자인 값(컬러·글꼴·크기)을 바꾼 뒤 한 번 돌리면 견본과 썸네일이 새 값으로 바뀐다.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
S="$HERE/../scripts"
OUT="$HERE/../../../docs/templates"
node "$S/build_html.mjs" "$HERE/outline.json" "$OUT"
node "$S/fit_slides.mjs" "$OUT/deck.html"
node "$S/check_overflow.mjs" "$OUT/deck.html" | head -1
node "$S/template_thumbs.mjs" "$OUT/deck.html" "$OUT/thumbs"
rm -f "$OUT/audit.json" "$OUT/fit.json"   # 빌드 중간 파일은 웹에 올리지 않는다
