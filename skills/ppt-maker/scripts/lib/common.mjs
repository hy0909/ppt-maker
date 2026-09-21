// Copyright (c) 2026 SafeAI. All rights reserved.
// See COPYRIGHT.md — 복제·수정·재배포는 허락 없이 할 수 없습니다.
// Shared helpers for build_html.mjs / build_pptx.mjs
// Outline JSON schema: see ../references/outline-schema.md
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SLIDE_W = 1280;
export const SLIDE_H = 720;

// ─── color utils ────────────────────────────────────────────────
export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('').toUpperCase();
}
export function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A.map((x, i) => x + (B[i] - x) * t));
}
export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(v => {
    v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Derive the full token set from brand primary (+ optional secondary). */
export function derivePalette(brand = {}) {
  const primary = (brand.primary || '#2F0CC5').toUpperCase();  // 기본 포인트 컬러(보라 계열)
  const accent = (brand.secondary || '#0EA5E9').toUpperCase();
  // dark slide background: darken toward navy, but never near-black
  let dark = mix(primary, '#0B1020', 0.55);
  if (luminance(dark) < 0.012) dark = mix(primary, '#0B1020', 0.35);
  // report style (claude-ppt-guide 연차보고서): primary2 = brighter companion blue, gold pill, teal dot
  // primary2 = 작은 굵은 글씨·차트·단계 원에 쓰는 강조색. 사용자가 고른 보조 컬러가 흰 카드 위에서
  // 읽히지 않을 만큼 밝으면(대비 3 미만) 쓰지 않고 메인 컬러에서 만들어 낸다.
  // 너무 밝으면 메인 컬러 쪽으로 조금씩 섞어 대비 3 이상이 될 때까지 어둡게 한다(색 계열은 유지).
  const contrastOnWhite = c => 1.05 / (luminance(c) + 0.05);
  const readable = (c) => {
    for (let t = 0; t <= 1.001; t += 0.1) {
      const c2 = mix(c, primary, t);
      if (contrastOnWhite(c2) >= 3) return c2;
    }
    return primary;
  };
  const sec = brand.secondary && /^#?[0-9a-f]{6}$/i.test(brand.secondary) ? brand.secondary.toUpperCase() : '';
  const primary2 = sec && luminance(sec) > luminance(primary) ? readable(sec) : mix(primary, '#4E8DF5', 0.55);
  return {
    primary,
    primary2,
    primaryDeep: mix(primary, '#000000', 0.28),
    gold: (brand.gold || '#C8A24B').toUpperCase(),
    goldLight: '#F2D78E',
    teal: (brand.accentDot || '#00A89D').toUpperCase(),
    softBlue: mix(primary2, '#FFFFFF', 0.86),
    softerBlue: mix(primary2, '#FFFFFF', 0.94),
    border: '#D9DEE6', borderStrong: '#B9C3D2', text: '#1A2438', textMid: '#4A5568', textLight: '#8B95A7', bgSoft: '#F5F7FA',
    body: '#515B75',                                   // 카드 안 본문 글자(제목보다 연하게)
    banner: mix(primary, '#1E2850', 0.82),             // 참고·특이사항 배너 배경(네이비 톤, 사용자 원본 #202859)
    bannerLabel: mix(primary2, '#FFFFFF', 0.62),       // 그 배너의 라벨 글자(연한 컬러)
    bannerText: mix(mix(primary2, '#FFFFFF', 0.62), mix(primary, '#1E2850', 0.82), 0.28),  // 배너 본문 글자(라벨보다 한 단계 죽인 톤)
    coverBadge: mix(mix(primary, '#000000', 0.28), '#FFFFFF', 0.17),  // 표지 오른쪽 아래 상자(원본 #3C34A1)
    primaryDark: mix(primary, '#000000', 0.22),
    primaryMid: mix(primary, '#000000', 0.10),
    primaryLight: mix(primary, '#FFFFFF', 0.88),
    primaryTint: mix(primary, '#FFFFFF', 0.94),
    accent,
    accentLight: mix(accent, '#FFFFFF', 0.86),
    dark,
    ink: '#222A35',
    g9: '#1E293B', g8: '#334155', g7: '#475569', g6: '#64748B', g5: '#94A3B8',
    g4: '#CBD5E1', g3: '#E2E8F0', g2: '#F1F5F9', g1: '#F8FAFC',
    white: '#FFFFFF',
    success: '#138A4E', warning: '#C97A1F', danger: '#C9302C',
  };
}

// ─── design tokens ──────────────────────────────────────────────
// 값의 원본은 design-tokens.json 한 곳이다. 웹 디자인 시스템 화면에서 저장하면 그 파일이 바뀐다.
// 아래 기본값은 파일이 없거나 칸이 빠졌을 때만 쓴다.
const DEFAULT_TOKENS = {
  color:   { primary: '#2F0CC5', secondary: '#1E5BB8' },
  type:    { h0: { size: 48, line: 58.6, spc: -1 }, h1: { size: 40, line: 48, spc: -1 },
             h2: { size: 22, line: 31.8, spc: -0.2 }, body2: { size: 18, line: 26.6, spc: -0.8 } },
  head:    { eyebrow: 15, pgno: 13, stitle: 42, lead: 16, ruleColor: '#CFD4DC' },
  frame:   { pad: 40, safeBottom: 44, bodyTop: 220 },
  shape:   { card: 19, banner: 14, label: 8, pill: 999, shadowY: 2, shadowBlur: 12, shadowOpacity: 7 },
  density: { dense: { body: 18, small: 16, cardTitle: 26, stat: 34, table: 16, tableH: 16, gap: 12 },
             airy:  { body: 18, small: 16, cardTitle: 26, stat: 34, table: 16, tableH: 16, gap: 12 } },
};
/** 읽어 온 값을 기본값 위에 덮는다. 빠진 칸은 기본값이 남는다. */
const overlay = (base, over) => {
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {}))
    out[k] = (v && typeof v === 'object' && !Array.isArray(v)) ? overlay(base[k] || {}, v) : v;
  return out;
};
const tokenFile = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'design-tokens.json');
let TOKENS = DEFAULT_TOKENS;
try {
  TOKENS = overlay(DEFAULT_TOKENS, JSON.parse(fs.readFileSync(tokenFile, 'utf8')));
} catch (e) {
  console.warn(`design-tokens.json 을 읽지 못해 기본값을 썼습니다: ${e.message}`);
}
export const SHAPE = TOKENS.shape;
export const HEAD = TOKENS.head;
export const FRAME = TOKENS.frame;
SHAPE.shadowCss = `0 ${SHAPE.shadowY}px ${SHAPE.shadowBlur}px rgba(20,40,80,${SHAPE.shadowOpacity / 100})`;

// ─── density scale (px) ─────────────────────────────────────────
export const DENSITY = TOKENS.density;

// ─── outline loading & normalisation ───────────────────────────
export function loadOutline(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const meta = Object.assign({
    type: 'gov-proposal', density: 'dense', lang: 'ko', title: '제목', subtitle: '', event: '',
    company: '', presenter: '', date: '', version: '',
    brand: {}, logo: {}, font: 'Pretendard', contact: {},
    agenda: true, dividers: 'auto', pageNumbers: true, footer: '',
    coverBg: 'cube',             // 표지 배경 이미지. 목록은 assets/cover-bg/index.json
  }, raw.meta || {});
  meta.brand = Object.assign({ primary: '#2F0CC5' }, meta.brand);   // 기본 포인트 컬러
  // 기본 로고가 있고, `logo: { light:'', dark:'' }` 로 비우면 그 자리를 비워 둔다.
  meta.logo = Object.assign({ light: 'assets/logo_v_blue.png', dark: 'assets/logo_h_white.png' }, meta.logo);
  const sections = (raw.sections || []).map((s, i) => Object.assign({ no: i + 1, title: '', subtitle: '', slides: [] }, s));
  // 간지는 목차가 3개 이상이면 넣는다(단원이 하나뿐인 짧은 자료에는 넣지 않는다).
  if (meta.dividers === 'auto') meta.dividers = meta.density === 'airy' || sections.length >= 3;
  const closing = raw.closing === false ? null : Object.assign({ message: '감사합니다', sub: '' }, raw.closing || {});
  const appendix = raw.appendix || [];
  return { meta, sections, closing, appendix, _file: path.resolve(file) };
}

/** Flatten the outline into a linear slide list with page numbers. */
export function flattenSlides(outline) {
  const { meta, sections, closing, appendix } = outline;
  const out = [];
  out.push({ kind: 'cover' });
  if (meta.agenda && sections.length) out.push({ kind: 'agenda' });
  for (const sec of sections) {
    if (meta.dividers) out.push({ kind: 'divider', section: sec });
    sec.slides.forEach((sl, i) => out.push({ kind: 'content', section: sec, slide: sl, idx: i + 1 }));
  }
  if (closing) out.push({ kind: 'closing' });
  appendix.forEach((sl, i) => out.push({ kind: 'appendix', slide: sl, idx: i + 1 }));
  // page numbers: cover counts as 1, only content/appendix pages show numbers
  let n = 0;
  for (const s of out) {
    n += 1;
    s.order = n;
    s.pageNo = (s.kind === 'content' || s.kind === 'appendix') ? String(n).padStart(2, '0') : null;
  }
  return out;
}

export function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── 외톨이 어절 묶기 (한글 조판) ────────────────────────
// 마지막 어절이 짧으면("확장", "것이") 줄 끝에 혼자 떨어져 보기 나쁘다.
// 앞 어절과 줄바꿈 없는 공백(NBSP)으로 묶어 둘을 같이 다음 줄로 내린다.
// HTML 쪽은 word-break:keep-all 과 같이 쓰고, PPTX 쪽은 PowerPoint 가 NBSP 에서 안 끊어서
// 두 경로 모두 해결된다. pptxgenjs 에는 줄바꿈 규칙 옵션이 없어서 이 방법 밖에 없다.
// 출처: kez-lab/korean-presentation-skill (MIT) 의 korean-orphan 규칙. 거긴 만든 뒤에 잡고,
//       여기서는 만드는 순간에 막는다. 상세는 CREDITS.md.
export const KOREAN_PARTICLE = /^(은|는|이|가|을|를|의|에|와|과|도|로|으로|만|께|부터|까지|에서|에게|이다|입니다|한다|합니다)$/;
export const ORPHAN_MAX_CHARS = 2;   // 이 길이 이하의 마지막 어절은 앞에 붙인다
export const NBSP = '\u00A0';
/** 마지막 어절이 짧으면 앞 어절과 NBSP 로 묶는다. <br> 로 나눠진 구간마다 따로 본다. */
export function tieTail(s) {
  const t = String(s ?? '');
  if (!t.trim() || !/[가-힣]/.test(t)) return t;        // 한글이 없으면 건드리지 않는다
  return t.split(/(<br\s*\/?>)/gi).map(seg => {
    if (/^<br/i.test(seg)) return seg;
    const m = seg.match(/^([\s\S]*\S)([ \t]+)(\S+)([ \t]*)$/);
    if (!m) return seg;                                    // 어절이 하나뿐이면 묶을 게 없다
    const [, head, , tail, trail] = m;
    const bare = tail.replace(/\*\*/g, '').replace(/[.,;:)\]」』"'…·]+$/gu, '');
    if (bare.length > ORPHAN_MAX_CHARS && !KOREAN_PARTICLE.test(bare)) return seg;
    return head + NBSP + tail + trail;
  }).join('');
}

/** allow **bold** markers in text → <b> */
export function rich(s) {
  return esc(tieTail(s)).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/&lt;br\s*\/?&gt;/gi, '<br>');
}
/** split "**bold**" markers into pptxgenjs text runs */
export function richRuns(s, base = {}) {
  const parts = String(tieTail(s) ?? '').split(/(\*\*.+?\*\*)/g).filter(Boolean);
  return parts.map(p => {
    const m = p.match(/^\*\*(.+)\*\*$/);
    return m ? { text: m[1], options: { ...base, bold: true } } : { text: p, options: { ...base } };
  });
}

/** item can be a string or {k, v}; normalise to {k, v} */
export function normItem(it) {
  if (typeof it === 'string') return { k: '', v: it };
  return { k: it.k || it.title || '', v: it.v || it.desc || '' };
}

export function sectionLabel(sec, slide) {
  if (!sec) return '';
  return `${sec.no}. ${sec.title}`;
}

export function slideLabel(s) {
  if (s.kind === 'cover') return '표지';
  if (s.kind === 'agenda') return '목차';
  if (s.kind === 'divider') return `${s.section.no}. ${s.section.title}`;
  if (s.kind === 'closing') return '마무리';
  if (s.kind === 'appendix') return `Appendix ${s.idx} ${s.slide.title || ''}`.trim();
  return `${s.section.no}-${s.idx} ${s.slide.title || ''}`.trim();
}

export const ROMAN = ['i','ii','iii','iv','v','vi','vii','viii','ix','x','xi','xii'];
export const roman = n => ROMAN[n - 1] || String(n);

// ─── 글자 규격 (사용자 원본 PPTX 에서 그대로 옮김) ──────────────────────
// size = pt, line = 고정 줄간격(pt), spc = 자간(pt, 음수가 '좁게'), face = 글꼴 이름.
// Paperlogy·Pretendard 는 굵기마다 패밀리가 따로 있다 → bold 속성을 켜지 않는다(가짜 굵기 방지).
const FACE = {
  h0: 'Paperlogy 7 Bold',
  h1: 'Paperlogy 7 Bold',
  h2: 'Paperlogy 5 Medium',
  body2: 'Pretendard Light'
};
export const TYPE = {
  h0:    { size: TOKENS.type.h0.size, line: TOKENS.type.h0.line, spc: TOKENS.type.h0.spc,   face: FACE.h0 },
  h1:    { size: TOKENS.type.h1.size, line: TOKENS.type.h1.line,   spc: TOKENS.type.h1.spc,   face: FACE.h1 },
  h2:    { size: TOKENS.type.h2.size, line: TOKENS.type.h2.line, spc: TOKENS.type.h2.spc, face: FACE.h2 },
  body2: { size: TOKENS.type.body2.size, line: TOKENS.type.body2.line, spc: TOKENS.type.body2.spc, face: FACE.body2 },
};
export const TITLE_FACE = FACE.h0;
export const BODY_FACE = FACE.body2;
export const FALLBACK_FACES = `'Pretendard','Apple SD Gothic Neo','Malgun Gothic','맑은 고딕','Noto Sans KR',sans-serif`;
/** pt → px (1280×720 화면 기준, 96dpi) */
export const px = pt => +(pt * 96 / 72).toFixed(2);
/** TYPE 한 칸을 CSS 선언으로 */
export const typeCss = t =>
  `font-family:'${t.face}',${FALLBACK_FACES};font-weight:400;font-size:${px(t.size)}px;line-height:${px(t.line)}px;letter-spacing:${t.spc}pt;`;

// ─── 표지·목차 배치 (원본 PPTX 좌표를 px 로 환산, 1280×720) ──────────────
// 상하좌우 여백은 원본 그대로 둔다. 제목(59.4)과 설명줄(61.5)의 왼쪽이 2px 다른 것도
// 원본에서 작은 글씨를 시각적으로 맞춰 둔 것이라 그대로 옮긴다.
export const COVER_BOX = {
  lead:      { x: 61.5,  y: 56,    w: 530.2, h: 83.6 },   // body2 — 제목 위 설명 한 줄
  title:     { x: 59.4,  y: 117,   w: 720,   h: 172.1 },  // h0
  logo:      { x: 60.4,  y: 613.4, w: 202.5, h: 50.6 },   // 왼쪽 아래 흰 로고
  badge:     { x: 986.1, y: 636.9, w: 246.6, h: 39.6 },   // 오른쪽 아래 상자
  badgeText: { x: 947.6, y: 641.6, w: 266.7, h: 26,   size: 14, spc: -0.8 },
};
export const AGENDA_BOX = {
  title:  { x: 47.3, y: 40.6, w: 320, h: 64 },            // h1 '목차'
  cols:   [{ n: 560, t: 598.5 }, { n: 926.5, t: 965 }],   // 열마다 번호 x / 항목 x
  itemW: 274.5, itemH: 32, rowTop: 62, rowPitch: 61.5,
  numSize: 22, numSpc: -0.5,                              // 번호 (Paperlogy 7 Bold)
  foot:   { x: 47.3, y: 658.1, w: 999.3, h: 18, size: 12, spc: -0.2 },
  pageNo: { x: 1200, y: 658.1, w: 40,    h: 18 },
};

// ─── 표지 배경 3종 (사용자가 고른 이미지) ─────────────────────
// 원본을 2560×1440 으로 키워 assets/cover-bg/ 에 넣어 뒀다(Lanczos + 언샵, JPEG 품질 95·4:4:4).
// 표지 배경 목록. 어떤 표지에는 짝이 되는 간지 배경(divider)이 딸려 있고, 없으면 간지는 브랜드 그라디언트를 쓴다.
// 마무리 장표는 표지와 무관하게 늘 브랜드 그라디언트다.
// 목록은 assets/cover-bg/index.json 한 곳에만 있다.
// 새 배경은 `python3 scripts/prepare_cover_bg.py <원본> <키> --label "이름"` 으로 넣으면
// 그림 종류에 맞는 방법으로 2560×1440 으로 키우고 이 파일까지 고쳐 준다.
const BG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'cover-bg');
const BG_LIST = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(BG_DIR, 'index.json'), 'utf8')).backgrounds || []; }
  catch { return [{ key: 'cube', label: '유리 큐브', file: 'cube.jpg' }]; }
})();
export const COVER_BACKGROUNDS = BG_LIST;
export const COVER_BG_KEYS = BG_LIST.map(b => b.key);
export const COVER_BG_LABEL = Object.fromEntries(BG_LIST.map(b => [b.key, b.label]));
/** meta.coverBg → out/assets 기준 경로 (확장자는 목록에 적힌 그대로) */
export function coverBgFile(design) {
  const b = BG_LIST.find(x => x.key === design) || BG_LIST[0];
  return `assets/cover-bg/${b.file}`;
}
/** 본문 장표 맨 아래 출처·각주 줄. 근거 표기를 요구하는 문서가 있어 자리를 잡아 뒀다.
 *  safe 는 출처가 없을 때 본문 아래로 비워 두는 여백(px). 출처가 길어지면 그만큼 본문을 위로 올린다. */
export const SLIDE_FOOT = { size: 11, line: 15.4, spc: -0.2, bottom: 13, safe: 44 };

/** 장표의 출처·각주를 줄 배열로 만든다. 문자열도 배열도 받는다.
 *  각주는 한 줄에 하나씩, 출처는 여럿이어도 ' · ' 로 묶어 한 줄로 적는다.
 *  '출처: ' 로 이미 시작하면 덧붙이지 않는다. */
export function footLines(sl) {
  const list = v => (Array.isArray(v) ? v : v ? [v] : []).map(x => String(x).trim()).filter(Boolean);
  const out = list(sl && sl.footnote);
  const src = list(sl && sl.source).map(t => t.replace(/^출처\s*[:：]\s*/, ''));
  if (src.length) out.push('출처: ' + src.join(' · '));
  return out;
}

/** 출처 줄까지 넣었을 때 본문 아래로 비워야 하는 높이(px) */
export function footSafeBottom(lines) {
  if (!lines.length) return SLIDE_FOOT.safe;
  return Math.max(SLIDE_FOOT.safe, Math.ceil(SLIDE_FOOT.bottom + lines.length * px(SLIDE_FOOT.line)) + 4);
}

/** 이 표지를 골랐을 때 쓸 간지 배경 — 짝이 없으면 null (그때는 브랜드 그라디언트) */
export function dividerBgFile(design) {
  const b = BG_LIST.find(x => x.key === design) || BG_LIST[0];
  return b && b.divider ? `assets/cover-bg/${b.divider}` : null;
}
/** 표지 제목 자리를 살짝 눌러 주는 그라데이션 — HTML 과 PPTX 가 같은 값을 쓴다 */
export const COVER_SCRIM = 'linear-gradient(90deg,rgba(5,3,18,.42) 0%,rgba(5,3,18,.48) 42%,rgba(5,3,18,.30) 58%,rgba(5,3,18,0) 74%)';
/** 간지 글씨는 왼쪽에 몰려 있다 — 왼쪽만 눌러 주고 오른쪽 그림은 살린다 */
export const DIVIDER_SCRIM = 'linear-gradient(90deg,rgba(5,3,18,.74) 0%,rgba(5,3,18,.62) 40%,rgba(5,3,18,.26) 70%,rgba(5,3,18,.06) 100%)';
/** 마무리 장표 배경 — 표지와 따로 간다(브랜드 그라디언트) */
export const closingBgCss = P => `linear-gradient(135deg,${P.primaryDeep} 0%,${P.primary} 45%,${P.primary2} 100%)`;
