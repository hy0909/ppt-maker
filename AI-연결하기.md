# AI 연결하기

PPT Maker 는 글을 읽고 장표 구성을 짜는 일만 AI 에 맡긴다. 나머지는 전부 내 컴퓨터에서 돈다.

**내 계정으로 돈다.** 만든 사람 계정이나 키는 어디에도 들어 있지 않다. 요금도 각자 자기 계정으로 나간다.

연결하는 방법은 세 가지다. 하나만 고르면 된다.

| 방법 | 키가 필요한가 | 이럴 때 고른다 |
| --- | --- | --- |
| Claude Code | 없어도 된다 | Claude 구독이 있다. 가장 간단하다 |
| Claude API 키 | 필요하다 | 쓴 만큼 내고 싶다 |
| GPT API 키 | 필요하다 | OpenAI 를 쓴다. 다른 서비스도 같은 방식이면 된다 |

서버는 켤 때 준비된 것을 알아서 고른다. Claude API 키, GPT API 키, Claude Code 순서다.
골라서 못박고 싶으면 `PPT_MAKER_BACKEND` 에 `api` · `openai` · `cli` 중 하나를 적는다.

---

## 1. Claude Code (키 없이)

Claude 구독이 있으면 이게 제일 쉽다. 터미널에 한 번만 로그인해 두면 된다.

```bash
npm install -g @anthropic-ai/claude-code
claude auth login
./start.sh
```

화면 오른쪽 위에 `Claude Code CLI` 라고 뜨면 연결된 것이다.

모델을 바꾸려면 `PPT_MAKER_CLI_MODEL` 에 적는다. 기본은 `opus` 다.

```bash
PPT_MAKER_CLI_MODEL=sonnet ./start.sh
```

---

## 2. Claude API 키

https://console.anthropic.com 에서 키를 만든다. `sk-ant-` 로 시작한다.

```bash
ANTHROPIC_API_KEY=sk-ant-여기에-내-키 ./start.sh
```

매번 치기 번거로우면 셸 설정 파일(`~/.zshrc`)에 적어 둔다.

```bash
echo 'export ANTHROPIC_API_KEY=sk-ant-여기에-내-키' >> ~/.zshrc
source ~/.zshrc
```

모델은 `PPT_MAKER_MODEL` 로 바꾼다. 기본은 `claude-opus-5` 다.

---

## 3. GPT API 키

https://platform.openai.com/api-keys 에서 키를 만든다. `sk-` 로 시작한다.

```bash
OPENAI_API_KEY=sk-여기에-내-키 ./start.sh
```

모델은 `PPT_MAKER_OPENAI_MODEL` 로 바꾼다. 기본은 `gpt-5` 다.

```bash
OPENAI_API_KEY=sk-... PPT_MAKER_OPENAI_MODEL=gpt-4.1 ./start.sh
```

### OpenAI 말고 다른 곳

`OPENAI_BASE_URL` 을 바꾸면 OpenAI 와 같은 방식으로 말하는 곳은 다 붙는다.
Azure OpenAI, Together, Groq, 그리고 내 컴퓨터에서 돌리는 Ollama·LM Studio 같은 것들이다.

```bash
# 내 컴퓨터의 Ollama
OPENAI_BASE_URL=http://localhost:11434/v1 \
OPENAI_API_KEY=ollama \
PPT_MAKER_OPENAI_MODEL=qwen2.5:32b ./start.sh
```

서비스마다 받아 주는 항목이 조금씩 다르다. 새 항목을 모르는 곳이면 서버가 알아서 기본 항목만 다시 보낸다.

---

## 4. 아무것도 연결하지 않고 쓰기

키도 구독도 없이 쓰는 길이 하나 더 있다. 장표 구성을 만드는 화면에서 **프롬프트 복사**를 누르고,
그 내용을 쓰던 AI(Claude, ChatGPT, 무엇이든)에 붙여 넣는다. 받은 JSON 을 **JSON 붙여넣기**로 가져오면
그다음부터는 평소와 똑같이 돌아간다.

웹에 올라간 둘러보기 화면에서도 이 길은 열려 있다.

---

## 설정값 한눈에

| 이름 | 하는 일 | 기본값 |
| --- | --- | --- |
| `PPT_MAKER_BACKEND` | 무엇으로 돌릴지 못박는다 (`api`·`openai`·`cli`) | 준비된 것 중에서 고름 |
| `ANTHROPIC_API_KEY` | Claude API 키 | 없음 |
| `PPT_MAKER_MODEL` | Claude API 모델 | `claude-opus-5` |
| `PPT_MAKER_CLI_MODEL` | Claude Code 모델 | `opus` |
| `OPENAI_API_KEY` | GPT 키 | 없음 |
| `OPENAI_BASE_URL` | GPT 쪽 주소 | `https://api.openai.com/v1` |
| `PPT_MAKER_OPENAI_MODEL` | GPT 모델 | `gpt-5` |
| `PPT_MAKER_OPENAI_MAXTOK` | 한 번에 받을 최대 길이 | `32000` |
| `PORT` | 화면 주소의 번호 | `3790` |
| `HOST` | 서버를 열어 둘 범위 | `127.0.0.1` (내 컴퓨터만) |

---

## 안 될 때

| 화면에 뜨는 말 | 무슨 뜻인가 | 어떻게 하나 |
| --- | --- | --- |
| AI 를 아직 연결하지 않았습니다 | 셋 중 아무것도 준비되지 않았다 | 위 1~3 중 하나를 한다 |
| Claude Code CLI 에 로그인되어 있지 않습니다 | `claude` 는 깔렸는데 로그인 전이다 | `claude auth login` |
| API 키가 유효하지 않습니다 | Claude 키가 틀렸다 | 키를 다시 만든다 |
| OPENAI_API_KEY 가 올바르지 않습니다 | GPT 키가 틀렸다 | 키를 다시 만든다 |
| 모델 이름이나 주소가 틀렸습니다 | 그 모델을 못 쓰거나 주소가 다르다 | 모델 이름과 `OPENAI_BASE_URL` 을 확인한다 |
| 요청 한도를 넘었습니다 | 잠깐 너무 많이 불렀다 | 조금 기다린다 |

서버를 켠 터미널에 더 자세한 내용이 찍힌다. 로그인 서비스로 켰다면 `skills/ppt-maker/app/workspace/server.log` 를 본다.

---

## 다른 사람이 만든 파일이 나한테 보이나

보이지 않는다. 서버는 각자 자기 컴퓨터에서 돌고, 만든 파일도 그 컴퓨터에만 남는다.
가운데서 모아 두는 곳이 없다.

서버는 `127.0.0.1` 에만 붙는다. 같은 공유기를 쓰는 사람도 들어오지 못한다.
다른 기기에서 열어야 하면 `HOST=0.0.0.0` 을 직접 줘야 하는데, 이 서버에는 로그인이 없으니
들어온 사람이 내 AI 사용량을 그대로 쓴다. 필요할 때만 켜고 바로 되돌리는 편이 안전하다.
