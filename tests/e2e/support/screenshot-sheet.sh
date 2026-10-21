#!/usr/bin/env bash
# A09 docs only — puts the PNGs of specs/a09-screenshots.spec.ts into one sheet (rows: pages; columns:
# 360x640 | 390x844 | 1366x768 | 1440x900) for docs/screenshots/A09.webp. Needs ImageMagick 6 (`convert`) with
# WebP and the DejaVu Sans font; not part of any test run.
#   A09_SCREENSHOTS_DIR=/tmp/a09 npm run test:e2e -- a09-screenshots
#   tests/e2e/support/screenshot-sheet.sh /tmp/a09 docs/screenshots/A09.webp 360 78
set -euo pipefail
SHOTS="$1"; OUT="$2"; H="${3:-220}"; Q="${4:-60}"
TMP=$(mktemp -d)
COLS=(mobile-360x640 mobile-390x844 laptop-1366x768 desktop-1440x900)
declare -A LABEL=(
  [01-login]="login" [02-home]="home (requester)" [03-my-requests]="my requests" [04-repair-form]="repair form (no bottom nav)"
  [05-request-detail]="request detail" [06-board]="board" [07-team]="contact GM" [08-no-permission]="no permission (/admin)"
  [09-not-found]="not found" [10-gm-home]="home (GM Admin)" [11-gm-create]="GM create" [12-on-behalf]="on behalf"
  [13-admin-users]="admin: users" [14-more-menu]="more menu (mobile)" [15-disabled]="account disabled"
  [16-not-set-up]="not set up" [17-outsider]="outside @tdfb.co")
rows=()
header=("$TMP/h-label.png")
convert -size 170x28 xc:'#FAF8F3' -font DejaVu-Sans -pointsize 13 -fill '#2D2A26' -gravity west -annotate +8+0 "A09 · page \\ size" "$TMP/h-label.png"
for col in "${COLS[@]}"; do
  w=$(convert "$SHOTS/$col/01-login.png" -resize x"$H" -format '%w' info:)
  convert -size "${w}x28" xc:'#FAF8F3' -font DejaVu-Sans -pointsize 13 -fill '#2D2A26' -gravity center -annotate +0+0 "${col#*-}" "$TMP/h-$col.png"
  header+=("$TMP/h-$col.png")
done
convert "${header[@]}" +append "$TMP/header.png"
for row in $(ls "$SHOTS/${COLS[0]}" | sed 's/\.png$//' | sort); do
  tiles=()
  convert -size 170x"$H" xc:'#FAF8F3' -font DejaVu-Sans -pointsize 13 -fill '#2D2A26' -gravity west -annotate +8+0 "${row%%-*} ${LABEL[$row]}" "$TMP/$row-label.png"
  tiles+=("$TMP/$row-label.png")
  for col in "${COLS[@]}"; do
    convert "$SHOTS/$col/$row.png" -resize x"$H" -bordercolor '#DADBD2' -border 1 -bordercolor '#FAF8F3' -border 3 "$TMP/$row-$col.png"
    tiles+=("$TMP/$row-$col.png")
  done
  convert "${tiles[@]}" -background '#FAF8F3' -gravity center +append "$TMP/row-$row.png"
  rows+=("$TMP/row-$row.png")
done
convert "$TMP/header.png" "${rows[@]}" -background '#FAF8F3' -gravity west -append -quality "$Q" -define webp:method=6 "$OUT"
rm -rf "$TMP"
identify -format '%wx%h %b\n' "$OUT"
