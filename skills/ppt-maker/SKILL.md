---
name: ppt-maker
description: 텍스트 원문 또는 기존 PPTX를 목적에 맞는 발표자료(HTML 덱 + PDF + 편집 가능한 PPTX)로 제작·개선하는 스킬. 사용자가 "PPT 만들어줘", "발표자료", "제안서", "회사소개서", "IR 자료", "기존 PPT 개선/정리", "장표 구성", ".pptx로 뽑아줘"를 요청하거나 .pptx 파일을 첨부하며 재구성·디자인 개선을 요청할 때 사용한다.
---

# ppt-maker

텍스트 → **outline.json** + `design-tokens.json`(디자인 값) → `deck.html`(deck-stage.js) → PDF(Playwright) + PPTX(pptxgenjs).
사용자와 합의하는 것은 항상 **장표 구성(outline.json)**이다. HTML/PPTX는 아웃라인에서 재생성하는 산출물이지 편집 대상이 아니다.

**구성 규칙 (필독):** `references/deck-rules.md` — 모든 슬라이드의 구조, 텍스트 길이 한계, 색상·글꼴 규칙, 레이아웃 결정 사항

## 결과물
- `deck.html` : 브라우저에서 바로 발표(←→, F 전체화면), `E`키로 텍스트 직접 수정 가능
- `deck.pdf` : 제출·공유용, 슬라이드당 1페이지
- `deck.pptx` : 네이티브 텍스트·도형으로 편집 가능. 16:9 (13.333×7.5in)

**전달 파일명 규칙: `회사약칭_출력날짜`** — 약칭은 영문 소문자(`meta.fileCompany`, 기본 `deck`), 날짜는 파일을 만든 날 `YYMMDD`. 예: `acme_260821.pptx`, `acme_260821.pdf`. 웹 화면은 다운로드 시 자동 적용된다. 에이전트 방식으로 만들었을 때는 `out/deck.pptx`·`deck.pdf`를 이 이름으로 복사해 전달한다(`cp out/deck.pptx "acme_$(date +%y%m%d).pptx"`).

## 두 가지 사용 방법

| 방법 | 언제 | 실행 |
| --- | --- | --- |
| **웹 화면** (`app/`) | 사용자가 직접 유형·컬러·원문을 넣고 미리보기·다운로드까지 하고 싶을 때 | `cd app && npm install && ANTHROPIC_API_KEY=… node server.mjs` → http://localhost:3790 |
| **에이전트 대화** (이 SKILL) | Claude Code 세션에서 대화로 아웃라인을 합의하며 만들 때 | 아래 워크플로우 |

웹 화면은 같은 스크립트를 뒤에서 실행한다. API 키가 없으면 "프롬프트 복사 → Claude 에서 JSON 생성 → 붙여넣기" 경로로 동작한다. 작업 결과는 `app/workspace/<작업이름>/`에 쌓인다.

## 워크플로우

### 0. 준비 (최초 1회)
```bash
./install_fonts.sh                                        # 글꼴 두 가지 설치
cd <skill>/scripts && npm install && npx playwright install chromium
pip install python-pptx pymupdf
```
**Pretendard**(본문)와 **Paperlogy**(표지·섹션 제목) 두 글꼴이 시스템에 있어야 HTML·PDF·PPTX 글꼴이 일치한다.
`./install_fonts.sh` 가 공식 배포처에서 받아 깐다. 둘 다 SIL OFL 1.1 이라 누구나 공짜로 쓴다.
굵기마다 패밀리가 따로라 `Paperlogy 7 Bold`·`Pretendard Light` 처럼 이름을 그대로 쓴다. 본문 글꼴만 바꾸려면 `meta.font`.
표지·목차의 글자 크기·줄 간격(pt 고정)·자간·좌표는 `references/design-system.md` 의 "표지·목차 글자 규격" 표에 있고, 값은 `scripts/lib/common.mjs` 의 `TYPE`·`COVER_BOX`·`AGENDA_BOX` 한 곳에만 둔다.
표지 배경 그림은 `meta.coverBg` 로 고른다(기본 `cube`). 목록은 `assets/cover-bg/index.json`.
배경에 짝이 되는 간지 그림이 달려 있으면 간지 배경도 같이 바뀐다(지금은 `haze`). 마무리 장표는 늘 브랜드 그라데이션이다.
표지 그림 위에는 아무것도 덮지 않는다. 들어 있는 배경이 모두 왼쪽이 어두워서다. 밝은 그림을 새로 넣어 제목이 안 읽히면 그 배경만 `--scrim` 으로 켠다.
배경을 새로 넣거나 바꿀 때는 원본을 그대로 쓰지 말고 `scripts/prepare_cover_bg.py` 로 2560×1440 고화질 처리를 거친다.
글자·로고가 얹힌 완성 장표를 배경으로 받았으면 `scripts/strip_cover_text.py` 로 글자를 먼저 지운다. 자세한 건 `references/design-system.md`.

**배경을 새로 넣거나 바꿀 때는 원본을 그대로 넣지 말고 반드시 이 스크립트를 쓴다.**
```bash
python3 <skill>/scripts/prepare_cover_bg.py <원본이미지> <키> --label "이름" [--replace 바꿀키]
```
그림 종류(줄무늬·그래픽·사진/하프톤)를 재서 맞는 방법으로 2560×1440 으로 키우고, 무손실이 더 작으면 무손실로 저장하고, `index.json` 까지 고친다. 자세한 규칙은 `references/design-system.md` 의 "배경을 새로 넣거나 바꿀 때".

### 1. 입력 수집 — `references/intake-questions.md`
공통(모드·목적·유형·제출조건·읽는방식·컬러·로고·표지배경·표지정보) → 유형별 질문. 원문에서 추론할 수 있는 것은 추론값을 내놓고 확인만 받는다. 한 번에 다 묻지 않는다.

**PPT 를 구분하는 기준 세 가지** — 목적(제안서·보고서·소개서), 제출 조건(자유 양식·지정 양식), 읽는 방식(발표용·제출열람용).
읽는 방식이 곧 밀도다: 발표용 `airy`, 제출·열람용 `dense`. 지정 양식이면 분량·목차 제한을 먼저 받아 적고 그 안에서 섹션을 줄인다.

| 목적 | 문서 유형 | `meta.type` | 읽는 방식 기본값 |
| --- | --- | --- | --- |
| 제안서 | 기술 제안서 | `tech-proposal` | 제출·열람용 |
| 제안서 | 고객사 제안서 | `client-proposal` | 제출·열람용 |
| 보고서 | 진행 보고서 | `progress-report` | 제출·열람용 |
| 보고서 | 내부 진행보고 | `internal-report` | 발표용 |
| 소개서 | 회사 소개서 | `company-intro` | 발표용 |
| 소개서 | IR (투자자) | `ir` | 발표용 |

목차 골격과 장수·레이아웃은 `references/outline-templates.md`.

### 2. 아웃라인 작성 — `references/outline-schema.md`
1. 유형 템플릿의 섹션 순서를 따르되, 원문에 근거가 없는 섹션은 넣지 않는다(빈 자리는 `[입력 필요: …]`).
2. 장표마다 `title`(주제)과 `lead`(결론 1~2문장)를 새로 쓴다. 원문을 그대로 붙이지 않는다.
3. 본문은 `columns / cards / process / table / stats / compare / image / timeline / callout` 중 구조에 맞는 블록으로. `bullets`는 최후의 수단.
4. **표를 넣을 때는 강조할 열을 사용자에게 먼저 묻는다.**
5. 수치·시장규모·고객명은 원문에 있는 것만. 같은 개념은 문서 전체에서 한 표현으로 통일.
6. 사용자에게 보여주고 확인받는다: 섹션 목록, 장표별 제목+리드+블록 타입, `[입력 필요]` 목록.

저장 위치: `<작업폴더>/outline.json`. 이미지는 `<작업폴더>/out/assets/`에 두고 `assets/파일명`으로 참조.

### 3. 빌드
```bash
S=<skill>/scripts; W=<작업폴더>
node $S/build_html.mjs   $W/outline.json $W/out          # deck.html (+ 엔진·로고 복사)
node $S/fit_slides.mjs   $W/out/deck.html                # 장표별 본문 배율 계산 → deck.html, fit.json
node $S/check_overflow.mjs $W/out/deck.html              # 검사 8종 → out/audit.json (error 있으면 exit 1)
node $S/export_pdf.mjs   $W/out/deck.html --png $W/out/png --scale 0.5   # PDF + 썸네일
node $S/build_pptx.mjs   $W/outline.json $W/out          # deck.pptx (fit.json 반영)
python3 $S/verify_pptx.py $W/out/deck.pptx --render $W/out/png_pptx      # OOXML 규격 검사(validate_pptx.py) + 구조 검사(경계 밖·크기 0 도형) + 렌더 → PNG (LibreOffice headless)
cp $W/out/deck.pptx "$W/acme_$(date +%y%m%d).pptx"; cp $W/out/deck.pdf "$W/acme_$(date +%y%m%d).pdf"   # 전달용 이름
```
PPTX 렌더 확인용 LibreOffice 설치(한 번만): `brew install --cask libreoffice` 후 한글 글꼴을 번들 폴더에 복사 `cp ~/Library/Fonts/Pretendard-*.otf /Applications/LibreOffice.app/Contents/Resources/fonts/truetype/`. **PowerPoint 를 AppleScript 로 여닫는 방식은 사용자 화면에 창·권한 확인창이 떠서 쓰지 않는다**(LibreOffice 가 없을 때만 폴백).

순서가 중요하다: `fit_slides` 다음에 PDF와 PPTX를 만들어야 글자 크기가 맞는다. 아웃라인을 고치면 1번부터 다시.

### 3-1. 글·표기 규칙 (2026-09-14, 사용자 확정)
- **제목은 명사형으로 끝낸다**: "…세 기능으로 구성" / "…24주 일정". "~한다·~합니다·~이다" 금지. 강조(`**…**`)는 색이 아니라 굵기로만.
- **장표 위 작은 글씨(아이브로우)는 그 장표가 속한 목차(섹션) 이름 하나만.** `header`·`subtitle` 필드는 쓰지 않는다.
- **번호는 1·2·3 숫자.** 로마숫자(i·ii·iii) 표기 금지.
- **사람이 쓴 보고서 문체.** "본 자료는", "~를 통해 ~할 수 있습니다", 빈 수식어(효율적·체계적), 같은 어미 반복 금지. 껍데기 소제목("화면", "내용") 금지.
- **카드 안 줄 간격은 내용량에 맞춰 자동**(적으면 넓게, 많으면 좁게). 카드 밖으로 넘치지 않는다.
- 이미지 경로는 지어내지 않는다. 파일이 없으면 자리표시자로 그려진다.
- 출처도 지어내지 않는다. 수치에 근거가 필요한데 받지 못했으면 `[출처 필요]` 로 남긴다. 장표 아래 출처 줄은 `slide.source`(여럿이면 한 줄로 묶임) · `slide.footnote` 로 쓴다.
이 규칙들이 적힌 곳: 디자인 규칙 `references/design-system.md`, 스키마 `references/outline-schema.md`, AI 생성 규칙 `app/server.mjs` 의 `systemPrompt()`, 렌더러 `scripts/build_html.mjs`·`build_pptx.mjs`.

### 4. 검수 (완료 선언 전 필수)
- `check_overflow` 의 `error` 0. `fit_slides`가 "still overflowing" 경고를 낸 장표는 내용을 나눈다.
  결과는 `out/audit.json` 에 남는다. 규칙 8종과 수준은 이렇다.

  | 규칙 | 수준 | 내용 |
  | --- | --- | --- |
  | `canvas-overflow` | error | 1280×720 밖으로 나감 |
  | `clipped` | error | 칸보다 내용이 길어 잘림 |
  | `safe-area` | error | 좌우 `--pad`·아래 `--safe-bottom` 침범 (본문 장) |
  | `low-contrast` | error/warn | 글자와 실제 배경색 대비가 AA 미달 (본문 장) |
  | `font-too-small` | warn | 발표용 13pt·제출용 10pt 미만 (본문 장) |
  | `korean-orphan` | warn | 마지막 줄에 두 글자 이하나 조사만 남음 |
  | `text-collision` | warn | 줄상자끼리 30% 넘게 겹침 |
  | `vertical-imbalance` | warn | 본문 아래가 캔버스의 28% 넘게 빔 |
  | `layout-run` | warn | 같은 구성의 장이 3연속 |

  표지·간지·마무리는 배경이 이미지나 어두운 판이라 대비를 숫자로 잴 수 없다. 대비·글자 크기는 본문 장만 본다.
  머리말·꼬리말·쪽번호(`.eyebrow` `.foot` `.ft` `.pn` `.pg` `.pgno` `.prog`)는 본문이 아니라 검사에서 뺀다.
- 한글 조판은 만드는 단계에서 막는다. `.slide` 에 `word-break:keep-all` 을 걸어 어절 중간 잘림을 막고,
  `tieTail()`(`lib/common.mjs`)이 마지막 어절이 두 글자 이하면 앞 어절과 NBSP 로 묶는다. HTML 과 PPTX 양쪽에 같이 들어간다.
- 썸네일(`out/png/*.png`)을 **직접 읽어** 확인: 여백 40% 이상인 장표 없음, 자리표시자 `[ … ]`가 남아 있으면 사용자에게 이미지 요청, 제목이 결론형인지, 한 장표에 메시지 하나인지.
- `verify_pptx.py` 종료코드 0 (OOXML 규격 위반·경계 밖 도형 0). 렌더 PNG로 HTML과 레이아웃이 같은지 눈으로 비교.
  - pptxgenjs 에 넘기는 옵션 객체(그림자 등)는 **호출마다 새로 만든다**. 같은 객체를 재사용하면 라이브러리가 제자리에서 변환해 값이 계속 커지고, PowerPoint 가 파일을 '복구'하며 내용을 버린다(2026-09-14 사고).
- 페이지 번호·섹션 번호·목차가 서로 맞는지.

### 5. 피드백 루프
미리보기는 `out/deck.html`을 브라우저 패널로 열어 보여준다(썸네일 레일 포함). 수정 요청은 아웃라인에 반영 → 3번 재실행. 사용자가 `E`키 편집 모드로 직접 고친 HTML이 있으면 그 변경을 아웃라인에 역반영한 뒤 재빌드한다(덮어쓰지 않는다).

## 기존 PPTX 개선 모드
```bash
python3 $S/extract_pptx.py <원본.pptx> $W/outline.json --images $W/out/assets
```
1. 초안 아웃라인이 나온다(장표별 `bullets` + `_raw` 텍스트박스 좌표·이미지). 유형 6가지 중 하나를 골라 매핑표를 보여주고 확인받는다.
2. 각 장표의 `bullets`를 구조 블록으로 재구성하고 `title`/`lead`를 새로 쓴다. **원문 의미와 수치는 유지.** `_raw`는 확인 후 삭제.
3. 개선 방향(가독성/통일/흐름/요약/표 단순화)에 따라 장표 분할·병합·부록 이동을 제안하고, 이후는 신규 제작과 같다.

## 디자인 규칙 (요약 — 상세는 `references/design-system.md`)
- 색은 `meta.brand.primary` 하나에서 파생. 임의 hex 금지. 군·공공 제출용은 네이비 계열 제안.
- 이모지 금지. 로고는 이미지로만(텍스트 대체 금지). 배경 이미지로 가독성 해치지 않기.
- 디자인은 미니멀 카드 리포트 스타일(2026-09 채택, 네이비/블루 팔레트). 장표 문법: **아이브로우**(섹션명 · **장 제목** `header`, 오른쪽 페이지 번호) → **헤드라인** `title`(결론형, 핵심 구절 `**강조**`) → 구분선 → `lead`(집계 기간·전제 한 줄) → 연회색 배경 위 **흰 카드**(카드 위 네이비 라벨 칩, 카드 안 "| 소제목") → 맨 아래 `callout` 배너(흰 라벨 칩 + 불릿). 수치는 `rows`+`highlight`·`stat`·`chart` 로 시각화. 표지(골드 pill·docType·orgs)·목차·간지·마무리는 자동.
- 밀도: `dense`(심사·제출, A/B/C 기본) / `airy`(발표·경영진, D/E/G 기본). 본문 크기는 `fit_slides`가 채운다.
- PDF-unsafe CSS(`background-clip:text`, `filter:blur`, `backdrop-filter`, colored `box-shadow`)는 렌더러가 쓰지 않는다. 손으로 HTML을 고칠 때도 금지.

## 하지 않는 것
- 사용자가 주지 않은 수치·로고·회사 정보 생성. 사업 전략 대신 수립. 애니메이션·영상.
- HTML 파일 직접 편집으로 마무리(아웃라인이 소스). 기존 PPTX의 수치 변경.

## 파일
```
ppt-maker/
├── SKILL.md
├── app/       server.mjs (로컬 웹 화면: 설정→입력→장표 구성 편집→PPT 만들기→미리보기·다운로드) · index.html · workspace/
├── scripts/   build_html.mjs · fit_slides.mjs · check_overflow.mjs · export_pdf.mjs · build_pptx.mjs (예전 디자인: *_classic.mjs)
│              extract_pptx.py · verify_pptx.py · lib/common.mjs · package.json
├── assets/    deck-stage.js · deck-editor.js · cover-bg/
├── references/ outline-schema.md · outline-templates.md · intake-questions.md · design-system.md
└── agents/openai.yaml
```
예제: `../../examples/breezehome/outline.json` (마케팅 월간 보고서) → `out/`.
