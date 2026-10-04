// usage: node template_thumbs.mjs <deck.html> <outdir>
// 덱의 장표를 한 장씩 PNG 썸네일(640×360)로 찍는다. 디자인 시스템 화면의 "템플릿 24종" 견본에 쓴다.
import { chromium } from 'playwright';
import fs from 'fs'; import path from 'path';
const [, , deck, outdir] = process.argv;
if (!deck || !outdir) { console.error('usage: node template_thumbs.mjs <deck.html> <outdir>'); process.exit(1); }
fs.mkdirSync(outdir, { recursive: true });
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 0.5 });
const url = 'file://' + path.resolve(deck) + '?_snthumb=1';
await p.goto(url); await p.waitForTimeout(1200);
const n = await p.evaluate(() => document.querySelector('deck-stage').children.length);
// 편집 단추와 아래 넘김 막대는 찍지 않는다
await p.addStyleTag({ content: '.de-editbtn,.de-status{display:none!important}' });
await p.evaluate(() => { const st = document.createElement('style'); st.textContent = '.overlay{display:none!important}';
  document.querySelector('deck-stage').shadowRoot.appendChild(st); });
for (let i = 1; i <= n; i++) {
  if (i > 1) { await p.keyboard.press('ArrowRight'); await p.waitForTimeout(350); }
  await p.screenshot({ path: path.join(outdir, String(i).padStart(2, '0') + '.png') });
}
await b.close(); console.log(n + ' thumbs →', outdir);
