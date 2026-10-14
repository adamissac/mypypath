# Summit diorama

The floating island in the home hero. `build_diorama.py` builds it in Blender
from a seeded height field (terrain, trail, lake, waterfall, pines, cabin, ten
cairns with lanterns, flag, hiker), bakes ambient occlusion into the vertex
colours with Cycles, and exports a GLB plus `scene-meta.json` (camera, trail
polyline, stop positions) for the browser.

```bash
BLENDER=/path/to/Blender.app/Contents/MacOS/Blender scripts/summit/build.sh
node scripts/build-summit.mjs          # bundle assets/summit/*.js with three.js
node scripts/summit/render-still.mjs   # the fallback still, from the live scene
```

Blender is not a project dependency: download any 5.x build and point `BLENDER`
at it. CI never runs it; `assets/models/summit.glb` and
`assets/summit/scene-meta.json` are committed.

`build.sh` fails if the compressed model is over 350 KB.
