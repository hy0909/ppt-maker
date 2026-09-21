#!/usr/bin/env node
// Copyright (c) 2026 SafeAI. All rights reserved.
// See COPYRIGHT.md — 복제·수정·재배포는 허락 없이 할 수 없습니다.
// outline.json → deck.html (deck-stage.js driven, PDF-safe)
// Visual style: 연차보고서형 리포트 덱을 1280×720 으로 맞춘 것.
// usage: node build_html.mjs <outline.json> [outdir]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadOutline, flattenSlides, derivePalette, DENSITY, esc, rich, normItem, slideLabel,
         TYPE, typeCss, px, FALLBACK_FACES, COVER_BOX, AGENDA_BOX, coverBgFile, closingBgCss, COVER_SCRIM,
         dividerBgFile, DIVIDER_SCRIM, tieTail } from './lib/common.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_ASSETS = path.resolve(__dirname, '..', 'assets');

const [, , outlineFile, outdirArg] = process.argv;
if (!outlineFile) { console.error('usage: node build_html.mjs <outline.json> [outdir]'); process.exit(1); }

const outline = loadOutline(outlineFile);
const outdir = path.resolve(outdirArg || path.dirname(outline._file));
const { meta } = outline;
const P = derivePalette(meta.brand);
const D = DENSITY[meta.density] || DENSITY.dense;
const slides = flattenSlides(outline);
const NUM = n => String(n); // 목차·간지 번호는 항상 1·2·3 숫자
const fitFile = path.join(outdir, 'fit.json');
const FIT = fs.existsSync(fitFile) ? JSON.parse(fs.readFileSync(fitFile, 'utf8')) : {};
const fitStyle = (order) => FIT[order] ? ` style="--k:${FIT[order]}"` : '';
const DIVIDER_BG = dividerBgFile(meta.coverBg);   // 표지에 짝이 되는 간지 그림이 있으면 그걸 깐다

// ─── CSS ────────────────────────────────────────────────────────
function css() {
  const K = meta.density === 'airy' ? 1.5 : 1.9;
  const C = COVER_BOX, A = AGENDA_BOX;
  return `
deck-stage:not(:defined){visibility:hidden;}
:root{
  --primary:${P.primary};--primary-2:${P.primary2};--primary-deep:${P.primaryDeep};
  --primary-soft:${P.softBlue};--primary-softer:${P.softerBlue};
  --accent:${P.teal};--gold:${P.gold};--gold-light:${P.goldLight};
  --success:${P.success};--warning:${P.warning};--danger:${P.danger};
  --bg-soft:${P.bgSoft};--border:${P.border};--border-strong:${P.borderStrong};
  --text:${P.text};--title:#10141C;--body:#515B75;--banner:${P.banner};--banner-label:${P.bannerLabel};--banner-text:${P.bannerText};--text-mid:${P.textMid};--text-light:${P.textLight};
  --pad:40px;--hdr:0px;--foot:0px;--safe-bottom:44px;--page:#E9ECF0;--card-shadow:0 2px 12px rgba(20,40,80,.07);
  --font:'${meta.font}','Pretendard','Malgun Gothic','맑은 고딕','Apple SD Gothic Neo','Noto Sans KR',sans-serif;
  --font-title:'Paperlogy 6 SemiBold',${FALLBACK_FACES};
  --font-title-b:'Paperlogy 8 ExtraBold',${FALLBACK_FACES};
  --cover-badge:${P.coverBadge};
  --kmax:${K};
}
/* --k: per-slide body scale from fit_slides.mjs. Header/title/lead are fixed. */
.slide{--k:1;
  --fs-body:calc(${D.body}px * var(--k));--fs-small:calc(${D.small}px * var(--k));
  --fs-card:calc(${D.cardTitle}px * var(--k));--fs-stat:calc(${D.stat}px * var(--k));
  --fs-table:calc(${D.table}px * var(--k));--fs-tableh:calc(${D.tableH}px * var(--k));
  --gap:calc(${D.gap}px * var(--k));
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
img{display:block;max-width:100%;}
html,body{margin:0;padding:0;background:#2a3142;}
body{font-family:var(--font);-webkit-font-smoothing:antialiased;color:var(--text);letter-spacing:-.8pt;}
.slide{width:1280px;height:720px;overflow:hidden;background:var(--page);position:relative;font-size:var(--fs-body);line-height:1.5;letter-spacing:-.8pt;word-break:keep-all;}
/* top: eyebrow + page no · headline · rule · meta line (minimal, no header strip) */
.top{position:absolute;top:30px;left:var(--pad);right:var(--pad);z-index:4;}
.eyebrow{font-size:15px;color:var(--text-mid);font-weight:500;display:flex;justify-content:space-between;align-items:baseline;}
.eyebrow b{color:var(--primary);font-weight:700;}
.eyebrow .pgno{font-size:14px;color:var(--text-light);font-weight:500;font-variant-numeric:tabular-nums;}
.stitle{font-family:var(--font-title);font-size:34.67px;font-weight:400;color:var(--title);line-height:1.2;margin-top:9px;word-break:keep-all;overflow-wrap:break-word;max-width:1100px;}
.stitle b{font-family:var(--font-title-b);font-weight:400;color:var(--title);}
.rule{height:1px;background:#CFD4DC;margin-top:13px;}
.slead{font-size:16px;color:var(--text-mid);line-height:1.5;margin-top:26px;max-width:1100px;}
.slead b{color:var(--text);font-weight:700;}
/* body */
.body{position:absolute;left:var(--pad);right:var(--pad);top:var(--body-top,238px);bottom:var(--safe-bottom);display:flex;flex-direction:column;gap:var(--gap);z-index:3;}
.blk{min-height:0;display:flex;flex-direction:column;}
.blk>.inner{flex:1;min-height:0;display:flex;flex-direction:column;}
/* block label above a block (작은 라벨) */
.slabel{display:inline-flex;align-items:center;height:2.1em;padding:0 1.05em;background:var(--primary);color:#fff;font-size:var(--fs-card);font-weight:700;border-radius:8px;white-space:nowrap;line-height:1;margin-bottom:.8em;align-self:flex-start;}
/* card: 제목 피약 + 흰 본문 — 투명 래퍼 + 독립 피약 + 독립 흰 박스 */
.card{position:relative;background:transparent;border:0;border-radius:0;box-shadow:none;display:flex;flex-direction:column;min-height:0;overflow:visible;gap:.3em;font-size:var(--fs-body);}
.card>.cap{background:var(--primary);color:#fff;font-size:var(--fs-card);font-weight:700;line-height:1.3;text-align:center;padding:.325em 1em;letter-spacing:-.01em;border-radius:999px;flex:0 0 auto;white-space:nowrap;}
.card>.bd{background:#fff;border-radius:22px;box-shadow:var(--card-shadow);padding:.95em 1.4em 1em;display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden;}
.card.tint>.bd{background:var(--primary-softer);}
.card.dark>.bd{background:var(--primary);color:#fff;}
.card .ct{font-size:var(--fs-card);font-weight:700;color:var(--text);margin-bottom:.5em;line-height:1.3;}
.card.dark .ct{color:#fff;}
.card .cd{font-size:var(--fs-small);color:var(--body);line-height:1.55;}
.card.dark .cd{color:rgba(255,255,255,.85);}
.card .fill{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:space-evenly;}
/* sub heading inside card: "| 채널 전체" */
.sh2{font-size:calc(var(--fs-body) * .94);font-weight:700;color:var(--body);line-height:1.3;margin-bottom:.5em;}
/* list */
ul.rl{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:var(--rl-gap,.5em);}
ul.rl li{position:relative;padding-left:1.05em;color:var(--text);font-size:var(--fs-body);line-height:1.25;}
ul.rl li::before{content:'•';position:absolute;left:.05em;top:0;color:var(--text);}
ul.rl li b{color:var(--text);font-weight:700;} ul.rl li .k{font-weight:700;color:var(--text);}
ul.rl li .v{color:var(--body);}
ul.rl li .v{color:var(--text-mid);font-size:var(--fs-small);display:block;margin-top:.1em;}
ul.rl.row li .v{display:inline;margin-left:.5em;}
.card.dark ul.rl li{color:#fff;} .card.dark ul.rl li::before{color:rgba(255,255,255,.7);} .card.dark ul.rl li .k{color:#fff;} .card.dark ul.rl li .v{color:rgba(255,255,255,.8);}
/* grids */
.grid{display:grid;gap:calc(var(--gap) * 1.6);flex:1;min-height:0;}
/* stat card: 제목 피약 + 수치 본문 — 투명 래퍼 + 독립 피약 + 독립 흰 박스 */
.stat{position:relative;background:transparent;border-radius:0;box-shadow:none;display:flex;flex-direction:column;min-height:0;overflow:visible;gap:.3em;font-size:var(--fs-body);}
.stat>.cap{background:var(--primary);color:#fff;font-size:var(--fs-card);font-weight:700;text-align:center;padding:.325em 1em;line-height:1.3;border-radius:999px;flex:0 0 auto;white-space:nowrap;}
.stat>.bd{background:#fff;border-radius:22px;box-shadow:var(--card-shadow);padding:.95em 1.4em 1em;display:flex;flex-direction:column;justify-content:center;flex:1;min-height:0;overflow:hidden;}
.stat .sl{font-size:var(--fs-small);color:var(--body);font-weight:500;}
.stat .sv{font-size:var(--fs-stat);font-weight:800;color:var(--text);line-height:1.05;margin-top:.1em;letter-spacing:-.04em;font-variant-numeric:tabular-nums;}
.stat .sv small{font-size:.5em;color:var(--text);margin-left:.05em;font-weight:700;}
.stat .sn{font-size:var(--fs-small);color:var(--primary-2);font-weight:700;margin-top:.5em;line-height:1.4;}
/* kv table (minimal): label column grey, values, bold last row; emphasize col tinted */
table.rt{width:100%;border-collapse:collapse;font-size:var(--fs-table);background:#fff;table-layout:fixed;}
.rt thead th{background:var(--bg-soft);color:var(--text);font-weight:700;text-align:center;padding:.6em .8em;border:1px solid #E3E7EC;font-size:var(--fs-tableh);line-height:1.3;}
.rt thead th.em{background:var(--primary);color:#fff;border-color:var(--primary);}
.rt tbody td{padding:.6em .8em;border:1px solid #E3E7EC;vertical-align:middle;color:var(--text);background:#fff;text-align:center;line-height:1.45;}
.rt tbody td:first-child{text-align:left;font-weight:600;background:var(--bg-soft);}
.rt tbody td.em{background:var(--primary-softer);font-weight:700;color:var(--primary);}
.rt tbody td.l{text-align:left;}
.rt tbody tr:last-child td{font-weight:700;}
.badge{display:inline-flex;align-items:center;gap:.35em;height:1.9em;padding:0 .8em;border-radius:1em;font-size:.8em;font-weight:600;white-space:nowrap;}
.badge::before{content:'';width:.4em;height:.4em;border-radius:50%;background:currentColor;}
.badge.ok{background:#E6F5EC;color:var(--success);} .badge.up{background:#DDEEFF;color:var(--primary-2);} .badge.prog{background:#FFF6E1;color:var(--warning);} .badge.n{background:var(--bg-soft);color:var(--text-mid);}
/* highlight box (used by kv/stat pairs) */
.hbox{background:var(--primary-softer);border-radius:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:.8em 1em;text-align:center;}
.hbox .hl{font-size:var(--fs-small);color:var(--text);} .hbox .hv{font-size:calc(var(--fs-stat) * .62);font-weight:800;color:var(--text);letter-spacing:-.03em;line-height:1.1;}
/* banner (callout): 어두운 둥근 박스 — 왼쪽에 라벨(연한 컬러), 오른쪽에 본문. 모두 박스 안에 들어간다 */
.banner{background:var(--banner);color:#fff;padding:.75em 1.6em;border-radius:14px;display:flex;align-items:center;gap:1.6em;flex-shrink:0;font-size:var(--fs-small);}
.banner .lead{color:var(--banner-label);font-size:calc(var(--fs-small) * 1.05);font-weight:700;white-space:nowrap;line-height:1.3;flex:0 0 auto;text-align:center;}
.banner .msg{font-size:var(--fs-small);font-weight:500;line-height:1.3;flex:1;min-width:0;}
.banner .msg ul.rl li{color:var(--banner-text);font-size:var(--fs-small);} .banner .msg ul.rl li::before{color:var(--banner-text);} .banner .msg b{color:#fff;font-weight:800;} .banner .msg ul.rl li .v{color:rgba(255,255,255,.75);}
.banner.light{background:#fff;color:var(--text);box-shadow:var(--card-shadow);} .banner.light .lead{color:var(--primary);} .banner.light .msg ul.rl li{color:var(--body);} .banner.light .msg ul.rl li::before{color:var(--body);} .banner.light .msg b{color:var(--primary);}
/* compare: two labeled cards */
.cmp{display:grid;grid-template-columns:1fr 3em 1fr;align-items:stretch;flex:1;min-height:0;font-size:var(--fs-body);}
.side{position:relative;background:transparent;border-radius:0;box-shadow:none;display:flex;flex-direction:column;min-height:0;overflow:visible;gap:.3em;}
.side>.cap{background:var(--text-mid);color:#fff;font-size:var(--fs-card);font-weight:700;text-align:center;padding:.325em 1em;line-height:1.3;border-radius:999px;flex:0 0 auto;white-space:nowrap;}
.side.to>.cap{background:var(--primary);}
.side>.bd{background:#fff;border-radius:22px;box-shadow:var(--card-shadow);padding:.95em 1.4em 1em;display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden;}
.side.to>.bd{background:var(--primary-softer);}
.side .sh{font-size:var(--fs-card);font-weight:700;margin:.1em 0 .6em;color:var(--text);}
.side .fill{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:space-evenly;}
.cmp .arr{display:flex;align-items:center;justify-content:center;color:var(--primary);font-size:2.2em;font-weight:800;}
/* roadmap (process / timeline) */
.rm{position:relative;display:flex;flex-direction:column;flex:1;min-height:0;font-size:var(--fs-body);}
.rm .line{position:absolute;left:4%;right:4%;top:calc(1.3em - 1px);height:2px;background:var(--primary);opacity:.55;}
.rm .nums{display:grid;gap:var(--gap);position:relative;z-index:1;}
.rm .num{width:2.6em;height:2.6em;border-radius:50%;background:var(--primary);color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center;margin:0 auto;border:3px solid var(--page);font-size:1em;}
.rm .num.last{background:var(--primary-2);}
.rm .steps{display:grid;gap:var(--gap);flex:1;min-height:0;margin-top:.7em;}
.rm .step{background:#fff;border-radius:12px;box-shadow:var(--card-shadow);padding:1em 1em;display:flex;flex-direction:column;min-height:0;text-align:center;}
.rm .step.hl{background:var(--primary-softer);} .rm .step.dk{background:var(--primary);color:#fff;}
.rm .step .per{font-size:var(--fs-small);font-weight:700;color:var(--primary-2);letter-spacing:.02em;} .rm .step.dk .per{color:rgba(255,255,255,.8);}
.rm .step .pt{font-size:var(--fs-card);font-weight:700;color:var(--text);margin:.2em 0 .45em;line-height:1.3;} .rm .step.dk .pt{color:#fff;}
.rm .step .pd{font-size:var(--fs-small);color:var(--text-mid);line-height:1.45;flex:1;display:flex;flex-direction:column;justify-content:center;gap:.3em;} .rm .step.dk .pd{color:rgba(255,255,255,.85);}
.rm .step ul.rl{text-align:left;} .rm .step ul.rl li{font-size:var(--fs-small);}
.rm .step.dk ul.rl li,.rm .step.dk ul.rl li .k{color:#fff;} .rm .step.dk ul.rl li::before{color:rgba(255,255,255,.7);} .rm .step.dk ul.rl li .v{color:rgba(255,255,255,.8);}
/* image */
.imgblk{display:flex;gap:calc(var(--gap) * 1.6);flex:1;min-height:0;font-size:var(--fs-body);}
.imgblk .pic{flex:1.3;min-height:0;display:flex;flex-direction:column;background:#fff;border-radius:12px;box-shadow:var(--card-shadow);padding:1em 1.2em;overflow:hidden;}
.imgblk .pic .fr{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;}
.imgblk .pic img{max-height:100%;max-width:100%;object-fit:contain;}
.imgblk .cp{font-size:var(--fs-small);color:var(--text-light);text-align:center;margin-top:.5em;}
.imgblk .txt{flex:1;min-height:0;display:flex;flex-direction:column;}
.ph{border:1.5px dashed #C3CAD5;border-radius:8px;background:var(--bg-soft);color:#6F7C92;display:flex;align-items:center;justify-content:center;font-size:var(--fs-small);font-weight:500;padding:1em;text-align:center;width:100%;height:100%;min-height:4em;}
/* kv: small table + highlight box side by side (성과 요약 카드) */
.kv{display:flex;gap:1.2em;align-items:stretch;flex:1;min-height:0;}
.kv .tbl{flex:1.4;min-height:0;display:flex;flex-direction:column;justify-content:center;}
.kv .hbox{flex:1;}
.card .sl{font-size:var(--fs-small);color:var(--text-mid);font-weight:500;}
.card .sv{font-size:var(--fs-stat);font-weight:800;color:var(--text);line-height:1.05;margin-top:.1em;letter-spacing:-.04em;font-variant-numeric:tabular-nums;}
.card .sv small{font-size:.5em;margin-left:.05em;font-weight:700;}
.card .sn{font-size:var(--fs-small);color:var(--primary-2);font-weight:700;margin-top:.45em;line-height:1.4;margin-bottom:.9em;}
.sec2+.sec2{margin-top:1em;padding-top:1em;border-top:1px solid #E6E9EE;}
/* chart */
.chart{background:var(--bg-soft);border-radius:10px;padding:1em 1.2em .8em;display:flex;flex-direction:column;flex:1;min-height:0;}
.chart .chh{display:flex;justify-content:space-between;align-items:baseline;font-size:var(--fs-small);}
.chart .chh b{color:var(--text);font-weight:700;font-size:var(--fs-body);} .chart .chh span{color:var(--text-mid);}
.chart svg{flex:1;min-height:0;width:100%;height:100%;display:block;margin-top:.3em;}
.chart .lg{display:flex;gap:1.2em;font-size:var(--fs-small);color:var(--text-mid);margin-top:.2em;} .chart .lg i{display:inline-block;width:.8em;height:.8em;border-radius:2px;margin-right:.35em;vertical-align:-.1em;}
/* cover / toc / divider / closing */
/* 표지 배경 — meta.coverBg 로 고른 이미지. 마무리 장표는 브랜드 그라디언트로 따로 간다 */
.cover{position:absolute;inset:0;overflow:hidden;color:#fff;}
.cbg{position:absolute;inset:0;overflow:hidden;z-index:0;background:#000 center center / cover no-repeat;}
.cv .cbg{background-image:url('${coverBgFile(meta.coverBg)}');}
/* 제목이 놓이는 왼쪽을 살짝 눌러 글씨가 밝은 부분에 걸쳐도 읽히게 한다 */
.cv .scrim{position:absolute;inset:0;z-index:1;background:${COVER_SCRIM};}
.closing .cbg{background:${closingBgCss(P)};}
/* 표지 본문 — 원본 PPTX 좌표·여백 그대로 */
.cover .clead{position:absolute;left:${C.lead.x}px;top:${C.lead.y}px;width:${C.lead.w}px;height:${C.lead.h}px;${typeCss(TYPE.body2)}color:#E7E6E6;z-index:2;word-break:keep-all;}
.cover .ctitle{position:absolute;left:${C.title.x}px;top:${C.title.y}px;width:${C.title.w}px;height:${C.title.h}px;${typeCss(TYPE.h0)}color:#fff;z-index:2;word-break:keep-all;}
.cover .clogo{position:absolute;left:${C.logo.x}px;top:${C.logo.y}px;width:${C.logo.w}px;height:${C.logo.h}px;object-fit:contain;object-position:left center;z-index:2;}
.cover .cbadge{position:absolute;right:${1280 - C.badge.x - C.badge.w}px;bottom:${720 - C.badge.y - C.badge.h}px;height:${C.badge.h}px;min-width:${C.badge.w}px;display:flex;align-items:center;justify-content:flex-end;padding:0 ${+(C.badge.x + C.badge.w - C.badgeText.x - C.badgeText.w).toFixed(1)}px;background:var(--cover-badge);font-size:${px(C.badgeText.size)}px;font-weight:700;letter-spacing:${C.badgeText.spc}pt;color:#fff;white-space:nowrap;z-index:2;}
.cover .logo{position:absolute;top:30px;right:53px;height:22px;z-index:3;}   /* 마무리 장표의 오른쪽 위 로고 */
.cin{position:relative;z-index:2;padding:66px 66px 56px;height:100%;display:flex;flex-direction:column;justify-content:space-between;}
.prog{font-size:17px;font-weight:500;letter-spacing:.02em;color:rgba(255,255,255,.82);display:flex;align-items:center;gap:10px;}
.pill{display:inline-block;padding:4px 11px;background:var(--gold);color:var(--primary);border-radius:3px;font-size:12px;font-weight:700;white-space:nowrap;}
/* 목차 — 원본 PPTX 좌표·여백 그대로. 왼쪽 위 '목차', 오른쪽에 번호 + 섹션명 2열 */
.tocp{position:absolute;inset:0;background:var(--page);}
.tocp .lb{position:absolute;left:${A.title.x}px;top:${A.title.y}px;width:${A.title.w}px;height:${A.title.h}px;${typeCss(TYPE.h1)}color:var(--title);}
.tocp .items{position:absolute;left:${A.cols[0].n}px;top:${A.rowTop}px;width:${A.cols[1].t + A.itemW - A.cols[0].n}px;display:grid;grid-auto-flow:column;grid-template-columns:${A.cols[0].t - A.cols[0].n + A.itemW}px ${A.cols[1].t - A.cols[1].n + A.itemW}px;column-gap:${+(A.cols[1].n - A.cols[0].t - A.itemW).toFixed(1)}px;row-gap:${+(A.rowPitch - A.itemH).toFixed(1)}px;align-content:start;}
.tocp .it{display:grid;grid-template-columns:${A.itemH - 10}px 1fr;column-gap:${+(A.cols[0].t - A.cols[0].n - A.itemH + 10).toFixed(1)}px;min-height:${A.itemH}px;}
.tocp .it .n{text-align:center;align-self:start;font-family:'${TYPE.h0.face}',${FALLBACK_FACES};font-weight:400;font-size:${px(A.numSize)}px;line-height:${A.itemH}px;letter-spacing:${A.numSpc}pt;color:var(--primary);}
.tocp .it .t{${typeCss(TYPE.h2)}color:var(--title);word-break:keep-all;margin:${+((A.itemH - px(TYPE.h2.line)) / 2).toFixed(2)}px 0;}
.tocp .it.apx .n{font-family:'Paperlogy 4 Regular',${FALLBACK_FACES};font-size:${px(20)}px;}
.tocp .it.apx .t{font-family:'Paperlogy 4 Regular',${FALLBACK_FACES};}
.tocp .ft{position:absolute;left:${A.foot.x}px;top:${A.foot.y}px;width:${A.foot.w}px;height:${A.foot.h}px;font-size:${px(A.foot.size)}px;line-height:${A.foot.h}px;letter-spacing:${A.foot.spc}pt;color:var(--text-light);}
.tocp .pn{position:absolute;left:${A.pageNo.x}px;top:${A.pageNo.y}px;width:${A.pageNo.w}px;height:${A.pageNo.h}px;text-align:right;font-size:${px(A.foot.size)}px;line-height:${A.pageNo.h}px;letter-spacing:${A.foot.spc}pt;color:var(--text-light);}
/* 간지: 포인트 컬러 한 면 + 좌상단 라벨·큰 제목 + 우하단 로고 워터마크 + 하단 정보줄 */
.dv{position:absolute;inset:0;overflow:hidden;background:linear-gradient(118deg,var(--primary-deep) 0%,var(--primary) 54%,var(--primary-2) 100%);color:#fff;}
.dv .wm{position:absolute;right:var(--pad);bottom:86px;width:620px;opacity:.12;pointer-events:none;}
${DIVIDER_BG ? `.dv .dbg{position:absolute;inset:0;background:#000 url('${DIVIDER_BG}') center center / cover no-repeat;}
.dv .dsc{position:absolute;inset:0;background:${DIVIDER_SCRIM};}` : ''}
.dv .in{position:absolute;inset:0;padding:56px var(--pad) 42px;display:flex;flex-direction:column;z-index:2;}
.dv .eb{font-size:15px;font-weight:700;letter-spacing:.14em;color:rgba(255,255,255,.62);text-transform:uppercase;}
.dv h1{font-family:var(--font-title-b);font-size:60px;font-weight:400;letter-spacing:-.04em;line-height:1.12;margin-top:26px;max-width:1000px;word-break:keep-all;}
.dv .s{font-size:18px;color:rgba(255,255,255,.72);margin-top:18px;max-width:820px;line-height:1.55;}
.dv .ft{margin-top:auto;display:flex;justify-content:space-between;align-items:flex-end;font-size:13px;color:rgba(255,255,255,.52);letter-spacing:-.01em;}
.closing .cin{justify-content:center;align-items:center;text-align:center;}
.closing .big{font-family:var(--font-title-b);font-size:88px;font-weight:400;color:#fff;letter-spacing:-.04em;line-height:1;margin-bottom:16px;}
.closing .ty{font-size:20px;color:rgba(255,255,255,.85);margin-bottom:24px;}
.closing .cs{margin-top:22px;padding-top:20px;border-top:1px solid rgba(255,255,255,.2);display:flex;justify-content:center;gap:32px;}
.closing .ci .r{font-size:9px;color:rgba(255,255,255,.6);letter-spacing:.15em;font-weight:700;} .closing .ci .v{font-size:15px;font-weight:700;color:#fff;margin-top:5px;}
@media print{.no-print{display:none!important;}}
`;
}

// ─── helpers ────────────────────────────────────────────────────
/** rough line count of a text at a font size inside a width (CJK ≈ 0.92em, latin ≈ 0.52em) — keeps HTML/PPTX body-top in sync */
function estLines(str, sizePx, widthPx) {
  const s = String(str || '').replace(/\*\*/g, '').replace(/<br\s*\/?>/gi, ' ');
  const cjk = (s.match(/[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF\u4E00-\u9FFF]/g) || []).length;
  return Math.max(1, Math.ceil((cjk * sizePx * 0.92 + (s.length - cjk) * sizePx * 0.52) / Math.max(widthPx, 1)));
}
/** 줄 간격은 내용량에 맞춘다: 항목이 적고 짧으면 넓게, 많거나 길면 좁게 — 카드 높이를 자연스럽게 채우되 넘치지 않게. */
function listGap(items) {
  const n = (items || []).length;
  const chars = (items || []).reduce((a, it) => { const { k, v } = normItem(it); return a + (k + v).replace(/\*\*/g, '').length; }, 0);
  return Math.max(0.4, Math.min(0.9, 2.0 - n * 0.26 - chars / 240)).toFixed(2);
}
function listItems(items, opts = {}) {
  const li = (items || []).map(it => {
    const { k, v } = normItem(it);
    if (!k) return `<li>${rich(v)}</li>`;
    return `<li><span class="k">${rich(k)}</span>${v ? `<span class="v">${rich(v)}</span>` : ''}</li>`;
  }).join('');
  return `<ul class="rl${opts.row ? ' row' : ''}" style="--rl-gap:${listGap(items)}em">${li}</ul>`;
}
/** 카드 = 둥근 네모 한 덩어리: 위 컬러 띠(제목) + 아래 흰 본문. 닫을 때는 CARD_CLOSE. */
const CARD_CLOSE = '</div></div>';
function cardOpen(cls = '', title = '') {
  return `<div class="card ${cls}">${title ? `<div class="cap">${rich(title)}</div>` : ''}<div class="bd">`;
}
/** optional sub-sections inside a card: [{heading, items}] → "| 제목" + list */
function subSections(secs) {
  return (secs || []).map(x => `<div class="sec2">${x.heading ? `<div class="sh2">${rich(x.heading)}</div>` : ''}${x.items ? listItems(x.items) : ''}${x.text ? `<div class="cd">${rich(x.text)}</div>` : ''}</div>`).join('');
}
function kvTable(rows) {
  return `<div class="tbl"><table class="rt"><tbody>${(rows || []).map(r => `<tr>${r.map((c, i) => `<td${i ? '' : ' style="width:38%"'}>${rich(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function statFrag(st) {
  const m = String(st.value ?? '').match(/^([\d.,~\-–]+)\s*(.*)$/);
  const val = m && m[2] && m[2].length <= 4 ? `${esc(m[1])}<small>${esc(m[2])}</small>` : rich(st.value);
  return `${st.sub ? `<div class="sl">${rich(st.sub)}</div>` : ''}<div class="sv">${val}</div>${st.desc ? `<div class="sn">${rich(st.desc)}</div>` : ''}`;
}
function chartPanel(b) {
  return `<div class="chart"><div class="chh"><b>${rich(b.title || '')}</b><span>${b.unit ? `단위 : ${esc(b.unit)}` : ''}</span></div>${chartSvg(b)}${(b.series || []).length > 1 ? `<div class="lg">${(b.series || []).map((sr, i) => `<span><i style="background:${SERIES_COLORS()[i]}"></i>${esc(sr.name || '')}</span>`).join('')}</div>` : ''}</div>`;
}
const SERIES_COLORS = () => [P.primary2, P.primary, P.teal, P.gold];
function chartSvg(b) {
  const labels = b.labels || [], series = (b.series || []).slice(0, 4), cols = SERIES_COLORS();
  const all = series.flatMap(sr => sr.values || []).filter(v => typeof v === 'number');
  const max = Math.max(1, ...all) * 1.25, min = Math.min(0, ...all);
  const W = 340, H = 118, padL = 16, padR = 16, padT = 20, padB = 24;
  const n = Math.max(labels.length, ...series.map(sr => (sr.values || []).length));
  const x = i => padL + (n <= 1 ? (W - padL - padR) / 2 : (W - padL - padR) * i / (n - 1));
  const y = v => padT + (H - padT - padB) * (1 - (v - min) / (max - min));
  let out = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" font-family="inherit">`;
  out += `<line x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" stroke="#C9CFD8" stroke-width="1"/>`;
  labels.forEach((l, i) => { out += `<text x="${x(i)}" y="${H - padB + 16}" text-anchor="middle" font-size="10" fill="${P.textMid}">${esc(l)}</text>`; if (i) out += `<line x1="${(x(i) + x(i - 1)) / 2}" y1="${H - padB}" x2="${(x(i) + x(i - 1)) / 2}" y2="${H - padB + 4}" stroke="#C9CFD8"/>`; });
  if (b.kind === 'bar') {
    const gw = (W - padL - padR) / Math.max(n, 1), bw = Math.min(28, gw * 0.6 / series.length);
    series.forEach((sr, si) => (sr.values || []).forEach((v, i) => {
      const bx = padL + gw * i + gw / 2 - (bw * series.length) / 2 + bw * si;
      out += `<rect x="${bx}" y="${y(v)}" width="${bw - 2}" height="${Math.max(0, H - padB - y(v))}" rx="2" fill="${cols[si]}" opacity="${si ? .75 : 1}"/>`;
      out += `<text x="${bx + (bw - 2) / 2}" y="${y(v) - 5}" text-anchor="middle" font-size="10" font-weight="700" fill="${P.text}">${esc(String(v))}</text>`;
    }));
  } else {
    series.forEach((sr, si) => {
      const pts = (sr.values || []).map((v, i) => `${x(i)},${y(v)}`).join(' ');
      out += `<polyline points="${pts}" fill="none" stroke="${cols[si]}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      (sr.values || []).forEach((v, i) => {
        out += `<circle cx="${x(i)}" cy="${y(v)}" r="3.2" fill="#fff" stroke="${cols[si]}" stroke-width="2"/>`;
        out += `<text x="${x(i)}" y="${y(v) - 8}" text-anchor="middle" font-size="11" font-weight="700" fill="${P.text}">${esc(String(v))}</text>`;
      });
    });
  }
  return out + '</svg>';
}
/** 파일이 실제로 있을 때만 이미지를 넣는다 — 없는 경로는 깨진 이미지 아이콘 대신 점선 자리표시자로. */
function imgOrPh(src, alt) {
  const ok = src && (/^(https?:)?\/\//.test(src) || fs.existsSync(path.resolve(outdir, src)));
  if (src && !ok) console.warn(`  (이미지 파일이 없어 자리표시자로 그림: ${src})`);
  const label = String(alt || '이미지 자리').trim();
  if (!ok) return `<div class="ph">${/^\[.*\]$/.test(label) ? esc(label) : `[ ${esc(label)} ]`}</div>`;
  return `<img src="${esc(src)}" alt="${esc(alt || '')}">`;
}
function badgeCell(txt) {
  const t = String(txt).replace(/\*\*/g, '');
  if (/^(달성|완료|충족)$/.test(t)) return `<span class="badge ok">${esc(t)}</span>`;
  if (/^(조기달성|초과달성|초과)$/.test(t)) return `<span class="badge up">${esc(t)}</span>`;
  if (/^(진행중|진행 중|예정|계획)$/.test(t)) return `<span class="badge prog">${esc(t)}</span>`;
  if (/^(미달|보류|중단)$/.test(t)) return `<span class="badge n">${esc(t)}</span>`;
  return rich(txt);
}

// ─── block renderers ────────────────────────────────────────────
const BLOCKS = {
  columns(b) {
    const cols = b.columns || [];
    return `<div class="grid" style="grid-template-columns:${cols.map(c => `${c.flex || 1}fr`).join(' ')}">${cols.map((c, i) => `
      ${cardOpen(c.tint || (b.tintLast && i === cols.length - 1) ? 'tint' : '', c.heading)}
        <div class="fill">${c.stat ? statFrag(c.stat) : ''}${c.rows ? `<div class="kv">${kvTable(c.rows)}${c.highlight ? `<div class="hbox"><div class="hl">${rich(c.highlight.label || '')}</div><div class="hv">${rich(c.highlight.value || '')}</div></div>` : ''}</div>` : ''}${c.sections ? subSections(c.sections) : ''}${c.items ? listItems(c.items, { row: b.rowItems }) : ''}${c.text ? `<div class="cd">${rich(c.text)}</div>` : ''}${c.chart ? chartPanel(c.chart) : ''}
        ${c.image !== undefined ? `<div class="imgblk" style="flex:1"><div class="pic" style="border:0;padding:0;box-shadow:none"><div class="fr">${imgOrPh(c.image, c.caption)}</div>${c.caption && c.image ? `<div class="cp">${esc(c.caption)}</div>` : ''}</div></div>` : ''}</div>
      ${CARD_CLOSE}`).join('')}</div>`;
  },
  cards(b) {
    const n = (b.cards || []).length; const cols = b.cols || (n <= 4 ? n : Math.ceil(n / 2));
    return `<div class="grid" style="grid-template-columns:repeat(${cols},1fr)">${(b.cards || []).map(c => `
      ${cardOpen(c.primary ? 'tint' : c.dark ? 'dark' : '', c.num !== undefined ? `${esc(c.num)}. ${c.title || ''}` : c.title)}
        <div class="fill">${c.tag ? `<div class="sh2">${esc(c.tag)}</div>` : ''}${c.stat ? statFrag(c.stat) : ''}${c.rows ? `<div class="kv">${kvTable(c.rows)}${c.highlight ? `<div class="hbox"><div class="hl">${rich(c.highlight.label || '')}</div><div class="hv">${rich(c.highlight.value || '')}</div></div>` : ''}</div>` : ''}${c.sections ? subSections(c.sections) : ''}${c.desc ? `<div class="cd">${rich(c.desc)}</div>` : ''}${c.items ? listItems(c.items) : ''}${c.chart ? chartPanel(c.chart) : ''}</div>
      ${CARD_CLOSE}`).join('')}</div>`;
  },
  stats(b) {
    const st = b.stats || [];
    return `<div class="grid" style="grid-template-columns:repeat(${st.length},1fr)">${st.map(s => {
      const m = String(s.value).match(/^([\d.,~\-–]+)\s*(.*)$/);
      const val = m && m[2] && m[2].length <= 4 ? `${esc(m[1])}<small>${esc(m[2])}</small>` : rich(s.value);
      return `<div class="stat">${s.label ? `<div class="cap">${rich(s.label)}</div>` : ''}<div class="bd">${s.sub ? `<div class="sl">${rich(s.sub)}</div>` : ''}<div class="sv">${val}</div>${s.desc ? `<div class="sn">${rich(s.desc)}</div>` : ''}</div></div>`;
    }).join('')}</div>`;
  },
  process(b) {
    const steps = b.steps || []; const n = steps.length;
    return `<div class="rm"><div class="line"></div>
      <div class="nums" style="grid-template-columns:repeat(${n},1fr)">${steps.map((s, i) => `<div class="num${i === n - 1 ? ' last' : ''}">${i + 1}</div>`).join('')}</div>
      <div class="steps" style="grid-template-columns:repeat(${n},1fr)">${steps.map((s, i) => `
        <div class="step${s.highlight ? ' hl' : ''}${s.dark || (b.darkLast && i === n - 1) ? ' dk' : ''}"><div class="per">${esc(s.period || `STEP ${i + 1}`)}</div><div class="pt">${rich(s.title || '')}</div>
        <div class="pd">${s.desc ? `<div>${rich(s.desc)}</div>` : ''}${s.items ? listItems(s.items) : ''}</div></div>`).join('')}</div></div>`;
  },
  timeline(b) {
    return BLOCKS.process({ steps: (b.phases || []).map(p => ({ period: p.period, title: p.title, items: p.items, desc: p.desc, highlight: p.highlight, dark: p.dark })), darkLast: b.darkLast });
  },
  table(b) {
    const em = b.emphasize; const widths = b.widths || [];
    const leftCols = new Set(b.leftAlign || [0]);
    return `<div class="tbl" style="flex:1;min-height:0;overflow:hidden"><table class="rt">
      ${widths.length ? `<colgroup>${widths.map(w => `<col style="width:${w}">`).join('')}</colgroup>` : ''}
      <thead><tr>${(b.headers || []).map((h, i) => `<th class="${i === em ? 'em' : ''}">${rich(h)}</th>`).join('')}</tr></thead>
      <tbody>${(b.rows || []).map(r => `<tr>${r.map((c, i) => `<td class="${i === em ? 'em' : ''}${leftCols.has(i) ? ' l' : ''}">${i === em ? rich(c) : badgeCell(c)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
  },
  compare(b) {
    const side = (s, cls, tag) => `<div class="side ${cls}"><div class="cap">${esc(s.tag || tag)}</div><div class="bd">${s.heading ? `<div class="sh">${rich(s.heading)}</div>` : ''}<div class="fill">${s.sections ? subSections(s.sections) : ''}${listItems(s.items)}</div></div></div>`;
    return `<div class="cmp">${side(b.left || {}, 'from', 'AS-IS')}<div class="arr">›</div>${side(b.right || {}, 'to', 'TO-BE')}</div>`;
  },
  image(b) {
    const pic = `<div class="pic">${b.heading ? `<div class="sh2">${rich(b.heading)}</div>` : ''}<div class="fr">${imgOrPh(b.src, b.caption || b.alt)}</div>${b.caption && b.src ? `<div class="cp">${esc(b.caption)}</div>` : ''}</div>`;
    if (b.side === 'full' || !b.text) return `<div class="imgblk">${pic}</div>`;
    const txt = `<div class="txt">${cardOpen('tint', b.text.heading)}<div class="fill">${listItems(b.text.items)}</div>${CARD_CLOSE}</div>`;
    return `<div class="imgblk">${b.side === 'left' ? pic + txt : txt + pic}</div>`;
  },
  bullets(b) {
    return `${cardOpen('', b.heading)}<div class="fill">${listItems(b.items)}</div>${CARD_CLOSE}`;
  },
  chart(b) {
    return `${cardOpen('', b.heading || '')}${chartPanel(b)}${CARD_CLOSE}`;
  },
  callout(b) {
    const body = b.items && b.items.length ? listItems(b.items) : rich(b.text || '');
    const label = b.label || '핵심 요약';
    return `<div class="banner${b.tone === 'light' ? ' light' : ''}"><div class="lead">${esc(label)}</div><div class="msg">${body}</div></div>`;
  },
};

function renderBlocks(blocks) {
  return (blocks || []).map(b => {
    const fn = BLOCKS[b.type];
    const flex = b.type === 'callout' ? '0 0 auto' : `${b.flex ?? 1} 1 0`;
    const label = b.label && b.type !== 'callout' ? `<div class="pl slabel">${rich(b.label)}</div>` : '';
    const body = fn ? fn(b) : `<div class="ph">[ 알 수 없는 블록: ${esc(b.type)} ]</div>`;
    return `<div class="blk" style="flex:${flex}">${label}<div class="inner">${body}</div></div>`;
  }).join('');
}

// ─── chrome ─────────────────────────────────────────────────────
const logoDark = () => meta.logo.dark ? `<img class="logo" src="${esc(meta.logo.dark)}" alt="">` : '';
const plainTitle = String(meta.title || '').replace(/<br\s*\/?>/gi, ' ').replace(/\*\*/g, '');
const TOTAL = slides.length;   // 간지 하단의 'N/Mp' 표기용
const footerText = (s) => meta.footer || (s.kind === 'appendix' ? 'Appendix' : s.section ? `${NUM(s.section.no)}. ${s.section.title}` : plainTitle);
function foot(s) {
  return `<div class="foot"><span class="pn">${esc(footerText(s))}</span><span class="pg">${meta.pageNumbers && s.pageNo ? s.pageNo : ''}</span></div>`;
}
function top(eyebrowHtml, headline, lead, pageNo) {
  return `<div class="top"><div class="eyebrow"><span>${eyebrowHtml}</span><span class="pgno">${pageNo || ''}</span></div>${headline ? `<div class="stitle">${rich(headline)}</div>` : ''}<div class="rule"></div>${lead ? `<div class="slead">${rich(lead)}</div>` : ''}</div>`;
}

// ─── slide renderers ────────────────────────────────────────────
function renderCover() {
  // 표지: 설명줄(body2) → 제목(h0) → 왼쪽 아래 로고 → 오른쪽 아래 상자. 원본 PPTX 배치 그대로.
  const badge = meta.event || meta.docType || '';
  return `<section class="slide" data-label="표지">
    <div class="cover cv">
      <div class="cbg" data-deco></div><div class="scrim" data-deco></div>
      ${meta.subtitle ? `<div class="clead">${rich(meta.subtitle)}</div>` : ''}
      <div class="ctitle">${rich(meta.title)}</div>
      ${meta.logo.dark ? `<img class="clogo" src="${esc(meta.logo.dark)}" alt="">` : ''}
      ${badge ? `<div class="cbadge">${esc(badge)}</div>` : ''}
    </div>
  </section>`;
}
function renderAgenda() {
  // 목차: 왼쪽 위 '목차'(h1), 오른쪽에 번호 + 섹션명(h2) 2열. 쪽수·설명은 적지 않는다.
  // 열은 grid 로 잡아 섹션명이 길어 두 줄이 되어도 두 열의 줄이 같이 내려간다.
  const list = outline.sections.map(x => ({ n: NUM(x.no), t: x.title, apx: false }));
  if (outline.appendix.length) list.push({ n: '+', t: '부록', apx: true });
  const nrow = Math.ceil(list.length / 2);
  const items = list.map(it =>
    `<div class="it${it.apx ? ' apx' : ''}"><span class="n">${esc(it.n)}</span><span class="t">${esc(tieTail(it.t))}</span></div>`);
  return `<section class="slide" data-label="목차">
    <div class="tocp">
      <div class="lb">목차</div>
      <div class="items" style="grid-template-rows:repeat(${nrow},minmax(${AGENDA_BOX.itemH}px,auto))">${items.join('')}</div>
      <div class="ft">${esc(plainTitle)}</div>
      ${meta.pageNumbers ? `<div class="pn">2</div>` : ''}
    </div>
  </section>`;
}
function renderDivider(s) {
  const sec = s.section;
  const eyebrow = sec.en || `CHAPTER ${String(sec.no).padStart(2, '0')}`;
  return `<section class="slide" data-label="${esc(slideLabel(s))}">
    <div class="dv">
      ${DIVIDER_BG ? '<div class="dbg" data-deco></div><div class="dsc" data-deco></div>'
                   : meta.logo.dark ? `<img class="wm" src="${esc(meta.logo.dark)}" alt="">` : ''}
      <div class="in">
        <div class="eb">${esc(eyebrow)}</div>
        <h1>${esc(sec.title)}</h1>
        ${sec.subtitle ? `<div class="s">${esc(sec.subtitle)}</div>` : ''}
        <div class="ft"><span>${esc(plainTitle)}</span><span>${s.order}/${TOTAL}p</span></div>
      </div>
    </div>
  </section>`;
}
function renderContent(s) {
  const sl = s.slide;
  // 아이브로우 = 이 장표가 속한 목차(섹션) 이름 하나만. 다른 것은 붙이지 않는다.
  const eyebrow = s.kind === 'appendix' ? 'APPENDIX' : esc(s.section.title);
  const headline = sl.headline || sl.title || '';
  const leadLines = sl.lead ? estLines(sl.lead, 16, 1100) : 0;
  const bodyTop = headline ? (sl.lead ? 262 + Math.max(0, leadLines - 1) * 24 : 190) : 96;
  return `<section class="slide" data-label="${esc(slideLabel(s))}" id="s${s.order}" data-fit="1"${fitStyle(s.order)}>
    ${top(eyebrow, headline, sl.lead, meta.pageNumbers && s.pageNo ? String(parseInt(s.pageNo, 10)) : '')}
    <div class="body" style="--body-top:${bodyTop}px">${renderBlocks(sl.blocks)}</div>
  </section>`;
}
function renderClosing() {
  const c = outline.closing, ct = meta.contact || {};
  const cols = (meta.orgs && meta.orgs.length ? meta.orgs : [meta.company && { role: '작성', name: meta.company }].filter(Boolean)).map(o => `<div class="ci"><div class="r">${esc(o.role || '')}</div><div class="v">${esc(o.name || '')}</div></div>`);
  if (ct.email) cols.push(`<div class="ci"><div class="r">CONTACT</div><div class="v">${esc(ct.email)}${ct.phone ? ` · ${esc(ct.phone)}` : ''}</div></div>`);
  if (ct.web) cols.push(`<div class="ci"><div class="r">WEB</div><div class="v">${esc(ct.web)}</div></div>`);
  return `<section class="slide closing" data-label="마무리">
    <div class="cover"><div class="cbg" data-deco></div>${logoDark()}
      <div class="cin"><div>
        ${meta.event ? `<div class="prog" style="justify-content:center;margin-bottom:26px">${meta.pill ? `<span class="pill">${esc(meta.pill)}</span>` : ''}${esc(meta.event)}</div>` : ''}
        <div class="big">${rich(c.message)}</div>
        <div class="ty">${rich(c.sub || 'Thank You')}</div>
        ${cols.length ? `<div class="cs">${cols.join('')}</div>` : ''}
      </div></div></div>
  </section>`;
}

const sectionsHtml = slides.map(s => {
  if (s.kind === 'cover') return renderCover();
  if (s.kind === 'agenda') return renderAgenda();
  if (s.kind === 'divider') return renderDivider(s);
  if (s.kind === 'closing') return renderClosing();
  return renderContent(s);
}).join('\n');

const html = `<!DOCTYPE html>
<!-- generated by ppt-maker skill · outline: ${path.basename(outline._file)} · type ${meta.type} · density ${meta.density} · style minimal -->
<html lang="ko" data-density="${meta.density}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(plainTitle)}</title>
<style>${css()}</style></head>
<body>
<deck-stage width="1280" height="720" style="--deck-rail-w:200px;">
${sectionsHtml}
</deck-stage>
<script src="deck-stage.js"></script>
<script src="deck-editor.js"></script>
<script>
document.addEventListener('keydown',e=>{if(e.key==='f'||e.key==='F'){document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen();}});
</script>
</body></html>`;

fs.mkdirSync(path.join(outdir, 'assets'), { recursive: true });
for (const f of ['deck-stage.js', 'deck-editor.js']) fs.copyFileSync(path.join(SKILL_ASSETS, f), path.join(outdir, f));
for (const rel of [meta.logo.light, meta.logo.dark]) {       // 쓰는 로고만 옮긴다
  if (!rel) continue;
  const src = path.join(SKILL_ASSETS, path.basename(rel)), dst = path.join(outdir, rel);
  if (!fs.existsSync(dst) && fs.existsSync(src)) { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); }
}
// 고른 표지 배경 이미지 한 장만 복사한다(3장 다 복사하면 결과 폴더가 무거워진다).
// 작업 폴더에 같은 이름으로 이미 있으면 그쪽을 쓴다 — 사용자가 바꿔 넣은 그림을 덮지 않는다.
for (const rel of [coverBgFile(meta.coverBg), DIVIDER_BG]) {
  if (!rel) continue;
  const dst = path.join(outdir, rel);
  if (!fs.existsSync(dst)) {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(path.join(SKILL_ASSETS, rel.replace(/^assets\//, '')), dst);
  }
}
const outFile = path.join(outdir, 'deck.html');
fs.writeFileSync(outFile, html);
console.log(`deck.html written → ${outFile}`);
console.log(`slides: ${slides.length}  (type ${meta.type}, ${meta.density}, primary ${P.primary}, style minimal)`);
slides.forEach(s => console.log(`  ${String(s.order).padStart(2, '0')}  ${s.pageNo ? '#' + s.pageNo : '   '}  ${slideLabel(s)}`));
