# Summit Diorama Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the code-built hero mountain with a Blender-scripted miniature island, rendered live with Three.js r186, with an entrance through clouds, drag to spin, clickable stops showing progress, a living scene and night mode.

**Architecture:** A Blender Python script builds and bakes the island and exports a GLB plus a still render. A Node build step optimises the GLB (meshopt) and bundles the scene source (`assets/summit/*.js`) with Three.js into one versioned `assets/js/summit-scene.js`. The existing classic bootstrap `assets/js/summit-3d.js` decides who gets 3D and dynamically imports the bundle. Pure logic (progress → stops, inertia, entrance timeline, qualification) lives in small modules with vitest coverage.

**Tech Stack:** Blender 5.2.2 (headless, scratch install), Three.js 0.186.1, `@gltf-transform/cli` (meshopt), esbuild (existing), vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-13-summit-diorama-design.md`

## Global Constraints

- Owner's rule: small commits, each pushed to `main`; no attribution lines in commit messages.
- Run `python3 scripts/bake_layout.py` before pushing CSS/JS changes; new assets go in `version_course_assets()`.
- Blender lives only in the scratchpad (`BLENDER=<path>`); outputs are committed so CI never needs it.
- `assets/models/summit.glb` ≤ 350 KB; `assets/img/summit-diorama.webp` ≤ 120 KB.
- No 3D under `prefers-reduced-motion`, Save-Data, 2G/3G, no WebGL, or `data-course="data"`.
- Nothing animates under reduced motion; a11y budget zero; the canvas is not in the tab order.
- Entrance plays once per session (`sessionStorage` key `pypath-summit-entrance`, wrapped in try/catch).
- Perf: new `decorKB ≤ 1300` line for `summit-scene.js` and `summit.glb`, excluded from `ownKB`.

## Review Focus

1. Theme toggled mid-session (light ↔ dark) must cross-fade lighting without reloading the model.
2. Switching course to Python for Data while the entrance is playing must stop the frame loop and show the moon; switching back must show the island at rest (no second entrance).
3. A WebGL context loss after mount must fall back to the still, not a blank square.
4. Touch drag on a phone must not block vertical page scroll.
5. A learner with every Foundations unit finished: all lanterns lit, hiker at the summit.

---

### Task 1: Pure logic modules

**Files:** Create `assets/summit/progress.js`, `assets/summit/spin.js`, `assets/summit/timeline.js`, `assets/summit/qualify.js`; Test `tests/summit-logic.test.js`.

**Interfaces (Produces):**
- `stopStates(completedUnits: number[], total=10) → { lit: boolean[], hiker: number }` — `hiker` is the 0-based index of the first unfinished unit, or `total-1` (summit) when all are done.
- `createSpin({ friction=4, maxTilt=0.14, idleSpeed=2π/52, resumeAfter=3 }) → { grab(x,y), drag(x,y,dt), release(), step(dt) → { yaw, tilt } }`.
- `entrancePlan({ readyAt: ms since DCL, heroVisible: boolean, seen: boolean }) → 'full' | 'late' | 'none'` (full when readyAt ≤ 2500 && visible && !seen; none when seen; else late).
- `entranceAt(t: seconds, plan) → { rise: 0..1, clouds: 0..1, trail: 0..1, hiker: 0..1, done: boolean }` (full: rise 0–1.2 s, clouds 0.6–1.8 s, trail 1.2–2.7 s, hiker 2.2–3.5 s; late: trail 0–1.5 s, hiker 1.0–2.3 s).
- `qualifies({ reduced, saveData, effectiveType, webgl, isHome, course }) → boolean`.

- [ ] Write `tests/summit-logic.test.js` covering: new learner (nothing lit, hiker 0); units 1–3 done (lit 0–2, hiker 3); all done (all lit, hiker 9); unsorted/duplicate/garbage input; spin coasting decays below 0.001 rad/s within 3 s after a release at 6 rad/s; tilt clamp at ±0.14 rad; idle rotation resumes only after 3 s; entrancePlan matrix (full/late/none); entranceAt monotonic and `done` at 3.5 s (full) / 2.3 s (late); qualifies matrix (each disqualifier alone).
- [ ] Run `npx vitest run tests/summit-logic.test.js` → FAIL (modules missing).
- [ ] Implement the four modules as ES modules (`export function …`), no DOM access.
- [ ] Run → PASS. Commit `feat(home): add the summit scene's pure logic` and push.

### Task 2: Blender diorama build

**Files:** Create `scripts/summit/build_diorama.py`, `scripts/summit/build.sh`, `scripts/summit/README.md`; output `assets/models/summit.glb`, `assets/img/summit-diorama.webp`, `assets/summit/scene-meta.json` (camera + stop/trail data).

- [ ] `build_diorama.py` (run as `"$BLENDER" -b --factory-startup --python scripts/summit/build_diorama.py -- --out <dir>`): clear scene; build terrain as a subdivided disc displaced by layered noise + three offset peak masks; coastline mask from angular noise; colour by height/slope (grass/rock/snow from the spec palette); carve a lake shelf and a trail groove along a hand-placed switchback spline from the cabin to the summit; underside strata mesh tapering to a point; waterfall plane from the lake outlet over the edge; pine mesh (stacked cones + trunk) instanced by slope/altitude/exclusion rules into one mesh with `EXT_mesh_gpu_instancing`-compatible collection instances; boulders; cabin with a separate `cabin_windows` mesh; ten cairns `stop_01..10` and lanterns `lantern_01..10` along the trail at equal arc-length; flag + pole; hiker (capsule body, sphere head, box pack). Bake AO with Cycles into a `Col` colour attribute multiplied over albedo. Camera matching the hero (34° fov, looking at the island centre). Export GLB (`export_format='GLB'`, `export_apply=True`, colours, no materials beyond vertex colour + named emissive materials for lanterns/windows/waterfall). Write `scene-meta.json` with camera position/target/fov, trail points (60 samples), stop positions. Render a 1024² transparent still with EEVEE to `summit-diorama.png`.
- [ ] `build.sh`: run Blender, then `npx gltf-transform optimize raw.glb assets/models/summit.glb --compress meshopt --texture-compress false --simplify false`, convert the still with Blender's WebP output (or `npx sharp-cli` if needed) to `assets/img/summit-diorama.webp` at quality 82, and print both sizes; exit 1 if over budget.
- [ ] Run it; look at the still and three extra angle renders (day + night lighting) — this is the spec's look checkpoint; iterate the script until the island reads as a miniature (soft AO, readable trail and cairns, no z-fighting).
- [ ] Commit `feat(home): model the summit diorama in Blender` with the script, README and outputs; push (nothing loads them yet).

### Task 3: Scene runtime and bundle

**Files:** Create `assets/summit/main.js` (entry: `export async function mount(host, opts)`), `assets/summit/scene.js`, `assets/summit/living.js`, `assets/summit/interact.js`; `scripts/build-summit.mjs`; output `assets/js/summit-scene.js`; modify `package.json` (dev deps `three@0.186.1`, `@gltf-transform/cli`; script `build:summit`).

**Interfaces:** `mount(host, { modelUrl, meta, units: [{n,title,hours,href}], completedUnits, theme: 'light'|'dark', plan: 'full'|'late'|'none', onReady, onFail }) → { setTheme(t), pause(), resume(), dispose() }`.

- [ ] Write `tests/summit-bundle.test.js`: after `node scripts/build-summit.mjs`, the bundle exists, exports `mount`, contains no `three.min.js` reference, embeds a hashed model URL, and `summit-3d.js` references the bundle's current `?v=` hash. Run → FAIL.
- [ ] `scene.js`: WebGLRenderer (alpha, antialias, SRGB output, ACES tone mapping, DPR cap 2 / 1.5 under 560 px), GLTFLoader + MeshoptDecoder, materials from vertex colours (MeshStandardMaterial, roughness 0.85), sun DirectionalLight with PCFSoft 1024 shadow map (off under 560 px or ≤4 cores), hemisphere light, contact shadow sprite, day/night light rigs with a 600 ms cross-fade, star points shown at night, lantern/window emissive intensities by theme and lit state.
- [ ] `living.js`: waterfall UV scroll, flag vertex-shader wave (onBeforeCompile), 4 drifting soft clouds (sprite cards), 3 birds (two-triangle meshes flapping on a circle), firework burst (pooled Points, 1 burst per 2 s).
- [ ] `interact.js`: pointer drag via `createSpin`, `touch-action: pan-y`, cursor lean; ray-cast hover on enlarged invisible spheres per stop; HTML label element (`.home-summit__label`, aria-hidden) projected to screen; click → `location.assign(unit.href)`; flag hit → fireworks.
- [ ] `main.js`: wires the above, runs `entranceAt` per frame, positions hiker along the trail polyline toward `stopStates().hiker`, renders only when visible/tab visible, `webglcontextlost` → `onFail`.
- [ ] `scripts/build-summit.mjs`: esbuild bundle `assets/summit/main.js` → `assets/js/summit-scene.js` (esm, minify, define `__MODEL_URL__` with the GLB's content hash), then rewrite `SCENE_SRC` in `assets/js/summit-3d.js` to `/assets/js/summit-scene.js?v=<hash>`; `--check` mode.
- [ ] Run → PASS. Commit `feat(home): render the summit diorama with three.js r186` and push.

### Task 4: Bootstrap, hero markup and fallback

**Files:** Modify `assets/js/summit-3d.js` (rewrite), `index.html` (hero `<img>` → `summit-diorama.webp`, inline pending check in `<head>`), `assets/css/home-path.css` (cloud bank, pending state, label, canvas cursor), `scripts/bake_layout.py` (version `summit-diorama.webp`, `summit-scene.js`, `models/summit.glb`); delete `assets/vendor/three.min.js`; test `tests/browser/summit.mjs`.

- [ ] Write `tests/browser/summit.mjs`: (a) fresh session, desktop → `.home-summit.is-pending` at first paint, canvas appears, `data-entrance="full"` recorded, island at rest after 4 s; (b) second load same session → `data-entrance="none"`; (c) slow model (route delay 4 s) → still fades in at 2.5 s, then canvas with `late`; (d) reduced motion → still only, no canvas, no pending class; (e) hover stop 3 → label shows Unit 3 title, click → navigates to `/units/unit-3.html`; (f) flag click → fireworks points visible; (g) theme toggle → `data-scene-theme` flips without new GLB request; (h) course switch to data → moon visible, `requestAnimationFrame` loop stopped; (i) forced context loss → still visible. Run → FAIL.
- [ ] Rewrite `summit-3d.js` around `qualifies()` (inlined copy for the classic script), the session flag and `import(SCENE_SRC)`; fall back to the still on any failure.
- [ ] Hero CSS: cloud-bank pending state (pure CSS gradients), still fade-in, canvas sizing, label pill using site tokens, `cursor: grab/grabbing/pointer`.
- [ ] Run → PASS. Commit `feat(home): bring the summit diorama into the hero` and push.

### Task 5: Budget and full verification

- [ ] `scripts/verify-perf-budget.mjs`: add `DECOR` allowlist (`/assets/js/summit-scene.js`, `/assets/models/summit.glb`), `decorKB ≤ 1300`, excluded from `ownKB`; update the comment that mentioned `three.min.js`.
- [ ] Run `npm test`, `test:a11y`, `test:mobile`, `test:keyboard`, `test:motion`, `test:perf`, `test:trail`, browser summit test; screenshots at 1440/1024/390 light+dark mid-entrance and at rest.
- [ ] Commit `test(perf): budget the summit diorama as decoration` and push; wait for live hashes; re-run `tests/browser/summit.mjs https://mypypath.com`.
