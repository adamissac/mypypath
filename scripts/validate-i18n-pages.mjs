import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('..',import.meta.url));
const json=async file=>JSON.parse(await readFile(resolve(root,file),'utf8'));
const registry=await json('assets/i18n/languages.json');
const pages=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(file=>/^(?:[^/]+\.html|(?:units|data)\/.*\.html)$/.test(file));
const totals=[];
for(const locale of registry.locales.filter(item=>item.tag!=='en'&&['ready','partial'].includes(item.status))) {
  let translated=0,total=0,completeStaticPages=0;
  for(const page of pages) {
    const source=await json('assets/i18n/pages/en/'+page+'.json');
    const target=await json('assets/i18n/pages/'+locale.tag+'/'+page+'.json');
    if (!target || Array.isArray(target) || typeof target!=='object') throw new Error(`${locale.tag}/${page}: invalid catalog`);
    let matched=0;
    for(const entry of source) {
      total++;
      const parts=target[entry.key];
      if(parts===undefined){if(locale.status==='ready')throw new Error(`${locale.tag}/${page}: missing ${entry.key}`);continue;}
      if(!Array.isArray(parts))throw new Error(`${locale.tag}/${page}: invalid parts`);
      const refs=parts.filter(part=>typeof part!=='string');
      if(refs.length!==entry.tokens || new Set(refs.map(part=>part?.token)).size!==entry.tokens || refs.some(part=>!Number.isInteger(part?.token)||part.token<0||part.token>=entry.tokens))throw new Error(`${locale.tag}/${page}: invalid inline tokens`);
      translated++;matched++;
    }
    if(matched===source.length)completeStaticPages++;
  }
  totals.push({locale:locale.tag,translatedOccurrences:translated,totalOccurrences:total,completeStaticPages,pages:pages.length});
}
console.log(JSON.stringify(totals,null,2));
