# CLAUDE.md

이 레포는 PPT 제작 스킬(`skills/ppt-maker`) 개발 저장소다. 스킬로 발표자료를 만들 때는 `skills/ppt-maker/SKILL.md`를 따른다.

- 소스는 항상 `outline.json`. `deck.html`/`deck.pptx`는 재생성 산출물이므로 직접 고치지 않는다.
- `assets/deck-stage.js`, `deck-editor.js`는 safeai-deck-template 레퍼런스와 동일하게 유지(수정 금지).
- 빌드 순서: build_html → fit_slides → check_overflow → export_pdf → build_pptx → verify_pptx.
- 완료 선언 전: 오버플로 0, 썸네일 직접 확인, PPTX out-of-bounds 0, 번호 정합성.
- 원문에 없는 수치·로고·회사 정보를 만들지 않는다.
