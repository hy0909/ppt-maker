#!/usr/bin/env python3
# Copyright (c) 2026 SafeAI. All rights reserved.
# See COPYRIGHT.md — 복제·수정·재배포는 허락 없이 할 수 없습니다.
"""표지 배경 그림을 2560×1440 고화질로 만들어 assets/cover-bg/ 에 넣는다.

    python3 prepare_cover_bg.py <원본이미지> <키> [--label "화면에 보일 이름"] [--replace 기존키]
    python3 prepare_cover_bg.py <원본이미지> <키> --divider-of <표지키>     # 그 표지를 골랐을 때 쓸 간지 배경

원본이 작아도 뭉개지지 않게, 그림 종류를 먼저 재어 보고 맞는 방법으로 키운다.

  1) 줄무늬형  — 가로줄(또는 세로줄)마다 색이 같은 그림.
                 줄 하나를 색 하나로 뽑아 1차원으로만 늘린다. 늘어나는 방향이 하나뿐이라 손실이 없다.
  2) 디더 격자형 — 정사각 칸이 켜짐/꺼짐 둘 중 하나인 점 그림(하프톤 디더).
                 칸 격자를 찾아내 큰 크기로 **다시 그린다**. 늘리는 게 아니라 새로 그리는 것이라 완전히 또렷하다.
  3) 그래픽형  — 색이 적고 경계가 뚜렷한 그림. 선형광에서 Lanczos 로 키우고 PNG(무손실)로 저장.
  4) 사진·하프톤형 — 점 스크린이나 사진. Lanczos + 언샵으로 점을 다시 세우고 JPEG 95·4:4:4.
                 (하프톤은 고주파가 많아 JPEG 4:2:0 이나 낮은 품질에서 링잉이 생긴다. 4:4:4 를 고정한다)

저장 형식은 무손실이 더 작으면 언제나 무손실을 고른다. 마지막에 되돌림 검사(PSNR)를 찍는다.
"""
import argparse
import json
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

OUT_W, OUT_H = 2560, 1440
HERE = os.path.dirname(os.path.abspath(__file__))
BG_DIR = os.path.join(HERE, '..', 'assets', 'cover-bg')
MANIFEST = os.path.join(BG_DIR, 'index.json')


# ── 색 공간: 크기를 바꿀 때는 선형광에서 섞어야 밝기가 안 틀어진다 ──────────
def srgb_to_linear(a):
    return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(a):
    a = np.clip(a, 0.0, 1.0)
    return np.where(a <= 0.0031308, a * 12.92, 1.055 * a ** (1 / 2.4) - 0.055)


def resize_linear(im, size, resample=Image.LANCZOS):
    """선형광에서 16bit 로 리사이즈 — 어두운 그라데이션의 밴딩·밝기 틀어짐을 막는다."""
    a = np.asarray(im, dtype=np.float32) / 255.0
    lin = srgb_to_linear(a)
    chans = []
    for c in range(3):
        ch = Image.fromarray((np.clip(lin[..., c], 0, 1) * 65535 + 0.5).astype(np.uint16))
        chans.append(np.asarray(ch.resize(size, resample), dtype=np.float32) / 65535.0)
    out = linear_to_srgb(np.stack(chans, -1))
    return Image.fromarray((out * 255 + 0.5).astype(np.uint8), 'RGB')


def cover_crop(im, ar=OUT_W / OUT_H):
    """16:9 로 잘라 낸다(가운데 기준). 늘려서 비율을 바꾸지 않는다."""
    w, h = im.size
    if abs(w / h - ar) < 1e-6:
        return im
    if w / h > ar:
        nw = int(round(h * ar))
        return im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    nh = int(round(w / ar))
    return im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))


# ── 그림 종류 재기 ──────────────────────────────────────────────────────
def high_freq_ratio(g):
    """잔잔한 그림인지, 점 스크린(하프톤·디더)이 깔린 그림인지.

    블록 하나의 주파수 에너지 중 높은 쪽 절반이 차지하는 비율.
    그림 전체를 격자로 훑어 **가장 높은 값**을 쓴다 — 주인공이 한쪽에 치우친 그림은
    가운데만 보면 텅 빈 바탕을 재게 되어 늘 '그래픽' 으로 잘못 걸린다.
    하프톤·디더는 0.15 를 크게 넘고, 평평한 그래픽은 0.05 아래로 떨어진다."""
    h, w = g.shape
    n = min(256, h, w) // 2 * 2
    if n < 32:
        return 0.0
    win = np.outer(np.hanning(n), np.hanning(n))
    c = n // 2
    yy, xx = np.ogrid[:n, :n]
    far = np.hypot(yy - c, xx - c) > c / 2
    best = 0.0
    for y in range(0, max(h - n, 0) + 1, max(n // 2, 1)):
        for x in range(0, max(w - n, 0) + 1, max(n // 2, 1)):
            blk = g[y:y + n, x:x + n].astype(np.float64)
            if blk.std() < 3:                  # 거의 한 색인 칸은 볼 것이 없다
                continue
            F = np.abs(np.fft.fftshift(np.fft.fft2((blk - blk.mean()) * win))) ** 2
            total = F.sum()
            if total > 0:
                best = max(best, float(F[far].sum() / total))
    return best


def classify(im):
    g = np.asarray(im.convert('L'), dtype=np.float32)
    row_flat = float(g.std(axis=1).mean())   # 가로줄마다 색이 같은가
    col_flat = float(g.std(axis=0).mean())   # 세로줄마다 색이 같은가
    a = np.asarray(im)
    gray = bool((a[..., 0] == a[..., 1]).all() and (a[..., 1] == a[..., 2]).all())
    colors = len(np.unique(a.reshape(-1, 3), axis=0))
    hf = high_freq_ratio(g)
    st = dict(row_flat=row_flat, col_flat=col_flat, colors=colors, hf=hf, gray=gray)
    if row_flat < 1.5 and row_flat < col_flat:
        return 'stripe-h', st
    if col_flat < 1.5 and col_flat < row_flat:
        return 'stripe-v', st
    if colors <= 8:                       # 색이 손에 꼽히면 칸 격자인지 본다
        grid = detect_dither_grid(im)
        if grid:
            st['grid'] = grid
            return 'dither', st
    # 점 스크린이 깔려 있으면 색이 몇 개든 하프톤으로 본다.
    # 회색조 그림은 고유색이 많아야 256개라 색 수만 보면 늘 '그래픽'으로 잘못 걸린다.
    # 기준을 넉넉히 잡아 애매하면 '그래픽' 쪽으로 보낸다.
    # 잘못 보냈을 때 손해가 작기 때문이다 — 그래픽 경로는 무손실이라 잃는 게 없지만,
    # 반대로 매끈한 그라데이션에 언샵·JPEG 를 물리면 경계에 흰 테가 생기고 띠가 진다.
    if hf < 0.25 and (colors <= 4096 or gray):
        return 'graphic', st
    return 'photo', st


# ── 디더 격자: 칸을 찾아 큰 크기로 다시 그린다 ─────────────────────────
def _integrals(g):
    H, W = g.shape
    I1 = np.zeros((H + 1, W + 1)); I1[1:, 1:] = g.cumsum(0).cumsum(1)
    I2 = np.zeros((H + 1, W + 1)); I2[1:, 1:] = (g * g).cumsum(0).cumsum(1)
    return I1, I2


def _cell_stats(I1, I2, W, H, nc, nr, ox=0.0, oy=0.0, inset=0.0):
    """칸마다 평균과 표준편차. 칸 안이 한 색이면 표준편차가 0 에 붙는다.

    inset 을 주면 칸 가장자리를 그만큼 물러나서 잰다. 원본을 줄일 때 칸 경계에 생긴
    반투명 이음매 1픽셀이 판단을 흐리는 걸 막는다."""
    cw, ch = (W - ox) / nc, (H - oy) / nr
    gx, gy = ox + np.arange(nc + 1) * cw, oy + np.arange(nr + 1) * ch
    ix, iy = min(inset, cw / 2 - 0.5), min(inset, ch / 2 - 0.5)
    x0 = np.clip(np.round(gx[:-1] + ix).astype(int), 0, W)
    x1 = np.clip(np.maximum(np.round(gx[1:] - ix).astype(int), x0 + 1), 0, W)
    y0 = np.clip(np.round(gy[:-1] + iy).astype(int), 0, H)
    y1 = np.clip(np.maximum(np.round(gy[1:] - iy).astype(int), y0 + 1), 0, H)
    n = np.maximum(np.outer(y1 - y0, x1 - x0), 1)
    def box(I):
        return (I[np.ix_(y1, x1)] - I[np.ix_(y0, x1)] - I[np.ix_(y1, x0)] + I[np.ix_(y0, x0)])
    mean = box(I1) / n
    var = np.maximum(box(I2) / n - mean ** 2, 0)
    return mean, np.sqrt(var)


def detect_dither_grid(im):
    """칸마다 켜짐/꺼짐만 있는 격자 그림인지 본다.

    칸 안이 한 색으로 균일해지는 격자 중 **가장 성긴 것**을 고른다.
    잔 격자는 무조건 균일해 보이므로, 성긴 쪽부터 훑어 처음 통과하는 칸수를 쓴다."""
    g = np.asarray(im.convert('L'), dtype=np.float64)
    H, W = g.shape
    I1, I2 = _integrals(g)
    gstd = float(g.std())
    if gstd < 8:
        return None

    def fit(nc):
        cw = W / nc
        nr = int(round(H / cw))
        if not 9 <= nr <= 300 or abs(cw / (H / nr) - 1) > 0.06:
            return None
        ins = max(1.0, cw * 0.18)
        ox = oy = 0.0
        for _ in range(2):                             # 자른 자리가 칸 경계와 어긋난 만큼 되찾는다
            ox = min(np.arange(0, cw, 0.25), key=lambda d: _cell_stats(I1, I2, W, H, nc, nr, d, oy, ins)[1].mean())
            oy = min(np.arange(0, H / nr, 0.25), key=lambda d: _cell_stats(I1, I2, W, H, nc, nr, ox, d, ins)[1].mean())
        mean, sd = _cell_stats(I1, I2, W, H, nc, nr, ox, oy, ins)
        lo, hi = float(mean.min()), float(mean.max())
        if hi - lo < 20 or sd.mean() / gstd > 0.15:    # 칸 안이 아직 얼룩덜룩하면 격자가 아니다
            return None
        band = (hi - lo) * 0.15
        clean = float(((mean < lo + band) | (mean > hi - band)).mean())
        if clean < 0.85:                               # 칸이 0 이나 최대 둘 중 하나로 갈려야 한다
            return None
        sharp = float(np.abs(mean - (lo + hi) / 2).mean() / ((hi - lo) / 2))
        return nc, nr, float(ox), float(oy), clean, sharp

    for nc in range(16, 401):
        if W / nc < 2.5:
            break
        got = fit(nc)
        if not got:
            continue
        # 성긴 쪽부터 처음 통과한 칸수 언저리를 다시 훑어 가장 또렷한 격자를 고른다.
        # 칸수가 하나 어긋나면 그림 끝으로 갈수록 격자가 밀려 점이 뭉개진다.
        near = [f for f in (fit(n) for n in range(nc, nc + 4)) if f]
        best = max(near, key=lambda f: (round(f[5], 3), -(f[2] + f[3])))
        return best[:5]
    return None


def upscale_dither(im, grid):
    """칸 격자를 읽어 2560×1440 으로 다시 그린다. 3배로 그린 뒤 1/3 로 줄여 가장자리를 매끈하게."""
    nc, nr, ox, oy, _ = grid
    W, H = im.size
    g = np.asarray(im.convert('L'), dtype=np.float64)
    I1, I2 = _integrals(g)
    C, _ = _cell_stats(I1, I2, W, H, nc, nr, ox, oy, max(1.0, (W - ox) / nc * 0.18))
    on = C > (C.min() + C.max()) / 2

    a = np.asarray(im).reshape(-1, 3)
    cols, cnt = np.unique(a, axis=0, return_counts=True)
    lum = cols.astype(float) @ [0.299, 0.587, 0.114]
    dot = tuple(int(x) for x in cols[max(range(len(cols)), key=lambda i: cnt[i] if lum[i] > 20 else -1)])
    bg = tuple(int(x) for x in cols[int(np.argmin(lum))])

    S = 3
    ow, oh = OUT_W * S, OUT_H * S
    sx, sy = ow / W, oh / H
    out = np.zeros((oh, ow, 3), dtype=np.uint8)
    out[:, :] = bg
    bx = np.clip(np.round((ox + np.arange(nc + 1) * (W - ox) / nc) * sx).astype(int), 0, ow)
    by = np.clip(np.round((oy + np.arange(nr + 1) * (H - oy) / nr) * sy).astype(int), 0, oh)
    for r in range(nr):
        c = 0
        while c < nc:                                  # 이어진 칸은 한 번에 칠한다(경계 이음매가 안 생긴다)
            if on[r, c]:
                s0 = c
                while c < nc and on[r, c]:
                    c += 1
                out[by[r]:by[r + 1], bx[s0]:bx[c]] = dot
            else:
                c += 1
    return Image.fromarray(out, 'RGB').resize((OUT_W, OUT_H), Image.BOX), dot, bg, float(on.mean())


# ── 종류별 키우기 ───────────────────────────────────────────────────────
def upscale_stripe(im, horizontal=True):
    """줄마다 색이 같은 그림: 줄 색만 1차원으로 늘리고 나머지 방향은 그대로 칠한다.
    늘어나는 방향이 하나뿐이라 흐려질 데가 없다."""
    a = np.asarray(im, dtype=np.float64) / 255.0
    lin = srgb_to_linear(a)
    profile = lin.mean(axis=1 if horizontal else 0)          # (n, 3) — 줄 하나당 색 하나
    n_out = OUT_H if horizontal else OUT_W
    strip = Image.fromarray((np.clip(profile, 0, 1) * 65535 + 0.5).astype(np.uint16).reshape(-1, 1, 3)[:, :, 0])
    cols = []
    for c in range(3):
        src = Image.fromarray((np.clip(profile[:, c], 0, 1) * 65535 + 0.5).astype(np.uint16).reshape(-1, 1))
        cols.append(np.asarray(src.resize((1, n_out), Image.LANCZOS), dtype=np.float64).ravel() / 65535.0)
    prof_out = linear_to_srgb(np.stack(cols, -1))
    px = (prof_out * 255 + 0.5).astype(np.uint8)
    full = np.repeat(px[:, None, :], OUT_W, axis=1) if horizontal else np.repeat(px[None, :, :], OUT_H, axis=0)
    return Image.fromarray(full, 'RGB')


def upscale_smooth(im, sharpen=True):
    out = resize_linear(im, (OUT_W, OUT_H))
    if sharpen:
        out = out.filter(ImageFilter.UnsharpMask(radius=2.0, percent=75, threshold=2))
    return out


# ── 저장: 무손실이 더 작으면 무손실 ────────────────────────────────────
def save_best(img, key, prefer_lossless, gray=False):
    png_path, jpg_path = os.path.join(BG_DIR, key + '.png'), os.path.join(BG_DIR, key + '.jpg')
    out = img.convert('L') if gray else img      # 회색조는 회색조로 — 화질 그대로, 파일은 1/3
    out.save(png_path, 'PNG', optimize=True)
    out.save(jpg_path, 'JPEG', quality=95, subsampling=0, optimize=True)
    png_sz, jpg_sz = os.path.getsize(png_path), os.path.getsize(jpg_path)
    use_png = prefer_lossless or png_sz <= jpg_sz
    keep, drop = (png_path, jpg_path) if use_png else (jpg_path, png_path)
    os.remove(drop)
    return os.path.basename(keep), os.path.getsize(keep), png_sz, jpg_sz


def roundtrip_psnr(src, out):
    """키운 그림을 원본 크기로 되돌려 원본과 비교 — 모양이 얼마나 지켜졌는지."""
    back = np.asarray(out.convert('RGB').resize(src.size, Image.LANCZOS), dtype=np.float32)
    a = np.asarray(src.convert('RGB'), dtype=np.float32)
    mse = float(((a - back) ** 2).mean())
    return float('inf') if mse == 0 else 10 * np.log10(255 * 255 / mse)


def load_manifest():
    if os.path.exists(MANIFEST):
        return json.load(open(MANIFEST, encoding='utf-8'))
    return {'backgrounds': []}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('source')
    ap.add_argument('key', help='meta.coverBg 에 쓸 키 (영문 소문자·하이픈)')
    ap.add_argument('--label', default=None, help='웹 화면에 보일 이름')
    ap.add_argument('--replace', default=None, help='이 키를 대신한다 (기존 파일 삭제)')
    ap.add_argument('--divider-of', dest='divider_of', default=None,
                    help='표지 목록에 새로 넣지 않고, 이 표지 키의 간지 배경으로 단다')
    ap.add_argument('--kind', default=None, choices=['stripe-h', 'stripe-v', 'dither', 'graphic', 'photo'],
                    help='자동 판별이 틀렸을 때 방법을 직접 지정한다')
    g = ap.add_mutually_exclusive_group()
    g.add_argument('--scrim', dest='scrim', action='store_true',
                   help='표지 왼쪽을 눌러 주는 그라데이션을 덮는다 (기본은 덮지 않는다)')
    g.add_argument('--no-scrim', dest='no_scrim', action='store_true',
                   help='--scrim 으로 켜 뒀던 것을 다시 끈다')
    a = ap.parse_args()

    src = Image.open(a.source).convert('RGB')
    cropped = cover_crop(src)
    kind, stat = classify(cropped)
    if a.kind and a.kind != kind:
        if a.kind == 'dither' and 'grid' not in stat:
            g = detect_dither_grid(cropped)
            if not g:
                sys.exit('칸 격자를 못 찾았다 — dither 로 지정할 수 없다')
            stat['grid'] = g
        print(f'지정      자동 판별 {kind} → {a.kind} (사람이 지정)')
        kind = a.kind
    print(f'원본      {src.size[0]}×{src.size[1]} → 16:9 로 자름 {cropped.size[0]}×{cropped.size[1]}')
    print(f'종류      {kind}  (가로줄 편차 {stat["row_flat"]:.2f} · 세로줄 편차 {stat["col_flat"]:.2f} · 고유색 {stat["colors"]:,} · 고주파 {stat["hf"]:.3f}{" · 회색조" if stat["gray"] else ""}{" · 칸 %d×%d" % stat["grid"][:2] if "grid" in stat else ""})')

    if kind == 'stripe-h':
        out, how, lossless = upscale_stripe(cropped, True), '가로줄 1차원 확대(선형광)', True
    elif kind == 'stripe-v':
        out, how, lossless = upscale_stripe(cropped, False), '세로줄 1차원 확대(선형광)', True
    elif kind == 'dither':
        nc, nr, _, _, clean = stat['grid']
        out, dot, bg, ratio = upscale_dither(cropped, stat['grid'])
        how = f'{nc}×{nr} 칸 격자를 읽어 다시 그림 (점 {dot} · 바탕 {bg} · 켜진 칸 {ratio*100:.0f}%)'
        lossless = True
    elif kind == 'graphic':
        out, how, lossless = upscale_smooth(cropped, sharpen=False), '선형광 Lanczos', True
    else:
        out, how, lossless = upscale_smooth(cropped, sharpen=True), '선형광 Lanczos + 언샵(2.0/75%)', False

    os.makedirs(BG_DIR, exist_ok=True)
    fname, size, png_sz, jpg_sz = save_best(out, a.key, lossless, gray=stat['gray'])
    print(f'확대      {how} → {OUT_W}×{OUT_H}')
    if kind == 'dither':
        # 늘린 게 아니라 칸을 읽어 새로 그린 것이라 픽셀끼리 맞대는 PSNR 은 뜻이 없다.
        # 대신 원본 칸이 얼마나 또렷하게 켜짐/꺼짐으로 갈렸는지를 적는다.
        print(f'읽기      원본 칸의 {stat["grid"][4]*100:.0f}% 가 켜짐/꺼짐으로 또렷하게 갈림 → 그대로 다시 그림(무손실)')
    else:
        psnr = roundtrip_psnr(cropped, out)
        print(f'되돌림    PSNR {psnr:.1f} dB  (40dB 넘으면 눈으로 차이 없음, inf = 완전 동일)')
    print(f'저장      {fname}  {size/1024/1024:.2f} MB   (PNG {png_sz/1024/1024:.2f} / JPEG {jpg_sz/1024/1024:.2f})')

    m = load_manifest()
    if a.divider_of:                                   # 표지는 그대로 두고 간지 그림만 달아 준다
        tgt = next((b for b in m['backgrounds'] if b['key'] == a.divider_of), None)
        if tgt is None:
            sys.exit(f'표지 키 {a.divider_of} 가 목록에 없다')
        old = tgt.get('divider')
        if old and old != fname:
            q = os.path.join(BG_DIR, old)
            if os.path.exists(q):
                os.remove(q)
                print(f'삭제      {old} (간지 배경 교체)')
        tgt['divider'] = fname
        json.dump(m, open(MANIFEST, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
        print(f'간지      {tgt["label"]}({tgt["key"]}) 표지를 고르면 간지 배경으로 {fname} 을 쓴다')
        return
    prev = next((b for b in m['backgrounds'] if b['key'] == a.key), None)
    bgs = [b for b in m['backgrounds'] if b['key'] != a.key and b['key'] != (a.replace or '')]
    entry = {'key': a.key, 'label': a.label or a.key, 'file': fname}
    # 그라데이션 여부는 그림 성질이라 같은 키로 다시 넣을 때만 이어받는다.
    # --replace 는 다른 그림으로 갈아 끼우는 것이라 이어받지 않는다.
    if a.scrim or (prev and prev.get('scrim') is True and not a.no_scrim):
        entry['scrim'] = True
        print('덮개      표지 왼쪽 그라데이션을 덮는다')
    if a.replace:                                   # 자리를 그대로 이어받는다
        idx = next((i for i, b in enumerate(m['backgrounds']) if b['key'] == a.replace), len(bgs))
        old = next((b for b in m['backgrounds'] if b['key'] == a.replace), None)
        if old:
            if old.get('divider'):                  # 간지 짝은 자리에 딸린 것이라 그대로 물려받는다
                entry['divider'] = old['divider']
                print(f'간지      {old["divider"]} 는 그대로 이어받는다')
            q = os.path.join(BG_DIR, old['file'])
            if os.path.exists(q) and old['file'] != fname:
                os.remove(q)
                print(f'삭제      {old["file"]} (→ {a.key} 로 교체)')
        bgs.insert(min(idx, len(bgs)), entry)
    else:
        bgs.append(entry)
    m['backgrounds'] = bgs
    json.dump(m, open(MANIFEST, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print('목록      ' + ' · '.join(f'{b["key"]}({b["label"]})' for b in bgs))


if __name__ == '__main__':
    sys.exit(main())
