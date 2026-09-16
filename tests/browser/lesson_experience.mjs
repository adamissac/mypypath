import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import AxeBuilder from '@axe-core/playwright';
const base=process.argv[2]||'http://localhost:8096';
const browser=await chromium.launch();
try {
 for(const path of ['/data/unit-1/reading-a-csv-file.html','/units/unit-1/first-program.html']) {
  for(const width of [390,1440]) for(const theme of ['light','dark']) {
   const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
   await context.addInitScript(t=>localStorage.setItem('pypath-theme',t),theme);
   const page=await context.newPage();await page.goto(base+path);
   await page.locator('.CodeMirror').first().waitFor();
   await page.getByText('In this lesson',{exact:false}).first().click();
   const link=page.locator('.lesson-outline a').filter({hasText:'Predict, then check'}).first();
   await link.click();
   assert.equal(await page.evaluate(()=>document.activeElement.tagName),'H2');
   await page.locator('.worked-answer summary').first().click();
   assert.equal(await page.locator('.checkpoint-output').first().isVisible(),true);
   await page.locator('.practice-box').first().scrollIntoViewIfNeeded();
   await page.waitForTimeout(300);
   const geometry=await page.locator('.CodeMirror').first().evaluate(cm=>{
    const gutter=cm.querySelector('.CodeMirror-gutters').getBoundingClientRect();
    const line=cm.querySelector('.CodeMirror-code pre');
    const walker=document.createTreeWalker(line,NodeFilter.SHOW_TEXT);let text;while((text=walker.nextNode())&&!text.textContent.trim()){}
    const range=document.createRange();range.setStart(text,0);range.setEnd(text,1);
    return {gutterRight:gutter.right,charLeft:range.getBoundingClientRect().left};
   });
   assert.ok(geometry.charLeft>=geometry.gutterRight,JSON.stringify(geometry));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   const audit=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
   assert.deepEqual(audit.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);
   console.log(`${path}: ${width}px ${theme}, section jump, worked answer, unclipped editor, accessibility pass`);
   await context.close();
  }
 }
 // Real Python execution: controls must still work after the UI enhancement.
 const page=await browser.newPage({reducedMotion:'reduce'});
 await page.goto(base+'/data/unit-1/reading-a-csv-file.html');
 await page.waitForFunction(()=>window.editors?.practice1);
 await page.evaluate(()=>window.editors.practice1.setValue('print(2 + 3)'));
 await page.locator('[data-editor-id="practice1"] .btn-run').click();
 await page.waitForFunction(()=>/^5\s*$/.test(document.getElementById('output-practice1').textContent.trim()),null,{timeout:120000});
 await page.locator('[data-editor-id="practice1"] .btn-reset').click();
 assert.match(await page.evaluate(()=>window.editors.practice1.getValue()),/import csv/);
 console.log('Real Python run returned 5; reset restored the CSV starter.');
} finally {await browser.close();}
