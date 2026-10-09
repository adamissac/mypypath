import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { openSync, closeSync, unlinkSync } from 'node:fs';
import { translateBatch, packBatches } from './lib/azure-translator.mjs';
import { parseTranslatedUnit } from '../assets/i18n/page-content.js';

const root = fileURLToPath(new URL('..',import.meta.url));
const configDir = resolve(homedir(),'.config/mypypath');
const json = async path => JSON.parse(await readFile(path,'utf8'));
const write = async (path,value) => { await mkdir(dirname(path),{recursive:true}); await writeFile(path+'.tmp',JSON.stringify(value)+'\n',{mode:0o600}); await rename(path+'.tmp',path); };
const registry = await json(resolve(root,'assets/i18n/languages.json'));
const english = await json(resolve(root,'assets/i18n/en.json'));
const inventory = await json(resolve(root,'.audit/i18n/source.json'));
const args = process.argv.slice(2);
const shellOnly = args.includes('--shell-only');
const requested = args.find(arg => arg.startsWith('--locale='))?.split('=')[1];
const selectedPage = args.find(arg => arg.startsWith('--page='))?.slice('--page='.length);
const priorityLimit = Number(args.find(arg=>arg.startsWith('--priority-characters='))?.split('=')[1] || 0);
if (selectedPage && !inventory.pages[selectedPage]) throw new Error('Unknown page');
const locales = registry.locales.filter(locale => locale.tag !== 'en' && (!requested || locale.tag === requested));
if (!locales.length) throw new Error('Unknown target locale');
const document = new JSDOM('').window.document;
const escape = value => value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const shellUnits = Object.entries(english).map(([key,value]) => ({ key, source:'<div>'+escape(value).replace(/\{[a-zA-Z][a-zA-Z0-9]*\}/g, token=>`<span class="notranslate">${token}</span>`)+'</div>' }));
const pageKeys = selectedPage ? new Set(inventory.pages[selectedPage]) : null;
let units = shellOnly ? shellUnits : Object.entries(inventory.units).filter(([key])=>!pageKeys || pageKeys.has(key)).map(([key,entry])=>({key,...entry}));
if (priorityLimit && !shellOnly) {
  const priorityPages = Object.keys(inventory.pages).filter(page=>!page.includes('/')).concat([
    'units/unit-1/what-is-python.html','data/unit-1/what-is-data-analysis.html',
    'units/unit-1/first-program.html','data/unit-1/rows-and-columns-with-lists.html',
    'units/unit-1/variables-types.html','data/unit-1/records-as-dictionaries.html'
  ]);
  const ordered = [...new Set(priorityPages.flatMap(page=>inventory.pages[page]||[]).concat(units.map(unit=>unit.key)))];
  const selected=[]; let cost=0;
  for(const key of ordered){const entry=inventory.units[key]; if(cost+entry.source.length>priorityLimit) continue; selected.push({key,...entry});cost+=entry.source.length;}
  units=selected;
}
const estimate = units.reduce((sum,entry)=>sum+Array.from(entry.source).length,0)*locales.length;
console.log(JSON.stringify({mode:shellOnly?'shell':'pages',locales:locales.map(x=>x.tag),charactersBeforeCache:estimate}));
if (!args.includes('--run')) process.exit(0);
const config = await json(resolve(configDir,'translator.json'));
const lockPath=resolve(configDir,'translator.lock');
const lock=openSync(lockPath,'wx',0o600);
process.on('exit',()=>{closeSync(lock);unlinkSync(lockPath);});
process.on('SIGINT',()=>process.exit(130));
process.on('SIGTERM',()=>process.exit(143));
const usagePath = resolve(configDir,'translator-usage.json');
const month = new Date().toISOString().slice(0,7);
let usage = {month,reserved:0};
try { const saved = await json(usagePath); if (saved.month === month) usage = saved; } catch (error) { if (error.code !== 'ENOENT') throw error; }
// Keep a buffer for portal tests. Increasing this requires an explicit budget
// decision; no resource is upgraded by this script.
const limit = Number(process.env.PYPATH_TRANSLATOR_CHARACTER_LIMIT || 1900000);
if (!Number.isSafeInteger(limit) || limit <= 0) throw new Error('Invalid character limit');
for (const locale of locales) {
  const cachePath = resolve(root,'.audit/i18n/cache',`${shellOnly?'shell':'pages'}-${locale.tag}.json`);
  let cache = {};
  try { cache = await json(cachePath); } catch(error) { if(error.code !== 'ENOENT') throw error; }
  const pending = units.filter(unit=>cache[unit.key]?.source !== unit.source);
  for (const batch of packBatches(pending)) {
    const cost = batch.reduce((sum,entry)=>sum+Array.from(entry.source).length,0);
    if (usage.reserved + cost > limit) throw new Error('Configured translation allowance reached. Cached progress is preserved.');
    usage.reserved += cost;
    await write(usagePath,usage);
    let translated;
    for(let attempt=0;!translated;attempt++) {
      try { translated = await translateBatch(batch.map(entry=>entry.source),locale.tag,config); }
      catch(error) {
        if(error.status!==429 || attempt>=5) throw error;
        const delay=Math.max(error.retryAfterMs,60000*(attempt+1));
        console.log(`${locale.tag}: Azure rate limit; honoring ${delay}ms backoff`);
        await new Promise(resolve=>setTimeout(resolve,delay));
      }
    }
    for (let i=0;i<batch.length;i++) {
      const entry=batch[i];
      let value;
      if (shellOnly) {
        const template=document.createElement('template'); template.innerHTML=translated[i];
        value=template.content.textContent;
        const tokens=text=>(text.match(/\{[a-zA-Z][a-zA-Z0-9]*\}/g)||[]).sort().join('|');
        if (tokens(value)!==tokens(english[entry.key])) throw new Error('Shell placeholder mismatch');
      } else value=parseTranslatedUnit(document,translated[i],entry);
      cache[entry.key]={source:entry.source,value};
    }
    await write(cachePath,cache);
    console.log(`${locale.tag}: ${Object.keys(cache).length}/${units.length} units cached; ${usage.reserved} characters reserved this month`);
    // Sequential requests, plus service-directed backoff on 429 responses.
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  if (shellOnly) {
    const overrides = await json(resolve(root,'assets/i18n/ui-overrides.json'));
    await write(resolve(root,'assets/i18n',locale.tag+'.json'),{...Object.fromEntries(units.map(unit=>[unit.key,cache[unit.key].value])),...overrides[locale.tag]});
  }
  else for (const [page,keys] of Object.entries(inventory.pages)) {
    if (selectedPage && page !== selectedPage) continue;
    await write(resolve(root,'assets/i18n/pages',locale.tag,page+'.json'),Object.fromEntries(keys.filter(key=>cache[key]?.source===inventory.units[key].source).map(key=>[key,cache[key].value])));
  }
}
