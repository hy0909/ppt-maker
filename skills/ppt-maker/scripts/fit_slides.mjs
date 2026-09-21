#!/usr/bin/env node
// Copyright (c) 2026 SafeAI. All rights reserved.
// See COPYRIGHT.md — 복제·수정·재배포는 허락 없이 할 수 없습니다.
// Fill-Space pass: for every content slide, find the largest body scale --k (within [kmin, kmax])
// that does not overflow, write it into deck.html (style="--k:…") and into fit.json (for build_pptx).
// usage: node fit_slides.mjs <deck.html> [--kmax 1.6] [--kmin 0.75]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const deck = path.resolve(args[0] || 'deck.html');
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? parseFloat(args[i + 1]) : def; };
const kmin = opt('--kmin', 0.75);
let html = fs.readFileSync(deck, 'utf8');
const kmaxDefault = parseFloat((html.match(/--kmax:([\d.]+)/) || [])[1] || '1.6');
const kmax = opt('--kmax', kmaxDefault);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.route(/deck-(stage|editor)\.js$/, r => r.abort());
await page.goto('file://' + deck, { waitUntil: 'networkidle' });
await page.addStyleTag({ content: 'deck-stage{display:block!important;visibility:visible!important}section.slide{position:relative!important;display:block!important}' });
await page.evaluate(() => document.fonts.ready);

const fits = await page.evaluate(({ kmin, kmax }) => {
  const overflows = (sec) => {
    const sr = sec.getBoundingClientRect();
    for (const el of sec.querySelectorAll('.body, .blk, .colbody, .cardx, .step .sd, .side, .txt, .ph, .tbl, .colm, .bul, .card, .stat, .step, .pic, .fill, .rt, .banner, .inner, .chart, .msg')) {
      if (el.scrollHeight - el.clientHeight > 1 || el.scrollWidth - el.clientWidth > 1) return true;
    }
    for (const el of sec.querySelectorAll('.body *')) {
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      if (b.bottom - sr.bottom > 1 || b.right - sr.right > 1) return true;
    }
    // body must not run into the footer/page-number zone
    const body = sec.querySelector('.body');
    if (body) {
      const bb = body.getBoundingClientRect();
      const safeBottom = parseFloat(getComputedStyle(sec).getPropertyValue('--safe-bottom')) || 52;
      if (bb.bottom > sr.bottom - safeBottom + 2) return true;
    }
    return false;
  };
  const out = {};
  document.querySelectorAll('section.slide[data-fit]').forEach(sec => {
    const order = sec.id.replace(/^s/, '');
    let lo = kmin, hi = kmax, best = null;
    // first check kmax itself
    sec.style.setProperty('--k', String(hi)); void sec.offsetHeight;
    if (!overflows(sec)) { out[order] = hi; return; }
    sec.style.setProperty('--k', String(lo)); void sec.offsetHeight;
    if (overflows(sec)) { out[order] = lo; sec.dataset.overflow = '1'; return; }
    for (let i = 0; i < 8; i++) {
      const mid = (lo + hi) / 2;
      sec.style.setProperty('--k', String(mid)); void sec.offsetHeight;
      if (overflows(sec)) hi = mid; else { lo = mid; best = mid; }
    }
    out[order] = Math.floor((best ?? lo) * 100) / 100;
  });
  return out;
}, { kmin, kmax });

// 2단계: 카드 안 줄 간격을 남는 높이에 맞춘다 — 넘치지 않으면서 흰 여백이 남지 않게.
const gaps = await page.evaluate(({ MING, MAXG }) => {
  // 간격을 벌린 뒤 장표 전체가 넘치지 않는지도 같이 본다(표·그래프가 밀려나는 것 방지)
  const secOver = (sec) => {
    if (!sec) return false;
    const sr = sec.getBoundingClientRect();
    for (const el of sec.querySelectorAll('.body, .blk, .inner, .card, .stat, .side, .tbl, .rt, .chart, .banner, .bd, .fill, .step, .pic')) {
      if (el.scrollHeight - el.clientHeight > 1 || el.scrollWidth - el.clientWidth > 1) return true;
    }
    const body = sec.querySelector('.body');
    if (body) {
      const safeBottom = parseFloat(getComputedStyle(sec).getPropertyValue('--safe-bottom')) || 44;
      if (body.getBoundingClientRect().bottom > sr.bottom - safeBottom + 2) return true;
    }
    return false;
  };
  const out = {};
  document.querySelectorAll('.card > .bd, .stat > .bd, .side > .bd, .banner .msg').forEach((bd, i) => {
    const list = bd.querySelector('ul.rl');
    if (!list) return;
    const items = list.children.length;
    const id = 'g' + i;
    list.dataset.gapId = id;
    const em = parseFloat(getComputedStyle(list).fontSize) || 16;
    const setGap = (g) => { list.style.setProperty('--rl-gap', g.toFixed(2) + 'em'); void bd.offsetHeight; };
    const fill = list.closest('.fill') || list.parentElement;
    const over = () => [bd, fill, list].some(el => el && (el.scrollHeight - el.clientHeight > 1));
    // 먼저 최소 간격으로 줄여 넘침 여부 확인
    setGap(MING);
    if (over()) { out[id] = MING; return; }
    if (items < 2) { out[id] = MING; return; }
    // 남는 높이를 항목 사이로 나눠 준다(최대 MAXG). 배너는 조금 촘촘하게.
    const free = bd.clientHeight - bd.scrollHeight;
    const cap = bd.classList.contains('msg') ? 0.5 : MAXG;   // 배너는 촘촘하게
    let g = MING + (free / (items - 1)) / em * 0.8;
    g = Math.max(MING, Math.min(cap, g));
    setGap(g);
    const sec = bd.closest('section.slide');
    while ((over() || secOver(sec)) && g > MING) { g = Math.max(MING, g - 0.08); setGap(g); }
    out[id] = g;
  });
  // 마지막 안전장치: 간격을 조정한 뒤에도 넘치는 장표는 본문 배율(--k)을 조금씩 낮춘다
  document.querySelectorAll('section.slide[data-fit]').forEach(sec => {
    let k = parseFloat(sec.style.getPropertyValue('--k')) || 1;
    let guard = 0;
    while (secOver(sec) && k > 0.75 && guard++ < 20) {
      k = Math.max(0.75, Math.round((k - 0.04) * 100) / 100);
      sec.style.setProperty('--k', String(k)); void sec.offsetHeight;
    }
    out['k:' + sec.id.replace(/^s/, '')] = k;
  });
  return out;
}, { MING: 0.4, MAXG: 0.9 });

// 계산한 간격을 HTML 에 새겨 넣는다
const gapHtml = await page.evaluate(() => document.querySelector('deck-stage, body').innerHTML);
await browser.close();

for (const [key, v] of Object.entries(gaps)) {
  if (key.startsWith('k:')) fits[key.slice(2)] = Math.floor(v * 100) / 100;   // 안전장치에서 낮춘 배율을 반영
}
// bake into deck.html: 줄 간격(--rl-gap) 은 브라우저에서 계산한 인라인 스타일을 그대로 옮겨 담는다
if (gapHtml) {
  const bodyStart = html.indexOf('<deck-stage');
  const bodyEnd = html.lastIndexOf('</deck-stage>');
  if (bodyStart >= 0 && bodyEnd > bodyStart) {
    const inner = gapHtml.replace(/^[\s\S]*?<deck-stage[^>]*>/, '').replace(/<\/deck-stage>[\s\S]*$/, '');
    const open = html.slice(bodyStart, html.indexOf('>', bodyStart) + 1);
    html = html.slice(0, bodyStart) + open + inner + html.slice(bodyEnd);
  }
}
for (const [order, k] of Object.entries(fits)) {
  const re = new RegExp(`(<section class="slide"[^>]*id="s${order}"[^>]*?)( style="--k:[\\d.]+")?(>)`);
  html = html.replace(re, (m, a, _b, c) => `${a} style="--k:${k}"${c}`);
}
fs.writeFileSync(deck, html);
const fitFile = path.join(path.dirname(deck), 'fit.json');
fs.writeFileSync(fitFile, JSON.stringify(fits, null, 2));

const vals = Object.values(fits);
console.log(`fit: ${vals.length} slides, k range ${Math.min(...vals)} – ${Math.max(...vals)} (kmin ${kmin}, kmax ${kmax}) → ${path.basename(deck)}, fit.json`);
const tight = Object.entries(fits).filter(([, k]) => k <= kmin + 0.01);
if (tight.length) console.log(`⚠ still overflowing at kmin (content too long, split the slide): #${tight.map(([o]) => o).join(', #')}`);
