#!/usr/bin/env python3
# Copyright (c) 2026 SafeAI. All rights reserved.
# See COPYRIGHT.md — 복제·수정·재배포는 허락 없이 할 수 없습니다.
"""Existing PPTX → outline draft JSON (for the 'improve existing deck' mode).

usage: python3 extract_pptx.py <in.pptx> [out.json] [--images <dir>]

- Reads every slide's shapes, groups text by position (top→bottom, left→right).
- Guesses: cover (slide 1), agenda (title contains 목차/Contents/Agenda), closing (감사/Thank),
  section from a leading "N." in the slide title, lead message from the widest text box near the top.
- Emits an outline.json skeleton with one `bullets` block per slide holding the remaining text,
  plus `_raw` per slide (all text boxes with geometry) so the agent can re-block it by hand.
- Tables become `table` blocks. Pictures are exported to --images dir and become `image` blocks.
The result is a DRAFT: the agent must rewrite titles/leads and choose block types (see SKILL.md).
"""
import json
import re
import sys
from pathlib import Path

from pptx import Presentation
from pptx.util import Emu

EMU_PER_PX = 914400 / 96  # 1 px @ 96dpi


def px(v):
    return round(v / EMU_PER_PX)


def shape_text(sh):
    if not sh.has_text_frame:
        return ""
    return "\n".join(p.text.strip() for p in sh.text_frame.paragraphs if p.text.strip())


def walk(shapes):
    """flatten groups"""
    for sh in shapes:
        if sh.shape_type == 6:  # GROUP
            yield from walk(sh.shapes)
        else:
            yield sh


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(1)
    src = Path(args[0])
    out = Path(args[1]) if len(args) > 1 and not args[1].startswith("--") else src.with_suffix(".outline.json")
    img_dir = None
    if "--images" in args:
        img_dir = Path(args[args.index("--images") + 1])
        img_dir.mkdir(parents=True, exist_ok=True)

    prs = Presentation(str(src))
    W, H = prs.slide_width, prs.slide_height
    sx, sy = 1280 / px(W), 720 / px(H)  # normalise to 1280x720

    meta = {"type": "?", "density": "dense", "title": "", "subtitle": "", "company": "", "presenter": "", "date": "",
            "brand": {"primary": "#3242C6"}, "source": src.name}
    sections, appendix = [], []
    closing = {"message": "감사합니다"}
    cur = None
    slides_dump = []

    for idx, slide in enumerate(prs.slides, 1):
        boxes, tables, pics = [], [], []
        for sh in walk(slide.shapes):
            geo = {"x": round(px(sh.left) * sx), "y": round(px(sh.top) * sy), "w": round(px(sh.width) * sx), "h": round(px(sh.height) * sy)}
            if getattr(sh, "has_table", False) and sh.has_table:
                rows = [[c.text.strip().replace("\n", " ") for c in r.cells] for r in sh.table.rows]
                tables.append({"type": "table", "headers": rows[0], "rows": rows[1:], "_geo": geo})
            elif sh.shape_type == 13 and img_dir is not None:  # PICTURE
                ext = sh.image.ext
                name = f"{idx:02d}_img_{len(pics)+1}.{ext}"
                (img_dir / name).write_bytes(sh.image.blob)
                pics.append({"type": "image", "src": f"assets/{name}", "side": "full", "_geo": geo})
            else:
                t = shape_text(sh)
                if t:
                    size = None
                    for p in sh.text_frame.paragraphs:
                        for r in p.runs:
                            if r.font.size:
                                size = max(size or 0, r.font.size.pt)
                    boxes.append({"text": t, "size": size, **geo})
        boxes.sort(key=lambda b: (b["y"] // 24, b["x"]))
        slides_dump.append({"slide": idx, "boxes": boxes, "tables": len(tables), "pictures": len(pics)})

        if not boxes and not tables and not pics:
            continue
        # title = top-most box with the largest font among the top 30% of the slide
        # header-style title: top-most short text box in the top band; else largest font near the top
        band = [b for b in boxes if b["y"] < 110 and len(b["text"]) <= 70 and b["w"] < 1000]
        if band:
            title_box = min(band, key=lambda b: (b["y"], b["x"]))
        else:
            top = [b for b in boxes if b["y"] < 220] or boxes
            title_box = max(top, key=lambda b: ((b["size"] or 0), -b["y"]))
        title = title_box["text"].split("\n")[0]
        rest = [b for b in boxes if b is not title_box]
        # lead = widest box just below the title
        lead = ""
        below = [b for b in rest if b["y"] > title_box["y"] and b["w"] > 600]
        if below:
            lb = min(below, key=lambda b: b["y"])
            if len(lb["text"]) > 30:
                lead = lb["text"].replace("\n", " ")
                rest = [b for b in rest if b is not lb]

        low = title.lower()
        if idx == 1:
            meta["title"] = title
            metas = [b["text"] for b in rest]
            meta["subtitle"] = metas[0] if metas else ""
            for m in metas:
                if "기업" in m or "회사" in m:
                    meta["company"] = m.split(":")[-1].strip()
                if "발표자" in m:
                    meta["presenter"] = m.split(":")[-1].strip()
                if re.search(r"20\d\d", m):
                    meta["date"] = m
            continue
        if re.search(r"목\s*차|contents|agenda", low):
            continue  # agenda is regenerated from sections
        if re.search(r"감사|thank|q\s*&\s*a", low) and len(rest) <= 3:
            closing = {"message": title, "sub": rest[0]["text"] if rest else ""}
            continue

        blocks = []
        blocks += tables
        blocks += pics
        items = []
        for b in rest:
            for line in b["text"].split("\n"):
                line = line.strip()
                if line:
                    items.append(line)
        if items:
            blocks.insert(0, {"type": "bullets", "items": items})
        entry = {"title": title, "lead": lead, "blocks": blocks, "_raw": boxes}

        if low.startswith("appendix") or "부록" in low:
            entry["title"] = re.sub(r"^(appendix|부록)\s*[–\-:]?\s*", "", title, flags=re.I)
            appendix.append(entry)
            continue
        m = re.match(r"^\s*(\d+)\s*[.)]\s*([^–\-]+?)\s*(?:[–\-]\s*(.+))?$", title)
        if m:
            no, sec_title, sub = int(m.group(1)), m.group(2).strip(), (m.group(3) or "").strip()
            if cur is None or cur["no"] != no:
                cur = {"no": no, "title": sec_title, "slides": []}
                sections.append(cur)
            entry["title"] = sub or sec_title
            cur["slides"].append(entry)
        else:
            if cur is None:
                cur = {"no": 1, "title": title, "slides": []}
                sections.append(cur)
            cur["slides"].append(entry)

    outline = {"meta": meta, "sections": sections, "closing": closing, "appendix": appendix}
    out.write_text(json.dumps(outline, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"outline draft → {out}")
    print(f"slides: {len(prs.slides)}  sections: {len(sections)}  appendix: {len(appendix)}  size: {px(W)}x{px(H)}")
    for s in sections:
        print(f"  {s['no']}. {s['title']}  ({len(s['slides'])} slides)")
        for sl in s["slides"]:
            print(f"     - {sl['title'][:50]}  [{', '.join(b['type'] for b in sl['blocks'])}]")
    print("NOTE: this is a draft — rewrite titles/leads and re-block `bullets` into columns/cards/process/table per SKILL.md.")


if __name__ == "__main__":
    main()
