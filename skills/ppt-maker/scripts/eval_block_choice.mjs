#!/usr/bin/env node
// 블록 선택 시험: tests/block-choice/cases.json 의 원문 조각마다 AI 가 블록을 고르게 하고 정답과 비교한다.
// AI 에게 주는 기준은 references/block-choice.md + outline-schema.md 의 블록 표 — 웹 화면(app/server.mjs)과 같은 문서다.
// claude CLI 를 쓴다(웹 화면의 CLI 경로와 같은 호출). 모델은 PPT_MAKER_CLI_MODEL (기본 opus).
//
// 사용: node eval_block_choice.mjs [--only 3,7] [--json out.json]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = k => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const only = opt('--only') ? new Set(opt('--only').split(',').map(Number)) : null;
const jsonAt = opt('--json') ? path.resolve(opt('--json')) : null;

const { cases: all } = JSON.parse(fs.readFileSync(path.join(SKILL, 'tests/block-choice/cases.json'), 'utf8'));
const cases = only ? all.filter(c => only.has(c.id)) : all;

const choice = fs.readFileSync(path.join(SKILL, 'references/block-choice.md'), 'utf8');
const schema = fs.readFileSync(path.join(SKILL, 'references/outline-schema.md'), 'utf8');
const blockTable = schema.slice(schema.indexOf('## 블록 타입'), schema.indexOf('## 자동으로 처리되는 것'));

const system = `당신은 발표자료 기획자다. 원문 조각마다 장표 한 장의 주 블록(callout 제외)을 하나 고른다.
각 조각은 서로 다른 덱의 장표다. 앞뒤 조각과의 다양성은 따지지 말고 조각마다 따로 판단한다.

# 블록 고르는 기준
${choice}

# 블록 필드
${blockTable}

# 출력
JSON 배열 하나만. 코드펜스·설명 없이. [{"id": 1, "block": "chart", "why": "신호 → 블록 한 줄"}]`;

const user = cases.map(c => `[${c.id}] ${c.text}`).join('\n\n');
const model = process.env.PPT_MAKER_CLI_MODEL || 'opus';
console.log(`사례 ${cases.length}개 · 모델 ${model} — 고르는 중…`);
const out = execFileSync('claude', ['-p', '--output-format', 'text', '--model', model, '--no-session-persistence', '--tools', '', '--system-prompt', system], { input: user, encoding: 'utf8', maxBuffer: 1 << 24 });
const picks = JSON.parse(out.slice(out.indexOf('['), out.lastIndexOf(']') + 1));
const byId = new Map(picks.map(p => [Number(p.id), p]));

let ok = 0;
const rows = cases.map(c => {
  const p = byId.get(c.id) || {};
  const hit = c.answer.includes(p.block);
  if (hit) ok++;
  return { id: c.id, pair: c.pair, answer: c.answer, picked: p.block || '(없음)', why: p.why || '', hit };
});

for (const r of rows) {
  console.log(`${r.hit ? 'O' : 'X'} [${String(r.id).padStart(2, '0')}] ${r.picked.padEnd(9)} 정답 ${r.answer.join('/').padEnd(18)} ${r.why}`);
}
const pct = Math.round(ok / cases.length * 100);
console.log(`\n맞힘 ${ok}/${cases.length} (${pct}%)`);
const miss = rows.filter(r => !r.hit);
if (miss.length) {
  const byPair = {};
  for (const r of miss) byPair[r.pair] = (byPair[r.pair] || 0) + 1;
  console.log('틀린 짝: ' + Object.entries(byPair).map(([k, v]) => `${k} ${v}`).join(' · '));
}
if (jsonAt) fs.writeFileSync(jsonAt, JSON.stringify({ model, total: cases.length, ok, pct, rows }, null, 2));
