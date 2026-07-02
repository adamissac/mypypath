# Lesson Format Kit

A standalone, portable extraction of the lesson/course page format used in
this project — the sticky sidebar course layout, lesson hero, content
building blocks, interactive practice boxes, exercises, and the header/footer
chrome that wraps it all. Copy this folder into any other project and it
works with **no build step**.

## Files

| File                 | Purpose                                                              |
|----------------------|-----------------------------------------------------------------------|
| `index.html`         | Full working demo lesson page — copy/paste sections from this.      |
| `lesson-format.css`  | Every style needed for the format (tokens, layout, components).     |
| `lesson-format.js`   | All behavior (sidebar toggle, theme toggle, editors, exercises...). |

Open `index.html` directly in a browser to see it in action.

## What's included

- **Header** — brand, nav links, mobile hamburger menu, light/dark theme toggle.
- **Footer** — brand + link columns.
- **Course layout** (`.layout-course`) — a two-column grid: a sticky,
  collapsible **sidebar** (`.course-sidebar`) with the lesson list, and a
  **main column** (`.course-main`) with the lesson itself.
  - Collapses to a slide-in overlay on mobile, with a toggle button
    (`.sidebar-toggle-btn`) and floating "Lessons" reopen pill.
  - Collapses to a hidden rail on desktop via the small chevron button in
    the sidebar header (state persists in `localStorage`).
- **Breadcrumb** (`nav[aria-label="Breadcrumb"]`).
- **Lesson hero** — eyebrow label, big title, and an "Overview" card
  (`.lesson-overview`) with an icon, description, meta pills
  (difficulty/time), and primary/ghost action buttons.
- **Content building blocks**, used inside `.content-section`:
  - `.info-card` — highlighted tip/fact box.
  - `.info-callout` — warning/key-point callout (supports lists).
  - `.uses-grid` / `.use-item` — small grid of short pills/tags.
  - `.feature-grid` / `.feature-card` — larger "why it matters" cards.
  - `.process-steps` / `.step` — numbered step-by-step walkthrough.
  - `.code-example` — static, non-runnable code block with a header.
  - Styled `<table>`.
  - A "copy code" button that fades in on hover over any `pre.code`.
- **Interactive practice boxes** (`.practice-box.interactive`) — an
  editable code editor (`.interactive-editor` + `.code-editor-small`) with
  Run / Reset / Clear-saved buttons and an output panel.
- **Reflection prompts** — auto-saving `<textarea class="reflection-input">`.
- **Exercises** (`.exercise-section` / `.exercise-item`) — Run / Check
  Answer / Show Solution buttons, plus a pass/fail feedback panel.
- **Reading progress bar** — thin bar under the header that fills as you
  scroll a lesson page (auto-injected by the JS, no markup needed).
- **Light/dark theme** — driven by `[data-theme="light|dark"]` on `<html>`
  and CSS custom properties.

## Using it in a new project

1. Copy `lesson-format.css` and `lesson-format.js` into your project's
   assets, and link them from your page `<head>`/before `</body>`:

   ```html
   <link rel="stylesheet" href="/assets/lesson-format.css" />
   <script defer src="/assets/lesson-format.js"></script>
   ```

2. Build a lesson page by copying the relevant blocks out of `index.html`:
   header → `.layout-course` (sidebar + `.course-main`) → footer.

3. For the **sidebar**, all you need is the raw markup — the collapse
   button and mobile reopen button are injected automatically by
   `lesson-format.js`:

   ```html
   <aside class="course-sidebar" id="lesson-sidebar">
     <p class="sidebar-unit-label">Unit 1 &bull; Foundations</p>
     <nav>
       <ul>
         <li><a class="active" href="/lesson-1">1. Lesson One</a></li>
         <li><a href="/lesson-2">2. Lesson Two</a></li>
       </ul>
     </nav>
   </aside>
   ```

4. Mark the current lesson link with `class="active"`. Everything else
   (hover states, active/rest styling, scroll behavior) is handled by CSS.

## Runnable code editors (optional)

The interactive editors are **decoupled from any specific execution
backend**. If you don't need runnable code, just delete
`.practice-box`/`.interactive-editor`/`.exercise-section` blocks and skip the
CodeMirror `<script>`/`<link>` tags — the rest of the format works fine
without them.

If you do want runnable code:

1. Include CodeMirror (used for the editor UI):

   ```html
   <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.2/codemirror.min.css" />
   <script defer src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.2/codemirror.min.js"></script>
   <script defer src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.2/mode/python/python.min.js"></script>
   ```

   (Swap the `mode/python` file for whatever language mode you need.)

2. Implement `window.LessonRunner.run(code)` to actually execute code. It
   must return a `Promise` that resolves to `{ stdout, stderr, error }`.
   For example, to run Python in the browser via
   [Pyodide](https://pyodide.org/):

   ```html
   <script>
     let pyodideReady;
     async function ensurePyodide() {
       if (!pyodideReady) pyodideReady = loadPyodide();
       return pyodideReady;
     }
     window.LessonRunner = {
       async run(code) {
         const pyodide = await ensurePyodide();
         try {
           let stdout = '';
           pyodide.setStdout({ batched: (s) => (stdout += s + '\n') });
           await pyodide.runPythonAsync(code);
           return { stdout, stderr: '', error: null };
         } catch (err) {
           return { stdout: '', stderr: '', error: String(err) };
         }
       }
     };
   </script>
   ```

   Or point it at a server-side sandbox/API instead — the format doesn't
   care how code actually runs.

3. Wire up each editor with three pieces of markup that share one id
   (e.g. `practice1`):

   ```html
   <div class="interactive-editor" data-editor-id="practice1">
     <div class="editor-toolbar-small">
       <button class="btn-run" onclick="runEditorCode('practice1')">Run</button>
       <button class="btn-reset" onclick="resetEditor('practice1', 'print(1)')">Reset</button>
     </div>
     <textarea class="code-editor-small" id="editor-practice1">print(1)</textarea>
     <div class="editor-output" id="output-practice1">
       <div class="output-placeholder">Press Run to see output</div>
     </div>
   </div>
   ```

4. For graded exercises, add a `.exercise-feedback` div and register a
   validator in `window.exerciseSolutions`:

   ```html
   <div class="exercise-feedback" id="feedback-exercise1"></div>
   <script>
     window.exerciseSolutions = window.exerciseSolutions || {};
     window.exerciseSolutions.exercise1 = {
       solution: 'print("expected solution")',
       validator(code, output) {
         const correct = output.stdout.includes('expected');
         return { correct, message: correct ? 'Great job!' : 'Try again.' };
       }
     };
   </script>
   ```

   Wire `checkExercise('exercise1')` / `showSolution('exercise1')` to
   buttons the same way as `runEditorCode`.

## Re-theming

Everything is driven by CSS custom properties at the top of
`lesson-format.css`:

```css
:root {
  --bg: #F0F9FF;
  --panel: #FFFFFF;
  --text: #0F172A;
  --primary: #0EA5E9;
  --accent: #14B8A6;
  --border: #CBD5E1;
  /* ...etc */
}
[data-theme="dark"] { /* dark-mode overrides */ }
```

Change these to match your brand and the whole format (buttons, cards,
sidebar, code blocks, exercises) updates automatically. Toggle dark mode by
adding `data-theme-toggle` to any button — `lesson-format.js` handles the
rest (and persists the choice in `localStorage`).

## Notes on what was intentionally left out

To keep this kit portable and free of app-specific logic, a few things
from the original site were **not** copied over verbatim:

- The multi-unit mega-menu/dropdown in the header nav (very content-specific
  — a plain nav list is included instead; add your own dropdown if needed).
- Pyodide/Python-specific execution code (kept pluggable via
  `window.LessonRunner` instead, so you can use any language/backend).
- Site-wide progress tracking, settings pages, and other app-level features
  unrelated to the lesson page format itself.
