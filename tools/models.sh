#!/bin/bash
# Shrinks Sogni/Pixal3D GLBs (about 11 MB each) for the web: 512px WebP textures, meshopt.
# Usage: tools/models.sh <dir with dawn.glb dusk.glb brazier.glb monolith.glb boulder.glb>
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
