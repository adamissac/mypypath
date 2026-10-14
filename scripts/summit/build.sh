#!/bin/sh
# Rebuild the summit diorama: Blender model -> compressed GLB + scene metadata.
#   BLENDER=/path/to/Blender scripts/summit/build.sh
# Blender is not a project dependency; any 5.x build works, run from anywhere.
# The still image is rendered from the live scene by scripts/summit/render-still.mjs
# afterwards, so it always matches what the browser draws.
set -e
: "${BLENDER:?set BLENDER to a Blender 5.x executable}"
root=$(cd "$(dirname "$0")/../.." && pwd)
tmp=$(mktemp -d)
"$BLENDER" -b --factory-startup --python "$root/scripts/summit/build_diorama.py" -- --out "$tmp" > "$tmp/blender.log" 2>&1 || { tail -40 "$tmp/blender.log"; exit 1; }
mkdir -p "$root/assets/models"
npx --prefix "$root" gltf-transform optimize "$tmp/summit-raw.glb" "$root/assets/models/summit.glb" \
  --compress meshopt --texture-compress false --simplify false --instance false --join false --flatten false --palette false > "$tmp/opt.log" 2>&1 || { cat "$tmp/opt.log"; exit 1; }
cp "$tmp/scene-meta.json" "$root/assets/summit/scene-meta.json"
size=$(wc -c < "$root/assets/models/summit.glb" | tr -d ' ')
echo "summit.glb: $size bytes"
if [ "$size" -gt 358400 ]; then echo "over the 350 KB budget" >&2; exit 1; fi
