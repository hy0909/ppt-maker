# PPT MAKER

텍스트 초안이나 기존 PPTX를 넣으면 회사 디자인 기준에 맞춘 발표자료를 만드는 도구입니다. 장표 구성을 AI와 정리하고, 결과를 HTML·PDF·편집 가능한 PPTX로 확인할 수 있습니다.

기획자·개발자가 내용을 장표로 구성하고 배치하는 시간, 디자이너가 요소를 만들고 장표를 다시 배치하는 시간을 줄이려고 만들었습니다. 각자 자료를 완성하고 디자이너는 UXUI 작업에 집중할 수 있도록 하는 것이 목표입니다.

[화면 둘러보기](https://hy0909.github.io/ppt-maker/) · [AI 연결 안내](AI-연결하기.md)

## 이용 조건을 먼저 확인해 주세요

코드와 문서를 읽는 것은 자유입니다. 복제·수정·재배포·상업적 이용에는 허락이 필요합니다. 자세한 조건은 [COPYRIGHT.md](COPYRIGHT.md), 문의는 [Issues](https://github.com/hy0909/ppt-maker/issues)를 참고해 주세요.

포함된 SafeAI 로고는 회사 자산입니다. 글꼴과 참고한 외부 자료의 이용 조건은 [NOTICE.md](NOTICE.md)에 따로 적어 두었습니다.

## 이런 작업을 할 수 있습니다

| 작업 | 제공하는 것 |
| --- | --- |
| 텍스트로 새 자료 만들기 | 내용을 장표로 나누고 제목·본문·표·카드·이미지 배치 구성 |
| 기존 PPTX 손보기 | 원본에서 내용을 추출해 장표 구성과 디자인 재정리 |
| 회사 디자인 적용하기 | 색상·로고 설정, 공통 글꼴과 레이아웃 적용 |
| 구성 확인하고 수정하기 | 장표 제목·내용·순서 검토, 미리보기 확인 |
| 파일로 내보내기 | 확인용 HTML, 공유용 PDF, 편집용 PPTX |

## 문서 목적에 맞춰 시작합니다

현재 화면에서 선택할 수 있는 문서 유형입니다. 각 유형의 기본 구성을 불러온 뒤 내용에 맞게 고칩니다.

| 문서 유형 | 주로 담는 내용 |
| --- | --- |
| 정부 과제 제안서 | 배경, 요구사항, 해결방안, 세부 기술, 기대효과 |
| 고객사 제안서 | 솔루션, 구축 방안, 수행 사례, 일정, 비용, 운영 |
| 연차보고서 | 과제 개요, 추진 현황, 개발 결과, 사업화, 향후 계획 |
| 내부 진행보고 | 과제 범위, 일정, 진행 상황, 필요한 결정과 지원 |
| 회사 소개서 | 회사 현황, 제품, 연혁, 실적, 특허, 팀 |
| IR | 핵심 기술, 성장 실적, 사업 계획, 투자 관련 자료 |

발표용과 제출·열람용을 구분하고, 지정 양식이 있으면 목차와 분량 제한을 입력합니다. 세부 구성은 [문서별 구성 안내](skills/ppt-maker/references/outline-templates.md)를 참고해 주세요.

## 내 컴퓨터에서 실행합니다

[웹 화면](https://hy0909.github.io/ppt-maker/)은 설치 전에 둘러보는 용도입니다. AI 직접 연결과 파일 생성은 내 컴퓨터에서 실행하는 앱을 사용합니다.

아래 설치 예시는 저장소 이용 허락을 받은 사용자를 위한 macOS 기준입니다. Node.js 18 이상과 Python 3.8 이상을 먼저 준비합니다.

<details>
<summary>처음 설치하는 방법</summary>

터미널에서 순서대로 실행합니다.

```bash
git clone https://github.com/hy0909/ppt-maker.git
cd ppt-maker

# Python 실행 환경과 파일 처리 도구
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install python-pptx pymupdf

# 글꼴과 장표 생성 도구
./install_fonts.sh
npm --prefix skills/ppt-maker/scripts install
(cd skills/ppt-maker/scripts && npx playwright install chromium)
npm --prefix skills/ppt-maker/app install
```

글꼴 설치 스크립트는 macOS·Linux용입니다. Pretendard와 Paperlogy를 공식 배포처에서 내려받습니다. Windows 설치 방법은 별도로 제공하지 않습니다.

</details>

설치를 마쳤으면 저장소 폴더에서 실행합니다. 새 터미널을 열었다면 Python 실행 환경도 다시 켭니다.

```bash
source .venv/bin/activate
./start.sh
```

브라우저에서 [내 컴퓨터의 PPT MAKER](http://localhost:3790)를 엽니다. 터미널을 닫거나 `Ctrl+C`를 누르면 앱이 종료됩니다.

## AI는 내 계정으로 연결합니다

아래 방법 중 하나를 고르면 됩니다. 계정이나 API 키는 포함되어 있지 않으며, 사용량과 요금은 각자 연결한 계정에 적용됩니다.

| 연결 방법 | 준비할 것 | 실행 방법 |
| --- | --- | --- |
| Claude Code | Claude Code 설치와 로그인 | `claude auth login` 후 `./start.sh` |
| Claude API | 본인의 API 키 | `ANTHROPIC_API_KEY=내_API_키 ./start.sh` |
| OpenAI API | 본인의 API 키 | `OPENAI_API_KEY=내_API_키 ./start.sh` |
| 직접 연결 없이 사용 | 평소 사용하는 AI | 화면에서 프롬프트 복사 → AI에 붙여넣기 → 받은 JSON 붙여넣기 |

키는 README나 저장소 파일에 적지 않습니다. 모델 변경, 연결 방법 선택, 오류 해결은 [AI 연결 안내](AI-연결하기.md)에 정리되어 있습니다.

## 입력부터 출력까지 이렇게 진행됩니다

1. 문서 유형과 읽는 방식, 회사 색상·로고를 정합니다.
2. 텍스트를 붙여 넣거나 기존 PPTX를 올립니다.
3. AI가 정리한 장표 구성을 확인하고 내용을 고칩니다.
4. 미리보기에서 배치와 글자 잘림을 확인합니다.
5. 필요한 파일을 내보내고, PPTX는 PowerPoint에서 최종 확인합니다.

장표 내용과 구성은 `outline.json`에 저장합니다. 이 원본으로 HTML과 PPTX를 만들고, HTML에서 PDF를 출력합니다. 생성 과정에서 글자 넘침과 장표 밖으로 벗어난 요소를 검사합니다.

## 장표 디자인 값을 고칩니다

색상·글자 크기·여백처럼 모든 장표에 공통으로 걸리는 값은 [디자인 시스템 화면](https://hy0909.github.io/ppt-maker/design/)에서 눈으로 보며 고칩니다. 값의 원본은 `skills/ppt-maker/design-tokens.json` 파일 하나이고, 장표를 만들 때 이 파일을 읽습니다.

| 화면을 연 곳 | 저장 단추가 하는 일 |
| --- | --- |
| 내 컴퓨터의 앱 (`localhost`) | `design-tokens.json`을 바로 고칩니다 |
| 웹 주소 (GitHub Pages) | 관리자로 들어간 뒤 저장소의 같은 파일을 고칩니다 |

웹에서 저장하려면 **관리자 로그인**에 비밀번호를 넣고 GitHub 토큰을 한 번 연결합니다. 토큰은 저장소 `hy0909/ppt-maker`에 Contents 읽기·쓰기 권한만 주면 되고, 넣은 브라우저에만 남습니다. 비밀번호는 화면을 한 겹 잠그는 것이고, 저장을 실제로 막는 것은 토큰입니다. 토큰이 없으면 비밀번호를 알아내도 저장소는 바뀌지 않습니다.

웹에서 저장한 값은 내 컴퓨터에서 `git pull`로 받아야 다음 생성부터 반영됩니다. 비밀번호는 화면 안에서 바꿀 수 있고, 잊었으면 저장소에서 `docs/design/admin.json`을 지우면 처음 비밀번호로 돌아갑니다.

## 수정하고 공유할 때 확인해 주세요

- **재생성할 자료는 원본에서 수정합니다.** 앱이나 `outline.json`을 고쳐야 다음 생성에도 반영됩니다. 내보낸 PPTX를 PowerPoint에서 고친 내용은 원본에 자동 반영되지 않으므로 최종 편집본은 별도 파일로 보관합니다.
- **내용과 출력물을 확인합니다.** 원문에 없는 수치·회사 정보는 임의로 채우지 않습니다. 생성 후에는 출처와 수치, 글꼴·줄바꿈을 확인합니다. HTML에서 만든 PDF와 PowerPoint의 표시 결과는 다를 수 있습니다.
- **파일 저장과 AI 전송을 구분합니다.** 작업 파일은 내 컴퓨터의 `skills/ppt-maker/app/workspace/`에 저장되며 Git 추적에서 제외됩니다. 외부 AI를 연결하면 구성 요청에 담긴 내용은 해당 서비스로 전송됩니다.
- **앱은 기본적으로 내 컴퓨터에서만 접속합니다.** `HOST=0.0.0.0`으로 실행하면 다른 기기에서도 접근할 수 있습니다. 앱에 로그인 기능이 없으므로 공개 서버로 운영하지 않습니다.

제작 규칙은 [장표 작성 기준](skills/ppt-maker/references/deck-rules.md), 디자인 값은 [디자인 기준](skills/ppt-maker/references/design-system.md), AI 제작 절차는 [SKILL.md](skills/ppt-maker/SKILL.md)를 참고해 주세요.
