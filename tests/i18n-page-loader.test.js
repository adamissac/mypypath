import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { collectPageContent } from '../assets/i18n/page-content.js';
import { createPageLoader } from '../assets/i18n/page-loader.js';

describe('page catalog loading', () => {
  it('waits for a complete page catalog before applying, then restores English', async () => {
    const d=new JSDOM('<p>Learn Python</p>').window.document;
    const entries=collectPageContent(d).map(entry=>({...entry,key:'lesson'}));
    const urls=[];
    const loader=createPageLoader(d,async url=>{urls.push(url);return url.includes('/en/')?entries:{lesson:['Apprendre Python']};},'/');
    const apply=await loader.prepare('fr');
    expect(d.querySelector('p').textContent).toBe('Learn Python');
    apply();
    expect(d.querySelector('p').textContent).toBe('Apprendre Python');
    (await loader.prepare('en'))();
    expect(d.querySelector('p').textContent).toBe('Learn Python');
    expect(urls).toEqual(['/assets/i18n/pages/en/index.html.json','/assets/i18n/pages/fr/index.html.json']);
  });

  it('rejects incomplete catalogs without changing page content', async () => {
    const d=new JSDOM('<p>Learn Python</p>').window.document;
    const entries=collectPageContent(d).map(entry=>({...entry,key:'lesson'}));
    const loader=createPageLoader(d,async url=>url.includes('/en/')?entries:{},'/units/unit-1/lesson.html');
    await expect(loader.prepare('fr')).rejects.toThrow('Incomplete');
    expect(d.querySelector('p').textContent).toBe('Learn Python');
  });
});
