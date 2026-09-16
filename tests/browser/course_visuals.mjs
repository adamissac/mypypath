/* Course palette and presentation contract. Run with a static server. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import AxeBuilder from '@axe-core/playwright';
const base=process.argv[2]||'http://localhost:8096';
const browser=await chromium.launch();
try {
 for(const theme of ['light','dark']) for(const width of [390,1440]) {
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
  await context.addInitScript(theme=>{localStorage.setItem('pypath-course','data');localStorage.setItem('pypath-theme',theme);},theme);
  const page=await context.newPage();
  await page.goto(base+'/courses.html');
  assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
  await page.waitForTimeout(500);
  assert.equal(await page.locator('.journey-card').count(),2);
  assert.equal(await page.locator('.journey-card--space').getAttribute('href'),'/data.html');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const audit=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();
  assert.deepEqual(audit.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);
  await page.goto(base+'/');
  await page.waitForFunction(()=>window.PyPathTrail);
  await page.evaluate(()=>window.PyPathTrail.scrollToProgress(.7));
  await page.getByRole('button',{name:'Yes, explore space'}).click();
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  assert.equal(await page.locator('html').getAttribute('data-course'),'data');
  await page.waitForTimeout(300); // allow the course palette transition to settle
  assert.equal(await page.locator('.home-summit__mountain').count(),0);
  assert.equal(await page.locator('.home-summit__moon').evaluate(e=>getComputedStyle(e).animationName),'none');
  const token=page.locator('.hero-live-highlight .tok-fn').first();
  if(await token.count()) assert.equal(await token.evaluate(el=>getComputedStyle(el).color),theme==='light'?'rgb(121, 75, 145)':'rgb(237, 213, 255)');
  const gradients=await page.evaluate(()=>[...document.querySelectorAll('*')].filter(el=>['',':before',':after'].some(p=>getComputedStyle(el,p||null).backgroundImage.includes('gradient('))).length);
  assert.equal(gradients,0);
  await page.goto(base+'/data/unit-1/what-is-data-analysis.html');
  assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
  await page.waitForTimeout(500);
  const editor=page.locator('.CodeMirror').first();
  await editor.waitFor({state:'attached'});
  const colors=await editor.evaluate(el=>{const probe=document.createElement('i');probe.style.backgroundColor='var(--pp-mist)';el.appendChild(probe);const result=[getComputedStyle(el).backgroundColor,getComputedStyle(probe).backgroundColor];probe.remove();return result;});
  assert.equal(colors[0],colors[1]);
  const number=page.locator('.CodeMirror .cm-number').first();
  assert.equal(await number.evaluate(el=>getComputedStyle(el).color),theme==='light'?'rgb(140, 60, 99)':'rgb(242, 179, 210)');
  console.log(`${theme} ${width}px: course cards, accessibility, Data syntax colors, flat surfaces, and reduced motion pass`);
  await context.close();
 }
} finally { await browser.close(); }
