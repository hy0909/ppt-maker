# outline.json 스키마

빌드 파이프라인의 단일 소스. HTML(`build_html.mjs`)과 PPTX(`build_pptx.mjs`)가 같은 파일을 읽어 각각 렌더링한다.
**사용자와 합의하는 대상은 이 파일이다.** HTML을 직접 고치지 말고 아웃라인을 고쳐 재빌드한다.

```jsonc
{
  "meta": {
    "type": "gov-proposal",      // gov-proposal | client-proposal | annual-report | internal-report | company-intro | ir
    "density": "dense",          // 읽는 방식 — dense(제출·열람용) | airy(발표용)
    "coverBg": "cube",           // 표지 배경 그림. 목록은 assets/cover-bg/index.json (cube | stripe | haze | cctv | wave | cube-mono | ring)
    "pill": "기술개발",           // 마무리 장표의 골드 라벨 (짧게, 선택)
    "event": "행사·공고명",       // 표지 오른쪽 아래 상자 (선택, 없으면 docType)
    "docType": "기술 개발 방향 검토", // event 가 없을 때 상자에 들어갈 말 (선택)
    "title": "문서 제목<br>둘째 줄",  // 표지 제목(h0). <br> 로 줄바꿈
    "subtitle": "부제 한 문장",   // 표지에서 제목 위에 오는 설명줄(body2)
    "company": "주식회사 아크미",
    "fileCompany": "acme",       // 전달 파일명 앞부분(영문). 파일명 = fileCompany_YYMMDD (예 acme_260821.pptx)
    "orgs": [ { "role": "주관기관", "name": "㈜아크미" }, { "role": "연구 분야", "name": "AI Vision" } ], // 마무리 장표의 기관 칸 (선택, 없으면 company/presenter 사용)
    "presenter": "발표자",        // 선택
    "period": "사업 기간 : 2026. 01 ~ 2026. 12", // 선택 (지금 표지에는 쓰지 않는다)
    "date": "2026. 09",          // 선택 (지금 표지에는 쓰지 않는다)
    "version": "v1.0",           // 선택
    "brand": { "primary": "#14366B", "secondary": "#1E5BB8" },   // primary 필수. secondary 는 강조 파랑(제목 강조·표 강조열). 나머지 톤은 자동 파생
    "logo": { "light": "assets/logo_light.png", "dark": "assets/logo_dark.png" },   // 없으면 생략
    "font": "Pretendard",
    "contact": { "name": "", "email": "", "phone": "", "web": "" },   // 마무리 장표
    "footer": "",                // 본문 좌하단 (비우면 "i. 섹션명" 자동)
    "agenda": true,              // 목차 장표 생성
    "dividers": "auto",          // 간지: auto(목차 3개 이상이면 넣음) | true | false
    "pageNumbers": true,
    // numbering 은 쓰지 않는다 — 목차·간지 번호는 항상 1·2·3 숫자
  },
  "sections": [
    {
      "no": 1, "title": "섹션명", "subtitle": "간지에 한 줄로 붙는 설명 (선택)", "en": "간지 왼쪽 위 표기 (선택, 없으면 CHAPTER 0N)",
      "slides": [
        {
          // header·subtitle 은 쓰지 않는다 — 장표 위 작은 글씨에는 목차(섹션) 이름만 나온다
          "subtitle": "헤더 바 제목 옆 짧은 부제 (선택)",
          "title": "결론형 헤드라인. **핵심 구절**을 굵게 → 파란색 강조",
          "lead": "헤드라인을 뒷받침하는 설명 2~3문장 (제목 오른쪽 회색 본문)",
          "notes": "발표자 노트 (PPTX에만 들어감, 선택)",
          "source": "통계청 「2025 가구 에너지 통계」, 2026.03",   // 출처. 배열도 됨 → ' · ' 로 묶어 한 줄
          "footnote": "* 반올림으로 합계가 100%가 아닐 수 있음",   // 각주. 배열이면 한 줄에 하나씩
          "blocks": [ /* 아래 블록 1~3개, 세로로 쌓임 */ ]
        }
      ]
    }
  ],
  "closing": { "message": "감사합니다", "sub": "한 줄" },   // false 로 생략
  "appendix": [ /* slide 객체 배열. 헤더 태그가 APPENDIX 로 표기 */ ]
}
```

장표 상단 구조(본문·부록, 미니멀 스타일): **아이브로우**(작은 회색 글씨로 목차(섹션) 이름 하나만, 오른쪽 끝 페이지 번호) → **헤드라인** `title` 30px → 가는 구분선 → **`lead`**(16px 회색, 1~2줄: 집계 기간·전제·근거 요약) → 본문(연회색 배경 위 흰 카드들) → 맨 아래 `callout` 배너. 헤더 바·푸터는 없다. `title` 은 "무엇" 이 아니라 **"그래서 결론이 무엇인가"** 를 담되 **문장이 아니라 명사형으로 끝낸다**("…세 기능으로 구성"). 핵심 구절만 `**…**` 로 감싼다(한 제목에 강조 1곳, 색은 바뀌지 않고 굵기만).

## 블록 타입

모든 블록은 `"flex": 1` (세로 비중, 선택)과 `"label": "소제목"` (블록 위 네이비 칩, 선택)을 가질 수 있다. `callout`은 내용 높이만 차지한다.
`items` 원소는 `"문장"` 또는 `{ "k": "키워드", "v": "설명" }` (k 는 굵게, v 는 아래 줄).

| type | 필드 | 용도 | 권장 개수 |
| --- | --- | --- | --- |
| `columns` | `columns:[{heading, items?, sections?:[{heading, items}], stat?:{sub, value, desc}, chart?:{…chart 블록 필드}, rows?, highlight?, text?, image?, caption?, flex?, tint?}]`, `tintLast?`, `rowItems?` | 소주제별 흰 카드(`heading` = 카드 위 라벨 칩). `sections` 는 카드 안 "| 소제목" + 목록, `stat` 은 큰 수치, `chart` 는 카드 안 그래프 | 컬럼 2~3 |
| `cards` | `cards:[{title, desc?, items?, sections?, num?, tag?, rows?:[[라벨, 값]], highlight?:{label, value}, stat?, chart?, primary?, dark?}]`, `cols?` | 병렬 카드(`title` = 라벨 칩). **지표 비교는 `rows`(7월/8월 표) + `highlight`(전월대비 18% 증가 박스)**, `tag` 는 "| 소제목", `primary` 연파랑, `dark` 네이비 반전 | 2~6 |
| `process` | `steps:[{title, desc?, items?, period?, highlight?, dark?}]`, `darkLast?` | 좌→우 절차·로드맵(선 + 번호 원 + 단계 카드). `period` 는 "1단계 · 2026 상" 같은 위 라벨 | 3~5 |
| `timeline` | `phases:[{period, title, items?, desc?, highlight?}]`, `darkLast?` | process 와 같은 모양, 기간 중심 | 3~5 |
| `table` | `headers, rows, emphasize?(열 index), leftAlign?([열 index]), widths?(["20%",…])` | 비교표, 평가지표 대응표, 예산. 강조 열은 연파랑 배경 + 파란 굵은 글씨. 셀에 `**굵게**` 가능. "달성/조기달성/진행중" 은 배지로 표시 | 행 3~7 |
| `stats` | `stats:[{label, sub?, value, desc?}]` | 핵심 수치 카드(`label` = 라벨 칩, `sub` = 작은 지표명, `value` 큰 숫자+단위, `desc` 파란 보조 문장 "전월 31만 회 · 35% 성장") | 2~4 |
| `chart` | `kind:"line"\|"bar", title, unit?, labels:[…], series:[{name, values:[…]}], heading?` | **월별 추이 등 수치는 표로 나열하지 말고 그래프로**. 시리즈 1~3개. 채널별 추이 그래프는 형식을 통일 | 1 |
| `compare` | `left:{tag?, heading, items}, right:{tag?, heading, items}` | AS-IS→TO-BE, 난제→해법. `tag` 기본 AS-IS/TO-BE, 오른쪽이 연파랑 강조 | 항목 3~4 |
| `image` | `src, alt?, caption?, heading?, side:"left"\|"right"\|"full", text?:{heading, items}, flex?` | 구성도·화면·사진. `src`가 비어 있으면 `[ alt ]` 점선 자리표시자 | 1 |
| `bullets` | `heading?, items` | 최후의 수단. 항목이 4개 넘으면 columns/cards 로 | 3~5 |
| `callout` | `items?:[…] 또는 text, label?("핵심 요약"·"특이사항"), tone?:"light"` | 장표 맨 아래 어두운 둥근 배너, 왼쪽에 흰 라벨 칩. **불릿 2~3개(`items`) 권장** | 1 |

## 자동으로 처리되는 것

- **색**: `brand.primary` 하나에서 primaryDark / primaryLight / tint / dark(간지·표지 배경) 파생. `secondary`는 포인트(표지 띠, 간지 번호).
- **글자 크기**: `fit_slides.mjs`가 장표마다 본문 배율 `--k`를 계산해 빈 공간을 채운다(dense 최대 1.9, airy 최대 1.5). 헤더 바·제목·리드는 고정 크기. 내용이 넘치면 0.75까지 줄이고, 그래도 넘치면 경고 → 장표를 나눈다.
- **상단**: 헤더 바 없음. 아이브로우(목차 이름만) + 페이지 번호, 헤드라인, 구분선, lead. (구 헤더 바 설명: 왼쪽 태그(`i · 2` 형식, 부록은 `APPENDIX`, 목차는 `CONTENTS`) + `header`(없으면 섹션명) + `subtitle` + 오른쪽 흰 로고. 표지·간지·마무리에는 없음.
- **표지**: `coverBg` 로 고른 그림 하나. 짝이 되는 간지 그림이 있는 배경(`haze`)을 고르면 간지 배경도 같이 바뀐다. 마무리는 늘 그라데이션. 표지는 `subtitle`(설명줄) → `title`(제목) → 왼쪽 아래 로고 → 오른쪽 아래 상자(`event`) 네 덩어리다. pill·docType 박스·기관 칸·기간/날짜는 표지에 넣지 않는다.
- **목차**: 연회색 배경에 왼쪽 위 `목차`, 오른쪽에 번호(1·2·3) + 섹션명 2열. 쪽수·설명은 적지 않는다. **간지**: 포인트 컬러 그라디언트 배경 + CHAPTER 0N + 섹션명 60px + 로고 워터마크.
- **표지·목차 글자 규격**(크기·줄 간격·자간·좌표): `design-system.md` 의 "표지·목차 글자 규격" 표. 값은 `scripts/lib/common.mjs` 의 `TYPE`·`COVER_BOX`·`AGENDA_BOX` 한 곳에만 둔다.
- **페이지 번호**: 표지=1로 세고 본문/부록에만 표기. 표지·목차·간지·마무리에는 없음.
- **이미지**: 경로는 출력 폴더 기준(`assets/xxx.png`). 없는 파일은 점선 자리표시자로 렌더링되고 납품 전 교체 대상.

## 작성 규칙 (콘텐츠)

- 장표 1개 = 메시지 1개. `title`이 결론(헤드라인, 핵심 구절 `**강조**`), `lead`가 그 근거·설명 2~3문장.
- 원문에 없는 수치·시장 규모·고객명은 만들지 않는다. 필요한 자리는 `[입력 필요: …]`로 남긴다.
- `bullets` 4개 이상이면 `columns`/`cards`/`process`로 구조화한다.
- 같은 의미는 문서 전체에서 한 표현으로 통일한다(제품명, 기관명, 날짜 형식).
