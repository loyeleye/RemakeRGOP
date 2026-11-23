#!/bin/bash
# Shrinks Sogni/Pixal3D GLBs (about 11 MB each) for the web: 512px WebP textures, meshopt.
# Usage: tools/models.sh <dir with dawn.glb dusk.glb brazier.glb monolith.glb boulder.glb, and/or the production dir with <character>/<character>.glb>
set -e
SRC=${1:?source dir}
OUT=$(dirname "$0")/../public/models
mkdir -p "$OUT"
for n in dawn dusk brazier monolith boulder; do
  [ -f "$SRC/$n.glb" ] || { echo "skip $n"; continue; }
  size=512; [ "$n" = boulder ] && size=256; [ "$n" = monolith ] && size=256
  npx gltf-transform optimize "$SRC/$n.glb" "$OUT/$n.glb" --texture-compress webp --texture-size $size --compress meshopt --simplify false >/dev/null
  echo "$n $(du -k "$OUT/$n.glb" | cut -f1) KB"
done
# Story characters (production/<name>/<name>.glb): heavier scans, so they're simplified too.
for n in rook lumi wick moth kes hesta; do
  f="$SRC/$n/$n.glb"; [ -f "$f" ] || f="$SRC/$n.glb"
  [ -f "$f" ] || continue
  npx gltf-transform optimize "$f" "$OUT/$n.glb" --texture-compress webp --texture-size 512 --compress meshopt --simplify-ratio 0.02 --simplify-error 0.01 >/dev/null
  echo "$n $(du -k "$OUT/$n.glb" | cut -f1) KB"
done
