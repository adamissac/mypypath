# Summit diorama: a Blender-built, interactive hero mountain

**Status:** Design approved in chat; awaiting written-spec review
**Date:** 2026-10-13
**Order:** Second of three (after `2026-10-13-trail-cleanup-and-data-cockpit-design.md`)

## Goal

Replace the code-built low-poly mountain in the home hero
(`assets/js/summit-3d.js`) with a miniature diorama modelled in Blender, and
make it something a visitor wants to touch: drag it, hover its stops, watch it
arrive. "Crazy but not overly excessive": every effect is small on its own.

Chosen in chat: look = **miniature diorama**; approach = **Blender model, live
Three.js**; features = **all four** (drag to spin, clickable stops, living
scene, entrance); loading = **right after page load**, with its own budget
line.

## The model

### Built by a script, not by hand

`scripts/summit/build_diorama.py` runs inside Blender headless
(`Blender -b --python scripts/summit/build_diorama.py -- --out <dir>`). It
builds the whole scene procedurally, bakes it, and exports it, so the model can
be changed and rebuilt rather than being a one-off binary. A second script,
`scripts/summit/build.sh`, runs Blender, optimises the export, renders the
still, and writes versioned URLs.

Blender is not installed on the dev machine. The official macOS arm64 build
(5.2.x, ~400 MB) is downloaded into a scratch folder and run from there; the
path is passed in `BLENDER=`. Nothing is installed system-wide, and CI never
needs Blender because the outputs are committed.

### Scene contents

- A floating island, irregular coastline, about the current footprint.
- One main summit and two lower peaks, offset (not a symmetric cone). Smooth
  sculpted rock from layered noise with ridges; grass on the lower slopes,
  rock on steep faces, snow on high ground and gentle slopes, decided by
  height and slope.
- A glacial lake on a shelf; its outlet spills over the island's edge as a
  waterfall.
- Pine groves (one pine mesh, instanced; placed by slope, altitude and
  distance from trail and lake), a few boulders.
- A small cabin at the trailhead with windows that can glow.
- A switchback trail from the cabin to the summit, pressed into the terrain.
  Ten stops along it, each a small stone cairn with a lantern. A flag on the
  summit.
- Underside: layered rock strata tapering to a point, more detailed than now.
- A hiker: a small, simple figure (body, head, backpack), separately animated.

### Look

- Colours stay in the site's blue family (snow `#eef7fc`, rock blues from
  `#0c4566` to `#428aba`, meadow a cool blue-green), with warm accents only in
  the cabin windows, lanterns and the flag.
- Ambient occlusion and soft bounce light are baked in Blender (Cycles) into
  vertex colours. That bake is what makes it read as a miniature. Direct sun
  or moon light stays live, so night mode is a lighting change, not a second
  model.
- Smooth shading, soft shadow map from the sun, ACES or AgX tone mapping, a
  soft contact shadow under the island. No post-processing pass.

### Shipped files

- `assets/models/summit.glb`: meshopt-compressed and quantised (via
  `gltfpack` or `@gltf-transform/cli`), vertex colours, no textures except the
  waterfall's small flow texture. **Target ≤ 350 KB.** Named nodes: `terrain`,
  `underside`, `pines` (instanced), `lake`, `waterfall`, `cabin`,
  `cabin_windows`, `flag`, `stop_01`..`stop_10`, `lantern_01`..`lantern_10`,
  `hiker`, and a `trail` curve exported as a polyline the runtime samples.
- `assets/img/summit-diorama.webp`: a still of the island at rest, rendered
  from the same camera, transparent background, 1024², target ≤ 120 KB. Used
  as the hero's fallback and first frame for late loads.

### Checkpoint

Before any interaction is wired up, renders of the model (three angles, day
and night) are shown to the owner for a yes/no on the look.

## Runtime

### Files

- `assets/js/summit-3d.js` stays the small classic-script bootstrap: decides
  whether this visitor gets 3D, manages the course switch to the moon, and
  `import()`s the scene when it is time.
- `assets/summit/*.js`: the scene source (loader, materials, interactions,
  entrance, night mode). Bundled with Three.js r186, `GLTFLoader` and
  `MeshoptDecoder` by `scripts/build-summit.mjs` (esbuild, already a dev
  dependency) into one minified `assets/js/summit-scene.js`, versioned by
  content hash like the trail's files. `three` is added as a dev dependency.
- `assets/vendor/three.min.js` (the deprecated r15x global build) is deleted.
  `git grep` finds no other user: only `summit-3d.js` loads it, and a comment
  in `scripts/verify-perf-budget.mjs` names it (updated with the budget change).

### Who gets 3D

Same rules as today: not under `prefers-reduced-motion`, not with Save-Data,
not on 2G/3G, not without WebGL, only on the home page, never while Python for
Data is the selected course (the moon shows then). Everyone else gets the
still image.

### Loading and the entrance

- For visitors who qualify, an inline check in `<head>` marks the hero
  pending before first paint. The art area then shows a soft CSS cloud bank
  instead of the still.
- The scene bundle and model start downloading after the `load` event (idle
  callback, 1 s timeout).
- **If the scene is ready within 2.5 s of DOMContentLoaded and the hero is
  on screen**, the full entrance plays (about 3.5 s): the island rises up
  through the cloud bank with a slight turn, the clouds part, the trail lights
  from the cabin to the summit as stops pop in one by one, and the hiker walks
  from the cabin to the learner's current stop.
- **Otherwise** the still fades in at 2.5 s; when the scene arrives it
  cross-fades in at the same pose and only the trail-lighting part plays.
- The entrance plays once per browser session (`sessionStorage`, wrapped in
  try/catch). Later visits in the session show the island at rest at once.
- If anything fails (import, model, WebGL context), the still stays and the
  pending state is cleared.

### Interactions

- **Drag to spin.** Horizontal drag rotates the island with inertia; release
  coasts and decays. Vertical tilt is clamped (about ±8°) so it cannot flip.
  Idle auto-rotation (one turn per ~52 s, as now) resumes 3 s after the last
  interaction. When not dragging, the island leans up to ~4° toward the
  pointer. Touch: `touch-action: pan-y`, so vertical swipes scroll the page.
- **Clickable stops.** Pointer hover is ray-cast against enlarged invisible
  hit volumes round each cairn. The hovered cairn lifts slightly, its lantern
  brightens, the cursor becomes a pointer, and an HTML label (site fonts and
  tokens, positioned by projecting the stop) shows "Unit 3 · Control Flow ·
  2-3 hrs". Click opens `/units/unit-N.html`. Unit names and hours are read
  from the trail's unit cards already in the DOM, not fetched.
- **Progress.** Finished units (every lesson and the test passed: the rule in
  `PyPathLessonProgress.unitBreakdown().complete`) have lit lanterns. The
  hiker stands at the first unfinished unit; Unit 1 for a first-time visitor.
  If lesson-progress is not on the page, the scene loads it; if that fails,
  nothing is lit and the hiker waits at Unit 1.
- **Living scene.** The waterfall's texture scrolls, the flag waves (vertex
  shader), three or four soft clouds drift, two or three birds circle the
  summit. Easter egg: clicking the summit flag fires a small burst of
  fireworks in the site's colours (rate-limited to one burst per 2 s).
- **Night.** Follows the site theme (`data-theme`, and the system preference
  when the theme is automatic): sun becomes a cool moon, sky light drops,
  lanterns and cabin windows glow, a sparse star field appears round the
  island. Theme changes cross-fade over ~600 ms.

### Running cost

Renders only while the hero is on screen and the tab is visible (as now).
Device pixel ratio capped at 2 (1.5 below 560 px). No shadow map below 560 px
or when `navigator.hardwareConcurrency <= 4`. Geometry and materials are built
once; the frame loop allocates nothing.

### Accessibility

The canvas keeps `role="img"` and the existing description, extended with "you
can drag to turn it". Stops are a pointer shortcut only; every unit is already
a real link in the trail section, so keyboard and screen-reader users lose
nothing, and the canvas is not in the tab order. The hover label is
`aria-hidden`.

## Page weight

- Measured raw by `scripts/verify-perf-budget.mjs`, the scene bundle plus
  model is about 1.1 MB, which would push `/index.html` past `ownKB ≤ 1500`
  inside the 4 s window. Rather than raise `ownKB`, the script gains a
  `decorKB` line for an explicit allowlist (`summit-scene.js`, `summit.glb`),
  budgeted at 1300, and excludes those from `ownKB`. The comment says why.
- On the wire (Vercel brotli) that is about 400 KB.
- The double `summit.png` download is gone (trail spec), and the new still is
  WebP, so `/index.html` `criticalKB` returns under 1000.

## Testing

- **Unit (vitest):** progress → lit stops and hiker position; inertia decay
  and clamps; entrance timeline (full vs late vs once-per-session);
  qualification rules; label text from card data.
- **Browser (Playwright, GPU off via SwiftShader):** pending → entrance → rest
  in light and dark; late-load path cross-fades; hover a stop shows its label
  and click navigates; flag click spawns particles; reduced motion and no
  WebGL show the still and no canvas; switching to Python for Data shows the
  moon and stops the frame loop.
- Existing suites: `npm test`, `test:a11y`, `test:mobile`, `test:keyboard`,
  `test:motion`, `test:perf`, `test:trail`.
- Then push to `main`, wait for the new hashes on mypypath.com, and repeat the
  browser screenshots against the live site.

## Out of scope

The trail section and Python for Data page (first spec), the unit pages (third
spec), the moon artwork, and the rocket-launch scene's mountain image (removed
in the first spec).
