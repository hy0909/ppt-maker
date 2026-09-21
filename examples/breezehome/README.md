# 예시 덱: 브리즈홈 8월 마케팅 성과 보고

**지어낸 자료다.** 회사도 숫자도 실재하지 않는다. 화면을 보려고 만든 본보기다.

| 항목 | 값 |
| --- | --- |
| 회사 | 브리즈홈 (가상) |
| 문서 종류 | 사내 월간 보고 (`internal-report`) |
| 장수 | 5장 |
| 읽는 방식 | 촘촘하게 (`dense`) |
| 연락처 | `marketing@example.com` (가상) |

매출·ROAS·팔로워 같은 숫자는 전부 만든 값이다. 그대로 인용하면 안 된다.

## 다시 만들어 보려면

```bash
S=../../skills/ppt-maker/scripts
node $S/build_html.mjs   outline.json out
node $S/fit_slides.mjs   out/deck.html
node $S/check_overflow.mjs out/deck.html
```

표지에 들어간 로고는 SafeAI 상표다. 쓸 때는 자기 로고로 바꾼다.
