#!/usr/bin/env node
// Copyright (c) 2026 SafeAI. All rights reserved.
// See COPYRIGHT.md — 복제·수정·재배포는 허락 없이 할 수 없습니다.
// deck.html → PDF (one page per slide) + optional PNG thumbnails, via headless Chromium.
// usage: node export_pdf.mjs <deck.html> [out.pdf] [--png <dir>] [--scale 0.5]
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
if (!args[0]) { console.error('usage: node export_pdf.mjs <deck.html> [out.pdf] [--png <dir>] [--scale 0.5]'); process.exit(1); }
const deck = path.resolve(args[0]);
const outPdf = path.resolve(args[1] && !args[1].startsWith('--') ? args[1] : deck.replace(/\.html?$/, '.pdf'));
const pngIdx = args.indexOf('--png');
const pngDir = pngIdx >= 0 ? path.resolve(args[pngIdx + 1]) : null;
const scaleIdx = args.indexOf('--scale');
const scale = scaleIdx >= 0 ? parseFloat(args[scaleIdx + 1]) : 0.5;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
await page.goto('file://' + deck, { waitUntil: 'networkidle' });
await page.waitForFunction(() => customElements.get('deck-stage') !== undefined);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);

// PDF: deck-stage.js injects @page 1280x720 on print → 1 slide per page
await page.emulateMedia({ media: 'print' });
await page.pdf({ path: outPdf, width: '1280px', height: '720px', printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
console.log(`PDF written → ${outPdf}`);

if (pngDir) {
  // thumbnails: load the deck WITHOUT deck-stage.js (blocked) so sections lay out as plain
  // 1280x720 blocks in normal flow, then screenshot each <section.slide>.
  fs.mkdirSync(pngDir, { recursive: true });
  const thumb = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: scale });
  await thumb.route(/deck-(stage|editor)\.js$/, r => r.abort());
  await thumb.goto('file://' + deck, { waitUntil: 'networkidle' });
  await thumb.addStyleTag({ content: 'deck-stage{display:block!important;visibility:visible!important}section.slide{position:relative!important;display:block!important;margin:0 0 8px 0}html,body{background:#fff}' });
  await thumb.evaluate(() => document.fonts.ready);
  const secs = await thumb.$$('section.slide');
  for (let i = 0; i < secs.length; i++) {
    await secs[i].scrollIntoViewIfNeeded();
    await secs[i].screenshot({ path: path.join(pngDir, `slide-${String(i + 1).padStart(2, '0')}.png`) });
  }
  console.log(`${secs.length} PNG thumbnails → ${pngDir}`);
}
await browser.close();
