import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { collectPageContent } from '../assets/i18n/page-content.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const files = execFileSync('git', ['ls-files', '-z'], {cwd:root,encoding:'utf8'}).split('\0').filter(file => /^(?:[^/]+\.html|(?:units|data)\/.*\.html)$/.test(file)).sort();
const units = {}, pages = {};
for (const file of files) {
  const dom = new JSDOM(await readFile(resolve(root,file),'utf8'));
  const entries = collectPageContent(dom.window.document).map(entry => {
    const key = createHash('sha256').update(entry.source).digest('hex').slice(0,24);
    if (units[key] && units[key].source !== entry.source) throw new Error('Content hash collision');
    units[key] = {source:entry.source,tokens:entry.tokens};
    return {...entry,key};
  });
  pages[file] = entries.map(entry => entry.key);
  const output = resolve(root,'assets/i18n/pages/en',file+'.json');
  await mkdir(dirname(output),{recursive:true});
  await writeFile(output,JSON.stringify(entries)+'\n');
  dom.window.close();
}
await mkdir(resolve(root,'.audit/i18n'),{recursive:true});
await writeFile(resolve(root,'.audit/i18n/source.json'),JSON.stringify({units,pages}));
console.log(JSON.stringify({pages:files.length,units:Object.keys(units).length,charactersPerTarget:Object.values(units).reduce((n,item)=>n+item.source.length,0)}));
