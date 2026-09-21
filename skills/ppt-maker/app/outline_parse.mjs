// Copyright (c) 2026 SafeAI. All rights reserved.
// See COPYRIGHT.md — 복제·수정·재배포는 허락 없이 할 수 없습니다.
// 모델이 돌려준 텍스트 → outline 객체.
// 코드펜스·앞뒤 설명을 걷어내고, 흔한 JSON 실수(꼬리 쉼표 등)를 보정하고,
// 응답이 중간에 끊긴 경우에는 마지막으로 완성된 장표까지만 살려서 복구한다.

/** 문자열을 훑으며 따옴표/이스케이프를 고려해 괄호 스택을 추적한다. */
function scan(str) {
  const stack = [];
  let inStr = false, esc = false, lastClose = -1, lastComma = -1;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '{' || c === '[') stack.push(c === '{' ? '}' : ']');
    else if (c === '}' || c === ']') { stack.pop(); lastClose = i; }
    else if (c === ',') lastComma = i;
  }
  return { stack, inStr, lastClose, lastComma };
}

/** 꼬리 쉼표 제거: {"a":1,} / [1,2,] → 정상 */
function dropTrailingCommas(s) {
  return s.replace(/,(\s*[}\]])/g, '$1');
}

/** 잘린 JSON 을 마지막으로 닫힌 괄호까지 자르고 남은 괄호를 닫아 되살린다. */
function salvage(str) {
  const { lastClose } = scan(str);
  if (lastClose < 0) return null;
  let cut = str.slice(0, lastClose + 1).replace(/[\s,]+$/, '');
  const { stack, inStr } = scan(cut);
  if (inStr) return null;
  while (stack.length) cut += stack.pop();
  return dropTrailingCommas(cut);
}

/** 살려낸 구성에서 비어 있는(잘린) 장표·섹션을 떼어낸다. */
function prune(outline) {
  const okSlide = sl => sl && (sl.title || sl.headline) && Array.isArray(sl.blocks) && sl.blocks.length > 0;
  if (Array.isArray(outline.sections)) {
    outline.sections = outline.sections
      .map(sec => (sec ? { ...sec, slides: (sec.slides || []).filter(okSlide) } : sec))
      .filter(sec => sec && sec.slides.length);
    outline.sections.forEach((s, i) => { s.no = i + 1; });
  }
  if (Array.isArray(outline.appendix)) outline.appendix = outline.appendix.filter(okSlide);
}

/**
 * @returns {{outline: object, note: string|null}} note 는 사용자에게 보여줄 한글 경고(복구했을 때만).
 * @throws {Error} 되살릴 수 없을 때. message 는 한글 설명.
 */
export function parseOutlineText(raw) {
  const t = String(raw || '').trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '');
  const s = t.indexOf('{');
  if (s < 0) throw new Error('응답에 JSON 이 없습니다. 원문을 조금 줄여서 다시 시도해 보세요.');
  const e = t.lastIndexOf('}');
  const body = e > s ? t.slice(s, e + 1) : t.slice(s);

  // 1) 그대로  2) 꼬리 쉼표만 보정
  for (const [cand, note] of [[body, null], [dropTrailingCommas(body), null]]) {
    try {
      const o = JSON.parse(cand);
      if (o && o.sections) return { outline: o, note };
    } catch { /* 다음 후보 */ }
  }
  // 3) 잘린 응답 복구
  const fixed = salvage(t.slice(s));
  if (fixed) {
    try {
      const o = JSON.parse(fixed);
      if (o && Array.isArray(o.sections)) {
        prune(o);
        const n = o.sections.reduce((a, sec) => a + (sec.slides || []).length, 0);
        if (n > 0) {
          if (!o.closing) o.closing = { message: '감사합니다' };
          return { outline: o, note: `응답이 중간에 끊겨 마지막 장표 일부를 잘라내고 ${n}장으로 복구했습니다. 내용을 확인하고 필요하면 다시 만들어 주세요.` };
        }
      }
    } catch { /* 복구 실패 */ }
  }
  // 4) 실패: 어디서 깨졌는지 알려준다
  let where = '';
  try { JSON.parse(body); } catch (err) {
    const m = /position (\d+)/.exec(err.message);
    if (m) {
      const p = Number(m[1]);
      where = `\n문제 위치 부근: …${body.slice(Math.max(0, p - 80), p + 80).replace(/\s+/g, ' ')}…`;
    }
  }
  const cut = scan(body).stack.length > 0;
  throw new Error((cut ? '응답이 중간에 끊겼습니다.' : '응답의 JSON 형식이 잘못됐습니다.') + ' 원문을 조금 줄이거나 다시 시도해 보세요.' + where);
}
