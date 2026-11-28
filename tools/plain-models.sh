#!/usr/bin/env bash
# Copies of public/models/*.glb for hosts that block WebAssembly and won't serve .glb (the
# shareable demo page): quantized instead of meshopt-compressed (three.js reads that with no
# decoder), base64 as .glb.txt. The game falls back to these when a .glb won't load.
# Usage: tools/plain-models.sh OUT_DIR
set -euo pipefail
OUT=${1:?out dir}
mkdir -p "$OUT/models"
TMP=$(mktemp -d)
for f in "$(dirname "$0")"/../public/models/*.glb; do
  n=$(basename "$f" .glb)
  npx --yes @gltf-transform/cli optimize "$f" "$TMP/$n.glb" --compress quantize --texture-compress false --simplify false >/dev/null
  base64 -w0 "$TMP/$n.glb" > "$OUT/models/$n.glb.txt"
  echo "$n $(du -k "$OUT/models/$n.glb.txt" | cut -f1) KB"
done
rm -rf "$TMP"
