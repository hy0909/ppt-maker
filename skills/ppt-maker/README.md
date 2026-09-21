# ppt-maker

텍스트 또는 기존 PPTX를 목적별 발표자료로 만드는 스킬. 상세 워크플로우는 `SKILL.md`.

| 폴더 | 내용 |
| --- | --- |
| `app/` | 로컬 웹 화면. `cd app && npm install && node server.mjs` → http://localhost:3790. 텍스트→아웃라인은 Claude API(`ANTHROPIC_API_KEY`), 없으면 프롬프트 복사 모드 |
| `scripts/` | outline.json → deck.html / PDF / PPTX 빌드, fit·overflow 검사, PPTX 추출·검증 |
| `assets/` | deck-stage.js(슬라이드 엔진, 수정 금지), deck-editor.js(브라우저 편집), 표지 배경 |
| `references/` | 아웃라인 스키마, 유형별 목차 템플릿(A~G), 입력 질문 스크립트, 디자인 시스템 |

## 빠른 실행
```bash
cd scripts && npm install && npx playwright install chromium && pip install python-pptx pymupdf
node build_html.mjs ../../../examples/breezehome/outline.json ../../../examples/breezehome/out
node fit_slides.mjs ../../../examples/breezehome/out/deck.html
node export_pdf.mjs ../../../examples/breezehome/out/deck.html --png ../../../examples/breezehome/out/png
node build_pptx.mjs ../../../examples/breezehome/outline.json ../../../examples/breezehome/out
```
