/* Bundle the summit scene (assets/summit/*.js + three.js r186 + GLTFLoader +
   MeshoptDecoder) into one versioned file, and point the bootstrap at it.

     node scripts/build-summit.mjs          # write assets/js/summit-scene.js
     node scripts/build-summit.mjs --check  # exit 1 if it is stale

   Both URLs carry a content hash: the model's inside the bundle, the bundle's
   inside assets/js/summit-3d.js. /assets/(css|js)/* is cached for an hour, so a
   new model behind an old URL would not reach a returning visitor. */
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(root, 'assets/js/summit-scene.js');
const BOOT = resolve(root, 'assets/js/summit-3d.js');
const MODEL = resolve(root, 'assets/models/summit.glb');
const check = process.argv.includes('--check');
const hash = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 10);

const modelUrl = `/assets/models/summit.glb?v=${hash(readFileSync(MODEL))}`;
const result = await build({
  entryPoints: [resolve(root, 'assets/summit/entry.js')],
  bundle: true,
  format: 'esm',
  minify: true,
  target: ['es2020'],
  legalComments: 'none',
  write: false,
  define: { __SUMMIT_MODEL_URL__: JSON.stringify(modelUrl) },
  logLevel: 'silent',
});
const code = Buffer.from(result.outputFiles[0].contents);
const sceneUrl = `/assets/js/summit-scene.js?v=${hash(code)}`;

const boot = existsSync(BOOT) ? readFileSync(BOOT, 'utf8') : '';
const SCENE_LINE = /var SCENE_SRC = '[^']*';/;
const nextBoot = SCENE_LINE.test(boot) ? boot.replace(SCENE_LINE, `var SCENE_SRC = '${sceneUrl}';`) : boot;

if (check) {
  const stale = [];
  if (!existsSync(OUT) || !readFileSync(OUT).equals(code)) stale.push('assets/js/summit-scene.js');
  if (SCENE_LINE.test(boot) && nextBoot !== boot) stale.push('assets/js/summit-3d.js');
  if (stale.length) {
    console.error(`stale: ${stale.join(', ')} -- run node scripts/build-summit.mjs`);
    process.exit(1);
  }
  console.log('summit bundle is up to date');
} else {
  writeFileSync(OUT, code);
  if (nextBoot !== boot) writeFileSync(BOOT, nextBoot);
  console.log(`wrote assets/js/summit-scene.js (${Math.round(code.length / 1024)} KB), ${sceneUrl}`);
}
