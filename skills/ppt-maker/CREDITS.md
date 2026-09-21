# 가져온 것과 출처

ppt-maker 가 오픈소스에서 가져온 생각과, 그 출처다. 코드를 그대로 복사한 곳은 없고 규칙과 판단 기준을 우리 구조에 맞춰 다시 썼다.
어떤 레포를 왜 봤는지는 `docs/03_opensource-analysis.md` 에 있다.

| 가져온 것 | 어디에 들어갔나 | 출처 | 라이선스 |
| --- | --- | --- | --- |
| 외톨이 어절·조사 방지 (`korean-orphan`) | `scripts/lib/common.mjs` 의 `tieTail()`, `scripts/check_overflow.mjs` | [kez-lab/korean-presentation-skill](https://github.com/kez-lab/korean-presentation-skill) | MIT |
| 검사 규칙을 error/warn 으로 나누고 결과를 `audit.json` 으로 남기는 방식 | `scripts/check_overflow.mjs` | 같은 곳 | MIT |
| 줄상자 단위로 겹침을 재는 방법 (여러 줄로 접힌 인라인 요소의 전체 상자는 실제 잉크가 아니다) | `scripts/check_overflow.mjs` 의 `text-collision` | 같은 곳 | MIT |
| 어절 중간 잘림 방지를 슬라이드 루트에 한 번만 거는 방식 (`word-break:keep-all`) | `scripts/build_html.mjs` 의 `.slide` | 같은 곳 | MIT |

## 봤지만 아직 안 가져온 것

| 무엇 | 어디 | 왜 미뤘나 |
| --- | --- | --- |
| 템플릿 카탈로그를 "이럴 때 / 이게 아닐 때 / 필요한 값 / 예시" 네 항목으로 적는 형식 | [seulee26/mckinsey-pptx](https://github.com/seulee26/mckinsey-pptx) (MIT) | 기획서 6.5 표를 먼저 고쳐야 한다 |
| 고른 레이아웃의 이유를 한 줄로 남기게 하는 규칙 | 같은 곳 | 위와 같이 |
| 문장 린터 (불릿이 명사구인지, 길이가 고른지, 제목이 병렬인지) | [jkkms/ppt-deck](https://github.com/jkkms/ppt-deck) (MIT) | 다음 차례 |
| 레이아웃 배정을 전체 1회로 끝내는 호출 구조 | [presenton/presenton](https://github.com/presenton/presenton) (Apache-2.0) | AI 단계를 손볼 때 같이 |
| 장 역할 분류와 결과물 채점 (PPTEval) | [icip-cas/PPTAgent](https://github.com/icip-cas/PPTAgent) (MIT) | 기존 PPTX 개선 모드를 손볼 때 |

## 글꼴

| 글꼴 | 출처 | 라이선스 |
| --- | --- | --- |
| Pretendard (본문) | [orioncactus/pretendard](https://github.com/orioncactus/pretendard) | SIL Open Font License 1.1 |
| Paperlogy (표지·섹션 제목) | [Freesentation/paperlogy](https://github.com/Freesentation/paperlogy) | SIL Open Font License 1.1 |

글꼴 파일은 이 저장소에 넣지 않는다. `./install_fonts.sh` 가 위 두 곳에서 받아 깐다.
OFL 은 글꼴 파일에만 걸리므로, 이 저장소의 이용 조건과 서로 영향을 주지 않는다.
