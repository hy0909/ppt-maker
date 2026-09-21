#!/usr/bin/env node
// Copyright (c) 2026 SafeAI. All rights reserved.
// See COPYRIGHT.md — 복제·수정·재배포는 허락 없이 할 수 없습니다.
// usage: node build_pptx.mjs <outline.json> [outdir]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pptxgen from 'pptxgenjs';
import { chromium } from 'playwright';
import { loadOutline, flattenSlides, derivePalette, DENSITY, richRuns, normItem, slideLabel, SLIDE_W, SLIDE_H, mix,
         TYPE, COVER_BOX, AGENDA_BOX, coverBgFile, closingBgCss, coverScrim,
         dividerBgFile, DIVIDER_SCRIM, SLIDE_FOOT, footLines, footSafeBottom, SHAPE, HEAD, FRAME } from './lib/common.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_ASSETS = path.resolve(__dirname, '..', 'assets');
const [, , outlineFile, outdirArg] = process.argv;
if (!outlineFile) { console.error('usage: node build_pptx.mjs <outline.json> [outdir]'); process.exit(1); }

const outline = loadOutline(outlineFile);
const outdir = path.resolve(outdirArg || path.dirname(outline._file));
const { meta } = outline;
const P_base = derivePalette(meta.brand);
const P = { ...P_base, page: '#E9ECF0', title: '#10141C' };  // minimal card design: light grey page, near-black headline
const D = DENSITY[meta.density] || DENSITY.dense;
const slides = flattenSlides(outline);
const fitFile = path.join(outdir, 'fit.json');
const K_DAMP = 0.92;
const PAD = FRAME.pad; // --pad in build_html.mjs (사용자 원본 PPTX 기준 좌우 40px)
const FIT = fs.existsSync(fitFile) ? JSON.parse(fs.readFileSync(fitFile, 'utf8')) : {};
const FONT = meta.font || 'Pretendard';
const FONT_TITLE = 'Paperlogy 6 SemiBold';      // 본문 장표 헤드라인
const FONT_TITLE_B = 'Paperlogy 8 ExtraBold';   // 헤드라인 안 **강조**, 간지·마무리 큰 제목
const NUM = n => String(n); // 목차·간지 번호는 항상 1·2·3 숫자
const plainTitle = String(meta.title || '').replace(/<br\s*\/?>/gi, ' ').replace(/\*\*/g, '');
const TOTAL = slides.length;   // 간지 하단의 'N/Mp' 표기용

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE';
pres.author = meta.company || '';
pres.title = meta.title;

// ─── unit helpers ───────────────────────────────────────────────
const IN = px => +(px / 96).toFixed(4);
const PT = (px, k = 1) => +(px * 0.75 * k).toFixed(1);
const PXL = pt => +(pt * 96 / 72).toFixed(2);   // pt → px (1280×720 화면 기준)
const C = hex => String(hex || '').replace(/^#/, '');
const asset = rel => { const p = path.resolve(outdir, rel); return fs.existsSync(p) ? p : path.join(SKILL_ASSETS, path.basename(rel)); };

function colorToHex(color) {
  if (!color) return 'FFFFFF';
  const s = String(color).trim();
  if (s.startsWith('#')) return s.replace('#', '').toUpperCase().padEnd(6, '0');
  const m = s.match(/rgba\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/);
  if (m) {
    const alpha = parseFloat(m[4]);
    const blend = (v) => Math.round(255 + (v - 255) * alpha);
    const br = blend(parseInt(m[1])), bg = blend(parseInt(m[2])), bb = blend(parseInt(m[3]));
    return [br, bg, bb].map(x => x.toString(16).padStart(2, '0').toUpperCase()).join('');
  }
  const m2 = s.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (m2) return [m2[1], m2[2], m2[3]].map(x => parseInt(x).toString(16).padStart(2, '0').toUpperCase()).join('');
  return 'FFFFFF';
}

/** 둥근 모서리 반지름(px) → 규격 안에 들어오는 값. adj 상한(50000 = 짧은 변의 50%)을 넘으면 PowerPoint 가 파일을 거부한다. */
const radiusPx = (r, w, h) => Math.max(0, Math.min(r, Math.min(Math.abs(w), Math.abs(h)) * 0.499));

function rect(slide, x, y, w, h, { fill, line, radius = 0, dash } = {}) {
  w = Math.max(1, w); h = Math.max(1, h); // CRITICAL: clamp to minimum 1px
  slide.addShape(radius ? pres.shapes.ROUNDED_RECTANGLE : pres.shapes.RECTANGLE, {
    x: IN(x), y: IN(y), w: IN(w), h: IN(h),
    fill: fill ? { color: colorToHex(fill) } : { type: 'none' },
    line: line ? { color: colorToHex(line.color), width: line.width ?? 1, dashType: dash || 'solid' } : { type: 'none' },
    rectRadius: radius ? IN(radiusPx(radius, w, h)) : 0,
  });
}

function text(slide, str, x, y, w, h, { size, color = P.text, bold = false, align = 'left', valign = 'top', fill, line, radius = 0, margin = 0, lineSpacing = 1.3, lineSpacingPt = 0, face, bullets = false, italic = false, k = 1, letterSpacing = -0.8 } = {}) {
  w = Math.max(1, w); h = Math.max(1, h); // CRITICAL: clamp to minimum 1px
  const base = { fontFace: face || FONT, fontSize: PT(size, k), color: colorToHex(color), bold, italic, breakLine: false };
  let runs;
  if (Array.isArray(str)) {
    runs = [];
    str.forEach((p, i) => {
      const o = typeof p === 'string' ? { text: p } : p;
      const pb = { ...base, ...(o.size ? { fontSize: PT(o.size, k) } : {}), ...(o.color ? { color: colorToHex(o.color) } : {}), ...(o.bold !== undefined ? { bold: o.bold } : {}) };
      const rr = richRuns(o.text, pb);
      if (bullets) rr[0].options.bullet = true;
      if (o.spaceAfter !== undefined) rr[0].options.paraSpaceAfter = o.spaceAfter;
      rr[rr.length - 1].options.breakLine = i < str.length - 1;
      runs.push(...rr);
    });
  } else runs = richRuns(str, base);
  slide.addText(runs, {
    x: IN(x), y: IN(y), w: IN(w), h: IN(h), align, valign, margin: IN(margin) * 72,
    // 고정 줄간격(pt)이 오면 배수 대신 그것을 쓴다 — 원본 PPTX 의 '고정 58.6pt' 같은 값
    ...(lineSpacingPt ? { lineSpacing: lineSpacingPt } : { lineSpacingMultiple: lineSpacing }),
    fill: fill ? { color: colorToHex(fill) } : undefined,
    line: line ? { color: colorToHex(line.color), width: line.width ?? 1 } : undefined,
    shape: radius ? pres.shapes.ROUNDED_RECTANGLE : undefined, rectRadius: radius ? IN(radius) : undefined,
    charSpacing: letterSpacing, fit: 'none', autoFit: false,
  });
}

/* altText 를 반드시 준다. 비워 두면 pptxgenjs 가 파일의 전체 경로를 대체 텍스트로 넣어,
   만든 사람 컴퓨터의 폴더 이름이 PPTX 안에 그대로 남는다. */
function image(slide, rel, x, y, w, h, contain = true) {
  if (!rel) return false;
  const p = path.resolve(outdir, rel);
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) return false;
  slide.addImage({ path: p, altText: path.basename(rel), x: IN(x), y: IN(y), w: IN(w), h: IN(h), sizing: { type: contain ? 'contain' : 'cover', w: IN(w), h: IN(h) } });
  return true;
}

function logo(slide, dark = true) {
  const rel = dark ? meta.logo.dark : meta.logo.light;
  const p = asset(rel);
  if (!fs.existsSync(p)) return;
  const h = 20, w = 80;
  slide.addImage({ path: p, altText: '로고', x: IN(SLIDE_W - 53 - w), y: IN(30), w: IN(w), h: IN(h), sizing: { type: 'contain', w: IN(w), h: IN(h) } });
}

function estW(str, sizePx) {
  const t = String(str || '').replace(/\*\*/g, '');
  const cjk = (t.match(/[ᄀ-ᇿ㄰-㆏가-힯一-鿿]/g) || []).length;
  return cjk * sizePx * 0.92 + (t.length - cjk) * sizePx * 0.52;
}
function slide_dot(slide, x, y, d, color) { slide.addShape(pres.shapes.OVAL, { x: IN(x), y: IN(y), w: IN(d), h: IN(d), fill: { color: colorToHex(color) }, line: { type: 'none' } }); }
function calloutH(b, k, w) {
  const px = D.body * k * 0.9, py = D.body * k * 0.7;
  const n = lines(b.text || '', D.cardTitle * k, w - px * 2);
  return Math.max(60, py * 2 + D.small * k * 1.6 + n * D.cardTitle * k * 1.35 + 4);
}
function lines(str, sizePx, widthPx) {
  const s = String(str || '').replace(/\*\*/g, '').replace(/<br\s*\/?>/gi, ' ');
  const cjk = (s.match(/[ᄀ-ᇿ㄰-㆏가-힯一-鿿]/g) || []).length;
  const est = cjk * sizePx * 0.92 + (s.length - cjk) * sizePx * 0.52;
  return Math.max(1, Math.ceil(est / Math.max(widthPx, 1)));
}

// ─── 배경 이미지(그라데이션) 를 out/assets 에 미리 그려 둔다 ────────
// PPTX 도형만으로는 CSS 그라데이션·반투명 워터마크를 재현할 수 없어 HTML 을 그대로 캡처해 배경으로 깐다.
const BG_PATH = path.join(outdir, 'assets', '_bg_gradient.png');     // 마무리 장표
const BG_DIVIDER = path.join(outdir, 'assets', '_bg_divider.png');   // 간지 (그라디언트)
// 표지 배경 = 고른 이미지 + 제목 자리 그라데이션. build_html.mjs 가 out/assets 로 복사해 둔 원본을
// 그대로 캡처해 한 장으로 합친다 — HTML 과 그림이 어긋나지 않는다.
const BG_COVER_SRC = path.resolve(outdir, coverBgFile(meta.coverBg));
// 원본이 무손실(PNG)이면 합친 것도 무손실로 — 줄무늬·경계가 뚜렷한 그림은 JPEG 에서 링잉이 생긴다
const COVER_LOSSLESS = path.extname(BG_COVER_SRC).toLowerCase() === '.png';
const BG_COVER = path.join(outdir, 'assets', '_bg_cover' + (COVER_LOSSLESS ? '.png' : '.jpg'));
// 간지도 표지에 짝이 되는 그림이 있으면 같은 방식으로 합친다. 없으면 브랜드 그라디언트.
const DIVIDER_REL = dividerBgFile(meta.coverBg);
const BG_DIV_SRC = DIVIDER_REL ? path.resolve(outdir, DIVIDER_REL) : null;
const DIV_LOSSLESS = !!BG_DIV_SRC && path.extname(BG_DIV_SRC).toLowerCase() === '.png';
const BG_DIVIDER_IMG = path.join(outdir, 'assets', '_bg_divider_img' + (DIV_LOSSLESS ? '.png' : '.jpg'));
const AGENDA_LINES = [];               // 목차 섹션명이 몇 줄이 되는지 — 브라우저에서 실제로 재서 채운다
const MEASURED = { badge: 0 };         // 표지 오른쪽 아래 상자 글자 폭(px)
async function renderBackgrounds() {
  fs.mkdirSync(path.dirname(BG_PATH), { recursive: true });
  const base = '*{margin:0}body{width:1280px;height:720px;overflow:hidden}';
  // 마무리 장표: build_html.mjs 의 .closing .cbg 와 같은 그라디언트
  const cover = `<!doctype html><style>${base}
.cbg{position:relative;width:1280px;height:720px;overflow:hidden;background:${closingBgCss(P)}}</style><div class="cbg"></div>`;
  // 간지: 포인트 컬러 그라데이션 + 오른쪽 아래 로고 워터마크 (build_html.mjs 의 .dv 와 동일)
  // setContent 로 띄운 about:blank 문서는 file:// 을 못 읽는다 → 로고를 data URI 로 심는다.
  const wm = asset(meta.logo.dark);
  const wmSrc = fs.existsSync(wm) ? `data:image/png;base64,${fs.readFileSync(wm).toString('base64')}` : '';
  const divider = `<!doctype html><style>${base}
.dv{position:relative;width:1280px;height:720px;overflow:hidden;background:linear-gradient(118deg,${P.primaryDeep} 0%,${P.primary} 54%,${P.primary2} 100%)}
.wm{position:absolute;right:${PAD}px;bottom:86px;width:620px;opacity:.12}</style>
<div class="dv">${wmSrc ? `<img class="wm" src="${wmSrc}">` : ''}</div>`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  const jobs = [[cover, BG_PATH]];
  if (!BG_DIV_SRC) jobs.push([divider, BG_DIVIDER]);
  for (const [html, out] of jobs) {
    await page.setContent(html);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1280, height: 720 } });
  }
  // 그림 배경(표지·간지): 이미지가 크니 data URI 대신 임시 HTML 을 그림 옆에 두고 file:// 로 연다
  const composite = async (src, out, scrim, lossless) => {
    if (!src || !fs.existsSync(src)) return false;
    const tmp = path.join(path.dirname(src), '_bg_tmp.html');
    fs.writeFileSync(tmp, `<!doctype html><style>${base}
.cbg{position:relative;width:1280px;height:720px;overflow:hidden;background:#000 url('${path.basename(src)}') center center / cover no-repeat}
.sc{position:absolute;inset:0;background:${scrim}}</style><div class="cbg"><div class="sc"></div></div>`);
    await page.goto('file://' + tmp, { waitUntil: 'networkidle' });
    await page.screenshot({ path: out, ...(lossless ? {} : { type: 'jpeg', quality: 95 }), clip: { x: 0, y: 0, width: 1280, height: 720 } });
    fs.unlinkSync(tmp);
    return true;
  };
  await composite(BG_COVER_SRC, BG_COVER, coverScrim(meta.coverBg), COVER_LOSSLESS);
  if (BG_DIV_SRC && !await composite(BG_DIV_SRC, BG_DIVIDER_IMG, DIVIDER_SCRIM, DIV_LOSSLESS)) {
    console.warn(`간지 배경 이미지를 못 찾았다: ${BG_DIV_SRC} — build_html.mjs 를 먼저 돌려야 한다`);
  }
  // 표지 상자 글자 폭: 어림값 대신 실제로 재서 HTML 과 상자 크기를 맞춘다.
  const badgeText = meta.event || meta.docType || '';
  if (badgeText) {
    await page.setContent(`<!doctype html><style>*{margin:0}
.b{display:inline-block;font-family:'${FONT}';font-weight:700;font-size:${PXL(COVER_BOX.badgeText.size)}px;letter-spacing:${COVER_BOX.badgeText.spc}pt;white-space:nowrap}</style>
<span class="b">${badgeText.replace(/[<>&]/g, '')}</span>`);
    await page.evaluate(() => document.fonts.ready);
    MEASURED.badge = await page.$eval('.b', e => e.getBoundingClientRect().width);
  }
  // 목차 섹션명 줄 수: 글자 폭을 어림잡지 않고 같은 글꼴로 실제로 재서 HTML 과 줄바꿈을 맞춘다.
  const labels = outline.sections.map(x => x.title).concat(outline.appendix.length ? ['부록'] : []);
  if (labels.length) {
    const A = AGENDA_BOX, lh = PXL(TYPE.h2.line);
    await page.setContent(`<!doctype html><style>*{margin:0}
.t{width:${A.itemW}px;font-family:'${TYPE.h2.face}';font-weight:400;font-size:${PXL(TYPE.h2.size)}px;line-height:${lh}px;letter-spacing:${TYPE.h2.spc}pt;word-break:keep-all}</style>
${labels.map(t => `<div class="t">${t.replace(/[<>&]/g, '')}</div>`).join('')}`);
    await page.evaluate(() => document.fonts.ready);
    const hs = await page.$$eval('.t', els => els.map(e => e.getBoundingClientRect().height));
    hs.forEach(h => AGENDA_LINES.push(Math.max(1, Math.round(h / lh))));
  }
  await browser.close();
}
await renderBackgrounds();
const closingBg = (slide) => { slide.background = { path: BG_PATH }; };
const coverBgImg = (slide) => {
  if (fs.existsSync(BG_COVER)) slide.background = { path: BG_COVER };
  else { console.warn(`표지 배경 이미지를 못 찾았다: ${BG_COVER_SRC} — build_html.mjs 를 먼저 돌려야 한다`); closingBg(slide); }
};
const dividerBg = (slide) => {
  slide.background = { path: BG_DIV_SRC && fs.existsSync(BG_DIVIDER_IMG) ? BG_DIVIDER_IMG : BG_DIVIDER };
};

// ─── block renderers ────────────────────────────────────────────
// Geometry mirrors the CSS in build_html.mjs (minimal card design). All sizes in px at 1280×720; k = per-slide body scale.
// pptxgenjs 는 넘겨받은 옵션 객체를 제자리에서 변환한다 — 같은 객체를 재사용하면 값이 호출마다 곱해져
// dir/blurRad 가 규격을 벗어나고 PowerPoint 가 '복구' 대화상자를 띄운다. 반드시 매번 새 객체를 만든다.
const shadow = () => ({ type: 'outer', blur: 6, offset: 1.5, angle: 90, color: '14285A', opacity: 0.08 });
const SERIES = () => [P.primary2, P.primary, P.teal, P.gold];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** rounded card (white by default) with soft shadow */
function card(slide, x, y, w, h, fill = P.white, radius = 12) {
  w = Math.max(1, w); h = Math.max(1, h);
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: IN(x), y: IN(y), w: IN(w), h: IN(h), fill: { color: colorToHex(fill) }, line: { type: 'none' }, rectRadius: IN(radiusPx(radius, w, h)), shadow: shadow() });
}
/** 블록 위에 붙는 작은 라벨(모서리만 둥근 사각형). 폭을 돌려준다. */
function pill(slide, label, x, y, k, { fill = P.primary, color = P.white } = {}) {
  const fs = D.cardTitle * k, h = fs * 2.1, w = Math.round(estW(label, fs) + fs * 2.0);
  x = clamp(x, 4, SLIDE_W - w - 4);
  rect(slide, x, y, w, h, { fill, radius: 8 });
  text(slide, label, x, y, w, h, { size: D.cardTitle, k, color, bold: true, align: 'center', valign: 'middle' });
  return w;
}
/** 카드 = 둥근 알약(제목) + 간격 + 흰 본문 상자.
 *  알약: 완전히 둥근 피치, 주 컬러 배경, 흰 굵은 중앙 정렬 텍스트.
 *  본문: 별도의 둥근 카드(반지름 16, 부드러운 그림자).
 *  본문 상자를 돌려준다. */
function bandCard(slide, box, k, label, { body = P.white, band = P.primary, labelColor = P.white } = {}) {
  const em = D.body * k, fs = D.cardTitle * k, pillH = fs * 1.95, gap = em * 0.3;
  let contentY = box.y;
  if (label) {
    // 알약 제목: 카드 너비 전체, 완전히 둥근 모양(HTML 의 .card>.cap 과 같게)
    const w = box.w, x = box.x;
    const rr = radiusPx(pillH / 2, w, pillH);
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: IN(x), y: IN(box.y), w: IN(w), h: IN(pillH),
      fill: { color: colorToHex(band) }, line: { type: 'none' }, rectRadius: IN(rr)
    });
    text(slide, label, x, box.y, w, pillH, { size: D.cardTitle, k, color: labelColor, bold: true, align: 'center', valign: 'middle', lineSpacing: 1.3 });
    contentY = box.y + pillH + gap;
  }
  // 흰 본문 카드: 자신의 둥근 카드(반지름 16, 부드러운 그림자)
  const bodyH = Math.max(1, box.y + box.h - contentY);
  card(slide, box.x, contentY, box.w, bodyH, body, 19);
  const padX = em * 1.4, padT = em * 0.95, padB = em * 1.0;
  return { x: box.x + padX, y: contentY + padT, w: box.w - padX * 2, h: Math.max(1, bodyH - padT - padB) };
}
const labeledCard = (slide, box, k, label, fill = P.white) =>
  bandCard(slide, box, k, label, fill === P.primary ? { body: P.white, band: P.primary } : { body: fill });
/** "| 소제목" sub heading */
function sh2(slide, str, x, y, w, k, color = P.body) {
  const h = D.body * k * 1.3;
  text(slide, str, x, y, w, h, { size: D.body * 0.94, k, bold: true, color, valign: 'middle' });
  return h;
}
/** bullet list ("ul.rl"): k bold + v (small, next line) or "row" (inline). Returns paragraphs + estimated height. */
/** HTML 의 listGap() 과 같은 식: 항목이 적고 짧으면 넓게, 많거나 길면 좁게 */
function listGapEm(items) {
  const n = (items || []).length;
  const chars = (items || []).reduce((a, it) => { const x = normItem(it); return a + (x.k + x.v).replace(/\*\*/g, '').length; }, 0);
  return Math.max(0.4, Math.min(0.9, 2.0 - n * 0.26 - chars / 240));
}
function listParas(items, k, w, { row = false, dark = false, size = D.body, tight = false, plainColor } = {}) {
  const em = D.body * k, small = D.small * k;
  const gapEm = tight ? Math.min(listGapEm(items), 0.35) : listGapEm(items);   // 배너 안은 줄을 붙여 쓴다
  const paras = []; let h = 0;
  (items || []).map(normItem).forEach((it, i) => {
    const kColor = dark ? P.white : P.text, vColor = dark ? 'rgba(255,255,255,.78)' : P.body;
    const plain = plainColor || (dark ? 'rgba(255,255,255,.88)' : P.text);  // 불릿 본문은 진한 색(소제목이 연한 회색)
    if (!it.k) {
      paras.push({ text: it.v, color: plain, size, bullet: true, spaceAfter: i < items.length - 1 ? em * gapEm * 0.75 : 0 });
      h += lines(it.v, size * k, w - em) * size * k * 1.3;
    } else if (row || !it.v) {
      paras.push({ text: it.v ? `**${it.k}**  ${it.v}` : `**${it.k}**`, color: plain, size, bullet: true, spaceAfter: i < items.length - 1 ? em * gapEm * 0.75 : 0 });
      h += lines(`${it.k}  ${it.v}`, size * k, w - em) * size * k * 1.3;
    } else {
      paras.push({ text: it.k, color: kColor, bold: true, size, bullet: true });
      paras.push({ text: it.v, color: vColor, size: D.small, indent: true, spaceAfter: i < items.length - 1 ? em * gapEm * 0.75 : 0 });
      h += lines(it.k, size * k, w - em) * size * k * 1.3 + lines(it.v, small, w - em) * small * 1.3;
    }
    if (i < items.length - 1) h += em * gapEm;
  });
  return { paras, h };
}
function listBox(slide, items, x, y, w, h, k, opts = {}) {
  const { paras, h: contentH } = listParas(items, k, w, opts);
  if (!paras.length) return;
  const em = D.body * k;
  // 남는 높이를 항목 사이로 나눠 카드 안을 고르게 채운다(넘치면 최소 간격).
  const n = (items || []).length;
  if (n > 1 && (opts.availH || h) > contentH) {
    const extra = Math.min(((opts.availH || h) - contentH) / (n - 1) * 0.8, em * (opts.tight ? 0.15 : 0.9));
    if (extra > 0) paras.forEach(p => { if (p.spaceAfter) p.spaceAfter += extra * 0.75; });
  }
  const runs = [];
  paras.forEach((p, i) => {
    const base = { fontFace: FONT, fontSize: PT(p.size || D.body, k), color: colorToHex(p.color), bold: !!p.bold, breakLine: false, charSpacing: -0.8 };
    const rr = richRuns(p.text, base);
    if (p.bullet) rr[0].options.bullet = { indent: Math.round(em * 1.05 * 0.75) };
    else if (p.indent) rr[0].options.bullet = { code: '00A0', indent: Math.round(em * 1.05 * 0.75) }; // 보이지 않는 글머리(공백)로 들여쓰기만
    if (p.spaceAfter) rr[0].options.paraSpaceAfter = p.spaceAfter;
    rr[rr.length - 1].options.breakLine = i < paras.length - 1;
    runs.push(...rr);
  });
  slide.addText(runs, { x: IN(x), y: IN(y), w: IN(Math.max(1, w)), h: IN(Math.max(1, h)), align: 'left', valign: opts.valign || 'top', margin: 0, lineSpacingMultiple: 1.25, fit: 'none', autoFit: false });
}

// ── fragments: {h, flex?, draw(y, h)} stacked vertically inside a card (".fill" → space-evenly) ──
function fragStat(st, k, w) {
  const small = D.small * k, statFs = D.stat * k, em = D.body * k;
  const subH = st.sub ? small * 1.5 : 0, valH = statFs * 1.1, descH = st.desc ? lines(st.desc, small, w) * small * 1.4 + em * 0.45 : 0;
  return { h: subH + valH + descH, draw: (slide, x, y) => {
    if (st.sub) { text(slide, st.sub, x, y, w, subH, { size: D.small, k, color: P.textMid }); y += subH; }
    const m = String(st.value ?? '').match(/^([\d.,~\-–]+)\s*(.*)$/);
    const runs = m && m[2] && m[2].length <= 4
      ? [{ text: m[1], options: { fontFace: FONT, fontSize: PT(D.stat, k), color: colorToHex(P.text), bold: true, charSpacing: -1 } }, { text: m[2], options: { fontFace: FONT, fontSize: PT(D.stat * 0.5, k), color: colorToHex(P.text), bold: true } }]
      : richRuns(st.value, { fontFace: FONT, fontSize: PT(D.stat, k), color: colorToHex(P.text), bold: true, charSpacing: -1 });
    slide.addText(runs, { x: IN(x), y: IN(y), w: IN(w), h: IN(valH), valign: 'middle', margin: 0, fit: 'none', autoFit: false });
    y += valH;
    if (st.desc) text(slide, st.desc, x, y + em * 0.45, w, descH - em * 0.45, { size: D.small, k, color: P.primary2, bold: true, lineSpacing: 1.4 });
  } };
}
/** kv: small 2-col table (flex 1.4) + tinted highlight box (flex 1) */
function fragKv(rows, hl, k, w) {
  const fs = D.table * k, em = D.body * k;
  const rowH = fs * 1.45 + fs * 1.2;
  const h = rows.length * rowH;
  return { h, draw: (slide, x, y) => {
    const gap = em * 1.2, tw = hl ? (w - gap) * 1.4 / 2.4 : w, hw = w - gap - tw;
    const lw = tw * 0.38;
    rows.forEach((r, i) => {
      const ry = y + i * rowH, last = i === rows.length - 1;
      rect(slide, x, ry, lw, rowH, { fill: P.bgSoft, line: { color: '#E3E7EC', width: 0.75 } });
      text(slide, r[0] ?? '', x + fs * 0.8, ry, lw - fs * 1.6, rowH, { size: D.table, k, bold: true, color: P.text, valign: 'middle' });
      rect(slide, x + lw, ry, tw - lw, rowH, { fill: P.white, line: { color: '#E3E7EC', width: 0.75 } });
      text(slide, r[1] ?? '', x + lw + fs * 0.8, ry, tw - lw - fs * 1.6, rowH, { size: D.table, k, bold: last, color: P.text, align: 'center', valign: 'middle' });
    });
    if (hl) {
      const hx = x + tw + gap;
      rect(slide, hx, y, hw, h, { fill: P.softerBlue, radius: 10 });
      const lh = D.small * k * 1.5, vh = D.stat * k * 0.62 * 1.15, top = y + (h - lh - vh) / 2;
      text(slide, hl.label || '', hx, top, hw, lh, { size: D.small, k, color: P.text, align: 'center', valign: 'middle' });
      text(slide, hl.value || '', hx, top + lh, hw, vh, { size: D.stat * 0.62, k, color: P.text, bold: true, align: 'center', valign: 'middle' });
    }
  } };
}
function fragSections(secs, k, w, dark = false) {
  const em = D.body * k;
  const parts = (secs || []).map(s => {
    const hh = s.heading ? em * 1.25 + em * 0.5 : 0;
    const { h: lh } = s.items ? listParas(s.items, k, w, { dark }) : { h: 0 };
    const th = s.text ? lines(s.text, D.small * k, w) * D.small * k * 1.55 : 0;
    return { s, hh, lh, th, h: hh + lh + th };
  });
  const h = parts.reduce((a, p) => a + p.h, 0) + Math.max(0, parts.length - 1) * (em * 2 + 1);
  return { h, draw: (slide, x, y) => {
    parts.forEach((p, i) => {
      if (i) { rect(slide, x, y + em, w, 1, { fill: '#E6E9EE' }); y += em * 2 + 1; }
      if (p.s.heading) { sh2(slide, p.s.heading, x, y, w, k, dark ? P.white : P.body); y += p.hh; }
      if (p.s.items) { listBox(slide, p.s.items, x, y, w, p.lh + em, k, { dark }); y += p.lh; }
      if (p.s.text) { text(slide, p.s.text, x, y, w, p.th, { size: D.small, k, color: dark ? 'rgba(255,255,255,.85)' : P.textMid, lineSpacing: 1.55 }); y += p.th; }
    });
  } };
}
function fragList(items, k, w, opts = {}) {
  const { h } = listParas(items, k, w, opts);
  return { h, flex: opts.fill ? 1 : undefined, draw: (slide, x, y, hh) => listBox(slide, items, x, y, w, Math.max(h, hh || 0), k, { ...opts, availH: Math.max(h, hh || 0) }) };
}
function fragText(str, k, w, { size = D.small, color = P.body } = {}) {
  const h = lines(str, size * k, w) * size * k * 1.55;
  return { h, draw: (slide, x, y) => text(slide, str, x, y, w, h, { size, k, color, lineSpacing: 1.55 }) };
}
function fragTag(tag, k, w, dark) {
  const h = D.body * k * 1.25 + D.body * k * 0.5;
  return { h, draw: (slide, x, y) => sh2(slide, tag, x, y, w, k, dark ? P.white : P.body) };
}
/** grey chart panel: title + "단위" line + native pptx chart */
function fragChart(c, k, w) {
  return { h: 96 * k, flex: 1, draw: (slide, x, y, h) => chartPanel(slide, c, x, y, w, h, k) };
}
function chartPanel(slide, c, x, y, w, h, k) {
  const em = D.body * k, padX = em * 1.2, padY = em;
  rect(slide, x, y, w, h, { fill: P.bgSoft, radius: 10 });
  const hh = em * 1.5;
  text(slide, c.title || '', x + padX, y + padY, w * 0.6, hh, { size: D.body, k, bold: true, color: P.text, valign: 'middle' });
  if (c.unit) text(slide, `단위 : ${c.unit}`, x + w * 0.5, y + padY, w * 0.5 - padX, hh, { size: D.small, k, color: P.textMid, align: 'right', valign: 'middle' });
  const series = (c.series || []).slice(0, 4), labels = c.labels || [];
  const ch = h - padY - hh - em * 0.6;
  if (!series.length || ch < 30) return;
  const data = series.map(sr => ({ name: sr.name || '', labels, values: sr.values || [] }));
  const all = data.flatMap(d => d.values).filter(v => typeof v === 'number');
  const max = Math.max(1, ...all);
  const common = {
    x: IN(x + padX * 0.4), y: IN(y + padY + hh), w: IN(w - padX * 0.8), h: IN(ch),
    chartColors: SERIES().map(colorToHex), showValue: true, dataLabelFontFace: FONT, dataLabelFontSize: PT(10.5, k), dataLabelColor: colorToHex(P.text), dataLabelFontBold: true, dataLabelFormatCode: '#,##0.##',
    catAxisLabelFontFace: FONT, catAxisLabelFontSize: PT(10.5, k), catAxisLabelColor: colorToHex(P.textMid), catAxisLineColor: 'C9CFD8', catGridLine: { style: 'none' },
    valAxisHidden: true, valGridLine: { style: 'none' }, valAxisMinVal: Math.min(0, ...all), valAxisMaxVal: Math.ceil(max * 1.3), valAxisLineShow: false,
    showLegend: series.length > 1, legendPos: 'b', legendFontFace: FONT, legendFontSize: PT(10, k), legendColor: colorToHex(P.textMid),
    plotArea: { fill: { color: colorToHex(P.bgSoft) } }, chartArea: { fill: { color: colorToHex(P.bgSoft) } },
  };
  if (c.kind === 'bar') slide.addChart(pres.charts.BAR, data, { ...common, barDir: 'col', barGapWidthPct: 80, barGrouping: 'clustered', dataLabelPosition: 'outEnd' });
  else slide.addChart(pres.charts.LINE, data, { ...common, lineSize: 2, lineDataSymbol: 'circle', lineDataSymbolSize: 7, lineDataSymbolLineColor: colorToHex(P.primary2), lineDataSymbolLineSize: 1.5, dataLabelPosition: 't', lineSmooth: false });
}
function fragImage(src, caption, k, w) {
  return { h: 60, flex: 1, draw: (slide, x, y, h) => {
    const capH = caption && src ? D.small * k * 1.6 : 0;
    if (!image(slide, src, x, y, w, Math.max(1, h - capH))) {
      rect(slide, x, y, w, h, { fill: P.bgSoft, line: { color: '#C3CAD5', width: 1.5 }, radius: 8, dash: 'dash' });
      const lab = String(caption || '이미지 자리').trim();
      text(slide, /^\[.*\]$/.test(lab) ? lab : `[ ${lab} ]`, x, y, w, h, { size: D.small, k, color: '#6F7C92', align: 'center', valign: 'middle' });
    } else if (capH) text(slide, caption, x, y + h - capH, w, capH, { size: D.small, k, color: P.textLight, align: 'center', valign: 'middle' });
  } };
}
/** stack fragments inside a box: fixed ones keep their height, flex ones share the remaining space; leftover is distributed evenly (space-evenly). */
function stack(slide, box, k, frags) {
  frags = frags.filter(Boolean);
  if (!frags.length) return;
  const gap = D.body * k * 0.9;
  const fixed = frags.reduce((a, f) => a + (f.flex ? 0 : f.h), 0), nflex = frags.filter(f => f.flex).length;
  let free = box.h - fixed - gap * (frags.length - 1);
  const flexH = nflex ? Math.max(40, free / nflex) : 0;
  let y = box.y;
  if (!nflex && free > 0) { const pad = free / (frags.length + 1); y += pad; frags.forEach(f => { f._gap = pad + gap; }); }
  frags.forEach((f, i) => {
    const h = f.flex ? flexH : f.h;
    f.draw(slide, box.x, y, h);
    y += h + (f._gap ?? gap);
  });
}
function cardFrags(c, k, w, dark = false) {
  return [
    c.tag ? fragTag(c.tag, k, w, dark) : null,
    c.stat ? fragStat(c.stat, k, w) : null,
    c.rows ? fragKv(c.rows, c.highlight, k, w) : null,
    c.sections ? fragSections(c.sections, k, w, dark) : null,
    c.desc ? fragText(c.desc, k, w, { color: dark ? 'rgba(255,255,255,.85)' : P.body }) : null,
    c.items ? fragList(c.items, k, w, { dark, row: c._row }) : null,
    c.text ? fragText(c.text, k, w) : null,
    c.chart ? fragChart(c.chart, k, w) : null,
    c.image !== undefined ? fragImage(c.image, c.caption, k, w) : null,
  ];
}

const B = {
  columns(slide, b, box, k) {
    const cols = b.columns || []; const gap = D.gap * k * 1.6;
    const weights = cols.map(c => c.flex || 1), tw = weights.reduce((a, c) => a + c, 0);
    let x = box.x;
    cols.forEach((c, i) => {
      const w = (box.w - gap * (cols.length - 1)) * weights[i] / tw;
      const tint = c.tint || (b.tintLast && i === cols.length - 1);
      const inner = labeledCard(slide, { x, y: box.y, w, h: box.h }, k, c.heading, tint ? P.softerBlue : P.white);
      stack(slide, inner, k, cardFrags({ ...c, _row: b.rowItems }, k, inner.w));
      x += w + gap;
    });
  },
  cards(slide, b, box, k) {
    const cards = b.cards || []; const n = cards.length; if (!n) return;
    const cols = b.cols || (n <= 4 ? n : Math.ceil(n / 2)); const rows = Math.ceil(n / cols);
    const gap = D.gap * k * 1.6;
    const cw = (box.w - gap * (cols - 1)) / cols, ch = (box.h - gap * (rows - 1)) / rows;
    cards.forEach((c, i) => {
      const cx = box.x + (i % cols) * (cw + gap), cy = box.y + Math.floor(i / cols) * (ch + gap);
      const fill = c.dark ? P.primary : c.primary ? P.softerBlue : P.white;
      const label = c.num !== undefined ? `${c.num}. ${c.title || ''}` : c.title;
      const inner = labeledCard(slide, { x: cx, y: cy, w: cw, h: ch }, k, label, fill);
      stack(slide, inner, k, cardFrags(c, k, inner.w, !!c.dark));
    });
  },
  stats(slide, b, box, k) {
    const st = b.stats || []; const n = st.length; if (!n) return;
    const gap = D.gap * k * 1.6, w = (box.w - gap * (n - 1)) / n;
    st.forEach((s, i) => {
      const inner = bandCard(slide, { x: box.x + i * (w + gap), y: box.y, w, h: box.h }, k, s.label);
      const f = fragStat(s, k, inner.w);
      f.draw(slide, inner.x, inner.y + Math.max(0, (inner.h - f.h) / 2));
    });
  },
  process(slide, b, box, k) {
    const steps = b.steps || []; const n = steps.length; if (!n) return;
    const em = D.body * k, gap = D.gap * k, sw = (box.w - gap * (n - 1)) / n;
    const csize = em * 2.6, lineY = box.y + em * 1.3;
    rect(slide, box.x + box.w * 0.04, lineY - 1, box.w * 0.92, 2, { fill: mix(P.primary, P.page, 0.55) });
    const cardY = box.y + csize + em * 0.7, ch = Math.max(1, box.y + box.h - cardY);
    steps.forEach((s, i) => {
      const x = box.x + i * (sw + gap);
      slide.addShape(pres.shapes.OVAL, { x: IN(x + sw / 2 - csize / 2), y: IN(lineY - csize / 2), w: IN(csize), h: IN(csize), fill: { color: colorToHex(i === n - 1 ? P.primary2 : P.primary) }, line: { color: colorToHex(P.page), width: 2.25 } });
      text(slide, String(i + 1), x + sw / 2 - csize / 2, lineY - csize / 2, csize, csize, { size: D.body, k, color: P.white, bold: true, align: 'center', valign: 'middle' });
      const dk = s.dark || (b.darkLast && i === n - 1), hl = s.highlight;
      card(slide, x, cardY, sw, ch, dk ? P.primary : hl ? P.softerBlue : P.white);
      const px = em, py = em; let y = cardY + py; const w = sw - px * 2;
      text(slide, s.period || `STEP ${i + 1}`, x + px, y, w, D.small * k * 1.5, { size: D.small, k, bold: true, color: dk ? 'rgba(255,255,255,.8)' : P.primary2, align: 'center', valign: 'middle', letterSpacing: 0.5 });
      y += D.small * k * 1.5 + em * 0.2;
      const tl = lines(s.title || '', D.cardTitle * k, w), th = tl * D.cardTitle * k * 1.3;
      text(slide, s.title || '', x + px, y, w, th, { size: D.cardTitle, k, bold: true, color: dk ? P.white : P.text, align: 'center', valign: 'top', lineSpacing: 1.3 });
      y += th + em * 0.45;
      const rest = Math.max(1, cardY + ch - py - y);
      if (s.items && s.items.length) listBox(slide, s.items, x + px, y, w, rest, k, { dark: dk, size: D.small, valign: 'middle' });
      else if (s.desc) text(slide, s.desc, x + px, y, w, rest, { size: D.small, k, color: dk ? 'rgba(255,255,255,.85)' : P.textMid, align: 'center', valign: 'middle', lineSpacing: 1.45 });
    });
  },
  timeline(slide, b, box, k) {
    return B.process(slide, { steps: (b.phases || []).map(p => ({ period: p.period, title: p.title, items: p.items, desc: p.desc, highlight: p.highlight, dark: p.dark })), darkLast: b.darkLast }, box, k);
  },
  table(slide, b, box, k) {
    // Drawn with native rects + text boxes (not addTable) for exact control over the emphasized column / alignment.
    const headers = b.headers || [], rows = b.rows || [], em = b.emphasize;
    const ncol = headers.length || (rows[0] || []).length;
    let colW;
    if (b.widths && b.widths.length === ncol) {
      const pct = b.widths.map(w => parseFloat(w)); const tot = pct.reduce((a, c) => a + c, 0);
      colW = pct.map(pc => box.w * pc / tot);
    } else colW = Array(ncol).fill(box.w / ncol);
    const leftCols = new Set(b.leftAlign || [0]);
    const clean = c => String(c ?? '').replace(/\*\*/g, '');
    let kk = k, hdrH, rowHs;
    for (let tries = 0; tries < 8; tries++) {
      const fs = D.table * kk, fsh = D.tableH * kk, padY = fs * 0.6, padX = fs * 0.8;
      hdrH = Math.max(1, ...headers.map((h, i) => lines(clean(h), fsh, colW[i] - padX * 2))) * fsh * 1.3 + padY * 2;
      rowHs = rows.map(r => Math.max(1, ...r.map((c, i) => lines(clean(c), fs, colW[i] - padX * 2))) * fs * 1.45 + padY * 2);
      const total = hdrH + rowHs.reduce((a, c) => a + c, 0);
      if (total <= box.h || kk <= 0.6) {
        const extra = Math.max(0, box.h - total); if (rows.length) rowHs = rowHs.map(h => h + extra / rows.length);
        break;
      }
      kk *= 0.9;
    }
    const fs = D.table * kk, padX = fs * 0.8;
    // white card behind the table
    card(slide, box.x, box.y, box.w, hdrH + rowHs.reduce((a, c) => a + c, 0), P.white, 6);
    let y = box.y, x = box.x;
    headers.forEach((h, i) => {
      rect(slide, x, y, colW[i], hdrH, { fill: i === em ? P.primary : P.bgSoft, line: { color: i === em ? P.primary : '#E3E7EC', width: 0.75 } });
      text(slide, clean(h), x + padX, y, colW[i] - padX * 2, hdrH, { size: D.tableH, k: kk, bold: true, color: i === em ? P.white : P.text, align: 'center', valign: 'middle', lineSpacing: 1.2 });
      x += colW[i];
    });
    y += hdrH;
    rows.forEach((r, ri) => {
      x = box.x; const h = rowHs[ri]; const last = ri === rows.length - 1;
      r.forEach((c, i) => {
        const isEm = i === em;
        rect(slide, x, y, colW[i], h, { fill: isEm ? P.softerBlue : i === 0 ? P.bgSoft : P.white, line: { color: '#E3E7EC', width: 0.75 } });
        const t = clean(c).trim();
        const badge = /^(달성|완료|충족|조기달성|초과달성|초과|진행중|진행 중|예정|계획|미달|보류|중단)$/.test(t);
        if (badge && !isEm) {
          const [bg, fg] = /^(달성|완료|충족)$/.test(t) ? ['#E6F5EC', P.success] : /^(조기달성|초과달성|초과)$/.test(t) ? ['#DDEEFF', P.primary2] : /^(진행중|진행 중|예정|계획)$/.test(t) ? ['#FFF6E1', P.warning] : [P.bgSoft, P.textMid];
          const bw = estW(t, fs * 0.8) + fs * 2.2, bh = fs * 1.6;
          rect(slide, x + colW[i] / 2 - bw / 2, y + h / 2 - bh / 2, bw, bh, { fill: bg, radius: bh / 2 });
          text(slide, '● ' + t, x + colW[i] / 2 - bw / 2, y + h / 2 - bh / 2, bw, bh, { size: D.table * 0.8, k: kk, bold: true, color: fg, align: 'center', valign: 'middle' });
        } else {
          text(slide, isEm ? c : clean(c), x + padX, y, colW[i] - padX * 2, h, { size: D.table, k: kk, bold: isEm || i === 0 || last, color: isEm ? P.primary : P.text, align: leftCols.has(i) ? 'left' : 'center', valign: 'middle', lineSpacing: 1.3 });
        }
        x += colW[i];
      });
      y += h;
    });
  },
  compare(slide, b, box, k) {
    const em = D.body * k, mid = em * 3, w = (box.w - mid) / 2;
    const side = (s, x, to) => {
      const inner = bandCard(slide, { x, y: box.y, w, h: box.h }, k, s.tag || (to ? 'TO-BE' : 'AS-IS'), { body: to ? P.softerBlue : P.white, band: to ? P.primary : P.textMid });
      let y = inner.y;
      if (s.heading) {
        const hh = lines(s.heading, D.cardTitle * k, inner.w) * D.cardTitle * k * 1.3;
        text(slide, s.heading, inner.x, y, inner.w, hh, { size: D.cardTitle, k, bold: true, color: P.text, lineSpacing: 1.3 });
        y += hh + em * 0.5;
      }
      const rest = { x: inner.x, y, w: inner.w, h: Math.max(1, inner.y + inner.h - y) };
      stack(slide, rest, k, [s.sections ? fragSections(s.sections, k, inner.w) : null, s.items ? fragList(s.items, k, inner.w) : null]);
    };
    side(b.left || {}, box.x, false);
    text(slide, '›', box.x + w, box.y, mid, box.h, { size: D.body * 2.2, k, color: P.primary, bold: true, align: 'center', valign: 'middle' });
    side(b.right || {}, box.x + w + mid, true);
  },
  image(slide, b, box, k) {
    const full = b.side === 'full' || !b.text;
    const em = D.body * k, gap = D.gap * k * 1.6;
    const pw = full ? box.w : (box.w - gap) * 1.3 / 2.3, tw = box.w - gap - pw;
    const px = b.side === 'left' || full ? box.x : box.x + tw + gap;
    const tx = b.side === 'left' ? box.x + pw + gap : box.x;
    // picture card (".pic": white card, optional "| heading", image or dashed placeholder)
    card(slide, px, box.y, pw, box.h, P.white);
    let y = box.y + em, ih = box.h - em * 2; const iw = pw - em * 2.4;
    if (b.heading) { const hh = sh2(slide, b.heading, px + em * 1.2, y, iw, k); y += hh + em * 0.5; ih -= hh + em * 0.5; }
    fragImage(b.src, b.caption || b.alt, k, iw).draw(slide, px + em * 1.2, y, Math.max(1, ih));
    if (!full) {
      const inner = labeledCard(slide, { x: tx, y: box.y, w: tw, h: box.h }, k, b.text.heading, P.softerBlue);
      stack(slide, inner, k, [b.text.sections ? fragSections(b.text.sections, k, inner.w) : null, b.text.items ? fragList(b.text.items, k, inner.w) : null]);
    }
  },
  bullets(slide, b, box, k) {
    const inner = labeledCard(slide, box, k, b.heading);
    stack(slide, inner, k, [b.sections ? fragSections(b.sections, k, inner.w) : null, b.items ? fragList(b.items, k, inner.w) : null]);
  },
  chart(slide, b, box, k) {
    const inner = labeledCard(slide, box, k, b.heading);
    chartPanel(slide, b, inner.x, inner.y, inner.w, inner.h, k);
  },
  callout(slide, b, box, k) {
    // 어두운 둥근 박스 하나. 왼쪽에 라벨(연한 컬러), 오른쪽에 본문 — 모두 박스 안에 들어간다.
    // 글자는 카드보다 한 단계 작게(원본: 라벨 15pt · 본문 14pt), 본문색은 라벨보다 죽인 톤.
    const light = b.tone === 'light', em = D.small * k, fs = D.small * 1.05 * k;
    const label = b.label || '핵심 요약';
    const h = box.h;
    card(slide, box.x, box.y, box.w, h, light ? P.white : P.banner, 14);
    const padX = em * 1.6, padY = em * 0.75, gap = em * 1.6;
    const lw = Math.max(estW(label, fs), fs * 3.2);
    text(slide, label, box.x + padX, box.y + padY, lw, h - padY * 2, { size: D.small * 1.05, k, color: light ? P.primary : P.bannerLabel, bold: true, align: 'center', valign: 'middle', lineSpacing: 1.3 });
    const tx = box.x + padX + lw + gap, tw = Math.max(1, box.x + box.w - padX - tx);
    if (b.items && b.items.length) listBox(slide, b.items, tx, box.y + padY, tw, h - padY * 2, k, { dark: !light, valign: 'middle', availH: h - padY * 2, tight: true, size: D.small, plainColor: light ? P.text : P.bannerText });
    else if (b.text) text(slide, b.text, tx, box.y + padY, tw, h - padY * 2, { size: D.small, k, color: light ? P.text : P.bannerText, valign: 'middle', lineSpacing: 1.3 });
  },
};
/** 배너 높이(레이아웃 단계용). callout() 과 같은 여백·글자 크기로 계산한다. */
function calloutBoxH(b, k, W) {
  const em = D.small * k, fs = D.small * 1.05 * k, label = b.label || '핵심 요약';
  const padY = em * 0.75, gap = em * 1.6;
  const tw = W - em * 3.2 - Math.max(estW(label, fs), fs * 3.2) - gap;
  const th = b.items && b.items.length ? listParas(b.items, k, tw, { tight: true, size: D.small }).h : lines(b.text || '', D.small * k, tw) * D.small * k * 1.3;
  return Math.max(fs * 2.1 + padY * 2, th + padY * 2);
}

// ─── top section of content slides (eyebrow · headline · rule · lead) ─────────
const RGBA = (c, a) => `rgba(${parseInt(c.slice(1, 3), 16)},${parseInt(c.slice(3, 5), 16)},${parseInt(c.slice(5, 7), 16)},${a})`;
function topSection(slide, eyebrowRuns, headline, lead, pageNo) {
  const W = SLIDE_W - PAD * 2;
  slide.addText(eyebrowRuns, { x: IN(PAD), y: IN(30), w: IN(W - 80), h: IN(22), align: 'left', valign: 'middle', margin: 0, fit: 'none', autoFit: false });
  if (pageNo) text(slide, pageNo, SLIDE_W - PAD - 80, 30, 80, 22, { size: HEAD.pgno, color: P.textLight, align: 'right', valign: 'middle' });
  let ruleY = 68;
  if (headline) {
    // .stitle: 31.5pt(42px), weight 600, **강조** 는 같은 색 굵게
    const runs = String(headline).split(/(\*\*.+?\*\*)/g).filter(Boolean).map(p => {
      const m = p.match(/^\*\*(.+)\*\*$/);
      return m ? { text: m[1], options: { fontFace: FONT_TITLE_B, fontSize: HEAD.stitle * 0.75, color: colorToHex(P.title), charSpacing: -0.8 } } : { text: p, options: { fontFace: FONT_TITLE, fontSize: HEAD.stitle * 0.75, color: colorToHex(P.title), charSpacing: -0.8 } };
    });
    slide.addText(runs, { x: IN(PAD), y: IN(61), w: IN(Math.min(W, 1100)), h: IN(51), align: 'left', valign: 'middle', margin: 0, fit: 'none', autoFit: false });
    ruleY = 116;
  }
  rect(slide, PAD, ruleY, W, 1, { fill: HEAD.ruleColor });
  let bodyTop = headline ? FRAME.bodyTop - 30 : 96;
  if (lead) {
    const n = lines(lead, HEAD.lead, 1100);
    const runs = richRuns(lead, { fontFace: FONT, fontSize: PT(HEAD.lead), color: colorToHex(P.textMid), charSpacing: -0.8 }).map(r => r.options.bold ? { ...r, options: { ...r.options, color: colorToHex(P.text) } } : r);
    slide.addText(runs, { x: IN(PAD), y: IN(ruleY + 27), w: IN(Math.min(W, 1100)), h: IN(24 * n + 2), align: 'left', valign: 'top', margin: 0, lineSpacingMultiple: 1.5, fit: 'none', autoFit: false });
    bodyTop = FRAME.bodyTop + (n - 1) * 24;
  }
  return bodyTop;
}

// ─── slide builders ──────────────────────────────────────────────
function cover() {
  // 표지: 설명줄(body2) → 제목(h0) → 왼쪽 아래 로고 → 오른쪽 아래 상자. 원본 PPTX 좌표·여백 그대로.
  const s = pres.addSlide();
  coverBgImg(s);
  const C = COVER_BOX;
  if (meta.subtitle) {
    text(s, String(meta.subtitle).replace(/<br\s*\/?>/gi, '\n'), C.lead.x, C.lead.y, C.lead.w, C.lead.h,
      { size: PXL(TYPE.body2.size), face: TYPE.body2.face, color: '#E7E6E6', valign: 'top',
        lineSpacingPt: TYPE.body2.line, letterSpacing: TYPE.body2.spc });
  }
  const titleLines = String(meta.title || '').split(/<br\s*\/?>/gi);
  const titleRuns = [];
  titleLines.forEach((line, i) => {
    const rr = richRuns(line, { fontFace: TYPE.h0.face, fontSize: TYPE.h0.size, color: colorToHex(P.white), charSpacing: TYPE.h0.spc });
    rr[rr.length - 1].options.breakLine = i < titleLines.length - 1;
    titleRuns.push(...rr);
  });
  const nl = Math.max(titleLines.length, lines(titleLines.join(' '), PXL(TYPE.h0.size), C.title.w));
  s.addText(titleRuns, {
    x: IN(C.title.x), y: IN(C.title.y), w: IN(C.title.w), h: IN(Math.max(C.title.h, nl * PXL(TYPE.h0.line))),
    align: 'left', valign: 'top', margin: 0, lineSpacing: TYPE.h0.line, fit: 'none', autoFit: false,
  });
  image(s, meta.logo.dark, C.logo.x, C.logo.y, C.logo.w, C.logo.h);
  const badge = meta.event || meta.docType || '';
  if (badge) {
    // 상자는 글자에 맞춰 늘어난다. 오른쪽 끝·아래 끝·안쪽 여백은 원본 그대로.
    const padX = C.badge.x + C.badge.w - C.badgeText.x - C.badgeText.w;
    const right = C.badge.x + C.badge.w;
    const bw = Math.max(C.badge.w, (MEASURED.badge || estW(badge, PXL(C.badgeText.size))) + padX * 2);
    rect(s, right - bw, C.badge.y, bw, C.badge.h, { fill: P.coverBadge });
    text(s, badge, right - bw + padX, C.badge.y, bw - padX * 2, C.badge.h,
      { size: PXL(C.badgeText.size), color: P.white, bold: true, align: 'right', valign: 'middle', letterSpacing: C.badgeText.spc });
  }
}

function agenda() {
  // 목차: 왼쪽 위 '목차'(h1), 오른쪽에 번호 + 섹션명(h2) 2열. 쪽수·설명은 적지 않는다.
  // 줄 위치는 build_html.mjs 의 grid 와 같은 규칙 — 섹션명이 두 줄이면 그 줄만큼 아래가 밀린다.
  const s = pres.addSlide();
  s.background = { color: colorToHex(P.page) };
  const A = AGENDA_BOX;
  text(s, '목차', A.title.x, A.title.y, A.title.w, A.title.h,
    { size: PXL(TYPE.h1.size), face: TYPE.h1.face, color: P.title, valign: 'top',
      lineSpacingPt: TYPE.h1.line, letterSpacing: TYPE.h1.spc });

  const list = outline.sections.map(sec => ({ n: NUM(sec.no), t: sec.title, apx: false }));
  if (outline.appendix.length) list.push({ n: '+', t: '부록', apx: true });
  const nrow = Math.ceil(list.length / 2);
  const lh = PXL(TYPE.h2.line), trim = (lh - A.itemH) / 2;
  const nlines = i => AGENDA_LINES[i] || 1;
  // 줄마다 높이 = 두 열 중 더 많은 줄 수 기준
  const rowY = []; let y = A.rowTop;
  for (let r = 0; r < nrow; r++) {
    rowY.push(y);
    let ln = 1;
    for (let c = 0; c < 2; c++) { const i = c * nrow + r; if (i < list.length) ln = Math.max(ln, nlines(i)); }
    y += (ln * lh - trim * 2) + (A.rowPitch - A.itemH);
  }
  list.forEach((it, i) => {
    const col = A.cols[Math.min(Math.floor(i / nrow), A.cols.length - 1)];
    const ry = rowY[i % nrow];
    text(s, it.n, col.n, ry, A.itemH - 10, A.itemH,
      { size: PXL(it.apx ? 20 : A.numSize), face: it.apx ? 'Paperlogy 4 Regular' : TYPE.h0.face,
        color: P.primary, align: 'center', valign: 'middle', letterSpacing: A.numSpc });
    text(s, it.t, col.t, ry - trim, A.itemW, nlines(i) * lh,
      { size: PXL(TYPE.h2.size), face: it.apx ? 'Paperlogy 4 Regular' : TYPE.h2.face,
        color: P.title, valign: 'top', lineSpacingPt: TYPE.h2.line, letterSpacing: TYPE.h2.spc });
  });
  text(s, plainTitle, A.foot.x, A.foot.y, A.foot.w, A.foot.h,
    { size: PXL(A.foot.size), color: P.textLight, valign: 'middle', letterSpacing: A.foot.spc });
  if (meta.pageNumbers) text(s, '2', A.pageNo.x, A.pageNo.y, A.pageNo.w, A.pageNo.h,
    { size: PXL(A.foot.size), color: P.textLight, align: 'right', valign: 'middle', letterSpacing: A.foot.spc });
}

function divider(sl) {
  // 간지: 포인트 컬러 배경 + 왼쪽 위 챕터 표기 + 큰 제목, 로고는 배경에 워터마크로 들어가 있다.
  const s = pres.addSlide();
  dividerBg(s);
  const sec = sl.section;
  const x = PAD, w = SLIDE_W - PAD * 2;
  const eyebrow = sec.en || `CHAPTER ${String(sec.no).padStart(2, '0')}`;
  let y = 56;
  text(s, eyebrow, x, y, w, 22, { size: 15, color: 'rgba(255,255,255,.62)', bold: true, valign: 'middle', letterSpacing: 2.1 });
  y += 22 + 26;
  const tl = Math.max(1, lines(sec.title, 60, 1000)), th = tl * 68;
  text(s, sec.title, x, y, Math.min(w, 1000), th, { size: 60, color: P.white, face: FONT_TITLE_B, valign: 'top', lineSpacing: 1.12, letterSpacing: -2.4 });
  y += th + 18;
  if (sec.subtitle) text(s, sec.subtitle, x, y, Math.min(w, 820), 28 * lines(sec.subtitle, 18, 820), { size: 18, color: 'rgba(255,255,255,.72)', valign: 'top', lineSpacing: 1.55 });
  const fy = SLIDE_H - 42 - 18;
  text(s, plainTitle, x, fy, w * 0.7, 18, { size: 13, color: 'rgba(255,255,255,.52)', valign: 'middle' });
  text(s, `${sl.order}/${TOTAL}p`, x + w * 0.7, fy, w * 0.3, 18, { size: 13, color: 'rgba(255,255,255,.52)', align: 'right', valign: 'middle' });
}

function content(sl) {
  const s = pres.addSlide();
  s.background = { color: colorToHex(P.page) };
  const k = (FIT[sl.order] || 1) * K_DAMP;
  const slide = sl.slide;
  // 아이브로우 = 이 장표가 속한 목차(섹션) 이름 하나만
  const base = { fontFace: FONT, fontSize: PT(15), color: colorToHex(P.textMid), bold: false, charSpacing: -0.8 };
  const parts = [{ text: sl.kind === 'appendix' ? 'APPENDIX' : sl.section.title, options: base }];
  const headline = slide.headline || slide.title || '';
  const bodyTop = topSection(s, parts, headline, slide.lead, meta.pageNumbers && sl.pageNo ? String(parseInt(sl.pageNo, 10)) : '');

  const foot = footLines(slide);
  const W = SLIDE_W - PAD * 2, bodyH = SLIDE_H - footSafeBottom(foot) - bodyTop;
  const blocks = slide.blocks || [];
  const gap = D.gap * k;
  const em = D.body * k;
  const labelH = b => (b.label && b.type !== 'callout') ? D.cardTitle * k * 2.1 + em * 0.8 : 0;
  const fixed = blocks.map(b => b.type === 'callout' ? calloutBoxH(b, k, W) : 0);
  const flexTotal = blocks.reduce((a, b) => a + (b.type === 'callout' ? 0 : (b.flex ?? 1)), 0) || 1;
  const freeH = Math.max(0, bodyH - fixed.reduce((a, c) => a + c, 0) - gap * Math.max(blocks.length - 1, 0));
  let by = bodyTop;
  blocks.forEach((b, i) => {
    const h = b.type === 'callout' ? fixed[i] : Math.max(1, freeH * (b.flex ?? 1) / flexTotal);
    const fn = B[b.type];
    if (!fn) { text(s, `[ 알 수 없는 블록: ${b.type} ]`, PAD, by, W, h, { size: D.body, k, color: P.textLight, align: 'center', valign: 'middle' }); by += h + gap; return; }
    let y = by, hh = h;
    if (labelH(b)) { pill(s, b.label, PAD, y, k); y += labelH(b); hh -= labelH(b); }
    // cards with a straddling pill need the pill's half height above the card → the layout box starts at the pill top
    fn(s, b, { x: PAD, y, w: W, h: Math.max(1, hh) }, k);
    by += h + gap;
  });
  // 출처·각주 — HTML 의 .foot 과 같은 자리·같은 크기
  if (foot.length) {
    const lh = PXL(SLIDE_FOOT.line), h = foot.length * lh;
    text(s, foot.join('\n'), PAD, SLIDE_H - SLIDE_FOOT.bottom - h, W, h, {
      size: PXL(SLIDE_FOOT.size), color: P.textLight, lineSpacingPt: SLIDE_FOOT.line,
      letterSpacing: SLIDE_FOOT.spc, valign: 'bottom',
    });
  }
  if (slide.notes) s.addNotes(slide.notes);
}

function closing() {
  const s = pres.addSlide();
  closingBg(s);
  logo(s, true);
  const c = outline.closing, ct = meta.contact || {};
  const cols = (meta.orgs && meta.orgs.length ? meta.orgs : [meta.company && { role: '작성', name: meta.company }].filter(Boolean)).map(o => ({ r: o.role || '', v: o.name || '' }));
  if (ct.email) cols.push({ r: 'CONTACT', v: ct.email + (ct.phone ? ` · ${ct.phone}` : '') });
  if (ct.web) cols.push({ r: 'WEB', v: ct.web });
  const bigH = 96, tyH = 30, progH = meta.event ? 25 + 26 : 0, csH = cols.length ? 22 + 20 + 40 : 0;
  const total = progH + bigH + 16 + tyH + csH;
  let y = (SLIDE_H - total) / 2;
  if (meta.event) {
    const pw = meta.pill ? Math.round(estW(meta.pill, 12) + 24) : 0, ew = estW(meta.event, 17);
    let px = (SLIDE_W - (pw + (pw ? 10 : 0) + ew)) / 2;
    if (meta.pill) { rect(s, px, y, pw, 25, { fill: P.gold, radius: 3 }); text(s, meta.pill, px, y, pw, 25, { size: 12, color: P.primary, bold: true, align: 'center', valign: 'middle' }); px += pw + 10; }
    text(s, meta.event, px, y, ew + 20, 25, { size: 17, color: 'rgba(255,255,255,.82)', valign: 'middle' });
    y += progH;
  }
  s.addText(richRuns(c.message, { fontFace: FONT_TITLE_B, fontSize: PT(88), color: colorToHex(P.white), charSpacing: -3 }), { x: IN(PAD), y: IN(y), w: IN(SLIDE_W - PAD * 2), h: IN(bigH), align: 'center', valign: 'middle', margin: 0, fit: 'none', autoFit: false });
  y += bigH + 16;
  text(s, c.sub || 'Thank You', PAD, y, SLIDE_W - PAD * 2, tyH, { size: 20, color: 'rgba(255,255,255,.85)', align: 'center', valign: 'middle' });
  y += tyH;
  if (cols.length) {
    y += 22;
    const lw = Math.min(SLIDE_W - PAD * 2, cols.length * 260);
    rect(s, (SLIDE_W - lw) / 2, y, lw, 1, { fill: RGBA('#FFFFFF', 0.2) });
    y += 20;
    const colW = lw / cols.length;
    cols.forEach((col, i) => {
      const cx = (SLIDE_W - lw) / 2 + i * colW;
      text(s, col.r, cx, y, colW, 14, { size: 9, color: 'rgba(255,255,255,.6)', bold: true, align: 'center', letterSpacing: 1.2, valign: 'middle' });
      text(s, col.v, cx, y + 17, colW, 24, { size: 15, color: P.white, bold: true, align: 'center', valign: 'middle' });
    });
  }
}

// ─── main ───────────────────────────────────────────────────────
for (const sl of slides) {
  if (sl.kind === 'cover') cover();
  else if (sl.kind === 'agenda') agenda();
  else if (sl.kind === 'divider') divider(sl);
  else if (sl.kind === 'closing') closing();
  else content(sl);
}

const outFile = path.join(outdir, 'deck.pptx');
await pres.writeFile({ fileName: outFile });
console.log(`deck.pptx written → ${outFile}`);
console.log(`slides: ${slides.length}  (type ${meta.type}, ${meta.density}, primary ${P.primary}, style minimal)`);
slides.forEach(sl => console.log(`  ${String(sl.order).padStart(2, '0')}  ${sl.pageNo ? '#' + sl.pageNo : '   '}  ${slideLabel(sl)}`));
