#!/usr/bin/env node
// Copyright (c) 2026 SafeAI. All rights reserved.
// See COPYRIGHT.md — 복제·수정·재배포는 허락 없이 할 수 없습니다.
// ppt-maker 로컬 웹 화면 서버.
//   node server.mjs [port]        (기본 3790 → http://localhost:3790; PORT 환경변수도 인식)
// - GET  /                 UI
// - GET  /api/status       API 키 여부, 모델, 작업 목록
// - POST /api/outline      {meta, text, notes, project} → Claude 로 outline.json 생성
// - POST /api/extract      {project, filename, data(base64)} → 기존 PPTX → outline 초안
// - POST /api/asset        {project, filename, data(base64)} → workspace/<project>/out/assets/ 저장
// - POST /api/build        {project, outline} → build_html → fit → check_overflow → export_pdf → build_pptx
// - GET  /ws/<project>/... 빌드 결과 정적 서빙 (deck.html, pdf, pptx)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { parseOutlineText } from './outline_parse.mjs';
import { TYPE, COVER_BOX, COVER_SCRIM, coverScrim, COVER_BG_KEYS, COVER_BG_LABEL, coverBgFile, dividerBgFile, derivePalette } from '../scripts/lib/common.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_FILE = path.join(here, '..', 'design-tokens.json');
const TOKEN_STATE = path.join(here, 'workspace', '.design-state.json');
const SKILL = path.resolve(here, '..');
const SCRIPTS = path.join(SKILL, 'scripts');
const REFS = path.join(SKILL, 'references');
const ASSETS = path.join(SKILL, 'assets');
const WS = path.join(here, 'workspace');
fs.mkdirSync(WS, { recursive: true });
const PORT = Number(process.argv[2] || process.env.PORT || 3790);
const MODEL = process.env.PPT_MAKER_MODEL || 'claude-opus-5';

/** 회사약칭_YYMMDD — 회사 약칭은 meta.fileCompany(영문), 없으면 회사명이 영문일 때 그 소문자, 아니면 deck */
export function outputBaseName(meta = {}, d = new Date()) {
  let slug = String(meta.fileCompany || '').trim();
  if (!slug) { const c = String(meta.company || '').replace(/[^A-Za-z0-9]/g, ''); slug = c || 'deck'; }
  slug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '');
  const yymmdd = String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  return `${slug}_${yymmdd}`;
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', '.md': 'text/markdown; charset=utf-8' };

import { execSync } from 'node:child_process';
const hasApiKey = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || fs.existsSync(path.join(process.env.HOME || '', '.config/anthropic')));
let CLAUDE_BIN = null;
try { CLAUDE_BIN = execSync('command -v claude', { encoding: 'utf8', shell: '/bin/zsh' }).trim() || null; } catch { CLAUDE_BIN = fs.existsSync(path.join(process.env.HOME || '', '.local/bin/claude')) ? path.join(process.env.HOME, '.local/bin/claude') : null; }

// OpenAI 방식으로 말하는 서비스(GPT, 그리고 같은 규격을 따르는 다른 곳)
const OPENAI_KEY    = () => process.env.OPENAI_API_KEY || '';
const OPENAI_BASE   = () => (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
const OPENAI_MODEL  = () => process.env.PPT_MAKER_OPENAI_MODEL || 'gpt-5';
const OPENAI_MAXTOK = () => Number(process.env.PPT_MAKER_OPENAI_MAXTOK || 32000);

/* 무엇으로 돌릴지 고른다. PPT_MAKER_BACKEND 로 못박을 수 있고(api·openai·cli),
   비워 두면 준비된 것 중에서 고른다. 고른 것이 준비돼 있지 않으면 none 이다. */
const backend = () => {
  const want = (process.env.PPT_MAKER_BACKEND || '').trim().toLowerCase();
  if (want === 'api')    return hasApiKey()   ? 'api'    : 'none';
  if (want === 'openai') return OPENAI_KEY()  ? 'openai' : 'none';
  if (want === 'cli')    return CLAUDE_BIN    ? 'cli'    : 'none';
  return hasApiKey() ? 'api' : OPENAI_KEY() ? 'openai' : CLAUDE_BIN ? 'cli' : 'none';
};
const hasCreds = () => backend() !== 'none';
const NO_BACKEND = 'AI 를 아직 연결하지 않았습니다. 셋 중 하나를 고르세요.\n'
  + '1) Claude Code CLI: claude 를 깔고 claude auth login\n'
  + '2) Claude API 키: ANTHROPIC_API_KEY=sk-ant-... ./start.sh\n'
  + '3) GPT API 키: OPENAI_API_KEY=sk-... ./start.sh\n'
  + '자세한 방법은 docs/AI-연결하기.md 에 있습니다.';

const slug = s => String(s || 'deck').trim().replace(/[^\w가-힣-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'deck';
const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
const readBody = req => new Promise((ok, err) => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => { try { ok(c.length ? JSON.parse(Buffer.concat(c).toString('utf8')) : {}); } catch (e) { err(e); } }); req.on('error', err); });

function run(cmd, args, cwd) {
  return new Promise(resolve => {
    const p = spawn(cmd, args, { cwd });
    let out = '';
    p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
    p.on('close', code => resolve({ code, out }));
  });
}

// ─── Claude: text → outline ─────────────────────────────────────
function systemPrompt() {
  const schema = fs.readFileSync(path.join(REFS, 'outline-schema.md'), 'utf8');
  const templates = fs.readFileSync(path.join(REFS, 'outline-templates.md'), 'utf8');
  return `당신은 발표자료 기획자다. 사용자가 준 원문과 설정으로 outline.json 을 작성한다.

# 출력
- **JSON 객체 하나만** 출력한다. 코드펜스, 설명, 주석 없이.
- 아래 스키마를 정확히 따른다. 블록 타입은 스키마의 10종만 사용한다.

# 콘텐츠 규칙
- 장표 1개 = 메시지 1개. **title 은 결론을 담되 문장이 아니라 명사형으로 끝낸다**: "제품 목록·품질 통계·프린터 설정 **세 기능으로 구성**", "네 항목 모두 **8월 목표치 초과 달성**", "요구사항 정리부터 시범 운영까지 **24주 일정**". "~한다 / ~합니다 / ~이다 / ~했다 / ~된다" 같은 서술형 종결은 쓰지 않는다. 핵심 구절 1~2곳만 **…** 로 감싼다(굵게만 표시되고 색은 본문과 같다).
- lead 는 한 줄 보조 정보(집계 기간, 전제, 근거)로 짧게. 쓸 내용이 없으면 넣지 않는다.
- 장표 위쪽 작은 글씨에는 그 장표가 속한 목차(섹션) 이름이 자동으로 들어간다. **header·subtitle 필드는 쓰지 않는다.**
- meta.numbering 은 넣지 않는다(목차·간지 번호는 1·2·3 숫자로 표기된다).
- **사람이 직접 쓴 보고서처럼 쓴다.** 담백하고 구체적으로. 다음은 쓰지 않는다: "본 자료는 / 본 문서에서는", "~를 통해 ~할 수 있습니다", "효율적으로·효과적으로·체계적으로·극대화" 같은 빈 수식어, 같은 뜻 반복, 번역투("~에 대한 ~의 수행"), 모든 항목을 같은 길이와 같은 어미로 맞춘 기계적인 나열, 원문에 없는 일반론.
- 카드·컬럼의 소제목(heading·tag·sections.heading)은 내용을 가리키는 이름으로 쓴다. "화면", "내용", "항목", "개요"처럼 껍데기뿐인 소제목은 넣지 말고 생략한다. 카드 제목과 같은 말을 소제목으로 반복하지 않는다.
- 원문에 없는 수치·시장규모·고객명·성과는 만들지 않는다. 필요한 자리는 "[입력 필요: …]" 텍스트로 남긴다. **이미지 경로(src·image)는 지어내지 말고 빈 문자열로 두고** alt/caption 에 무엇이 들어갈 자리인지 적는다(자리표시자가 그려진다).
- 수치·인용이 있는 장표에는 slide.source 로 출처를 단다. 근거를 따지는 제출용 문서에서는 빠뜨리지 않는다. 원문에 적힌 출처만 옮기고, 근거가 필요한데 원문에 없으면 "[출처 필요]" 로 남긴다. 말머리 "출처:" 는 렌더러가 붙이니 빼고 쓰고, 여럿이면 배열로 준다. 단서·용어 풀이는 slide.footnote 에 한 줄로.
- **수치는 텍스트로 나열하지 말고 시각화한다**: 전월/목표 대비 지표는 cards 의 rows(7월/8월 표) + highlight(전월대비 18% 증가), 월별 추이는 chart(line) 또는 columns 의 chart, 대표 수치 하나는 stat(큰 숫자 + 파란 보조 문장). 같은 종류의 그래프(채널별 월 추이 등)는 모두 같은 형식으로 통일한다.
- 한 텍스트 상자에 내용을 몰아넣지 않는다. 카드 안은 sections("| 소제목" + 불릿 2~3개)로 구조화하고, 굵기·크기로 강조를 분명히 한다. bullets 는 최후의 수단. 절차·로드맵은 process, 비교는 compare/table, 일정은 timeline.
- 컬럼은 2~3개, 카드는 2~6개, 표 행은 3~7개. 한 장표에 블록 1~3개. 카드가 한 줄에 2~3개 나란히 놓이면 **항목 수(2~4개)와 문장 길이를 서로 비슷하게** 맞춘다(한 카드만 길거나 짧으면 어색하다). 각 항목은 한 줄짜리 명사구나 짧은 구로 쓴다. 장표 마지막에는 callout(label "핵심 요약"/"특이사항"/"참고", items 2~3개)로 닫는다.
- 강조: 결론 컬럼/카드에 tint·primary, 표에는 emphasize(강조 열 index)와 leftAlign(글이 긴 열), 마지막 단계 카드에 darkLast. 어떤 열을 강조했는지 lead 나 notes 에 적지 않는다.
- 문서 유형별 목차 템플릿을 따르되, 원문에 근거가 없는 섹션은 만들지 않는다. 섹션마다 subtitle(목차에 보이는 한 줄 설명)을 쓴다.
- meta 에는 사용자가 준 값을 그대로 넣는다(회사명·발표자·날짜·컬러). 표지용 pill(2~4글자 라벨: 월간 보고·기술개발·사업제안 등), docType(문서 종류 한 구절), orgs([{role,name}])는 원문에서 알 수 있을 때만 채우고 모르면 넣지 않는다. title 이 길면 <br> 로 두 줄로 나눈다.
- 같은 개념은 문서 전체에서 한 표현으로 통일한다.
- **분량**: 본문은 섹션 3~5개 × 장표 2~4개 = 전체 8~14장을 넘기지 않는다. 원문이 길면 핵심만 고르고 세부 근거는 부록(appendix) 2~3장으로 넘긴다. notes 는 꼭 필요할 때만 한 줄.

# 스키마
${schema}

# 문서 유형별 목차 템플릿
${templates}`;
}


/** OpenAI 방식의 /chat/completions 를 부른다. stream 이면 onDelta 로 글자를 흘려 준다.
 *  서비스마다 받아 주는 항목이 조금씩 달라서, 400 이 오면 선택 항목을 빼고 한 번 더 보낸다. */
async function openaiChat(user, { stream = false, onDelta, signal } = {}) {
  const msgs = [{ role: 'system', content: systemPrompt() }, { role: 'user', content: user }];
  const rich = { model: OPENAI_MODEL(), messages: msgs, stream,
                 max_completion_tokens: OPENAI_MAXTOK(), response_format: { type: 'json_object' },
                 ...(stream ? { stream_options: { include_usage: true } } : {}) };
  const plain = { model: OPENAI_MODEL(), messages: msgs, stream, max_tokens: OPENAI_MAXTOK() };
  const post = b => fetch(OPENAI_BASE() + '/chat/completions', {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + OPENAI_KEY() },
    body: JSON.stringify(b),
  });

  let r = await post(rich);
  if (r.status === 400) {
    const why = await r.text().catch(() => '');
    if (/max_completion_tokens|response_format|stream_options|unsupported|unknown|unrecognized/i.test(why)) r = await post(plain);
    else throw new Error('GPT 쪽에서 요청을 거절했습니다 (400): ' + why.slice(0, 300));
  }
  if (!r.ok) {
    const why = await r.text().catch(() => '');
    if (r.status === 401 || r.status === 403) throw new Error('OPENAI_API_KEY 가 올바르지 않습니다. 키를 다시 확인하세요.');
    if (r.status === 404) throw new Error(`모델 이름이나 주소가 틀렸습니다. 모델 ${OPENAI_MODEL()}, 주소 ${OPENAI_BASE()} 를 확인하세요.`);
    if (r.status === 429) throw new Error('요청 한도를 넘었습니다. 잠시 뒤 다시 시도하세요.');
    throw new Error(`GPT 오류 (${r.status}): ` + why.slice(0, 300));
  }

  const asUsage = u => u ? { input_tokens: u.prompt_tokens, output_tokens: u.completion_tokens } : null;
  if (!stream) {
    const j = await r.json();
    return { text: j.choices?.[0]?.message?.content || '', usage: asUsage(j.usage) };
  }
  let text = '', usage = null, buf = '';
  const dec = new TextDecoder();
  for await (const chunk of r.body) {
    buf += dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const p = line.slice(5).trim();
      if (!p || p === '[DONE]') continue;
      let e; try { e = JSON.parse(p); } catch { continue; }
      const d = e.choices?.[0]?.delta?.content;
      if (d) { text += d; onDelta?.(text); }
      if (e.usage) usage = asUsage(e.usage);
    }
  }
  return { text, usage };
}

/** 같은 프롬프트를 GPT 쪽으로 보낸다(한 번에 받는 방식). */
async function generateOutlineViaOpenAI({ meta, text, notes }) {
  const user = `## 설정\n${JSON.stringify(meta, null, 2)}\n\n## 추가 메모 (유형별 질문 답변)\n${notes || '(없음)'}\n\n## 원문\n${text}`;
  const { text: out, usage } = await openaiChat(user);
  if (!out.trim()) throw new Error('GPT 가 빈 응답을 보냈습니다.');
  saveRaw(out);
  const { outline } = parseOutlineText(out);
  outline.meta = Object.assign({}, outline.meta || {}, pickMeta(meta));
  return { outline, usage };
}

async function generateOutline({ meta, text, notes }) {
  const client = new Anthropic();
  const user = `## 설정
${JSON.stringify(meta, null, 2)}

## 추가 메모 (유형별 질문 답변)
${notes || '(없음)'}

## 원문
${text}`;
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    system: [{ type: 'text', text: systemPrompt(), cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') throw new Error('모델이 요청을 거절했습니다: ' + (msg.stop_details?.explanation || ''));
  const textOut = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
  saveRaw(textOut);
  const { outline } = parseOutlineText(textOut);
  outline.meta = Object.assign({}, outline.meta || {}, pickMeta(meta));
  return { outline, usage: msg.usage };
}
/** Same prompt through the logged-in Claude Code CLI (`claude -p`). No API key needed. */
function generateOutlineViaCLI({ meta, text, notes }) {
  return new Promise((resolve, reject) => {
    const user = `## 설정\n${JSON.stringify(meta, null, 2)}\n\n## 추가 메모 (유형별 질문 답변)\n${notes || '(없음)'}\n\n## 원문\n${text}`;
    const args = ['-p', '--output-format', 'text', '--model', process.env.PPT_MAKER_CLI_MODEL || 'opus', '--no-session-persistence', '--tools', '', '--system-prompt', systemPrompt()];
    const p = spawn(CLAUDE_BIN, args, { env: { ...process.env, CLAUDECODE: undefined, CLAUDE_CODE_ENTRYPOINT: undefined } });
    let out = '', err = '';
    p.stdout.setEncoding('utf8'); p.stderr.setEncoding('utf8'); // 한글이 청크 경계에서 깨지지 않게
    p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d);
    p.on('error', reject);
    p.on('close', code => {
      const all = (out + '\n' + err).trim();
      if (/Failed to authenticate|OAuth|not logged in|login/i.test(all) && !/^\s*\{/.test(out.trim()))
        return reject(Object.assign(new Error(`Claude Code CLI 에 로그인되어 있지 않습니다. 터미널(맥 터미널 앱)에 아래 한 줄을 붙여 넣어 로그인한 뒤 다시 시도하세요:\n${CLAUDE_BIN} auth login`), { kind: 'auth', cmd: `${CLAUDE_BIN} auth login` }));
      if (code !== 0 && !out.trim()) return reject(new Error('claude CLI 오류: ' + all.slice(0, 400)));
      saveRaw(out);
      try {
        const { outline, note } = parseOutlineText(out);
        outline.meta = Object.assign({}, outline.meta || {}, pickMeta(meta));
        resolve({ outline, backend: 'cli', note });
      } catch (e) { reject(new Error(e.message + RAW_HINT)); }
    });
    p.stdin.end(user);
  });
}
// user-supplied settings always win over model output
function pickMeta(m) {
  const o = {};
  for (const k of ['type', 'density', 'coverBg', 'company', 'presenter', 'date', 'event', 'brand', 'contact', 'footer', 'logo']) if (m[k] !== undefined && m[k] !== '') o[k] = m[k];
  if (m.title) o.title = m.title;
  return o;
}

// ─── build pipeline ─────────────────────────────────────────────
// targets: 'html'(미리보기: build_html→fit→check_overflow) · 'pdf' · 'pptx'. 파일 출력은 로컬 변환이라 AI 토큰을 쓰지 않는다.
// 기본값은 미리보기만. PDF·PPTX 는 사용자가 다운로드 버튼을 눌렀을 때만 만든다 (기획서 1.2 문제 2).
async function build(project, outline, targets = ['html']) {
  const dir = path.join(WS, project), out = path.join(dir, 'out');
  const want = new Set(targets);
  fs.mkdirSync(path.join(out, 'assets'), { recursive: true });
  const outlineFile = path.join(dir, 'outline.json');
  fs.writeFileSync(outlineFile, JSON.stringify(outline, null, 2));
  const needHtml = want.has('html') || !fs.existsSync(path.join(out, 'deck.html'));
  const steps = [
    ...(needHtml ? [
      ['build_html', 'node', [path.join(SCRIPTS, 'build_html.mjs'), outlineFile, out]],
      ['fit_slides', 'node', [path.join(SCRIPTS, 'fit_slides.mjs'), path.join(out, 'deck.html')]],
      ['check_overflow', 'node', [path.join(SCRIPTS, 'check_overflow.mjs'), path.join(out, 'deck.html')]],
    ] : []),
    ...(want.has('pdf') ? [['export_pdf', 'node', [path.join(SCRIPTS, 'export_pdf.mjs'), path.join(out, 'deck.html'), path.join(out, 'deck.pdf')]]] : []),
    ...(want.has('pptx') ? [
      ['build_pptx', 'node', [path.join(SCRIPTS, 'build_pptx.mjs'), outlineFile, out]],
      // PowerPoint 가 '복구' 대화상자를 띄우는 파일을 내보내지 않도록 구조·규격을 검사한다(렌더는 하지 않음)
      ['verify_pptx', 'python3', [path.join(SCRIPTS, 'verify_pptx.py'), path.join(out, 'deck.pptx')]],
    ] : []),
  ];
  // 미리보기를 새로 만들면 이전 PDF/PPTX 는 낡은 것이므로 지운다
  if (needHtml) for (const f of ['deck.pdf', 'deck.pptx']) fs.rmSync(path.join(out, f), { force: true });
  const log = [];
  let overflow = false;
  for (const [name, cmd, args] of steps) {
    const r = await run(cmd, args, SCRIPTS);
    log.push(`$ ${name}\n${r.out.trim()}`);
    if (name === 'check_overflow' && r.code !== 0) { overflow = true; continue; }
    if (r.code !== 0) return { ok: false, log: log.join('\n\n'), failed: name };
  }
  const v = Date.now();
  // 출력 파일명 규칙: 회사약칭_출력날짜(YYMMDD)  예) acme_260821.pptx
  const base = outputBaseName(outline.meta);
  const has = f => fs.existsSync(path.join(out, f));
  return {
    ok: true, overflow, log: log.join('\n\n'), fileBase: base,
    preview: `/ws/${project}/out/deck.html?v=${v}`,
    pdf: has('deck.pdf') ? `/ws/${project}/out/deck.pdf?v=${v}&dl=${base}.pdf` : null,
    pptx: has('deck.pptx') ? `/ws/${project}/out/deck.pptx?v=${v}&dl=${base}.pptx` : null,
    fit: fs.existsSync(path.join(out, 'fit.json')) ? JSON.parse(fs.readFileSync(path.join(out, 'fit.json'), 'utf8')) : {},
  };
}


// 마지막 모델 응답 원문을 남긴다 — 파싱이 실패했을 때 무엇이 왔는지 바로 확인할 수 있게.
const RAW_FILE = path.join(WS, '_last-response.txt');
const RAW_HINT = `\n(방금 받은 응답 원문: ${RAW_FILE})`;
function saveRaw(text) { try { fs.writeFileSync(RAW_FILE, String(text ?? '')); } catch {} }

// ─── async generation jobs (progress · cancel · usage) ──────────
const JOBS = new Map();
const STATS_FILE = path.join(WS, '_stats.json');
const loadStats = () => { try { return JSON.parse(fs.readFileSync(STATS_FILE, 'utf8')); } catch { return []; } };
const saveStat = (st) => { const a = loadStats(); a.push(st); fs.writeFileSync(STATS_FILE, JSON.stringify(a.slice(-50))); };
const SYS_TOKENS_EST = Math.round(systemPrompt().length / 2.6); // rough: mixed Korean/markdown

/** estimate before starting: from history (last 10 runs) or defaults */
function estimate(inputChars) {
  const hist = loadStats().filter(x => x.outputTokens > 0).slice(-10);
  const inTok = Math.round(inputChars / 2.2) + SYS_TOKENS_EST;
  if (hist.length) {
    const avgOut = hist.reduce((a, x) => a + x.outputTokens, 0) / hist.length;
    const secPerTok = hist.reduce((a, x) => a + x.durationMs / 1000 / x.outputTokens, 0) / hist.length;
    const outTok = Math.round(avgOut * Math.min(1.6, Math.max(0.7, inputChars / (hist.reduce((a, x) => a + x.inputChars, 0) / hist.length || 1))));
    return { seconds: Math.round(outTok * secPerTok + 8), outputTokens: outTok, inputTokens: inTok, basis: `이전 ${hist.length}회 평균` };
  }
  const outTok = Math.min(16000, Math.max(5000, 4000 + inputChars * 2));
  return { seconds: Math.round(outTok / 80 + 15), outputTokens: outTok, inputTokens: inTok, basis: '기본값' };
}

function jobSnapshot(j) {
  const elapsedMs = (j.endedAt || Date.now()) - j.startedAt;
  const outTok = j.usage?.output_tokens ?? j.outputTokensLive ?? Math.round(j.outputChars / 2);
  const progress = j.state === 'done' ? 1 : Math.min(0.97, outTok / Math.max(j.estimate.outputTokens, 1));
  const remainingSec = j.state === 'running' ? Math.max(0, Math.round(j.estimate.seconds - elapsedMs / 1000)) : 0;
  return { id: j.id, state: j.state, backend: j.backend, elapsedMs, estimate: j.estimate, outputChars: j.outputChars, outputTokens: outTok, tokensExact: Boolean(j.usage), progress, remainingSec, usage: j.usage || null, costUsd: j.costUsd ?? null, error: j.error || null, warning: j.warning || null, outline: j.state === 'done' ? j.outline : undefined };
}

function finishJob(j, outText, usage, costUsd, meta) {
  saveRaw(outText);
  try {
    const { outline, note } = parseOutlineText(outText);
    outline.meta = Object.assign({}, outline.meta || {}, pickMeta(meta));
    j.outline = outline; j.warning = note || null; j.usage = usage || null; j.costUsd = costUsd ?? null; j.state = 'done'; j.endedAt = Date.now();
    saveStat({ at: j.endedAt, backend: j.backend, inputChars: j.inputChars, outputTokens: usage?.output_tokens || Math.round(j.outputChars / 2), durationMs: j.endedAt - j.startedAt, costUsd: costUsd ?? null });
  } catch (e) { j.state = 'error'; j.endedAt = Date.now(); j.error = e.message + RAW_HINT; }
}

function startJob(body) {
  const be = backend();
  const id = Math.random().toString(36).slice(2, 10);
  const inputChars = (body.text || '').length + (body.notes || '').length;
  const j = { id, state: 'running', backend: be, startedAt: Date.now(), endedAt: null, outputChars: 0, outputTokensLive: null, inputChars, estimate: estimate(inputChars), meta: body.meta };
  JOBS.set(id, j);
  const user = `## 설정\n${JSON.stringify(body.meta, null, 2)}\n\n## 추가 메모 (유형별 질문 답변)\n${body.notes || '(없음)'}\n\n## 원문\n${body.text}`;
  // 원문을 프로젝트 폴더에 남긴다 — 다시 만들 때 붙여 넣지 않아도 되게.
  try {
    const dir = path.join(WS, slug(body.project || 'deck'));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'source.txt'), `${body.text || ''}\n\n---- 추가 메모 ----\n${body.notes || ''}`);
  } catch {}
  if (be === 'cli') {
    const args = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--model', process.env.PPT_MAKER_CLI_MODEL || 'opus', '--no-session-persistence', '--tools', '', '--system-prompt', systemPrompt()];
    const p = spawn(CLAUDE_BIN, args, { env: { ...process.env, CLAUDECODE: undefined, CLAUDE_CODE_ENTRYPOINT: undefined } });
    j.proc = p;
    let buf = '', text = '', err = '', result = null;
    p.stdout.setEncoding('utf8'); p.stderr.setEncoding('utf8'); // 한글이 청크 경계에서 깨지지 않게
    p.stdout.on('data', d => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line) continue;
        let e; try { e = JSON.parse(line); } catch { continue; }
        if (e.type === 'stream_event') {
          const ev = e.event || {};
          if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') { text += ev.delta.text; j.outputChars = text.length; }
          if (ev.type === 'message_delta' && ev.usage?.output_tokens) j.outputTokensLive = ev.usage.output_tokens;
        } else if (e.type === 'result') result = e;
      }
    });
    p.stderr.on('data', d => err += d);
    p.on('close', code => {
      if (j.state === 'cancelled') return;
      const all = text + '\n' + err + '\n' + (result?.result || '');
      if ((!text.trim() && /Failed to authenticate|OAuth|not logged in/i.test(all)) || result?.is_error && /authenticate|login/i.test(result?.result || '')) {
        j.state = 'error'; j.endedAt = Date.now(); j.kind = 'auth'; j.cmd = `${CLAUDE_BIN} auth login`;
        j.error = `Claude Code CLI 에 로그인되어 있지 않습니다. 터미널에 아래 한 줄을 붙여 넣어 로그인한 뒤 다시 시도하세요:\n${CLAUDE_BIN} auth login`; return;
      }
      if (result?.is_error) { j.state = 'error'; j.endedAt = Date.now(); j.error = 'claude CLI 오류: ' + String(result.result || err).slice(0, 300); return; }
      if (!text.trim()) { j.state = 'error'; j.endedAt = Date.now(); j.error = 'claude CLI 가 응답 없이 종료했습니다 (code ' + code + '): ' + err.slice(0, 300); return; }
      finishJob(j, text, result?.usage, result?.total_cost_usd, body.meta);
    });
    p.stdin.end(user);
  } else if (be === 'api') {
    (async () => {
      try {
        const client = new Anthropic();
        const stream = client.messages.stream({ model: MODEL, max_tokens: 64000, system: [{ type: 'text', text: systemPrompt(), cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content: user }] });
        j.abort = () => stream.abort();
        let text = '';
        for await (const ev of stream) {
          if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') { text += ev.delta.text; j.outputChars = text.length; }
          if (ev.type === 'message_delta' && ev.usage?.output_tokens) j.outputTokensLive = ev.usage.output_tokens;
        }
        const msg = await stream.finalMessage();
        if (j.state === 'cancelled') return;
        if (msg.stop_reason === 'refusal') { j.state = 'error'; j.endedAt = Date.now(); j.error = '모델이 요청을 거절했습니다.'; return; }
        finishJob(j, text, msg.usage, null, body.meta);
      } catch (e) {
        if (j.state === 'cancelled') return;
        j.state = 'error'; j.endedAt = Date.now();
        j.error = e instanceof Anthropic.AuthenticationError ? 'API 키가 유효하지 않습니다.' : e instanceof Anthropic.RateLimitError ? '요청 한도 초과. 잠시 후 다시 시도하세요.' : (e.message || String(e));
      }
    })();
  } else if (be === 'openai') {
    (async () => {
      const ac = new AbortController();
      j.abort = () => ac.abort();
      try {
        const { text, usage } = await openaiChat(user, { stream: true, signal: ac.signal,
          onDelta: t => { j.outputChars = t.length; } });
        if (j.state === 'cancelled') return;
        if (!text.trim()) { j.state = 'error'; j.endedAt = Date.now(); j.error = 'GPT 가 빈 응답을 보냈습니다.'; return; }
        if (usage?.output_tokens) j.outputTokensLive = usage.output_tokens;
        finishJob(j, text, usage, null, body.meta);
      } catch (e) {
        if (j.state === 'cancelled') return;
        j.state = 'error'; j.endedAt = Date.now(); j.error = e.message || String(e);
      }
    })();
  } else {
    j.state = 'error'; j.endedAt = Date.now(); j.error = NO_BACKEND;
  }
  return j;
}
function cancelJob(j) {
  if (j.state !== 'running') return;
  j.state = 'cancelled'; j.endedAt = Date.now();
  try { j.proc?.kill('SIGTERM'); } catch {}
  try { j.abort?.(); } catch {}
}
// drop finished jobs after 30 min
setInterval(() => { const t = Date.now() - 30 * 60e3; for (const [k, j] of JOBS) if (j.endedAt && j.endedAt < t) JOBS.delete(k); }, 60e3).unref();

// ─── server ─────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
      return res.end(fs.readFileSync(path.join(here, 'index.html')));
    }
    /* 디자인 시스템 화면. 값을 고쳐 저장하면 design-tokens.json 이 바뀌고,
       다음 빌드부터 HTML·PPTX 에 그대로 반영된다. */
    if (req.method === 'GET' && url.pathname === '/design') {
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
      return res.end(fs.readFileSync(path.join(here, 'design-system.html')));
    }
    if (req.method === 'GET' && url.pathname === '/api/tokens') {
      try { return json(res, 200, JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'))); }
      catch { return json(res, 200, {}); }
    }
    if (req.method === 'POST' && url.pathname === '/api/tokens') {
      const body = await readBody(req);
      if (!body || !body.tokens) return json(res, 400, { error: '보낼 값이 없습니다' });
      fs.writeFileSync(TOKEN_FILE, JSON.stringify(body.tokens, null, 2) + '\n');
      if (body.state) fs.writeFileSync(TOKEN_STATE, JSON.stringify(body.state, null, 2) + '\n');
      return json(res, 200, { ok: true, file: TOKEN_FILE });
    }
    if (req.method === 'GET' && url.pathname === '/api/status') {
      const projects = fs.readdirSync(WS).filter(d => fs.existsSync(path.join(WS, d, 'outline.json'))).map(d => ({ name: d, mtime: fs.statSync(path.join(WS, d, 'outline.json')).mtimeMs, built: fs.existsSync(path.join(WS, d, 'out', 'deck.pptx')) })).sort((a, b) => b.mtime - a.mtime);
      return json(res, 200, { hasCreds: hasCreds(), backend: backend(), model: backend() === 'cli' ? 'Claude Code CLI (opus)' : backend() === 'openai' ? OPENAI_MODEL() : MODEL, projects });
    }
    if (req.method === 'GET' && url.pathname.startsWith('/api/project/')) {
      const p = slug(decodeURIComponent(url.pathname.split('/')[3]));
      const f = path.join(WS, p, 'outline.json');
      if (!fs.existsSync(f)) return json(res, 404, { error: 'not found' });
      const built = fs.existsSync(path.join(WS, p, 'out', 'deck.html'));
      const hasF = f => fs.existsSync(path.join(WS, p, 'out', f));
      return json(res, 200, { project: p, outline: JSON.parse(fs.readFileSync(f, 'utf8')), built, preview: built ? `/ws/${p}/out/deck.html` : null, fileBase: built ? outputBaseName(JSON.parse(fs.readFileSync(f, 'utf8')).meta) : null, pdf: built && hasF('deck.pdf') ? `/ws/${p}/out/deck.pdf?dl=${outputBaseName(JSON.parse(fs.readFileSync(f, 'utf8')).meta)}.pdf` : null, pptx: built && hasF('deck.pptx') ? `/ws/${p}/out/deck.pptx?dl=${outputBaseName(JSON.parse(fs.readFileSync(f, 'utf8')).meta)}.pptx` : null });
    }
    if (req.method === 'GET' && url.pathname === '/api/prompt') {
      // for the no-API-key path: hand the user the system prompt to paste into Claude
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end(systemPrompt());
    }
    if (req.method === 'POST' && url.pathname === '/api/outline/start') {
      const body = await readBody(req);
      if (!body.text || body.text.trim().length < 20) return json(res, 400, { error: '원문 텍스트가 너무 짧습니다.' });
      if (backend() === 'none') return json(res, 400, { error: NO_BACKEND });
      const j = startJob(body);
      return json(res, 200, jobSnapshot(j));
    }
    if (req.method === 'GET' && url.pathname === '/api/outline/status') {
      const j = JOBS.get(url.searchParams.get('job'));
      if (!j) return json(res, 404, { error: '작업을 찾을 수 없습니다 (서버가 재시작되었을 수 있음).' });
      const snap = jobSnapshot(j); if (j.kind) { snap.kind = j.kind; snap.cmd = j.cmd; }
      return json(res, 200, snap);
    }
    if (req.method === 'POST' && url.pathname === '/api/outline/cancel') {
      const body = await readBody(req); const j = JOBS.get(body.job);
      if (j) cancelJob(j);
      return json(res, 200, j ? jobSnapshot(j) : { state: 'cancelled' });
    }
    if (req.method === 'GET' && url.pathname === '/api/estimate') {
      return json(res, 200, estimate(Number(url.searchParams.get('chars') || 0)));
    }
    if (req.method === 'POST' && url.pathname === '/api/outline') {
      const be = backend();
      if (be === 'none') return json(res, 400, { error: NO_BACKEND + '\n또는 프롬프트 복사 → 내 AI 에 붙여 생성 → JSON 붙여넣기.' });
      const body = await readBody(req);
      if (!body.text || body.text.trim().length < 20) return json(res, 400, { error: '원문 텍스트가 너무 짧습니다.' });
      try {
        const r = be === 'api' ? await generateOutline(body)
                : be === 'openai' ? await generateOutlineViaOpenAI(body)
                : await generateOutlineViaCLI(body);
        return json(res, 200, r);
      } catch (e) {
        if (e.kind === 'auth') return json(res, 401, { error: e.message, kind: 'auth', cmd: e.cmd });
        if (e instanceof Anthropic.AuthenticationError) return json(res, 401, { error: 'API 키가 유효하지 않습니다.' });
        if (e instanceof Anthropic.RateLimitError) return json(res, 429, { error: '요청 한도 초과. 잠시 후 다시 시도하세요.' });
        if (e instanceof Anthropic.APIError) return json(res, e.status || 500, { error: `API 오류 ${e.status}: ${e.message}` });
        return json(res, 500, { error: e.message });
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/asset') {
      const { project, filename, data } = await readBody(req);
      const p = slug(project), name = path.basename(filename).replace(/[^\w.가-힣-]+/g, '_');
      const dir = path.join(WS, p, 'out', 'assets'); fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, name), Buffer.from(data, 'base64'));
      return json(res, 200, { path: `assets/${name}`, url: `/ws/${p}/out/assets/${name}` });
    }
    if (req.method === 'POST' && url.pathname === '/api/extract') {
      const { project, filename, data } = await readBody(req);
      const p = slug(project), dir = path.join(WS, p); fs.mkdirSync(path.join(dir, 'out', 'assets'), { recursive: true });
      const src = path.join(dir, 'source.pptx');
      fs.writeFileSync(src, Buffer.from(data, 'base64'));
      const r = await run('python3', [path.join(SCRIPTS, 'extract_pptx.py'), src, path.join(dir, 'outline.draft.json'), '--images', path.join(dir, 'out', 'assets')], SCRIPTS);
      if (r.code !== 0) return json(res, 500, { error: r.out });
      const outline = JSON.parse(fs.readFileSync(path.join(dir, 'outline.draft.json'), 'utf8'));
      return json(res, 200, { outline, log: r.out, source: filename });
    }
    if (req.method === 'POST' && url.pathname === '/api/build') {
      const { project, outline, targets } = await readBody(req);
      if (!outline || !outline.sections) return json(res, 400, { error: 'outline 이 없습니다.' });
      return json(res, 200, await build(slug(project), outline, Array.isArray(targets) && targets.length ? targets : undefined));
    }
    if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname.startsWith('/ws/')) {
      const rel = decodeURIComponent(url.pathname.slice(4));
      const file = path.resolve(WS, rel);
      if (!file.startsWith(WS) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
      const ext = path.extname(file).toLowerCase();
      const dl = url.searchParams.get('dl');
      const dlName = dl && /^[\w.-]+$/.test(dl) && path.extname(dl).toLowerCase() === ext ? dl : path.basename(file);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store', ...(ext === '.pptx' || ext === '.pdf' ? { 'Content-Disposition': `attachment; filename="${dlName}"; filename*=UTF-8''${encodeURIComponent(dlName)}` } : {}) });
      if (req.method === 'HEAD') return res.end();
      return fs.createReadStream(file).pipe(res);
    }
    // 표지 미리보기용 규격 — 글자 크기·줄간격·자간·좌표를 lib/common.mjs 에서 그대로 내려준다
    if (req.method === 'GET' && url.pathname === '/api/coverspec') {
      return json(res, 200, {
        type: TYPE, box: COVER_BOX, scrim: COVER_SCRIM,
        backgrounds: COVER_BG_KEYS.map(k => {
          const div = dividerBgFile(k);
          return { key: k, label: COVER_BG_LABEL[k], src: '/asset/' + coverBgFile(k).replace(/^assets\//, ''),
                   divider: div ? '/asset/' + div.replace(/^assets\//, '') : null,
                   scrim: coverScrim(k) };   // 배경마다 다르다 — 덮지 않는 배경은 'none'
        }),
        logo: '/asset/logo_h_white.png',
      });
    }
    // 스킬 assets 정적 서빙 (표지 배경 그림, 로고)
    if (req.method === 'GET' && url.pathname.startsWith('/asset/')) {
      const rel = decodeURIComponent(url.pathname.slice('/asset/'.length));
      const f = path.resolve(ASSETS, rel);
      if (!f.startsWith(ASSETS + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'public, max-age=3600' });
      return res.end(fs.readFileSync(f));
    }
    if (req.method === 'GET' && url.pathname.startsWith('/ref/')) {
      const f = path.join(REFS, path.basename(url.pathname));
      if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': MIME['.md'] }); return res.end(fs.readFileSync(f));
    }
    res.writeHead(404); res.end('not found');
  } catch (e) {
    json(res, 500, { error: e.message });
  }
});
// 127.0.0.1 로 묶는다. 호스트를 비우면 모든 네트워크 카드에 열려서, 같은 와이파이에 있는
// 사람이 로그인 없이 들어와 덱을 만들고 내 AI 사용량을 쓸 수 있다. 이 서버에는 로그인이 없다.
// 다른 기기에서 봐야 하면 HOST=0.0.0.0 을 직접 줘야 한다.
const HOST = process.env.HOST || '127.0.0.1';
server.listen(PORT, HOST, () => {
  console.log(`ppt-maker UI → http://localhost:${PORT}${HOST !== '127.0.0.1' ? ` (${HOST} 에 열림 — 같은 망의 다른 사람도 들어올 수 있다)` : ''}   (AI backend: ${backend()}${backend()==='cli' ? ' — ' + CLAUDE_BIN : ''}${backend()==='none' ? ' — 프롬프트 복사 모드' : ''})`);
});
