#!/usr/bin/env python3
# Copyright (c) 2026 SafeAI. All rights reserved.
# See COPYRIGHT.md — 복제·수정·재배포는 허락 없이 할 수 없습니다.
"""표지 렌더(글자·로고가 얹힌 장표 그림)에서 글자를 지우고 배경만 남긴다.

    python3 strip_cover_text.py <표지렌더> <내보낼파일> [--slope -0.22] [--pad 16]

사용자가 완성된 장표 그림을 배경 후보로 줄 때 쓴다. 지울 자리는 `COVER_BOX` 가 정해 둔
리드·제목·로고·오른쪽 아래 상자 네 덩어리다. 결과를 바로 쓰지 말고 `prepare_cover_bg.py` 에
넣어 2560×1440 으로 키운다.

메우는 방법은 배경이 어떻게 생겼는지에 달렸다.

  - 매끈한 그라데이션    → `--slope none`. 둘레 색을 안쪽으로 이어 붙인다(라플라스).
  - 대각선 띠가 있는 배경 → `--slope <기울기>`. 띠 방향으로 양쪽 끝까지 걸어 나가
                            만난 두 색을 거리로 섞는다. 띠를 가로질러 섞지 않으니 경계가 안 뭉개진다.

기울기를 모르면 `--probe` 로 먼저 재 본다.
"""
import argparse
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

# build_html.mjs 가 쓰는 COVER_BOX 와 같은 값 (1280×720 기준 px)
COVER_BOXES = [
    (61.5, 56, 530.2, 83.6),      # 리드
    (59.4, 117, 720, 172.1),      # 제목
    (60.4, 613.4, 202.5, 50.6),   # 왼쪽 아래 로고
    (986.1, 636.9, 246.6, 39.6),  # 오른쪽 아래 상자
    (947.6, 641.6, 266.7, 26),    # 상자 안 글자
]


def srgb_to_linear(a):
    return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(a):
    a = np.clip(a, 0, 1)
    return np.where(a <= 0.0031308, a * 12.92, 1.055 * a ** (1 / 2.4) - 0.055)


def probe_slope(img, mask=None):
    """띠가 어느 기울기로 누워 있는지 잰다.

    기울기 후보마다 그림을 그만큼 비스듬히 잘라 가로줄을 뽑고, 그 줄의 색이 얼마나 고른지 본다.
    띠와 나란해지면 한 줄 안이 거의 한 색이 되므로 편차가 가장 작아진다.

    줄이 그림 밖으로 나가면 표본이 줄어 편차도 같이 작아진다. 그래서 **그림 안에 온전히 들어오는
    줄만** 세고, 그런 줄이 몇 개 안 되는 기울기는 아예 후보에서 뺀다. 글자 자리도 빼고 잰다."""
    g = np.asarray(Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).convert('L'), dtype=np.float64)
    H, W = g.shape
    if mask is not None:
        g = np.where(mask, np.nan, g)
    xs = np.arange(int(W * 0.05), int(W * 0.95), max(W // 300, 1))
    span = xs[-1] - xs[0]
    best = None
    with np.errstate(invalid='ignore'):
        for sl in np.arange(-0.55, 0.551, 0.004):
            lift = sl * (xs - xs[0])
            lo, hi = -lift.min(), H - 1 - lift.max()
            if hi - lo < H * 0.25:                    # 온전히 들어오는 줄이 너무 적다
                continue
            rows = np.linspace(lo, hi, 48)
            py = np.round(rows[:, None] + lift[None, :]).astype(int)
            vals = g[np.clip(py, 0, H - 1), xs[None, :]]
            score = float(np.nanmean(np.nanstd(vals, axis=1)))
            if best is None or score < best[0]:
                best = (score, float(sl))
    return None if best is None else best[1]


def directional_fill(img, mask, slope, max_steps=2000):
    """지울 자리를 띠 방향으로 메운다. 양쪽으로 걸어 나가 만난 두 색을 거리로 섞는다."""
    H, W, _ = img.shape
    dx, dy = 1.0, slope
    n = np.hypot(dx, dy)
    dx, dy = dx / n, dy / n
    ys, xs = np.nonzero(mask)
    hits = []
    for sgn in (+1, -1):
        val = np.zeros((len(ys), 3))
        dist = np.full(len(ys), np.inf)
        todo = np.arange(len(ys))
        for t in range(1, max_steps):
            if not len(todo):
                break
            px = np.round(xs[todo] + sgn * dx * t).astype(int)
            py = np.round(ys[todo] + sgn * dy * t).astype(int)
            inside = (px >= 0) & (px < W) & (py >= 0) & (py < H)
            ok = np.zeros(len(todo), bool)
            ok[inside] = ~mask[py[inside], px[inside]]
            if ok.any():
                idx = todo[ok]
                val[idx] = img[py[ok], px[ok]]
                dist[idx] = t
            todo = todo[~ok & inside]          # 그림 밖으로 나간 것은 반대쪽에 맡긴다
        hits.append((val, dist))
    (v1, d1), (v2, d2) = hits
    w1 = np.where(np.isfinite(d1), 1 / np.maximum(d1, 1e-6), 0)[:, None]
    w2 = np.where(np.isfinite(d2), 1 / np.maximum(d2, 1e-6), 0)[:, None]
    out = img.copy()
    out[ys, xs] = (v1 * w1 + v2 * w2) / np.maximum(w1 + w2, 1e-12)
    return out


def harmonic_fill(img, mask, iters=500):
    """지울 자리를 둘레 색으로 메운다(라플라스). 성긴 격자부터 풀어 빨리 수렴시킨다."""
    levels = []
    m, f = mask, img
    while min(m.shape) > 24:
        levels.append((m, f))
        h2, w2 = f.shape[0] // 2, f.shape[1] // 2
        m = np.asarray(Image.fromarray(m.astype(np.uint8) * 255).resize((w2, h2), Image.BOX)) > 0
        f = np.stack([np.asarray(Image.fromarray((f[..., c] * 65535).astype(np.uint16))
                                 .resize((w2, h2), Image.BOX), dtype=np.float64) / 65535 for c in range(3)], -1)
    levels.append((m, f))
    guess = None
    for m, f in reversed(levels):
        u = f.copy()
        if guess is not None:
            up = np.stack([np.asarray(Image.fromarray((guess[..., c] * 65535).astype(np.uint16))
                                      .resize((m.shape[1], m.shape[0]), Image.BILINEAR), dtype=np.float64) / 65535
                           for c in range(3)], -1)
            u[m] = up[m]
        for _ in range(iters):
            n = np.empty_like(u)
            n[1:-1, 1:-1] = (u[:-2, 1:-1] + u[2:, 1:-1] + u[1:-1, :-2] + u[1:-1, 2:]) / 4
            n[0], n[-1], n[:, 0], n[:, -1] = u[0], u[-1], u[:, 0], u[:, -1]
            u[m] = n[m]
        guess = u
    return guess


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('source')
    ap.add_argument('out')
    ap.add_argument('--slope', default='auto',
                    help="띠 기울기 dy/dx. 'auto'(재 본다) · 'none'(라플라스) · 숫자(예 -0.22)")
    ap.add_argument('--pad', type=int, default=16, help='지울 상자를 몇 px 넓힐지')
    ap.add_argument('--probe', action='store_true', help='기울기만 재 보고 끝낸다')
    a = ap.parse_args()

    src = Image.open(a.source).convert('RGB')
    W, H = src.size
    img = srgb_to_linear(np.asarray(src, dtype=np.float64) / 255)
    sx, sy = W / 1280, H / 720                 # 1280×720 이 아닌 렌더도 받아 준다

    mask = np.zeros((H, W), dtype=bool)
    for x, y, w, h in COVER_BOXES:
        mask[max(0, int(y * sy) - a.pad):min(H, int((y + h) * sy) + a.pad),
             max(0, int(x * sx) - a.pad):min(W, int((x + w) * sx) + a.pad)] = True
    if a.probe:
        print(f'재 본 기울기: {probe_slope(img, mask):+.3f}')
        return
    print(f'원본      {W}×{H}   지울 자리 {mask.sum():,}px ({mask.mean()*100:.1f}%)')

    slope = a.slope
    if slope == 'auto':
        slope = probe_slope(img, mask)
        print(f'기울기    재 보니 {slope:+.3f}')
        if abs(slope) < 0.01:
            slope = None
            print('기울기    거의 0 이라 띠가 없다고 보고 라플라스로 간다')
    elif slope != 'none':
        slope = float(slope)
    else:
        slope = None

    out = harmonic_fill(img, mask) if slope is None else directional_fill(img, mask, slope)
    res = Image.fromarray((linear_to_srgb(out) * 255 + 0.5).astype(np.uint8), 'RGB')
    # 메운 자리의 이음매만 아주 살짝 눅인다 — 띠 경계는 살려야 하니 1px 남짓만
    soft = res.filter(ImageFilter.GaussianBlur(1.2))
    res = Image.composite(soft, res, Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3)))
    res.save(a.out, 'PNG', optimize=True)

    # 지운 자리가 얼마나 깨끗해졌는지: 둘레보다 튀는 픽셀을 지우기 전과 후로 견준다.
    # 0 이 되지는 않는다 — 띠 경계가 상자를 지나가면 그 경계도 '튀는 픽셀' 로 세어지기 때문이다.
    def rough(pil):
        x = np.asarray(pil, dtype=np.float32)
        y = np.asarray(pil.filter(ImageFilter.GaussianBlur(24)), dtype=np.float32)
        return int(((np.abs(x - y).max(axis=2) > 18) & mask).sum())
    before, after = rough(src), rough(res)
    print(f'메움      {"라플라스(둘레 색 잇기)" if slope is None else f"띠 방향 {slope:+.3f} 로 잇기"}')
    print(f'지운 자리 튀는 픽셀 {before:,} → {after:,}개 ({100*(1-after/max(before,1)):.0f}% 줄었다)')
    print(f'저장      {a.out}  {os.path.getsize(a.out)/1024:.0f} KB')
    print('다음      prepare_cover_bg.py 에 넣어 2560×1440 으로 키운다')


if __name__ == '__main__':
    sys.exit(main())
