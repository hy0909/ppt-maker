#!/bin/sh
# PPT Maker 가 쓰는 글꼴 두 가지를 내려받아 설치한다.
#   Pretendard (본문)  SIL Open Font License 1.1  https://github.com/orioncactus/pretendard
#   Paperlogy  (제목)  SIL Open Font License 1.1  https://github.com/Freesentation/paperlogy
# 두 글꼴 다 OFL 이라 개인도 회사도 공짜로 쓴다. 이 저장소 이용 조건과는 별개다.
#
# 사용: ./install_fonts.sh            설치
#       ./install_fonts.sh --force    이미 있어도 다시 설치
set -e

PRETENDARD_URL="https://github.com/orioncactus/pretendard/releases/download/v1.3.9/Pretendard-1.3.9.zip"
PAPERLOGY_URL="https://github.com/Freesentation/paperlogy/raw/refs/heads/main/Paperlogy-1.001.zip"
FORCE=""
[ "$1" = "--force" ] && FORCE=1

case "$(uname -s)" in
  Darwin) DIR="$HOME/Library/Fonts" ;;
  Linux)  DIR="$HOME/.local/share/fonts" ;;
  *)
    echo "이 스크립트는 macOS 와 리눅스에서만 됩니다. 아래 두 곳에서 직접 받아 설치하세요."
    echo "  Pretendard  $PRETENDARD_URL"
    echo "  Paperlogy   $PAPERLOGY_URL"
    exit 1 ;;
esac
mkdir -p "$DIR"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

have() {  # have <글꼴이름> → 이미 깔려 있으면 0
  [ -n "$FORCE" ] && return 1
  ls "$DIR" 2>/dev/null | grep -qi "^$1" && return 0
  fc-list 2>/dev/null | grep -qi "$1" && return 0
  return 1
}

get() {  # get <주소> <받을파일>
  curl -fsSL -o "$2" "$1" || {
    echo "  받지 못했습니다. 브라우저로 직접 받으세요: $1"
    return 1
  }
}

# Pretendard — 압축 안에 static(기본) 과 alternative(숫자 모양만 다른 판) 가 같이 있다.
# 둘 다 깔면 이름이 겹쳐 엉뚱한 글꼴이 잡히므로 static 과 variable 만 가져온다.
echo "Pretendard 설치"
if have Pretendard; then
  echo "  이미 있습니다. 건너뜁니다."
else
  get "$PRETENDARD_URL" "$TMP/p.zip" || exit 1
  unzip -q "$TMP/p.zip" -d "$TMP/p"
  find "$TMP/p/public/static" -maxdepth 1 -type f \( -name '*.otf' -o -name '*.ttf' \) \
    -exec cp {} "$DIR/" \;
  find "$TMP/p/public/variable" -maxdepth 1 -type f -name '*.ttf' \
    -exec cp {} "$DIR/" \; 2>/dev/null || true
  echo "  끝났습니다."
fi

echo "Paperlogy 설치"
if have Paperlogy; then
  echo "  이미 있습니다. 건너뜁니다."
else
  get "$PAPERLOGY_URL" "$TMP/l.zip" || exit 1
  unzip -q "$TMP/l.zip" -d "$TMP/l"
  find "$TMP/l" -type f \( -name 'Paperlogy-*.ttf' -o -name 'Paperlogy-*.otf' \) \
    -exec cp {} "$DIR/" \;
  echo "  끝났습니다."
fi

[ "$(uname -s)" = "Linux" ] && { fc-cache -f >/dev/null 2>&1 || true; }

echo
echo "설치 위치: $DIR"
echo "두 글꼴 모두 SIL Open Font License 1.1 입니다. 전문: https://openfontlicense.org"
