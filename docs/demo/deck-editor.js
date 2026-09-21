/* ══════════════════════════════════════════════════════════════════════
   deck-editor.js — SafeAI Deck 직접 편집 모드 (bolt-on)
   deck-stage.js 를 수정하지 않고 그 위에 얹는 WYSIWYG 편집 레이어.

   - light-DOM <section> 슬라이드를 직접 조작
   - 핸들/툴바는 문서 레벨 오버레이(스크린 좌표) → shadow/scale 우회
   - 첫 이동/크기/회전 시 그 슬라이드만 flow→absolute 로 lazy bake
   - 저장: File System Access API (폴백: 다운로드)
   - export(PPTX/PDF)는 기존 익스포터/인쇄에 위임 — 여기선 깨끗한 DOM만 생산

   설계: docs/superpowers/specs/2026-07-16-deck-editor-design.md
   ══════════════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  const AUTHOR_W = 1280, AUTHOR_H = 720;
  const TYPE_SCALE = [12, 14, 15, 16, 18, 20, 24, 28, 36, 44, 56];
  const SNAP = 6;          // authored px
  const NUDGE = 1, NUDGE_BIG = 10;
  const HISTORY_MAX = 50;

  // 토큰 스와치 (CLAUDE.md 색 규칙 — 임의 hex 금지)
  const TEXT_COLORS = [
    ['브랜드', '#3242C6'], ['잉크', '#222A35'], ['보조', '#64748B'],
    ['진블루', '#2937A7'], ['액센트', '#0EA5E9'], ['흰색', '#FFFFFF'],
  ];
  const BG_COLORS = [
    ['없음', null], ['라이트', '#E1E9F7'], ['회색', '#F1F5F9'],
    ['다크', '#1B2456'], ['브랜드', '#3242C6'], ['액센트', '#0EA5E9'],
  ];

  /* ── 상태 ─────────────────────────────────────────────── */
  const S = {
    on: false,
    stage: null,          // <deck-stage>
    sel: null,            // 선택된 요소
    dirty: false,
    dirHandle: null,      // FSA 디렉터리 핸들
    fileHandle: null,     // deck.html 핸들
    undo: [],
    redo: [],
    drag: null,
  };

  /* ── DOM 유틸 ─────────────────────────────────────────── */
  const stage = () => document.querySelector('deck-stage');
  const activeSlide = () => {
    const st = stage();
    if (!st) return null;
    // light-DOM 직속 section 중 data-deck-active
    return st.querySelector(':scope > section[data-deck-active]')
        || st.querySelector(':scope > section');
  };
  const scaleOf = (slide) => {
    const r = slide.getBoundingClientRect();
    return r.width / AUTHOR_W || 1;
  };

  // 스크린 좌표 → 슬라이드 authored 좌표
  const toAuthored = (slide, clientX, clientY) => {
    const r = slide.getBoundingClientRect();
    const s = scaleOf(slide);
    return { x: (clientX - r.left) / s, y: (clientY - r.top) / s };
  };

  /* ── 콘텐츠 리프 판정 ─────────────────────────────────────
     선택/베이크 대상: 직접 텍스트를 갖거나, <img>, 혹은 스타일 박스
     (배경 or 보더). 순수 레이아웃 래퍼는 제외. */
  const hasDirectText = (el) => {
    for (const n of el.childNodes)
      if (n.nodeType === 3 && n.textContent.trim()) return true;
    return false;
  };
  const isStyledBox = (el) => {
    const cs = getComputedStyle(el);
    const bg = cs.backgroundColor;
    const hasBg = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
    const hasBorder = parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0;
    return hasBg || hasBorder;
  };
  const isLeaf = (el) => {
    if (!(el instanceof Element)) return false;
    if (el.classList.contains('de-skip')) return false;
    const tag = el.tagName;
    if (tag === 'IMG' || tag === 'SVG') return true;
    if (hasDirectText(el)) return true;
    if (isStyledBox(el)) return true;
    return false;
  };
  const isLeafBox = (el) => hasDirectText(el) || isStyledBox(el);
  const areaOf = (r) => Math.max(1, r.width * r.height);

  // 콘텐츠 유닛 수집 — 트리 워크.
  //  · IMG/SVG            → 항상 유닛 (하강 안 함)
  //  · 작은 positioned 요소 → 이미 freeform 인 chrome/카드 래퍼 = 유닛 (하강 안 함)
  //  · flow 리프(텍스트/박스) → 유닛 (하강 안 함)
  //  · 그 외(큰 컨테이너)    → 하강
  const collectUnits = (slide) => {
    const slideArea = areaOf(slide.getBoundingClientRect());
    const units = [];
    const walk = (node) => {
      for (const child of node.children) {
        if (child.classList.contains('de-skip')) continue;
        const tag = child.tagName;
        if (tag === 'IMG' || tag === 'SVG') { units.push(child); continue; }
        const cs = getComputedStyle(child);
        const positioned = cs.position !== 'static';
        const ratio = areaOf(child.getBoundingClientRect()) / slideArea;
        if (positioned && ratio < 0.6) { units.push(child); continue; }
        if (!positioned && isLeafBox(child) && ratio < 0.9) { units.push(child); continue; }
        walk(child);
      }
    };
    walk(slide);
    return units;
  };
  // baked 슬라이드는 마커로, 아니면 트리워크로
  const unitsOf = (slide) => slide.dataset.deBaked !== undefined
    ? Array.from(slide.querySelectorAll(':scope [data-de-baked]'))
    : collectUnits(slide);

  // absolute 로 만들 때의 컨테이닝 블록 (가장 가까운 positioned/transform 조상, 없으면 slide)
  const containingBlock = (el, slide) => {
    let a = el.parentElement;
    while (a && a !== slide) {
      const cs = getComputedStyle(a);
      if (cs.position !== 'static' || cs.transform !== 'none') return a;
      a = a.parentElement;
    }
    return slide;
  };

  // 클릭 지점의 선택 대상 = 그 지점을 포함하는 유닛
  const pickTarget = (slide, target) => {
    if (slide.dataset.deBaked !== undefined) {
      let el = target;
      while (el && el !== slide) {
        if (el.dataset && el.dataset.deBaked !== undefined) return el;
        el = el.parentElement;
      }
      return null;
    }
    const units = collectUnits(slide);
    let el = target;
    while (el && el !== slide) {
      if (units.indexOf(el) !== -1) return el;
      el = el.parentElement;
    }
    return null;
  };

  /* ── 베이크: flow → absolute (슬라이드 1회) ───────────────── */
  const bakeSlide = (slide) => {
    if (slide.dataset.deBaked !== undefined) return;
    const units = collectUnits(slide);
    const s = scaleOf(slide);
    // 전부 먼저 측정(pre-bake), 각 유닛의 실제 컨테이닝 블록 기준.
    // 회전(rotate)은 잠시 벗기고 측정 — 회전된 bbox 는 부풀어서 좌표·폭이 틀어진다.
    // (회전은 중심 기준이라 벗겨도 중심이 같아, 측정한 레이아웃 rect + rotate 재적용 = 동일한 시각 결과.)
    // translate 류는 시각 위치 그대로 측정해 left/top 에 흡수시킨다 (기존 동작).
    const measured = units.map((el) => {
      const ang = getAngle(el);
      const prevT = el.style.transform;
      if (ang) el.style.transform = prevT.replace(/rotate\([-\d.]+deg\)\s*/, '');
      const cb = containingBlock(el, slide);
      const ur = el.getBoundingClientRect();
      const cr = cb.getBoundingClientRect();
      const ccs = getComputedStyle(cb);
      const bl = parseFloat(ccs.borderLeftWidth) || 0;
      const bt = parseFloat(ccs.borderTopWidth) || 0;
      if (ang) el.style.transform = prevT;
      return {
        el, ang,
        left: (ur.left - cr.left) / s - bl,
        top: (ur.top - cr.top) / s - bt,
        width: ur.width / s,
        height: ur.height / s,
      };
    });
    for (const m of measured) {
      m.el.dataset.deBaked = '';
      const st = m.el.style;
      st.position = 'absolute';
      st.left = round(m.left) + 'px';
      st.top = round(m.top) + 'px';
      st.width = round(m.width) + 'px';
      st.right = 'auto'; st.bottom = 'auto';
      st.margin = '0';
      st.boxSizing = 'border-box';
      // bake 가 sizing 을 인계받으므로, 잔여 min/max 제약을 해제한다.
      // (가독성용 max-width 가 남으면 리사이즈로 width 를 키워도 캡에 걸려 렌더 폭이 안 늘어남)
      st.maxWidth = 'none'; st.minWidth = '0';
      st.maxHeight = 'none'; st.minHeight = '0';
      // translate 류는 left/top 에 흡수했으니 제거(이중 적용 방지), 회전만 보존.
      st.transform = m.ang ? 'rotate(' + round(m.ang) + 'deg)' : '';
    }
    slide.dataset.deBaked = '';
  };
  const round = (n) => Math.round(n * 10) / 10;

  /* ── 히스토리 ─────────────────────────────────────────── */
  const snapshot = () => {
    const slide = activeSlide();
    // baked 마커는 slide 요소 자체의 속성이라 innerHTML 에 안 담김 — 따로 기록해야
    // bake 이전 스냅샷으로 undo 했을 때 마커도 함께 되돌아간다.
    return slide ? { id: slideKey(slide), html: slide.innerHTML, baked: slide.dataset.deBaked !== undefined } : null;
  };
  const slideKey = (slide) => slide.id || slide.getAttribute('data-deck-slide') || '';
  const pushUndo = () => {
    const snap = snapshot();
    if (!snap) return;
    S.undo.push(snap);
    if (S.undo.length > HISTORY_MAX) S.undo.shift();
    S.redo.length = 0;
    markDirty();
  };
  const restore = (fromStack, toStack) => {
    const snap = fromStack.pop();
    if (!snap) return;
    const slide = activeSlide();
    if (!slide || slideKey(slide) !== snap.id) return;
    toStack.push({ id: snap.id, html: slide.innerHTML, baked: slide.dataset.deBaked !== undefined });
    deselect();
    slide.innerHTML = snap.html;
    if (snap.baked) slide.dataset.deBaked = ''; else delete slide.dataset.deBaked;
    markDirty();
  };
  const undo = () => restore(S.undo, S.redo);
  const redo = () => restore(S.redo, S.undo);

  const markDirty = () => { S.dirty = true; updateBar(); };

  /* ══ 오버레이 레이어 (핸들·툴바) — 문서 레벨 ══════════════ */
  let overlay, box, handles = {}, rotateHandle, toolbar, editBtn, statusBar, guideLayer;
  const HANDLE_DIRS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

  const injectStyle = () => {
    const css = `
    .de-overlay{position:fixed;inset:0;pointer-events:none;z-index:2147483600;}
    .de-box{position:fixed;border:1.5px solid #2A38B0;pointer-events:none;box-sizing:border-box;display:none;}
    .de-h{position:fixed;width:11px;height:11px;background:#fff;border:2px solid #2A38B0;border-radius:50%;pointer-events:auto;box-sizing:border-box;margin:-6px 0 0 -6px;display:none;}
    .de-h.corner{cursor:nwse-resize}
    .de-rot{position:fixed;width:14px;height:14px;background:#fff;border:2px solid #2A38B0;border-radius:50%;pointer-events:auto;margin:-7px 0 0 -7px;display:none;cursor:grab}
    .de-guide{position:fixed;background:#EF4444;z-index:2147483650;pointer-events:none;}
    .de-toolbar{position:fixed;top:60px;left:50%;transform:translateX(-50%);display:none;
      align-items:center;gap:10px;flex-wrap:wrap;padding:8px 14px;background:#151b3d;
      border:1px solid #2b3358;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.4);
      z-index:2147483700;pointer-events:auto;font:500 12.5px Pretendard,system-ui,sans-serif;color:#aab2d8;}
    .de-toolbar.on{display:flex}
    .de-toolbar .lbl{color:#7c86b0;font-size:11px}
    .de-toolbar .div{width:1px;height:18px;background:#2b3358}
    .de-sw{width:19px;height:19px;border-radius:5px;border:1px solid rgba(255,255,255,.25);cursor:pointer}
    .de-sw.none{position:relative;background:#232a52}
    .de-sw.none::after{content:"";position:absolute;inset:3px;border-top:2px solid #ff6b6b;transform:rotate(45deg)}
    .de-btn{background:#232a52;border:1px solid #333c6b;color:#dfe4f7;padding:5px 10px;border-radius:7px;cursor:pointer;font:600 12.5px Pretendard,system-ui;}
    .de-btn:hover{background:#2c3568}
    .de-btn.danger{color:#ffb4b4;border-color:#5a2b3a}
    .de-editbtn{position:fixed;right:18px;bottom:18px;z-index:2147483700;pointer-events:auto;
      background:#3242C6;color:#fff;border:none;padding:10px 16px;border-radius:999px;cursor:pointer;
      font:700 13px Pretendard,system-ui;box-shadow:0 6px 20px rgba(50,66,198,.4);}
    .de-editbtn.on{background:#EF4444}
    .de-status{position:fixed;left:18px;bottom:18px;z-index:2147483700;pointer-events:none;
      display:none;padding:7px 12px;background:#151b3d;border:1px solid #2b3358;border-radius:8px;
      font:600 12px Pretendard,system-ui;color:#9aa3c7;}
    .de-status.on{display:block}
    section[data-de-editing]{cursor:default}
    .de-editing-el{outline:1.5px dashed #2A38B0;outline-offset:2px}
    /* 편집 확정 전 Cmd+P — 점선 아웃라인이 PDF 에 찍히지 않게 (beforeprint 정리의 보험) */
    @media print{ .de-editing-el{ outline:none !important; } }
    `;
    const st = document.createElement('style');
    st.id = 'de-style';
    st.className = 'export-hidden no-print';
    st.textContent = css;
    document.head.appendChild(st);
  };

  const buildChrome = () => {
    overlay = el('div', 'de-overlay export-hidden no-print');
    guideLayer = el('div', 'de-overlay export-hidden no-print');
    box = el('div', 'de-box');
    overlay.appendChild(box);
    HANDLE_DIRS.forEach((d) => {
      const h = el('div', 'de-h ' + (d.length === 2 ? 'corner' : ''));
      h.dataset.dir = d;
      handles[d] = h;
      overlay.appendChild(h);
    });
    rotateHandle = el('div', 'de-rot');
    overlay.appendChild(rotateHandle);

    // 툴바
    toolbar = el('div', 'de-toolbar export-hidden no-print');
    toolbar.innerHTML =
      '<span class="lbl">글자</span><span data-tc style="display:flex;gap:5px"></span>' +
      '<span class="div"></span><span class="lbl">배경</span><span data-bc style="display:flex;gap:5px"></span>' +
      '<span class="div"></span><span class="lbl">크기</span>' +
      '<button class="de-btn" data-font="-1">A−</button><button class="de-btn" data-font="1">A＋</button>' +
      '<span class="div"></span>' +
      '<button class="de-btn" data-act="image">이미지</button>' +
      '<button class="de-btn" data-act="add">＋텍스트</button>' +
      '<button class="de-btn danger" data-act="del">삭제</button>';

    // 편집 토글 + 상태바
    editBtn = el('button', 'de-editbtn export-hidden no-print');
    editBtn.textContent = '편집 (E)';
    statusBar = el('div', 'de-status export-hidden no-print');

    document.body.append(overlay, guideLayer, toolbar, editBtn, statusBar);

    // 스와치
    const tc = toolbar.querySelector('[data-tc]'), bc = toolbar.querySelector('[data-bc]');
    TEXT_COLORS.forEach(([name, c]) => tc.appendChild(swatch(name, c, applyTextColor)));
    BG_COLORS.forEach(([name, c]) => bc.appendChild(swatch(name, c, applyBgColor)));

    // 툴바 버튼
    toolbar.querySelectorAll('[data-font]').forEach((b) =>
      b.addEventListener('click', () => stepFont(+b.dataset.font)));
    toolbar.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'del') deleteSel();
      else if (b.dataset.act === 'add') addText();
      else if (b.dataset.act === 'image') pickImage();
    });

    editBtn.addEventListener('click', () => setMode(!S.on));
  };

  const swatch = (title, color, fn) => {
    const s = el('div', 'de-sw' + (color === null ? ' none' : ''));
    s.title = title;
    if (color) s.style.background = color;
    s.addEventListener('click', () => S.sel && fn(color));
    return s;
  };
  const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };

  /* ── 선택 & 오버레이 위치 갱신 ────────────────────────── */
  const select = (target) => {
    if (S.sel === target) return;
    deselect();
    S.sel = target;
    positionOverlay();
  };
  const deselect = () => {
    if (S.sel && S.sel.getAttribute('contenteditable') === 'true') commitText(S.sel);
    S.sel = null;
    hideOverlay();
  };
  const hideOverlay = () => {
    box.style.display = 'none';
    Object.values(handles).forEach((h) => h.style.display = 'none');
    rotateHandle.style.display = 'none';
    toolbar.classList.remove('on');
  };
  const positionOverlay = () => {
    const t = S.sel;
    if (!t || !S.on) { hideOverlay(); return; }
    const r = t.getBoundingClientRect();
    box.style.display = 'block';
    box.style.left = r.left + 'px'; box.style.top = r.top + 'px';
    box.style.width = r.width + 'px'; box.style.height = r.height + 'px';
    const pts = {
      nw: [r.left, r.top], n: [r.left + r.width / 2, r.top], ne: [r.right, r.top],
      e: [r.right, r.top + r.height / 2], se: [r.right, r.bottom],
      s: [r.left + r.width / 2, r.bottom], sw: [r.left, r.bottom],
      w: [r.left, r.top + r.height / 2],
    };
    HANDLE_DIRS.forEach((d) => {
      const h = handles[d];
      h.style.display = 'block';
      h.style.left = pts[d][0] + 'px'; h.style.top = pts[d][1] + 'px';
    });
    rotateHandle.style.display = 'block';
    rotateHandle.style.left = (r.left + r.width / 2) + 'px';
    // 위쪽에 툴바가 가리면(요소가 상단) 아래쪽에 배치
    const tb = toolbar.getBoundingClientRect();
    const above = r.top - 22;
    rotateHandle.style.top = (above < tb.bottom + 6 ? r.bottom + 22 : above) + 'px';
    toolbar.classList.add('on');
  };

  /* ── 색 / 폰트 ───────────────────────────────────────── */
  const applyTextColor = (c) => { pushUndo(); S.sel.style.color = c; };
  const applyBgColor = (c) => {
    pushUndo();
    S.sel.style.background = c || 'transparent';
    if (c) {
      if (!S.sel.style.padding) S.sel.style.padding = '14px 16px';
      S.sel.style.borderRadius = S.sel.style.borderRadius || '12px';
      if (['#1B2456', '#3242C6', '#0EA5E9'].includes(c)) S.sel.style.color = '#fff';
    }
  };
  const nearestStep = (px) => {
    let best = TYPE_SCALE[0], bd = Infinity;
    for (const s of TYPE_SCALE) { const d = Math.abs(s - px); if (d < bd) { bd = d; best = s; } }
    return best;
  };
  const stepFont = (dir) => {
    if (!S.sel) return;
    pushUndo();
    const cur = parseFloat(getComputedStyle(S.sel).fontSize);
    let i = TYPE_SCALE.indexOf(nearestStep(cur));
    i = Math.max(0, Math.min(TYPE_SCALE.length - 1, i + dir));
    S.sel.style.fontSize = TYPE_SCALE[i] + 'px';
    positionOverlay();
  };

  /* ── 추가 / 삭제 ─────────────────────────────────────── */
  const addText = () => {
    const slide = activeSlide(); if (!slide) return;
    pushUndo();
    bakeSlide(slide);
    const t = el('div');
    t.dataset.deBaked = '';
    t.style.cssText = 'position:absolute;left:80px;top:80px;width:320px;font-size:16px;line-height:1.5;color:#222A35;';
    t.textContent = '새 텍스트 — 더블클릭해 수정';
    slide.appendChild(t);
    select(t);
  };
  const deleteSel = () => {
    if (!S.sel) return;
    pushUndo();
    const t = S.sel; deselect(); t.remove();
  };

  /* ── 텍스트 편집 ─────────────────────────────────────── */
  const startEdit = (t) => {
    select(t);
    pushUndo();
    t.setAttribute('contenteditable', 'true');
    t.classList.add('de-editing-el');
    t.focus();
    const r = document.createRange(); r.selectNodeContents(t);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
  };
  const commitText = (t) => {
    t.removeAttribute('contenteditable');
    t.classList.remove('de-editing-el');
  };
  // 평문 붙여넣기
  const onPaste = (e) => {
    if (!S.sel || S.sel.getAttribute('contenteditable') !== 'true') return;
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  };

  /* ── 이미지 ──────────────────────────────────────────── */
  const pickImage = () => {
    if (!S.sel) return;
    const inp = el('input'); inp.type = 'file'; inp.accept = 'image/*';
    inp.addEventListener('change', async () => {
      const f = inp.files[0]; if (!f) return;
      pushUndo();
      let src;
      if (S.dirHandle) {
        try {
          const assets = await S.dirHandle.getDirectoryHandle('assets', { create: true });
          const fh = await assets.getFileHandle(f.name, { create: true });
          const w = await fh.createWritable(); await w.write(f); await w.close();
          src = 'assets/' + f.name;
        } catch (_) { src = await asDataURL(f); }
      } else {
        src = await asDataURL(f);
      }
      insertImage(S.sel, src);
    });
    inp.click();
  };
  const insertImage = (host, src) => {
    const img = el('img');
    img.src = src;
    img.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;';
    host.innerHTML = ''; host.appendChild(img);
    positionOverlay();
  };
  const asDataURL = (f) => new Promise((res) => {
    const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f);
  });

  /* ══ 포인터: 이동 / 리사이즈 / 회전 ══════════════════════ */
  const getAngle = (el) => {
    const m = (el.style.transform || '').match(/rotate\(([-\d.]+)deg\)/);
    return m ? parseFloat(m[1]) : 0;
  };
  const setAngle = (el, deg) => {
    const other = (el.style.transform || '').replace(/rotate\([-\d.]+deg\)/, '').trim();
    el.style.transform = (other + ' rotate(' + round(deg) + 'deg)').trim();
  };

  const onDown = (e) => {
    if (!S.on) return;
    const h = e.target.closest('.de-h');
    const rot = e.target.closest('.de-rot');
    const slide = activeSlide();
    if (!slide) return;

    if (rot && S.sel) {
      e.preventDefault();
      pushUndo();               // bake 전 상태 스냅샷 — undo 시 flow 복원
      bakeSlide(slide);         // absolute 좌표 위에서 회전 (이후 bake 가 회전을 지우는 일 방지)
      const r = S.sel.getBoundingClientRect();
      S.drag = { mode: 'rotate', cx: r.left + r.width / 2, cy: r.top + r.height / 2, start: getAngle(S.sel) };
      return;
    }
    if (h && S.sel) {
      e.preventDefault();
      pushUndo();               // bake 전 상태 스냅샷 (bake 후에 찍으면 undo 가 중간 상태로 복원됨)
      bakeSlide(slide);
      const st = S.sel.style;
      S.drag = {
        mode: 'resize', dir: h.dataset.dir, slide,
        sx: e.clientX, sy: e.clientY, s: scaleOf(slide),
        L: parseFloat(st.left) || 0, T: parseFloat(st.top) || 0,
        W: S.sel.offsetWidth, H: S.sel.offsetHeight,
        ang: getAngle(S.sel),
      };
      return;
    }
    // 슬라이드 내부 클릭 → 선택 or 이동
    const inSlide = e.target.closest && slide.contains(e.target);
    if (inSlide) {
      if (S.sel && S.sel.getAttribute('contenteditable') === 'true' && S.sel.contains(e.target)) return; // 편집 중 커서 자유
      const target = pickTarget(slide, e.target);
      if (!target) { deselect(); return; }
      select(target);
      e.preventDefault();
      S.drag = {
        mode: 'move', slide, s: scaleOf(slide),
        sx: e.clientX, sy: e.clientY, willBake: target.dataset.deBaked === undefined,
        target,
      };
    } else if (!e.target.closest('.de-toolbar') && !e.target.closest('.de-editbtn')) {
      deselect();
    }
  };

  const onMove = (e) => {
    const d = S.drag; if (!d) return;
    if (d.mode === 'rotate') {
      let deg = Math.atan2(e.clientY - d.cy, e.clientX - d.cx) * 180 / Math.PI + 90;
      if (e.shiftKey) deg = Math.round(deg / 15) * 15;
      setAngle(S.sel, deg);
      positionOverlay();
      return;
    }
    if (d.mode === 'move') {
      // 실제로 움직이기 시작한 첫 프레임에만 기록 — 단순 클릭 선택은 undo 스택을 오염시키지 않음.
      // pushUndo 가 bake 보다 먼저라 undo 시 flow 상태로 복원되고, dirty 도 여기서 세팅된다.
      if (!d.pushed) { d.pushed = true; pushUndo(); }
      if (d.willBake) { bakeSlide(d.slide); d.willBake = false; }
      if (d.L0 === undefined) { d.L0 = parseFloat(S.sel.style.left) || 0; d.T0 = parseFloat(S.sel.style.top) || 0; }
      const dx = (e.clientX - d.sx) / d.s, dy = (e.clientY - d.sy) / d.s;
      const nl = d.L0 + dx, nt = d.T0 + dy;
      const snapped = applySnap(d.slide, S.sel, nl, nt);
      S.sel.style.left = round(snapped.x) + 'px';
      S.sel.style.top = round(snapped.y) + 'px';
      positionOverlay();
      return;
    }
    if (d.mode === 'resize') {
      const dx = (e.clientX - d.sx) / d.s, dy = (e.clientY - d.sy) / d.s;
      const r = resizeRotated(d, dx, dy);
      const st = S.sel.style;
      st.width = round(Math.max(20, r.W)) + 'px';
      st.left = round(r.L) + 'px'; st.top = round(r.T) + 'px';
      if (d.dir.length === 2 || d.dir === 'n' || d.dir === 's') st.height = round(Math.max(20, r.H)) + 'px';
      positionOverlay();
    }
  };

  const onUp = () => {
    if (S.drag) { clearGuides(); S.drag = null; }
  };

  /* 회전 고려 리사이즈 수학 (로컬 축 투영 + 중심 고정) */
  const resizeRotated = (d, dx, dy) => {
    const rad = d.ang * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
    // 스크린 델타 → 로컬 축
    const lx = dx * cos + dy * sin;
    const ly = -dx * sin + dy * cos;
    let W = d.W, H = d.H, dL = 0, dT = 0;
    const dir = d.dir;
    if (dir.includes('e')) W = d.W + lx;
    if (dir.includes('w')) { W = d.W - lx; dL = lx; }
    if (dir.includes('s')) H = d.H + ly;
    if (dir.includes('n')) { H = d.H - ly; dT = ly; }
    W = Math.max(20, W); H = Math.max(20, H);
    if (d.ang === 0) {
      return { W, H, L: d.L + (dir.includes('w') ? d.W - W : 0), T: d.T + (dir.includes('n') ? d.H - H : 0) };
    }
    // 회전 시: 고정 모서리를 유지하도록 중심 보정 (로컬 이동을 스크린으로 역변환)
    const mx = dL * cos - dT * sin; // (근사) 좌상단 이동을 스크린으로
    const my = dL * sin + dT * cos;
    return { W, H, L: d.L + (dir.includes('w') ? mx : 0), T: d.T + (dir.includes('n') ? my : 0) };
  };

  /* ── 스냅/정렬 가이드 ────────────────────────────────── */
  const applySnap = (slide, moving, x, y) => {
    clearGuides();
    const w = moving.offsetWidth, h = moving.offsetHeight;
    const targets = { vx: [0, AUTHOR_W / 2, AUTHOR_W], hy: [0, AUTHOR_H / 2, AUTHOR_H] };
    unitsOf(slide).forEach((u) => {
      if (u === moving) return;
      if (u.dataset.deBaked === undefined) return;
      const ul = parseFloat(u.style.left) || 0, ut = parseFloat(u.style.top) || 0;
      targets.vx.push(ul, ul + u.offsetWidth / 2, ul + u.offsetWidth);
      targets.hy.push(ut, ut + u.offsetHeight / 2, ut + u.offsetHeight);
    });
    const edgesX = [x, x + w / 2, x + w], edgesY = [y, y + h / 2, y + h];
    let nx = x, ny = y;
    for (const ex of edgesX) for (const tx of targets.vx)
      if (Math.abs(ex - tx) <= SNAP) { nx += (tx - ex); drawGuide(slide, 'v', tx); break; }
    for (const ey of edgesY) for (const ty of targets.hy)
      if (Math.abs(ey - ty) <= SNAP) { ny += (ty - ey); drawGuide(slide, 'h', ty); break; }
    return { x: nx, y: ny };
  };
  const drawGuide = (slide, dir, at) => {
    const sr = slide.getBoundingClientRect(), s = scaleOf(slide);
    const g = el('div', 'de-guide');
    if (dir === 'v') { g.style.left = (sr.left + at * s) + 'px'; g.style.top = sr.top + 'px'; g.style.width = '1px'; g.style.height = sr.height + 'px'; }
    else { g.style.top = (sr.top + at * s) + 'px'; g.style.left = sr.left + 'px'; g.style.height = '1px'; g.style.width = sr.width + 'px'; }
    guideLayer.appendChild(g);
  };
  const clearGuides = () => { if (guideLayer) guideLayer.innerHTML = ''; };

  /* ── 키보드 ──────────────────────────────────────────── */
  const onKey = (e) => {
    const typing = S.sel && S.sel.getAttribute('contenteditable') === 'true';
    // E 토글 (타이핑 중 아닐 때)
    if (!typing && (e.key === 'e' || e.key === 'E') && !e.metaKey && !e.ctrlKey
        && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) {
      setMode(!S.on); e.preventDefault(); return;
    }
    if (!S.on) return;
    // undo/redo
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault(); e.shiftKey ? redo() : undo(); return;
    }
    // save
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault(); save(); return;
    }
    if (typing) { if (e.key === 'Escape') { commitText(S.sel); } return; }
    if (!S.sel) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSel(); return; }
    // 화살표 nudge (선택 시 슬라이드 이동 가로채기)
    if (e.key.startsWith('Arrow')) {
      e.preventDefault(); e.stopPropagation();
      const slide = activeSlide(); bakeSlide(slide);
      const st = S.sel.style;
      const amt = e.shiftKey ? NUDGE_BIG : NUDGE;
      if (e.key === 'ArrowLeft') st.left = (parseFloat(st.left) || 0) - amt + 'px';
      if (e.key === 'ArrowRight') st.left = (parseFloat(st.left) || 0) + amt + 'px';
      if (e.key === 'ArrowUp') st.top = (parseFloat(st.top) || 0) - amt + 'px';
      if (e.key === 'ArrowDown') st.top = (parseFloat(st.top) || 0) + amt + 'px';
      markDirty(); positionOverlay();
    }
  };

  /* ── 저장 / 직렬화 ───────────────────────────────────── */
  const serializeDeck = () => {
    const clone = document.documentElement.cloneNode(true);
    // 편집기 주입물 제거
    clone.querySelectorAll('.de-overlay,.de-toolbar,.de-editbtn,.de-status,#de-style,.de-guide')
      .forEach((n) => n.remove());
    // 전이 속성/클래스 제거
    clone.querySelectorAll('[data-de-baked]').forEach((n) => n.removeAttribute('data-de-baked'));
    clone.querySelectorAll('[contenteditable]').forEach((n) => n.removeAttribute('contenteditable'));
    clone.querySelectorAll('[data-de-editing]').forEach((n) => n.removeAttribute('data-de-editing'));
    clone.querySelectorAll('.de-editing-el').forEach((n) => n.classList.remove('de-editing-el'));
    return '<!DOCTYPE html>\n' + clone.outerHTML;
  };

  const save = async () => {
    const html = serializeDeck();
    const fname = currentFileName();
    if (window.showSaveFilePicker || S.fileHandle) {
      try {
        if (!S.fileHandle) {
          S.fileHandle = await window.showSaveFilePicker({
            suggestedName: fname,
            types: [{ description: 'HTML', accept: { 'text/html': ['.html'] } }],
          });
        }
        const w = await S.fileHandle.createWritable();
        await w.write(html); await w.close();
        S.dirty = false; toast('저장됨 ✓'); updateBar();
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }
    // 폴백 다운로드
    const a = el('a');
    a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    a.download = fname; a.click();
    S.dirty = false; toast('다운로드됨 (기존 파일에 덮어쓰기)'); updateBar();
  };
  // 현재 열린 파일명 (deck.html 하드코딩 대신) — 어느 덱이든 자기 파일로 저장
  const currentFileName = () => {
    const base = decodeURIComponent((location.pathname || '').split('/').pop() || '');
    return /\.html?$/i.test(base) ? base : 'deck.html';
  };
  const connectDir = async () => {
    if (!window.showDirectoryPicker) return;
    try {
      S.dirHandle = await window.showDirectoryPicker();
      S.fileHandle = await S.dirHandle.getFileHandle(currentFileName(), { create: false });
      toast('폴더 연결됨 — 저장/이미지 준비 완료');
    } catch (_) {}
  };

  let toastT;
  const toast = (msg) => {
    statusBar.textContent = msg; statusBar.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(updateBar, 1800);
  };
  const updateBar = () => {
    if (!S.on) { statusBar.classList.remove('on'); return; }
    statusBar.textContent = '편집 모드 · ' + (S.dirty ? '● 미저장 (Cmd+S)' : '저장됨')
      + (S.dirHandle ? '' : ' · 저장 시 폴더 연결');
    statusBar.classList.add('on');
  };

  /* ── 모드 토글 ───────────────────────────────────────── */
  const setMode = (on) => {
    S.on = on;
    editBtn.classList.toggle('on', on);
    editBtn.textContent = on ? '편집 종료 (E)' : '편집 (E)';
    const slide = activeSlide();
    document.querySelectorAll('deck-stage > section').forEach((s) => {
      if (on) s.setAttribute('data-de-editing', ''); else s.removeAttribute('data-de-editing');
    });
    if (!on) { deselect(); }
    updateBar();
    positionOverlay();
  };

  /* ── 초기화 ──────────────────────────────────────────── */
  const init = () => {
    if (!stage()) { requestAnimationFrame(init); return; }
    injectStyle();
    buildChrome();
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('dblclick', (e) => {
      if (!S.on) return;
      const slide = activeSlide(); if (!slide || !slide.contains(e.target)) return;
      const t = pickTarget(slide, e.target);
      if (t && t.tagName !== 'IMG') startEdit(t);
    }, true);
    document.addEventListener('paste', onPaste, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', positionOverlay, true);
    window.addEventListener('resize', positionOverlay);
    window.addEventListener('beforeunload', (e) => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });
    // 슬라이드 전환 시 재스코프
    stage().addEventListener('slidechange', () => { deselect(); });
    // 발표 모드(F 전체화면) — deck.html 이 fullscreenchange 때 쏘는 presenting 신호 구독
    // + fullscreenchange 폴백. 편집 UI 를 전부 숨겨 "클린 프레젠테이션" 계약 유지.
    const setPresenting = (on) => {
      if (on && S.on) setMode(false);       // 편집 중이었으면 종료 (툴바·핸들·상태바 정리)
      editBtn.style.display = on ? 'none' : '';
    };
    window.addEventListener('message', (e) => {
      const d = e.data;
      if (d && typeof d === 'object' && '__omelette_presenting' in d) setPresenting(!!d.__omelette_presenting);
    });
    document.addEventListener('fullscreenchange', () => setPresenting(!!document.fullscreenElement));
    // 인쇄 직전 편집 상태 정리 — 미확정 텍스트 커밋 + 선택 해제 (점선 아웃라인 방지)
    window.addEventListener('beforeprint', () => deselect());
    // 첫 저장 시 폴더 연결 유도
    editBtn.addEventListener('contextmenu', (e) => { e.preventDefault(); connectDir(); });

    // 테스트 훅
    window.__deckEditor = {
      S, setMode, select, deselect, activeSlide, bakeSlide, collectUnits, unitsOf, isLeaf,
      bakeUnits: unitsOf,
      serializeDeck, undo, redo, pickTarget, toAuthored, scaleOf, connectDir, save,
      startEdit, commitText, addText, deleteSel, stepFont, applyTextColor, applyBgColor,
      insertImage, positionOverlay,
    };
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
