/* Render assets/img/summit-diorama.webp from the live scene, at rest, in day
   light, for a first-time visitor. The still is what no-JS, reduced-motion and
   slow-connection visitors see, and what the scene cross-fades from when it
   arrives late, so it is drawn by the same renderer rather than separately.

     node scripts/build-summit.mjs && node scripts/summit/render-still.mjs */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'assets/img/summit-diorama.webp');
const TYPES = { '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.html': 'text/html' };

const server = createServer(async (req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/__still.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!doctype html><html><body style="margin:0;background:transparent">
      <div id="host" style="width:1024px;height:1024px;position:relative"></div>
      <script type="module">
        const m = await import('/assets/js/summit-scene.js');
        const host = document.getElementById('host');
        await m.mountSummit(host, { plan: 'none', theme: 'light', completedUnits: [],
          onReady: ({ canvas }) => { canvas.style.opacity = 1; host.append(canvas); window.ready = true; },
          onFail: (e) => { window.failed = String(e); } });
      </script></body></html>`);
    return;
  }
  const file = path.join(ROOT, url);
  try {
    if (!file.startsWith(ROOT) || (await stat(file)).isDirectory()) throw new Error();
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
  await page.goto(`${BASE}/__still.html`);
  await page.waitForFunction(() => window.ready || window.failed, null, { timeout: 60000 });
  if (await page.evaluate(() => window.failed)) throw new Error(await page.evaluate(() => window.failed));
  await page.waitForTimeout(1500); // clouds and birds settle into place
  const png = path.join(ROOT, 'assets/img/.summit-still.png');
  await page.locator('canvas').screenshot({ path: png, omitBackground: true });
  execFileSync('python3', ['-c', `from PIL import Image; Image.open(${JSON.stringify(png)}).save(${JSON.stringify(OUT)}, 'WEBP', quality=82, method=6)`]);
  await writeFile(png, '');
  execFileSync('rm', ['-f', png]);
  const size = (await stat(OUT)).size;
  console.log(`wrote assets/img/summit-diorama.webp (${Math.round(size / 1024)} KB)`);
  if (size > 120 * 1024) { console.error('over the 120 KB budget'); process.exitCode = 1; }
} finally {
  await browser.close();
  server.close();
}
