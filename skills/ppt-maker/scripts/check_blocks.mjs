#!/usr/bin/env node
// 아웃라인의 블록 선택을 덱 전체로 검사한다. 기준은 references/block-choice.md 4·5절.
// 빌드 전에 돌린다(브라우저 없이 outline.json 만 읽는다). 지적은 전부 warn — 종료코드는 --strict 일 때만 1.
//
//   why-missing     장표에 slide.why(블록을 고른 근거)가 없음
//   block-run       같은 주 블록이 3장 연속
//   block-share     한 블록이 본문 장의 40% 초과
//   block-variety   본문 6장 이상인데 블록 종류 4가지 미만
//   numbers-as-text 숫자가 많은데 stats·chart·bigstat 이 한 장도 없음
//   bullets-overuse bullets 가 주 블록인 장이 2장 이상
//
// 사용: node check_blocks.mjs <outline.json> [--strict] [--json out.json]
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const file = path.resolve(args.find(a => !a.startsWith('--')) || 'outline.json');
const strict = args.includes('--strict');
const jsonAt = args.includes('--json') ? path.resolve(args[args.indexOf('--json') + 1]) : null;
const outline = JSON.parse(fs.readFileSync(file, 'utf8'));

// 본문 장만 — 부록은 근거 자료라 다양성 검사에서 뺀다
const slides = [];
for (const s of outline.sections || []) {
  for (const sl of s.slides || []) {
    if (!Array.isArray(sl.blocks) || !sl.blocks.length) continue;
    slides.push({ no: slides.length + 1, section: s.title, title: sl.title || '', why: sl.why, blocks: sl.blocks });
  }
}

// 주 블록 = 띠(callout·flow·strip)가 아닌 첫 블록 (띠만 있으면 첫 블록)
const BANDS = new Set(['callout', 'flow', 'strip']);
const mainOf = sl => (sl.blocks.find(b => !BANDS.has(b.type)) || sl.blocks[0]).type;
const strip = t => String(t || '').replace(/\*\*|<br>/g, '').trim();
const findings = [];
const add = (rule, msg, sl) => findings.push({ level: 'warn', rule, msg, slide: sl ? sl.no : null, title: sl ? strip(sl.title) : null });

for (const sl of slides) {
  sl.main = mainOf(sl);
  if (!sl.why || !String(sl.why).trim()) add('why-missing', `why 없음 (${sl.main})`, sl);
}

let run = 1;
for (let i = 1; i < slides.length; i++) {
  run = slides[i].main === slides[i - 1].main ? run + 1 : 1;
  if (run === 3) add('block-run', `${slides[i].main} 가 3장 연속 (${slides[i - 2].no}~${slides[i].no})`, slides[i]);
  else if (run > 3) add('block-run', `${slides[i].main} 가 ${run}장 연속`, slides[i]);
}

const n = slides.length;
const count = {};
for (const sl of slides) count[sl.main] = (count[sl.main] || 0) + 1;
if (n >= 5) {
  for (const [t, c] of Object.entries(count)) {
    if (c / n > 0.4) add('block-share', `${t} 가 본문 ${n}장 중 ${c}장 (${Math.round(c / n * 100)}%, 기준 40%)`);
  }
}
const kinds = Object.keys(count).length;
if (n >= 6 && kinds < 4) add('block-variety', `본문 ${n}장에 블록 ${kinds}가지 (${Object.keys(count).join('·')}), 기준 4가지 이상`);

// 숫자가 글로만 나열됐나: 블록 글 안의 "숫자+단위" 개수
const used = new Set(slides.flatMap(sl => sl.blocks.map(b => b.type)));
const hasNumberViz = used.has('stats') || used.has('chart') || used.has('bigstat') ||
  slides.some(sl => sl.blocks.some(b => (b.cards || b.columns || []).some(c => c.stat || c.chart || c.rows || c.highlight || c.bar)));
if (!hasNumberViz) {
  const text = JSON.stringify(slides.map(sl => sl.blocks));
  const nums = text.match(/\d[\d,.]*\s?(%|만|억|천|명|건|원|배|회|개|점|시간|분)/g) || [];
  if (nums.length >= 6) add('numbers-as-text', `숫자 ${nums.length}개가 글로만 있음 — stats·chart·cards rows 로 보여 줄 장이 있는지 확인`);
}

const bulletSlides = slides.filter(sl => sl.main === 'bullets');
if (bulletSlides.length >= 2) add('bullets-overuse', `bullets 가 주 블록인 장 ${bulletSlides.length}장 (${bulletSlides.map(s => s.no).join('·')}), 기준 1장 이하`);

if (jsonAt) fs.writeFileSync(jsonAt, JSON.stringify({ outline: path.basename(file), slides: n, mix: count, findings }, null, 2));

const mix = Object.entries(count).sort((a, b) => b[1] - a[1]).map(([t, c]) => `${t} ${c}`).join(' · ');
if (!findings.length) { console.log(`OK — 본문 ${n}장, 블록 ${mix}`); process.exit(0); }
console.log(`본문 ${n}장 — 블록 ${mix}\n지적 ${findings.length}건`);
for (const f of findings) {
  const at = f.slide ? `[${String(f.slide).padStart(2, '0')}] ` : '[덱] ';
  console.log(`  w ${f.rule.padEnd(16)} ${at}${f.msg}${f.title ? `  "${f.title.slice(0, 30)}"` : ''}`);
}
process.exit(strict ? 1 : 0);
