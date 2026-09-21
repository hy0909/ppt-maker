# 제삼자 자료 및 의존성

| 항목 | 출처 | 라이선스 | 이 저장소에서의 취급 |
|------|------|---------|------------------|
| `skills/ppt-maker/assets/deck-stage.js` | safeai-deck-template | SafeAI copyright | SafeAI 허락으로 포함; 재사용 허락 없음 |
| `skills/ppt-maker/assets/deck-editor.js` | safeai-deck-template | SafeAI copyright | SafeAI 허락으로 포함; 재사용 허락 없음 |
| `skills/ppt-maker/assets/cover-bg/*` | SafeAI (AI 생성) | SafeAI copyright | AI 도구로 생성; 재사용 허락 없음 |
| `skills/ppt-maker/assets/logo_*.png` | SafeAI | Trademark | 기본값으로 들어 있다. 자기 로고로 바꿔 쓸 수 있다 |
| Pretendard 글꼴 | [orioncactus/pretendard](https://github.com/orioncactus/pretendard) | SIL Open Font License 1.1 | 파일 미포함. `./install_fonts.sh` 가 받아 깐다 |
| Paperlogy 글꼴 | [Freesentation/paperlogy](https://github.com/Freesentation/paperlogy) (Lee Juim / PT&) | SIL Open Font License 1.1 | 파일 미포함. `./install_fonts.sh` 가 받아 깐다 |
| @anthropic-ai/sdk | npm | Proprietary (Anthropic) | 런타임 의존성 |
| playwright | npm | Apache License 2.0 | 개발/빌드 의존성 |
| pptxgenjs | npm | MIT | 개발/빌드 의존성 |
| python-pptx | pip | MIT | 선택적; PPTX 생성/검증용 |
| PyMuPDF (pymupdf) | pip | AGPL-3.0 | 선택적; PDF 처리용 |

**주석:**
- safeai-deck-template는 SafeAI 내부 저장소입니다. 이 저장소는 SafeAI 허락으로 관련 파일을 포함합니다.
- `logo_*.png` 는 SafeAI 상표입니다. 기본 로고로 들어 있고, 화면의 로고 칸에서 자기 로고로 바꿀 수 있습니다. 바깥에 내보내는 자료라면 바꿔 쓰는 편이 맞습니다.
- 글꼴 두 가지는 OFL 1.1 입니다. OFL 은 글꼴 파일에만 걸리며, 이 저장소의 이용 조건과 서로 영향을 주지 않습니다. 누구나 공짜로 쓰고 회사에서도 씁니다.
- PyMuPDF는 AGPL 라이선스이므로, 이를 포함해 배포하는 경우 해당 라이선스를 준수해야 합니다.
