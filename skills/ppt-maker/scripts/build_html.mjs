#!/usr/bin/env node
// Copyright (c) 2026 SafeAI. All rights reserved.
// See COPYRIGHT.md — 복제·수정·재배포는 허락 없이 할 수 없습니다.
// usage: node build_html.mjs <outline.json> [outdir]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadOutline, flattenSlides, derivePalette, DENSITY, esc, rich, normItem, slideLabel, tableColWidths, FONTS, COLORS, numColumns,
         TYPE, typeCss, px, FALLBACK_FACES, COVER_BOX, AGENDA_BOX, coverBgFile, closingBgCss, coverScrim,
         dividerBgFile, DIVIDER_SCRIM, SLIDE_FOOT, footLines, footSafeBottom,
         tieTail, SHAPE, HEAD, FRAME, PAPERLOGY_FONT_FACE } from './lib/common.mjs';

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
  const K = 1.3;   // 본문 배율 최대값(dense·airy 같음). 내용이 적어도 글자가 지나치게 커지지 않게
  const C = COVER_BOX, A = AGENDA_BOX;
  return `
${PAPERLOGY_FONT_FACE}
deck-stage:not(:defined){visibility:hidden;}
:root{
  --primary:${P.primary};--primary-2:${P.primary2};--primary-deep:${P.primaryDeep};
  --primary-soft:${P.softBlue};--pill-glow:${P.pillGlow};--primary-softer:${P.softerBlue};
  --accent:${P.teal};--gold:${P.gold};--gold-light:${P.goldLight};
  --success:${P.success};--warning:${P.warning};--danger:${P.danger};
  --bg-soft:${P.bgSoft};--border:${P.border};--border-strong:${P.borderStrong};
  --text:${P.text};--title:${COLORS.gray.title};--body:${P.body};--banner:${P.banner};--banner-border:${P.bannerBorder};--banner-warn:${P.bannerWarn};--banner-warn-label:${P.bannerWarnLabel};--banner-warn-text:${P.bannerWarnText};--banner-strong:${P.bannerStrong};--banner-strong-text:${P.bannerStrongText};--banner-label:${P.bannerLabel};--banner-text:${P.bannerText};--text-mid:${P.textMid};--text-light:${P.textLight};
  --pad:${FRAME.pad}px;--hdr:0px;--foot:0px;--safe-bottom:${FRAME.safeBottom}px;--page:${COLORS.gray.page};--card-shadow:${SHAPE.shadowCss};
  --font:'${meta.font}','Pretendard','Malgun Gothic','맑은 고딕','Apple SD Gothic Neo','Noto Sans KR',sans-serif;
  --font-title:'${FONTS.face.headline}',${FALLBACK_FACES};
  --font-title-b:'${FONTS.face.headlineBold}',${FALLBACK_FACES};
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
.slide{width:1280px;height:720px;overflow:hidden;background:var(--page);position:relative;font-size:var(--fs-body);line-height:1.5;letter-spacing:-.8pt;word-break:keep-all;font-family:var(--font);color:var(--text);}   /* deck-stage 가 슬롯에 흰 글자·시스템 글꼴을 깔아서, 색·글꼴을 명시하지 않은 글자가 사라지지 않게 */
/* top: eyebrow + page no · headline · rule · meta line (minimal, no header strip) */
.top{position:absolute;top:30px;left:var(--pad);right:var(--pad);z-index:4;}
.eyebrow{font-size:${HEAD.eyebrow}px;color:var(--primary-deep);font-weight:500;display:flex;justify-content:space-between;align-items:baseline;}
.eyebrow b{color:var(--primary);font-weight:700;}
.eyebrow .pgno{position:absolute;top:-8px;right:0;font-size:${HEAD.pgno}px;color:var(--text-light);font-weight:500;font-variant-numeric:tabular-nums;}   /* 몇 번째 장인지 — 오른쪽 위 모서리에 따로 띄운다 */
.stitle{font-family:var(--font-title);font-size:${HEAD.stitle}px;font-weight:400;color:var(--title);line-height:1.2;margin-top:9px;word-break:keep-all;overflow-wrap:break-word;max-width:1100px;}
.stitle b{font-family:var(--font-title-b);font-weight:400;color:var(--title);}
.rule{display:none;}   /* 2026-10-09 헤드라인·리드 사이 구분선 없앰 */
.slead{font-size:${HEAD.lead}px;color:var(--text-mid);line-height:1.5;margin-top:12px;max-width:1100px;}   /* 헤드라인 바로 아래 */
.slead b{color:var(--text);font-weight:700;}
/* body */
.body{position:absolute;left:var(--pad);right:var(--pad);top:var(--body-top,238px);bottom:var(--safe-bottom);display:flex;flex-direction:column;gap:var(--gap);z-index:3;}
.blk{min-height:0;display:flex;flex-direction:column;}
.blk>.inner{flex:1;min-height:0;display:flex;flex-direction:column;}
/* block label above a block (작은 라벨) */
.slabel{display:inline-flex;align-items:center;height:2.1em;padding:0 1.05em;background:var(--primary);color:#fff;font-size:var(--fs-card);font-weight:700;border-radius:${SHAPE.label}px;white-space:nowrap;line-height:1;margin-bottom:.8em;align-self:flex-start;}
/* card: 제목 피약 + 흰 본문 — 투명 래퍼 + 독립 피약 + 독립 흰 박스 */
.card{position:relative;background:transparent;border:0;border-radius:0;box-shadow:none;display:flex;flex-direction:column;min-height:0;overflow:visible;gap:.3em;font-size:var(--fs-body);}
.card>.cap{background:linear-gradient(225deg,var(--pill-glow) 0%,var(--primary) 70%);color:#fff;font-size:var(--fs-card);font-weight:700;line-height:1.3;text-align:center;padding:.325em 1em;letter-spacing:-.01em;border-radius:${SHAPE.pill}px;flex:0 0 auto;white-space:nowrap;}
.card.plain>.bd{background:transparent;box-shadow:none;padding:0;} .card>.bd{background:#fff;border-radius:${SHAPE.card}px;box-shadow:var(--card-shadow);padding:.95em 1.4em 1em;display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden;}
/* 강조 카드도 본문 박스는 흰색이다. 한 장표 안에서 카드 바탕이 서로 달라 보이면
   어느 쪽이 중요한지가 아니라 "왜 색이 다르지" 로 읽힌다. 강조는 알약 제목으로만 한다. */
.card.tint>.bd{background:#fff;}
.card.dark>.bd{background:var(--primary);color:#fff;}
.card .ct{font-size:var(--fs-card);font-weight:700;color:var(--text);margin-bottom:.5em;line-height:1.3;}
.card.dark .ct{color:#fff;}
.card .cd{font-size:var(--fs-small);color:var(--body);line-height:1.55;}
.card.dark .cd{color:rgba(255,255,255,.85);}
.card .fill{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:flex-start;gap:12px;}   /* 위에서부터 채움, 덩어리 사이 12px */
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
.stat>.cap{background:linear-gradient(225deg,var(--pill-glow) 0%,var(--primary) 70%);color:#fff;font-size:var(--fs-card);font-weight:700;text-align:center;padding:.325em 1em;line-height:1.3;border-radius:${SHAPE.pill}px;flex:0 0 auto;white-space:nowrap;}
.stat>.bd{background:#fff;border-radius:${SHAPE.card}px;box-shadow:var(--card-shadow);padding:.95em 1.4em 1em;display:flex;flex-direction:column;justify-content:flex-start;flex:1;min-height:0;overflow:hidden;}
.stat .sl{font-size:var(--fs-small);color:var(--body);font-weight:500;}
.stat .sv{font-size:var(--fs-stat);font-weight:800;color:var(--text);line-height:1.05;margin-top:.1em;letter-spacing:-.04em;font-variant-numeric:tabular-nums;}
.stat .sv small{font-size:.5em;color:var(--text);margin-left:.05em;font-weight:700;}
.stat .sn{font-size:var(--fs-small);color:var(--primary-2);font-weight:700;margin-top:.5em;line-height:1.4;}
/* kv table (minimal): label column grey, values, bold last row; emphasize col tinted */
/* 표 — SAFE AI 디자인 시스템 Data Table: 위·아래 3px 회색(--text-mid) 선으로 시작·끝, 안쪽은 1px 연회색 선(세로선 없음).
   머리글(타이틀 영역)은 연회색 바탕·회색 글자. rowHeader 면 첫 열도 타이틀 영역(연회색 바탕·회색 글자 + 오른쪽 1px 선). 강조 열은 글자색만 포인트 컬러 */
table.rt{width:100%;border-collapse:collapse;font-size:calc(var(--fs-table) * var(--kt, 1));background:#fff;table-layout:fixed;text-align:left;border-top:3px solid var(--text-mid);border-bottom:3px solid var(--text-mid);}
.rt thead th{background:var(--bg-soft);color:var(--text-mid);font-weight:700;text-align:left;padding:.55em .8em;border:0;border-bottom:1px solid var(--border);font-size:calc(var(--fs-tableh) * var(--kt, 1));line-height:1.3;word-break:keep-all;overflow-wrap:anywhere;vertical-align:middle;}   /* 머리글도 칸이 좁으면 줄바꿈 */
.rt thead th.em{color:var(--primary);}
.rt tbody td{padding:.6em .8em;border:0;word-break:keep-all;overflow-wrap:anywhere;border-bottom:1px solid var(--border);vertical-align:middle;color:var(--text);background:transparent;text-align:left;line-height:1.45;}
.rt tbody td{font-weight:400;}   /* 본문 = regular·검정, 타이틀 영역 = bold·연회색 */
.rt.rh thead th:first-child{border-right:1px solid var(--border);}
.rt.rh tbody td:first-child{background:var(--bg-soft);color:var(--text-mid);font-weight:700;border-right:1px solid var(--border);}
.rt tbody td.em{color:var(--primary);}   /* 강조 열은 글자색만 — 바탕·굵기는 그대로 */
.rt tbody td.l{text-align:left;}
.rt tbody tr:last-child td{border-bottom:0;}
.rt tbody tr.tot td{background:var(--bg-soft);font-weight:600;}   /* 합계·평균 행 */
.rt th.n,.rt td.n{text-align:right;font-variant-numeric:tabular-nums;}   /* 숫자 칸은 오른쪽 정렬 */
/* 카드 안 작은 표(라벨·값 두 칸): shadcn 카드의 값 목록처럼 — 라벨 회색, 값 오른쪽·중간 굵기, 띠 없음 */
.rt.kvt{border-top:0;border-bottom:0;}
.rt.kvt td{padding:.55em .3em;}
.rt.kvt td:first-child{color:var(--text-mid);font-weight:500;}
.rt.kvt td:last-child{text-align:right;font-weight:600;color:var(--text);font-variant-numeric:tabular-nums;}
.badge{display:inline-flex;align-items:center;gap:.35em;height:1.9em;padding:0 .8em;border-radius:1em;font-size:.8em;font-weight:600;white-space:nowrap;}
.badge::before{content:'';width:.4em;height:.4em;border-radius:50%;background:currentColor;}
.badge.ok{background:var(--primary-softer);color:var(--primary);} .badge.up{background:#DDEEFF;color:var(--primary-2);} .badge.wip{background:#FFF6E1;color:var(--warning);}   /* .prog 는 표지 진행 줄이 쓰는 이름이라 겹치지 않게 wip */ .badge.n{background:var(--bg-soft);color:var(--text-mid);}
/* highlight box (used by kv/stat pairs) */
.hbox{background:var(--primary-softer);border-radius:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:.8em 1em;text-align:center;}
.hbox .hl{font-size:var(--fs-small);color:var(--text);} .hbox .hv{font-size:calc(var(--fs-stat) * .62);font-weight:800;color:var(--text);letter-spacing:-.03em;line-height:1.1;}
/* banner (callout): 연하늘 바탕 + 연하늘 테두리 둥근 박스 — 왼쪽에 라벨(포인트 컬러), 오른쪽에 본문. 모두 박스 안에 들어간다 */
/* 출처·각주: 본문 아래 비워 둔 자리에 깐다. 줄이 늘면 본문이 그만큼 위로 올라간다. */
.foot{position:absolute;left:var(--pad);right:var(--pad);bottom:${SLIDE_FOOT.bottom}px;z-index:3;
  font-size:${px(SLIDE_FOOT.size)}px;line-height:${px(SLIDE_FOOT.line)}px;letter-spacing:${SLIDE_FOOT.spc}pt;color:var(--text-light);}
.foot>div{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.banner{background:var(--banner);border:1.5px solid var(--banner-border);color:var(--text);padding:.75em 1.6em;border-radius:${SHAPE.banner}px;display:flex;align-items:baseline;gap:1.6em;flex-shrink:0;font-size:var(--fs-small);}
.banner .lead{color:var(--banner-label);font-size:calc(var(--fs-small) * 1.05);font-weight:700;white-space:nowrap;line-height:1.3;flex:0 0 auto;text-align:center;}
.banner .msg{font-size:var(--fs-small);font-weight:500;line-height:1.3;flex:1;min-width:0;}
.banner .msg ul.rl li{color:var(--banner-text);font-size:var(--fs-small);} .banner .msg ul.rl li::before{color:var(--banner-text);} .banner .msg b{color:var(--primary);font-weight:800;} .banner .msg ul.rl li .v{color:var(--text-mid);}
.banner.light{background:#fff;border-color:transparent;color:var(--text);box-shadow:var(--card-shadow);} .banner.light .lead{color:var(--primary);} .banner.light .msg ul.rl li{color:var(--body);} .banner.light .msg ul.rl li::before{color:var(--body);} .banner.light .msg b{color:var(--primary);}
/* 배너 위계: 기본(연한 메인 컬러) · 주의(warn, 빨강) · 강조(strong, 검정). 글자색은 바탕과 대비가 나게 */
.banner.warn{background:var(--banner-warn);border-color:var(--banner-warn);color:var(--banner-warn-text);} .banner.warn .lead{color:var(--banner-warn-label);} .banner.warn .msg,.banner.warn .msg ul.rl li{color:var(--banner-warn-text);} .banner.warn .msg ul.rl li::before{color:var(--banner-warn-text);} .banner.warn .msg b{color:var(--banner-warn-label);} .banner.warn .msg ul.rl li .v{color:var(--banner-warn-text);}
.banner.strong{background:var(--banner-strong);border-color:var(--banner-strong);color:#fff;} .banner.strong .lead{color:#fff;} .banner.strong .msg,.banner.strong .msg ul.rl li{color:var(--banner-strong-text);} .banner.strong .msg ul.rl li::before{color:var(--banner-strong-text);} .banner.strong .msg b{color:#fff;} .banner.strong .msg ul.rl li .v{color:var(--banner-strong-text);}
/* compare: two labeled cards */
.cmp{display:grid;grid-template-columns:1fr 3em 1fr;align-items:stretch;flex:1;min-height:0;font-size:var(--fs-body);}
.side{position:relative;background:transparent;border-radius:0;box-shadow:none;display:flex;flex-direction:column;min-height:0;overflow:visible;gap:.3em;}
.side>.cap{background:var(--text-mid);color:#fff;font-size:var(--fs-card);font-weight:700;text-align:center;padding:.325em 1em;line-height:1.3;border-radius:${SHAPE.pill}px;flex:0 0 auto;white-space:nowrap;}
.side.to>.cap{background:linear-gradient(225deg,var(--pill-glow) 0%,var(--primary) 70%);}
.side>.bd{background:#fff;border-radius:${SHAPE.card}px;box-shadow:var(--card-shadow);padding:.95em 1.4em 1em;display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden;}
.side.to>.bd{background:var(--primary-softer);}
.side .sh{font-size:var(--fs-card);font-weight:700;margin:.1em 0 .6em;color:var(--text);}
.side .fill{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:flex-start;gap:12px;}
.cmp .arr{display:flex;align-items:center;justify-content:center;} .cmp .arr i{width:1.9em;height:1.9em;border-radius:50%;background:var(--title);color:#fff;display:flex;align-items:center;justify-content:center;font-style:normal;font-size:1em;padding-left:.15em;}   /* 전/후 화살표 = 검정 원 안 흰 삼각형 */
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
.rm .step .pd{font-size:var(--fs-small);color:var(--text-mid);line-height:1.45;flex:1;display:flex;flex-direction:column;justify-content:flex-start;gap:.3em;} .rm .step.dk .pd{color:rgba(255,255,255,.85);}
.rm .step ul.rl{text-align:left;} .rm .step ul.rl li{font-size:var(--fs-small);}
.rm .step.dk ul.rl li,.rm .step.dk ul.rl li .k{color:#fff;} .rm .step.dk ul.rl li::before{color:rgba(255,255,255,.7);} .rm .step.dk ul.rl li .v{color:rgba(255,255,255,.8);}
/* image */
.imgblk{display:flex;gap:calc(var(--gap) * 1.6);flex:1;min-height:0;font-size:var(--fs-body);}
.imgblk .pic{flex:1.3;min-height:0;display:flex;flex-direction:column;background:#fff;border-radius:12px;box-shadow:var(--card-shadow);padding:1em 1.2em;overflow:hidden;}
.imgblk .pic .fr{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;container-type:size;}
.imgblk .pic img{max-height:100%;max-width:100%;object-fit:contain;}
/* 이미지 상자 비율: 기본 16:9(--arw/--arh). 칸 너비와 높이 중 작은 쪽에 맞춰 비율을 지키고, 원본은 cover 로 가장자리를 잘라 채운다. ratio:"original" 이면 .ib 없이 contain */
.imgblk .pic .fr>.ib{--arw:16;--arh:9;aspect-ratio:var(--arw) / var(--arh);width:min(100%, calc(100cqh * var(--arw) / var(--arh)));height:auto;max-height:100%;object-fit:cover;flex:0 0 auto;}
.imgblk .pic .fr>.ph.ib{padding:0;min-height:0;}
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
/* org(조직도·인력 배치, 2026-10-09) — 위 대표 카드(진한 머리띠 "CEO" · 이름 줄 · 사진 빈 칸 + 이력 두 열) → 연결선 → 팀 카드 2~5개(연한 머리띠 "팀 (인원)" · 팀장 이름 + 역할 배지 · 이력 한 줄) */
.org{display:flex;flex-direction:column;flex:1;min-height:0;font-size:var(--fs-small);align-items:center;}
.org .ohead{width:46%;background:#fff;border:1.5px solid var(--primary-deep);border-radius:10px;overflow:hidden;box-shadow:var(--card-shadow);flex:0 0 auto;}
.org .ohead .orole{background:var(--primary-deep);color:#fff;text-align:center;font-weight:700;font-size:1.15em;padding:.4em;}
.org .ohead .oname{text-align:center;font-weight:600;font-size:1.1em;padding:.35em;border-bottom:1px solid var(--border);letter-spacing:.2em;}
.org .ohead .obody{display:grid;grid-template-columns:5.2em 1fr;gap:1em;padding:.7em 1em .8em .9em;background:var(--bg-soft);}
.org .ohead .ophoto{aspect-ratio:3/4;background:var(--border);border-radius:4px;}
.org .ohead .otitle{color:var(--primary);font-weight:600;margin-bottom:.3em;}
.org .ohead .oitems{display:grid;grid-template-columns:1fr 1fr;column-gap:1em;row-gap:.15em;color:var(--text-mid);font-size:.92em;line-height:1.4;}
.org .ohead .oitems div::before{content:'• ';}
.org .olines{position:relative;width:100%;height:28px;flex:0 0 auto;}
.org .olines i{position:absolute;background:var(--border-strong);}
.org .oteams{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:1.2em;width:100%;flex:0 0 auto;align-items:start;}   /* 팀 카드는 내용 높이만큼 */
.org .oteam{background:#fff;border:1px solid var(--pill-glow-border,var(--primary-softer));border-radius:10px;overflow:hidden;box-shadow:var(--card-shadow);display:flex;flex-direction:column;}
.org .oteam .tname{background:var(--primary-softer);color:var(--primary);text-align:center;font-weight:600;font-size:1.05em;padding:.5em .6em;border-bottom:1px solid var(--border);}
.org .oteam .tbody{padding:.9em .8em;text-align:center;}
.org .oteam .tlead{font-weight:600;font-size:1.1em;letter-spacing:.15em;}
.org .oteam .tbadge{display:inline-block;margin-left:.5em;background:var(--bg-soft);color:var(--text-mid);border-radius:1em;padding:.1em .7em;font-size:.72em;font-weight:500;letter-spacing:0;vertical-align:middle;}
.org .oteam .tdesc{color:var(--text-mid);font-size:.88em;margin-top:.5em;line-height:1.35;}
/* history(연혁, 2026-10-09) — layout columns(기본): 간트와 같은 진한 머리띠(기간 + 흰 원), 열마다 세로 점선 + 점 + 연도·내용
   layout list: 왼쪽 기간(포인트 컬러), 오른쪽 연·월·내용 줄. 글이 많은 제출용 */
.hist{display:flex;flex-direction:column;flex:1;min-height:0;font-size:var(--fs-small);}
.hist .hh{display:grid;grid-template-columns:repeat(var(--n),1fr);background:var(--primary-deep);color:#fff;border-radius:6px;margin:0 -8px 12px;padding:0 8px;flex:0 0 auto;}
.hist .hh span{display:flex;align-items:center;gap:.6em;padding:.5em .6em .5em 0;font-weight:700;font-size:.95em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.hist .hh span::before{content:'';width:.7em;height:.7em;border-radius:50%;background:#fff;flex:0 0 auto;box-shadow:0 0 0 .22em var(--primary-deep),0 0 0 .32em rgba(255,255,255,.55);margin-left:.32em;}
.hist .hcols{display:grid;grid-template-columns:repeat(var(--n),1fr);column-gap:1.2em;flex:1;min-height:0;}
.hist .hcol{position:relative;padding-left:1.3em;}
.hist .hcol::before{content:'';position:absolute;left:.3em;top:.6em;bottom:.6em;border-left:1px dashed var(--border-strong);}
.hist .hi{position:relative;margin-bottom:12px;}
.hist .hi::before{content:'';position:absolute;left:-1.3em;top:.4em;width:.65em;height:.65em;border-radius:50%;background:var(--primary);}
.hist .hy{font-weight:700;color:var(--text);line-height:1.3;} .hist .hy small{font-weight:500;color:var(--text-mid);font-size:.9em;margin-left:.3em;}
.hist .ht{color:var(--text-mid);line-height:1.35;font-size:.95em;}
.hist.list{gap:14px;}
.hist.list .hg{display:grid;grid-template-columns:7.5em 1fr;column-gap:1.4em;}
.hist.list .hp{font-weight:700;color:var(--primary);line-height:1.55;}
.hist.list .hrow{display:grid;grid-template-columns:3.2em 3em 1fr;column-gap:.6em;line-height:1.55;}
.hist.list .hrow .hy{font-weight:600;} .hist.list .hrow .hm{color:var(--text-mid);} .hist.list .hrow .ht{color:var(--text);font-size:1em;margin-left:-8px;}   /* 월과 내용 사이 8px 좁게(2026-10-10) */
/* gantt(2026-10-09, 레퍼런스 "시간표" 모양) — 위에 진한 머리띠(열 라벨 흰 글자) · 왼쪽 항목 이름 · 이름 끝에서 막대까지 가는 안내선 ·
   막대는 두껍게, 라벨은 막대 안 흰 글자 · 막대 앞뒤에 시작·끝 표시(from·to). 세로 격자선·가로 구분선 없음 */
.gantt{display:flex;flex-direction:column;flex:1;min-height:0;font-size:var(--fs-small);--gl:24%;}
.gantt .gh,.gantt .gr{display:grid;grid-template-columns:var(--gl) 1fr;min-height:0;}
.gantt .gh{flex:0 0 auto;background:var(--primary-deep);color:#fff;border-radius:6px;overflow:hidden;margin:0 -8px 8px;padding:0 8px;}   /* 띠는 내용보다 좌우 8px 넓게, 글자는 내용 끝선에 맞춤, 아래 행과 8px */ .gantt .gr{flex:1;}
.gantt .gh .gnh{display:flex;align-items:center;padding:.45em .8em .45em 0;font-weight:700;font-size:.9em;}
.gantt .gcols{display:grid;grid-template-columns:repeat(var(--n),1fr);text-align:left;color:#fff;font-weight:600;font-size:.9em;margin-right:var(--gto,3.4em);}
.gantt .gcols span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:.45em .5em;border-left:1px solid rgba(255,255,255,.22);}
.gantt .gname{display:flex;align-items:center;padding-right:.8em;color:var(--text);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.gantt .gtrack{position:relative;min-height:1.9em;margin-right:var(--gto,3.4em);}   /* 오른쪽은 to 라벨 자리 */
.gantt .glead{position:absolute;left:0;top:50%;height:1px;background:var(--border-strong);}   /* 이름 끝 → 막대 시작 안내선 */
.gantt .gbar{position:absolute;top:50%;height:1.45em;font-style:normal;transform:translateY(-50%);background:var(--primary);border-radius:3px;min-width:4px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;font-size:.85em;white-space:nowrap;overflow:hidden;padding:0 .4em;}
.gantt .gbar.second{background:var(--primary-2);} .gantt .gbar.accent{background:var(--pill-glow);} .gantt .gbar.muted{background:var(--text-mid);}
.gantt .gfrom,.gantt .gto{position:absolute;top:50%;transform:translateY(-50%);font-size:.85em;color:var(--text-mid);white-space:nowrap;}
.gantt .gfrom{transform:translate(-100%,-50%);padding-right:.5em;} .gantt .gto{padding-left:.5em;} .gantt .gto.end{left:auto!important;right:calc(-1 * var(--gto,3.4em));text-align:right;padding-left:0;}
/* chart — shadcn/ui Charts: 회색 패널 없이 카드 위에 바로. 제목 왼쪽·단위 오른쪽, 범례는 아래 가운데(작은 둥근 네모) */
.chart{background:transparent;border-radius:0;padding:.2em 0 0;display:flex;flex-direction:column;flex:1;min-height:0;}
.chart .chh{display:flex;justify-content:space-between;align-items:baseline;font-size:var(--fs-small);}
.chart .chh b{color:var(--text);font-weight:700;font-size:var(--fs-body);} .chart .chh span{color:var(--text-mid);}
.chart .cplot{flex:1;min-height:0;margin-top:.5em;display:flex;} .chart .cplot svg{width:100%;height:100%;display:block;}
.chart .lg{display:flex;justify-content:center;gap:1.4em;font-size:var(--fs-small);color:var(--text);margin-top:.35em;} .chart .lg i{display:inline-block;width:.6em;height:.6em;border-radius:2px;margin-right:.4em;vertical-align:0;}
/* cover / toc / divider / closing */
/* 표지 배경 — meta.coverBg 로 고른 이미지. 마무리 장표는 브랜드 그라디언트로 따로 간다 */
.cover{position:absolute;inset:0;overflow:hidden;color:#fff;}
.cbg{position:absolute;inset:0;overflow:hidden;z-index:0;background:#000 center center / cover no-repeat;}
.cv .cbg{background-image:url('${coverBgFile(meta.coverBg)}');}
/* 제목이 놓이는 왼쪽을 살짝 눌러 글씨가 밝은 부분에 걸쳐도 읽히게 한다 */
.cv .scrim{position:absolute;inset:0;z-index:1;background:${coverScrim(meta.coverBg)};}
.closing .cbg{background:${P.primaryDeep};}   /* 2026-10-09 마무리: 진한 메인 단색, 왼쪽 위 메시지 · 왼쪽 아래 로고 + 연락처 · 오른쪽 그림 */
.closing .cin{display:block;padding:0;}
.closing .big{position:absolute;left:66px;top:70px;width:760px;font-family:var(--font-title-b);font-size:40px;font-weight:400;color:#fff;letter-spacing:-.02em;line-height:1.35;}
.closing .ty{position:absolute;left:66px;top:300px;width:600px;font-size:18px;color:rgba(255,255,255,.8);line-height:1.5;}
.closing .clogo2{position:absolute;left:66px;bottom:168px;height:44px;}
.closing .cs{position:absolute;left:66px;bottom:52px;display:grid;grid-template-columns:5.5em 1fr;row-gap:14px;column-gap:1.4em;font-size:20px;color:#fff;}
.closing .cs .r{color:rgba(255,255,255,.9);} .closing .cs .v{color:#fff;} .closing .cs .v.u{text-decoration:underline;text-underline-offset:4px;}
.closing .cimg{position:absolute;left:680px;top:70px;right:40px;bottom:40px;display:flex;align-items:center;justify-content:center;}
.closing .cimg img{max-width:100%;max-height:100%;object-fit:contain;}
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
  return `<div class="tbl"><table class="rt kvt"><tbody>${(rows || []).map(r => `<tr>${r.map((c, i) => `<td${i ? '' : ' style="width:38%"'}>${rich(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function statFrag(st) {
  const m = String(st.value ?? '').match(/^([\d.,~\-–]+)\s*(.*)$/);
  const val = m && m[2] && m[2].length <= 4 ? `${esc(m[1])}<small>${esc(m[2])}</small>` : rich(st.value);
  return `${st.sub ? `<div class="sl">${rich(st.sub)}</div>` : ''}<div class="sv">${val}</div>${st.desc ? `<div class="sn">${rich(st.desc)}</div>` : ''}`;
}
function chartPanel(b) {
  const data = esc(JSON.stringify({ kind: b.kind, labels: b.labels || [], series: (b.series || []).slice(0, 4).map(sr => ({ values: sr.values || [] })) }));
  return `<div class="chart" data-chart="${data}"><div class="chh"><b>${rich(b.title || '')}</b><span>${b.unit ? `단위 : ${esc(b.unit)}` : ''}</span></div><div class="cplot">${chartSvg(b)}</div>${(b.series || []).length > 1 ? `<div class="lg">${(b.series || []).map((sr, i) => `<span><i style="background:${SERIES_COLORS()[i]}"></i>${esc(sr.name || '')}</span>`).join('')}</div>` : ''}</div>`;
}
const SERIES_COLORS = () => [P.primary2, P.primary, P.teal, P.gold];
/** 그래프 — shadcn/ui Charts(recharts) 모양을 따른다: 가로 격자선만, 축선·눈금선 없음, 막대는 위 모서리만 둥글게, 선은 부드러운 곡선 + 점, 값 라벨은 위.
 *  그리는 코드는 CHART_DRAW_SRC 하나다. 서버는 기본 높이로 먼저 그려 두고(스크립트 없이도 보이게), 브라우저는 그래프 칸의 실제 가로세로 비율에 맞춰
 *  같은 함수로 다시 그린다(2026-10-10 — 그래야 가로를 꽉 채운다. viewBox 비율이 칸과 다르면 meet 때문에 좌우가 비었다). */
const CHART_DRAW_SRC = `function(b, W, H, C, fs) {
  fs = fs || 21;   // 글자 기준 크기(px) = 장표의 작은 글(--fs-small × 배율). 그림 좌표 1 = 화면 1px
  var esc = function(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function(c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); };
  var labels = b.labels || [], series = (b.series || []).slice(0, 4), cols = C.series;
  var all = [].concat.apply([], series.map(function(sr) { return sr.values || []; })).filter(function(v) { return typeof v === 'number'; });
  var max = Math.max.apply(null, [1].concat(all)) * 1.25, min = Math.min.apply(null, [0].concat(all));
  var padL = 20, padR = 20, padT = fs * 2.2, padB = fs * 2.6;   // 좌우 여백 20px, 위는 값 라벨, 아래는 축 라벨 자리
  var n = Math.max.apply(null, [labels.length].concat(series.map(function(sr) { return (sr.values || []).length; })));
  var dot = fs * 0.3, inset = b.kind === 'bar' ? 0 : dot;
  var x = function(i) { return padL + inset + (n <= 1 ? (W - padL - padR - inset * 2) / 2 : (W - padL - padR - inset * 2) * i / (n - 1)); };
  var y = function(v) { return padT + (H - padT - padB) * (1 - (v - min) / (max - min)); };
  var gw = (W - padL - padR) / Math.max(n, 1);
  var lx = function(i) { return b.kind === 'bar' ? padL + gw * i + gw / 2 : x(i); };   // 축 라벨: 막대는 묶음 가운데, 선은 점 아래
  var smooth = function(pts) {
    if (pts.length < 2) return pts.length ? 'M' + pts[0][0] + ',' + pts[0][1] : '';
    var k = pts.length, dx = [], m = [], t = [], i;
    for (i = 0; i < k - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; m[i] = dx[i] ? (pts[i + 1][1] - pts[i][1]) / dx[i] : 0; }
    t[0] = m[0]; t[k - 1] = m[k - 2];
    for (i = 1; i < k - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
    for (i = 0; i < k - 1; i++) { if (!m[i]) { t[i] = 0; t[i + 1] = 0; continue; } var a = t[i] / m[i], c = t[i + 1] / m[i], q = a * a + c * c; if (q > 9) { var tau = 3 / Math.sqrt(q); t[i] = tau * a * m[i]; t[i + 1] = tau * c * m[i]; } }
    var d = 'M' + pts[0][0] + ',' + pts[0][1];
    for (i = 0; i < k - 1; i++) { var hh = dx[i] / 3; d += ' C' + (pts[i][0] + hh).toFixed(1) + ',' + (pts[i][1] + t[i] * hh).toFixed(1) + ' ' + (pts[i + 1][0] - hh).toFixed(1) + ',' + (pts[i + 1][1] - t[i + 1] * hh).toFixed(1) + ' ' + pts[i + 1][0] + ',' + pts[i + 1][1]; }
    return d;
  };
  var out = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" font-family="inherit">';
  for (var g = 0; g <= 4; g++) { var gy = (padT + (H - padT - padB) * g / 4).toFixed(1); out += '<line x1="' + padL + '" y1="' + gy + '" x2="' + (W - padR) + '" y2="' + gy + '" stroke="' + C.border + '" stroke-opacity=".6" stroke-width="1"/>'; }
  labels.forEach(function(l, i) { out += '<text x="' + lx(i) + '" y="' + (H - padB + fs * 1.7) + '" text-anchor="middle" font-size="' + (fs * 0.9) + '" fill="' + C.textMid + '">' + esc(l) + '</text>'; });
  if (b.kind === 'bar') {
    var bw = Math.min(fs * 5, gw * 0.72 / series.length), r = series.length > 1 ? fs * 0.3 : fs * 0.5;
    series.forEach(function(sr, si) { (sr.values || []).forEach(function(v, i) {
      var bx = padL + gw * i + gw / 2 - (bw * series.length) / 2 + bw * si + 4, w = bw - 8;
      var top = y(v), bot = H - padB, rr = Math.min(r, Math.max(0, bot - top) / 2, w / 2);
      out += '<path d="M' + bx + ',' + bot + ' V' + (top + rr) + ' Q' + bx + ',' + top + ' ' + (bx + rr) + ',' + top + ' H' + (bx + w - rr) + ' Q' + (bx + w) + ',' + top + ' ' + (bx + w) + ',' + (top + rr) + ' V' + bot + ' Z" fill="' + cols[si] + '"/>';
      out += '<text x="' + (bx + w / 2) + '" y="' + (top - fs * 0.6) + '" text-anchor="middle" font-size="' + fs + '" font-weight="600" fill="' + C.text + '">' + esc(v) + '</text>';
    }); });
  } else {
    series.forEach(function(sr, si) {
      var pts = (sr.values || []).map(function(v, i) { return [x(i), y(v)]; });
      out += '<path d="' + smooth(pts) + '" fill="none" stroke="' + cols[si] + '" stroke-width="' + (fs * 0.18) + '" stroke-linejoin="round" stroke-linecap="round"/>';
      pts.forEach(function(pt, i) { out += '<circle cx="' + pt[0] + '" cy="' + pt[1] + '" r="' + dot + '" fill="' + cols[si] + '"/>'; out += '<text x="' + pt[0] + '" y="' + (pt[1] - fs * 0.85) + '" text-anchor="middle" font-size="' + fs + '" font-weight="600" fill="' + C.text + '">' + esc((sr.values || [])[i]) + '</text>'; });
    });
  }
  return out + '</svg>';
}`;
const chartDraw = new Function('return (' + CHART_DRAW_SRC + ')')();
const chartColors = () => ({ series: SERIES_COLORS(), border: P.border, textMid: P.textMid, text: P.text });
function chartSvg(b, H = 416) { return chartDraw(b, 1200, H, chartColors()); }
/** 파일이 실제로 있을 때만 이미지를 넣는다 — 없는 경로는 깨진 이미지 아이콘 대신 점선 자리표시자로. */
/** 이미지 상자 비율. 기본 16:9. "original" 이면 원본 비율 그대로(contain). */
export const IMAGE_RATIOS = { '16:9': [16, 9], '4:3': [4, 3], '1:1': [1, 1], '9:16': [9, 16], '3:4': [3, 4] };
function ratioAttr(ratio) {
  if (ratio === 'original') return '';
  const [w, h] = IMAGE_RATIOS[ratio] || IMAGE_RATIOS['16:9'];
  return ` class="ib" style="--arw:${w};--arh:${h}"`;
}
function imgOrPh(src, alt, ratio) {
  const ok = src && (/^(https?:)?\/\//.test(src) || fs.existsSync(path.resolve(outdir, src)));
  if (src && !ok) console.warn(`  (이미지 파일이 없어 자리표시자로 그림: ${src})`);
  const label = String(alt || '이미지 자리').trim();
  const ra = ratioAttr(ratio);
  if (!ok) return `<div class="ph${ra ? ' ib' : ''}"${ra ? ra.replace(' class="ib"', '') : ''}>${/^\[.*\]$/.test(label) ? esc(label) : `[ ${esc(label)} ]`}</div>`;
  return `<img src="${esc(src)}" alt="${esc(alt || '')}"${ra}>`;
}
/** 숫자 칸인가 — 숫자가 있고 글자는 단위 정도(4자 이하)만. "2억 7,500만 원", "18%", "1,540명" 은 숫자, "3개 기능 구성" 은 글 */
export { isNumCell } from './lib/common.mjs';
/** 합계·평균 같은 마무리 행인가 (첫 칸으로 판단) */
export function isTotalRow(r) { return /^(합계|총계|총합|계|전체|소계|평균|Total)$/i.test(String((r || [])[0] ?? '').replace(/\*\*/g, '').trim()); }
function badgeCell(txt) {
  const t = String(txt).replace(/\*\*/g, '');
  if (/^(달성|완료|충족)$/.test(t)) return `<span class="badge ok">${esc(t)}</span>`;
  if (/^(조기달성|초과달성|초과)$/.test(t)) return `<span class="badge up">${esc(t)}</span>`;
  if (/^(진행중|진행 중|예정|계획)$/.test(t)) return `<span class="badge wip">${esc(t)}</span>`;
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
        ${c.image !== undefined ? `<div class="imgblk" style="flex:1"><div class="pic" style="border:0;padding:0;box-shadow:none"><div class="fr">${imgOrPh(c.image, c.caption, c.ratio)}</div>${c.caption && c.image ? `<div class="cp">${esc(c.caption)}</div>` : ''}</div></div>` : ''}</div>
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
  /** 간트: cols(기간 라벨) × tasks(name, start, end 는 1부터 세는 칸 번호·끝 포함·2.5 처럼 반 칸 가능, tone, label) */
  gantt(b) {
    const cols = b.cols || [], n = Math.max(1, cols.length), tasks = b.tasks || [];
    const pos = v => { const x = typeof v === 'string' ? cols.indexOf(v) + 1 : Number(v); return Number.isFinite(x) && x > 0 ? x : 1; };
    const rows = tasks.map(t => {
      const s = Math.min(n, pos(t.start)), e = Math.max(s, Math.min(n, pos(t.end ?? t.start)));
      const left = ((s - 1) / n * 100).toFixed(2), width = ((e - s + 1) / n * 100).toFixed(2);
      // 안내선은 이름 끝에서 막대(또는 from 글자) 앞까지. from·to 는 막대 앞뒤 작은 글자, label 은 막대 안
      const fromW = t.from ? `calc(${left}% - ${String(t.from).length * 0.55 + 1}em)` : `${left}%`;
      return `<div class="gr"><div class="gname">${rich(t.name || '')}</div><div class="gtrack"><i class="glead" style="width:${fromW}"></i>${t.from ? `<span class="gfrom" style="left:${left}%">${esc(t.from)}</span>` : ''}<i class="gbar${t.tone ? ' ' + esc(t.tone) : ''}" style="left:${left}%;width:${width}%">${t.label ? esc(t.label) : ''}</i>${t.to ? `<span class="gto${e >= n ? ' end' : ''}" style="left:${(+left + +width).toFixed(2)}%">${esc(t.to)}</span>` : ''}</div></div>`;
    }).join('');
    return `${cardOpen('grow', b.heading)}<div class="gantt" style="--n:${n}"><div class="gh"><div class="gnh">${esc(b.nameHeader || '')}</div><div class="gcols">${cols.map(c => `<span>${esc(c)}</span>`).join('')}</div></div>${rows}</div>${CARD_CLOSE}`;
  },
  /** 조직도·인력 배치: head{role,name,title,items[]} + teams[{name,count,leader,leaderRole,desc}]. 사진은 넣지 않고 빈 칸 */
  org(b) {
    const hd = b.head || {}, teams = b.teams || [], n = Math.max(1, teams.length);
    // 연결선: 대표 카드 아래 중앙에서 내려와 가로선, 팀마다 아래로
    const lines = [`<i style="left:50%;top:0;width:1px;height:50%"></i>`, `<i style="left:calc(50% / ${n});right:calc(50% / ${n});top:50%;height:1px"></i>`]
      .concat(teams.map((_, i) => `<i style="left:calc(${(i + 0.5) / n * 100}%);top:50%;width:1px;height:50%"></i>`)).join('');
    return `${cardOpen('grow plain', b.heading)}<div class="org" style="--n:${n}">
      <div class="ohead"><div class="orole">${esc(hd.role || 'CEO')}</div><div class="oname">${esc(hd.name || '')}</div>
        <div class="obody"><div class="ophoto"></div><div>${hd.title ? `<div class="otitle">${esc(hd.title)}</div>` : ''}<div class="oitems">${(hd.items || []).map(t => `<div>${esc(t)}</div>`).join('')}</div></div></div></div>
      <div class="olines">${lines}</div>
      <div class="oteams">${teams.map(t => `<div class="oteam"><div class="tname">${esc(t.name || '')}${t.count ? ` (${esc(t.count)})` : ''}</div><div class="tbody"><div class="tlead">${esc(t.leader || '')}${t.leaderRole ? `<span class="tbadge">${esc(t.leaderRole)}</span>` : ''}</div>${t.desc ? `<div class="tdesc">${esc(t.desc)}</div>` : ''}</div></div>`).join('')}</div>
    </div>${CARD_CLOSE}`;
  },
  /** 연혁: groups[{period, items[{year, month?, text}]}]. layout "columns"(기본) | "list" */
  history(b) {
    const groups = b.groups || [], n = Math.max(1, groups.length);
    if (b.layout === 'list') {
      const gs = groups.map(g => `<div class="hg"><div class="hp">${rich(g.period || '')}</div><div>${(g.items || []).map(it => `<div class="hrow"><span class="hy">${esc(it.year || '')}</span><span class="hm">${esc(it.month || '')}</span><span class="ht">${rich(it.text || '')}</span></div>`).join('')}</div></div>`).join('');
      return `${cardOpen('grow', b.heading)}<div class="hist list">${gs}</div>${CARD_CLOSE}`;
    }
    const head = `<div class="hh">${groups.map(g => `<span>${esc(g.period || '')}</span>`).join('')}</div>`;
    const cols = `<div class="hcols">${groups.map(g => `<div class="hcol">${(g.items || []).map(it => `<div class="hi"><div class="hy">${esc(it.year || '')}${it.month ? `<small>${esc(it.month)}</small>` : ''}</div><div class="ht">${rich(it.text || '')}</div></div>`).join('')}</div>`).join('')}</div>`;
    return `${cardOpen('grow', b.heading)}<div class="hist" style="--n:${n}">${head}${cols}</div>${CARD_CLOSE}`;
  },
  timeline(b) {
    return BLOCKS.process({ steps: (b.phases || []).map(p => ({ period: p.period, title: p.title, items: p.items, desc: p.desc, highlight: p.highlight, dark: p.dark })), darkLast: b.darkLast });
  },
  table(b) {
    const em = b.emphasize; const rows = b.rows || [];
    const leftCols = new Set(b.leftAlign || [0]);
    // 수치만 있는 열(첫 열 제외)은 오른쪽 정렬, 글이 섞인 열은 왼쪽. 첫 칸이 합계·평균이면 footer 행
    const ncol = (b.headers || []).length || (rows[0] || []).length;
    // 열 너비: widths 를 주지 않았으면 칸 글자 양에 맞춰 나눈다(PPTX 와 같은 값)
    const widths = (b.widths || []).length === ncol ? b.widths : tableColWidths(b.headers, rows).map(p => p + '%');
    const numCol = numColumns(b.headers, rows, leftCols);
    const cls = (i, extra = '') => [i === em ? 'em' : '', numCol[i] ? 'n' : '', extra].filter(Boolean).join(' ');
    return `<div class="tbl" style="flex:1;min-height:0;overflow:hidden"><table class="rt${b.rowHeader ? ' rh' : ''}">
      ${widths.length ? `<colgroup>${widths.map(w => `<col style="width:${w}">`).join('')}</colgroup>` : ''}
      ${(b.headers || []).length ? `<thead><tr>${b.headers.map((h, i) => `<th class="${cls(i)}">${rich(h)}</th>`).join('')}</tr></thead>` : ''}
      <tbody>${rows.map(r => `<tr${isTotalRow(r) ? ' class="tot"' : ''}>${r.map((c, i) => `<td class="${cls(i, leftCols.has(i) && i > 0 ? 'l' : '')}">${i === em ? rich(c) : badgeCell(c)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
  },
  compare(b) {
    const side = (s, cls, tag) => `<div class="side ${cls}"><div class="cap">${esc(s.tag || tag)}</div><div class="bd">${s.heading ? `<div class="sh">${rich(s.heading)}</div>` : ''}<div class="fill">${s.sections ? subSections(s.sections) : ''}${listItems(s.items)}</div></div></div>`;
    return `<div class="cmp">${side(b.left || {}, 'from', 'AS-IS')}<div class="arr"><i>▶</i></div>${side(b.right || {}, 'to', 'TO-BE')}</div>`;
  },
  image(b) {
    const pic = `<div class="pic">${b.heading ? `<div class="sh2">${rich(b.heading)}</div>` : ''}<div class="fr">${imgOrPh(b.src, b.caption || b.alt, b.ratio)}</div>${b.caption && b.src ? `<div class="cp">${esc(b.caption)}</div>` : ''}</div>`;
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
    const tone = ['light', 'warn', 'strong'].includes(b.tone) ? ' ' + b.tone : '';
    return `<div class="banner${tone}"><div class="lead">${esc(label)}</div><div class="msg">${body}</div></div>`;
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
  const leadLines = sl.lead ? estLines(sl.lead, HEAD.lead, 1100) : 0;
  // 헤드라인이 두 줄 이상이면 그만큼 본문 시작을 내린다(리드·구분선이 본문과 겹치지 않게)
  const titleExtra = headline ? (estLines(headline, HEAD.stitle, 1100) - 1) * HEAD.stitle * 1.2 : 0;
  const bodyTop = titleExtra + (headline ? (sl.lead ? FRAME.bodyTop + Math.max(0, leadLines - 1) * HEAD.lead * 1.5 : FRAME.bodyTop - 30) : 96);
  const foot = footLines(sl);
  const safeBottom = footSafeBottom(foot);
  return `<section class="slide" data-label="${esc(slideLabel(s))}" id="s${s.order}" data-fit="1"${fitStyle(s.order)}>
    ${top(eyebrow, headline, sl.lead, meta.pageNumbers && s.pageNo ? String(parseInt(s.pageNo, 10)) : '')}
    <div class="body" style="--body-top:${bodyTop}px;--safe-bottom:${safeBottom}px">${renderBlocks(sl.blocks)}</div>
    ${foot.length ? `<div class="foot">${foot.map(t => `<div>${rich(t)}</div>`).join('')}</div>` : ''}
  </section>`;
}
function renderClosing() {
  const c = outline.closing, ct = meta.contact || {};
  const cols = (meta.orgs && meta.orgs.length ? meta.orgs : [meta.company && { role: '작성', name: meta.company }].filter(Boolean)).map(o => `<div class="ci"><div class="r">${esc(o.role || '')}</div><div class="v">${esc(o.name || '')}</div></div>`);
  if (ct.email) cols.push(`<div class="ci"><div class="r">CONTACT</div><div class="v">${esc(ct.email)}${ct.phone ? ` · ${esc(ct.phone)}` : ''}</div></div>`);
  if (ct.web) cols.push(`<div class="ci"><div class="r">WEB</div><div class="v">${esc(ct.web)}</div></div>`);
  // 2026-10-09 레이아웃: 왼쪽 위 메시지(두세 줄) · 왼쪽 아래 로고 + Web/E-mail · 오른쪽 그림(closing.image, 없으면 비움)
  const rows = [];
  if (ct.web) rows.push(['Web', `<span class="v u">${esc(ct.web)}</span>`]);
  if (ct.email) rows.push(['E-mail', `<span class="v">${esc(ct.email)}</span>`]);
  if (ct.phone) rows.push(['Tel', `<span class="v">${esc(ct.phone)}</span>`]);
  return `<section class="slide closing" data-label="마무리">
    <div class="cover"><div class="cbg" data-deco></div>
      <div class="cin">
        <div class="big">${rich(c.message)}</div>
        ${c.sub ? `<div class="ty">${rich(c.sub)}</div>` : ''}
        ${meta.logo.dark ? `<img class="clogo2" src="${esc(meta.logo.dark)}" alt="">` : ''}
        ${rows.length ? `<div class="cs">${rows.map(([r, v]) => `<span class="r">${r}</span>${v}`).join('')}</div>` : ''}
        ${c.image ? `<div class="cimg"><img src="${esc(c.image)}" alt=""></div>` : ''}
      </div></div>
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
<script>
/* 그래프를 그래프 칸의 실제 가로세로 비율로 다시 그린다 — 가로를 꽉 채우기 위해. fit_slides 는 배율을 정한 뒤 window.__drawCharts() 를 부른다 */
(function () {
  var draw = ${CHART_DRAW_SRC};
  var C = ${JSON.stringify(chartColors())};
  function redraw() {
    document.querySelectorAll('.chart[data-chart]').forEach(function (el) {
      var plot = el.querySelector('.cplot'); if (!plot) return;
      var w = plot.clientWidth, h = plot.clientHeight; if (w < 20 || h < 20) return;
      var hh = el.querySelector('.chh'), fs = hh ? parseFloat(getComputedStyle(hh).fontSize) : 16;   // 작은 글 크기(배율 포함)
      var b = JSON.parse(el.getAttribute('data-chart'));
      plot.innerHTML = draw(b, Math.round(w), Math.round(h), C, fs);
    });
  }
  window.__drawCharts = redraw;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', redraw); else redraw();
  window.addEventListener('load', redraw);
  window.addEventListener('resize', redraw);
})();
</script>
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
