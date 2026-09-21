#!/usr/bin/env node
// Copyright (c) 2026 SafeAI. All rights reserved.
// See COPYRIGHT.md — 복제·수정·재배포는 허락 없이 할 수 없습니다.
// deck.html 을 헤드리스 크롬으로 실제 렌더해서 재고, 규칙에 어긋나는 곳을 찾는다.
// usage: node check_overflow.mjs <deck.html> [--json <audit.json>]
//        error 가 하나라도 있으면 exit code 1
//
// 검사 8종 (level: error 는 파일을 내보내기 전에 반드시 고친다)
//   canvas-overflow    error  1280×720 밖으로 나감
//   clipped            error  칸보다 내용이 길어 잘림
//   safe-area          error  좌우 여백(--pad)·아래 여백(--safe-bottom) 침범
//   low-contrast       error/warn  글자와 실제 배경색 대비가 WCAG AA 미달
//   font-too-small     warn   발표용 13pt / 제출용 10pt 미만
//   korean-orphan      warn   마지막 줄에 두 글자 이하나 조사만 남음
//   text-collision     warn   글상자끼리 30% 넘게 겹침
//   vertical-imbalance warn   본문 아래가 캔버스의 28% 넘게 빔
//   layout-run         warn   같은 구성의 장이 3연속
//
// 규칙 목록과 수준 구분은 kez-lab/korean-presentation-skill (MIT) 의 감사 규칙에서 가져왔다.
// 측정 방식과 선택자는 우리 덱에 맞게 새로 썼다. 상세는 ../CREDITS.md
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const deck = path.resolve(args.find(a => !a.startsWith('--')) || 'deck.html');
const jsonAt = args.includes('--json')
  ? path.resolve(args[args.indexOf('--json') + 1])
  : path.join(path.dirname(deck), 'audit.json');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
// deck-stage.js 를 막아야 슬라이드가 1280×720 블록으로 평범하게 흐른다
await page.route(/deck-(stage|editor)\.js$/, r => r.abort());
await page.goto('file://' + deck, { waitUntil: 'networkidle' });
await page.addStyleTag({ content: 'deck-stage{display:block!important;visibility:visible!important}section.slide{position:relative!important;display:block!important}' });
await page.evaluate(() => document.fonts.ready);

const density = await page.evaluate(() => document.documentElement.dataset.density || 'dense');
const MIN_PT = density === 'airy' ? 13 : 10;      // 7.1 디자인 규칙
const n = await page.evaluate(() => document.querySelectorAll('section.slide').length);

const slides = [];
for (let i = 0; i < n; i++) {
  const r = await page.evaluate(({ i, MIN_PT }) => {
    const PARTICLE = /^(은|는|이|가|을|를|의|에|와|과|도|로|으로|만|께|부터|까지|에서|에게|이다|입니다|한다|합니다)$/;
    const sec = document.querySelectorAll('section.slide')[i];
    sec.scrollIntoView();
    const label = sec.dataset.label || `slide ${i + 1}`;
    const isContent = sec.dataset.fit === '1';
    const sr = sec.getBoundingClientRect();
    const out = [];
    const add = (level, rule, msg, el) => out.push({
      level, rule, msg,
      at: el ? `<${el.tagName.toLowerCase()}${el.className ? ' .' + String(el.className).trim().split(/\s+/)[0] : ''}>` : null,
      text: el ? (el.textContent || '').trim().slice(0, 40) : null,
    });
    const deco = el => el.closest('[data-deco]') || el.classList.contains('ring');
    // 머리말·꼬리말·쪽번호는 본문이 아니다 (7.1 규칙은 본문 기준)
    const CHROME = '.eyebrow,.foot,.ft,.pn,.pg,.pgno,.prog,.rule';
    const chrome = el => !!el.closest(CHROME);
    const vis = el => {
      const cs = getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity || '1') > 0.05;
    };

    // ── 1. 캔버스 밖으로 나감 ──────────────────────────────
    const seen = new Set();
    for (const el of sec.querySelectorAll('*')) {
      if (!el.offsetParent || deco(el) || !vis(el)) continue;
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      const over = Math.max(0, b.bottom - sr.bottom, b.right - sr.right, sr.left - b.left, sr.top - b.top);
      if (over > 1) {
        const k = 'ov' + el.className + (el.textContent || '').slice(0, 20);
        if (!seen.has(k)) { seen.add(k); add('error', 'canvas-overflow', `${Math.round(over)}px 밖으로 나감`, el); }
      }
    }
    // ── 2. 칸보다 내용이 길어 잘림 ─────────────────────────
    for (const el of sec.querySelectorAll('.body,.blk,.colbody,.cardx,.step .sd,.side,.txt,.ph,.tbl,.colm,.card,.stat,.step,.pic,.fill,.rt,.banner,.inner,.chart,.msg')) {
      const px = el.scrollHeight - el.clientHeight;
      if (px > 2) {
        const k = 'cl' + el.className + (el.textContent || '').slice(0, 20);
        if (!seen.has(k)) { seen.add(k); add('error', 'clipped', `${px}px 잘림`, el); }
      }
    }

    // 글이 들어 있는 말단 요소만 모은다
    const leaves = [...sec.querySelectorAll('*')].filter(el => {
      if (!el.offsetParent || deco(el) || !vis(el)) return false;
      if (!(el.textContent || '').trim()) return false;
      for (const c of el.children) if ((c.textContent || '').trim()) return false;
      const b = el.getBoundingClientRect();
      return b.width > 4 && b.height > 4;
    });

    // ── 3. 안전 여백 침범 (본문 장만) ──────────────────────
    if (isContent) {
      const cs = getComputedStyle(sec);
      const pad = parseFloat(cs.getPropertyValue('--pad')) || 44;
      const sb = parseFloat(cs.getPropertyValue('--safe-bottom')) || 48;
      for (const el of leaves) {
        const b = el.getBoundingClientRect();
        const l = sr.left + pad - b.left, rgt = b.right - (sr.right - pad), bot = b.bottom - (sr.bottom - sb);
        const worst = Math.max(l, rgt, bot);
        if (worst > 2) add('error', 'safe-area', `안전 여백을 ${Math.round(worst)}px 넘어섬`, el);
      }
    }

    // ── 4~6. 글자 단위 검사 ────────────────────────────────
    const toRgb = s => {
      const m = String(s).match(/rgba?\(([^)]+)\)/); if (!m) return null;
      const p = m[1].split(',').map(parseFloat);
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    };
    const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    const bgOf = el => {                      // 실제로 뒤에 칠해진 색. 이미지가 깔려 있으면 판단하지 않는다
      let nd = el;
      while (nd && nd !== document.body) {
        const cs = getComputedStyle(nd);
        if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
        const c = toRgb(cs.backgroundColor);
        if (c && c.a > 0.5) return c;
        nd = nd.parentElement;
      }
      return null;
    };
    const lastLine = el => {                  // 마지막 줄의 글자만 꺼낸다
      const rng = document.createRange(); rng.selectNodeContents(el);
      const rects = [...rng.getClientRects()].filter(x => x.width > 0 && x.height > 0);
      if (rects.length < 2) return '';
      const top = rects[rects.length - 1].top;
      const nodes = []; const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let t; while ((t = w.nextNode())) nodes.push(t);
      const total = nodes.reduce((a, x) => a + x.data.length, 0);
      if (!total) return '';
      const at = k => { for (const nd of nodes) { if (k <= nd.data.length) return [nd, k]; k -= nd.data.length; } const l = nodes[nodes.length - 1]; return [l, l.data.length]; };
      const topAt = k => { const [nd, off] = at(k); const rr = document.createRange(); rr.setStart(nd, off); rr.setEnd(nd, Math.min(off + 1, nd.data.length)); const b = rr.getBoundingClientRect(); return b.height ? b.top : null; };
      let lo = 0, hi = total;
      while (lo < hi) { const mid = (lo + hi) >> 1; const tp = topAt(mid); if (tp !== null && tp >= top - 1) hi = mid; else lo = mid + 1; }
      let s = '', seenN = 0;
      for (const nd of nodes) { const st = Math.max(0, lo - seenN); if (st < nd.data.length) s += nd.data.slice(st); seenN += nd.data.length; }
      return s.replace(/\s+/g, ' ').trim();
    };

    for (const el of leaves) {
      if (chrome(el)) continue;
      const cs = getComputedStyle(el);
      const px = parseFloat(cs.fontSize) || 0;
      const pt = px * 0.75;
      const bold = (parseInt(cs.fontWeight, 10) || 400) >= 600;
      // 4. 글자 크기 — 본문 장의 본문 글자만. 표지·간지·마무리의 작은 라벨은 의도된 것이다
      if (isContent && pt > 0 && pt < MIN_PT) add('warn', 'font-too-small', `${pt.toFixed(1)}pt (기준 ${MIN_PT}pt)`, el);
      // 5. 대비
      const fg = toRgb(cs.color), bg = isContent ? bgOf(el) : null;   // 배경 이미지 위 글자는 잴 수 없다
      if (fg && bg) {
        const large = px >= 24 || (px >= 18.66 && bold);
        const floor = large ? 3 : 4.5;
        const rt = ratio(fg, bg);
        if (rt < floor) add(rt < floor * 0.7 ? 'error' : 'warn', 'low-contrast', `${rt.toFixed(1)}:1 (기준 ${floor}:1)`, el);
      }
      // 6. 외톨이 조사
      const txt = (el.textContent || '').trim();
      if (/[가-힣]/.test(txt)) {
        const last = lastLine(el);
        const bare = last.replace(/[\s.,;:)\]」』"'…·]/g, '');
        if (last && /[가-힣]/.test(last) && (bare.length <= 2 || PARTICLE.test(bare))) {
          add('warn', 'korean-orphan', `마지막 줄에 "${last}"만 남음`, el);
        }
      }
    }

    // ── 7. 글상자 겹침 ─────────────────────────────────────
    // 두 줄로 접힌 인라인 요소는 전체 상자가 두 줄을 다 덮어서, 옆 항목과 겹친 것처럼 보인다.
    // 그래서 줄 단위 상자(getClientRects)끼리 견준다.
    const lineBoxes = el => [...el.getClientRects()].filter(r => r.width > 2 && r.height > 2);
    const boxed = leaves.map(el => ({ el, rects: lineBoxes(el) }));
    for (let a = 0; a < boxed.length; a++) {
      for (let b = a + 1; b < boxed.length; b++) {
        const A = boxed[a], B = boxed[b];
        if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
        let worst = 0;
        for (const ra of A.rects) for (const rb of B.rects) {
          const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
          const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
          if (w <= 0 || h <= 0) continue;
          const small = Math.min(ra.width * ra.height, rb.width * rb.height);
          if (small > 0) worst = Math.max(worst, (w * h) / small);
        }
        if (worst > 0.3) add('warn', 'text-collision', `"${(B.el.textContent || '').trim().slice(0, 16)}" 와 ${Math.round(worst * 100)}% 겹침`, A.el);
      }
    }

    // ── 8. 아래가 비었나 (본문 장만) ───────────────────────
    if (isContent) {
      const body = sec.querySelector('.body');
      if (body && leaves.length) {
        const br = body.getBoundingClientRect();
        let bottom = br.top;
        for (const el of leaves) { const b = el.getBoundingClientRect(); if (b.bottom > bottom && b.top >= br.top - 4) bottom = b.bottom; }
        const gap = br.bottom - bottom;
        if (gap > 720 * 0.28) out.push({ level: 'warn', rule: 'vertical-imbalance', msg: `본문 아래가 ${Math.round(gap)}px 빔 (기준 ${Math.round(720 * 0.28)}px)`, at: null, text: null });
      }
    }

    // 장 구성 지문 (연속 검사는 바깥에서)
    const kinds = ['ul.rl', '.card', '.tbl', '.stat', '.rm', '.pic', '.cmp', '.chart', '.banner', '.msg', '.hbox'];
    const sig = kinds.filter(k => sec.querySelector(k)).join('+') + '#' + sec.querySelectorAll('.card').length;

    return { label, isContent, sig, findings: out };
  }, { i, MIN_PT });
  slides.push({ no: i + 1, ...r });
}
await browser.close();

// ── 9. 같은 구성 3연속 ───────────────────────────────────
let run = 1;
for (let i = 1; i < slides.length; i++) {
  const a = slides[i], b = slides[i - 1];
  run = (a.isContent && b.isContent && a.sig === b.sig && a.sig !== '#0') ? run + 1 : 1;
  if (run >= 3) a.findings.push({ level: 'warn', rule: 'layout-run', msg: `같은 구성이 ${run}장 연속`, at: null, text: null });
}

const all = slides.flatMap(s => s.findings.map(f => ({ slide: s.no, label: s.label, ...f })));
const counts = { error: 0, warn: 0 };
for (const f of all) counts[f.level]++;

fs.writeFileSync(jsonAt, JSON.stringify({
  deck: path.basename(deck), density, slides: slides.length, counts,
  passed: counts.error === 0,
  findings: all,
}, null, 2));

if (!all.length) { console.log(`OK — ${slides.length}장, 지적 없음  → ${path.basename(jsonAt)}`); process.exit(0); }
console.log(`${slides.length}장 검사 — error ${counts.error} · warn ${counts.warn}  → ${path.basename(jsonAt)}`);
for (const s of slides) {
  if (!s.findings.length) continue;
  console.log(`\n[${String(s.no).padStart(2, '0')}] ${s.label}`);
  for (const f of s.findings) {
    console.log(`   ${f.level === 'error' ? 'E' : 'w'} ${f.rule.padEnd(18)} ${f.msg}${f.at ? '  ' + f.at : ''}${f.text ? ` "${f.text}"` : ''}`);
  }
}
process.exit(counts.error ? 1 : 0);
