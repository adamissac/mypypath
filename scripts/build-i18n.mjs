import { build } from 'esbuild';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
await build({
  entryPoints: [resolve(root, 'assets/i18n/entry.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2022'],
  outfile: resolve(root, 'assets/js/i18n.js'),
  legalComments: 'none'
});
console.log('Built self-contained localization runtime');
