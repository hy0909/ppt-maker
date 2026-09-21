#!/usr/bin/env python3
# Copyright (c) 2026 SafeAI. All rights reserved.
# See COPYRIGHT.md — 복제·수정·재배포는 허락 없이 할 수 없습니다.
"""QA for a generated PPTX: OOXML validation + structural check + visual render.

usage: python3 verify_pptx.py <deck.pptx> [--render <png_dir>] [--dpi 60]

Validations (always):
  1. OOXML integrity: package structure, numeric attributes, relationships
  2. Structural: slide size 13.333x7.5in, every shape inside the canvas
  3. Lists font sizes (pt), shape counts per slide
Visual (--render; LibreOffice headless preferred, no windows. --powerpoint = drive Microsoft PowerPoint via AppleScript, shows windows/dialogs):
  - exports the PPTX to PDF, rasterises pages with PyMuPDF → <png_dir>/slide-NN.png
"""
import subprocess
import sys
from pathlib import Path

from pptx import Presentation
from validate_pptx import ValidatePptx


def structural(path: Path) -> int:
    # Step 1: OOXML 검증 (PowerPoint이 복구할 이슈 선제 감지)
    print(f"\n{path.name}: OOXML 검증 중...")
    validator = ValidatePptx(path)
    ooxml_issues = validator.validate()

    # Step 2: python-pptx 구조 검증
    print(f"\n{path.name}: 구조 검증 중...")
    prs = Presentation(str(path))
    W, H = prs.slide_width, prs.slide_height
    print(f"{path.name}: {len(prs.slides)} 슬라이드, {W/914400:.3f} x {H/914400:.3f} in")
    bad = ooxml_issues  # OOXML 검증 결과를 초기 불량 수로 설정
    for i, s in enumerate(prs.slides, 1):
        out = [sh.name for sh in s.shapes if sh.left < -9525 or sh.top < -9525 or sh.left + sh.width > W + 9525 or sh.top + sh.height > H + 9525]
        # zero/negative sizes make PowerPoint silently refuse PDF export → treat as errors
        neg = [f"{sh.name}({sh.width/9525:.0f}x{sh.height/9525:.0f}px)" for sh in s.shapes if (sh.width or 0) <= 0 or (sh.height or 0) <= 0]
        bad += len(out) + len(neg)
        sizes = set()
        for sh in s.shapes:
            if sh.has_text_frame:
                for p in sh.text_frame.paragraphs:
                    for r in p.runs:
                        if r.font.size:
                            sizes.add(round(r.font.size.pt, 1))
        flag = (f"  OUT OF BOUNDS: {out}" if out else "") + (f"  INVALID SIZE: {neg}" if neg else "")
        print(f"  {i:02d} shapes={len(s.shapes):3d} pt={sorted(sizes)}{flag}")
    print("out-of-bounds / invalid-size shapes:", bad)
    return bad


def soffice_bin():
    import shutil
    for c in [shutil.which("soffice"), "/Applications/LibreOffice.app/Contents/MacOS/soffice"]:
        if c and Path(c).exists(): return c
    return None

def render(path: Path, png_dir: Path, dpi: int, allow_powerpoint: bool = False) -> None:
    pdf = path.with_suffix(".pptx.pdf")
    # 1) LibreOffice headless: no windows, no permission dialogs → preferred when installed
    so = soffice_bin()
    if so:
        import shutil, tempfile
        tmpdir = Path(tempfile.mkdtemp(prefix="ppt-render-"))
        r = subprocess.run([so, "--headless", "--convert-to", "pdf", "--outdir", str(tmpdir), str(path)], capture_output=True, text=True, timeout=300)
        out = tmpdir / (path.stem + ".pdf")
        if out.exists():
            shutil.move(str(out), str(pdf))
            import pymupdf
            doc = pymupdf.open(str(pdf)); png_dir.mkdir(parents=True, exist_ok=True)
            for i, page in enumerate(doc, 1): page.get_pixmap(dpi=dpi).save(str(png_dir / f"slide-{i:02d}.png"))
            print(f"rendered {len(doc)} pages → {png_dir}  (via LibreOffice headless; PowerPoint 과 글꼴 배치가 조금 다를 수 있음)")
            return
        print("LibreOffice convert failed:", (r.stderr or r.stdout).strip()[:200], "→ falling back to PowerPoint")
    # 2) PowerPoint via AppleScript — opens windows and 파일 액세스 부여 dialogs on the user's screen.
    #    Disabled unless --powerpoint is passed explicitly (the user does not want PowerPoint driven automatically).
    if not allow_powerpoint:
        print("LibreOffice 가 없어 PPTX 렌더를 건너뜁니다. 설치: brew install --cask libreoffice (PowerPoint 자동 조작은 --powerpoint 를 줄 때만)")
        return
    # Sandboxed PowerPoint pops a "파일 액세스 부여" dialog for folders it has not been granted (blocking AppleScript),
    # so work inside PowerPoint's own container, which it can always read/write, then move the PDF back.
    import shutil, os, time
    work = Path.home() / "Library/Containers/com.microsoft.Powerpoint/Data/tmp/ppt-maker-render"
    work.mkdir(parents=True, exist_ok=True)
    for old in work.glob("*"): old.unlink()
    src = work / path.name
    shutil.copy2(path, src)
    tmp_pdf = work / (path.stem + ".pdf")
    script = f'''
tell application "Microsoft PowerPoint"
  launch
  open POSIX file "{src}"
  delay 1
  set pres to active presentation
  save pres in (POSIX file "{tmp_pdf}") as save as PDF
  -- the PDF export is asynchronous: closing right away cancels it → wait until the file exists
  repeat 240 times
    delay 0.5
    if (do shell script "test -f {tmp_pdf} && echo y || echo n") is "y" then exit repeat
  end repeat
  delay 1
  close pres saving no
end tell'''
    for attempt in range(3):
        try:
            r = subprocess.run(["osascript", "-e", script], capture_output=True, text=True, timeout=180)
        except subprocess.TimeoutExpired:
            r = subprocess.CompletedProcess([], 1, "", "AppleScript timed out (PowerPoint dialog open?)")
        if r.returncode == 0 and tmp_pdf.exists():
            shutil.move(str(tmp_pdf), str(pdf)); break
        print(f"  (PowerPoint export attempt {attempt + 1} failed: {r.stderr.strip()[:120] or 'no file'}; retrying…)")
        subprocess.run(["osascript", "-e", 'tell application "System Events" to tell process "Microsoft PowerPoint" to click button "취소" of every window whose name is "파일 액세스 부여"'], capture_output=True)
        subprocess.run(["osascript", "-e", 'tell application "Microsoft PowerPoint" to close every presentation saving no'], capture_output=True)
        time.sleep(2)
    src.unlink(missing_ok=True)
    if not pdf.exists():
        print("PowerPoint export failed:", r.stderr.strip()[:300] or "(PowerPoint reported success but wrote no file)")
        print("→ PowerPoint 에 '파일 액세스 부여' 대화상자가 떠 있으면 닫고 다시 실행하거나, LibreOffice 설치: brew install --cask libreoffice")
        return
    import pymupdf  # PyMuPDF
    doc = pymupdf.open(str(pdf))
    png_dir.mkdir(parents=True, exist_ok=True)
    for i, page in enumerate(doc, 1):
        page.get_pixmap(dpi=dpi).save(str(png_dir / f"slide-{i:02d}.png"))
    print(f"rendered {len(doc)} pages → {png_dir}  (via {pdf.name})")


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(1)
    p = Path(args[0])
    bad = structural(p)
    if "--render" in args:
        dpi = int(args[args.index("--dpi") + 1]) if "--dpi" in args else 60
        render(p, Path(args[args.index("--render") + 1]), dpi, allow_powerpoint="--powerpoint" in args)
    sys.exit(1 if bad else 0)
