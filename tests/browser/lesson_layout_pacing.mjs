import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
const base=process.argv[2]||'http://localhost:8096';
const browser=await chromium.launch();
try {
 for(const width of (process.argv.includes('--lessons-only')?[]:[390,1440,1920])) {
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
  const page=await context.newPage();
  for(const prefix of ['units','data']) for(let unit=1;unit<=10;unit++) {
   const manifest=JSON.parse(fs.readFileSync(prefix==='data'?'assets/data/curriculum-data.json':'assets/data/curriculum.json'));
   const lesson=manifest.lessons.find(l=>l.unit===unit);
   await page.goto(base+lesson.path);
   const toggle=page.locator('.sidebar-toggle-btn');
   await toggle.waitFor();
   await page.locator('.course-sidebar[role="dialog"]').waitFor({state:'attached'});
   const before=await page.locator('.course-main').boundingBox();
   assert.ok(before.x<=33,`${prefix}/${unit}/${width}: left ${before.x}`);
   assert.ok(width-before.x-before.width<=33,`${prefix}/${unit}/${width}: right gutter`);
   await toggle.click();
   await page.getByRole('button',{name:'Close lesson menu'}).waitFor();
   const open=await page.locator('.course-main').boundingBox();
   assert.ok(Math.abs(before.x-open.x)<1&&Math.abs(before.width-open.width)<1,'opening menu moved content');
   await page.keyboard.press('Escape');
   assert.equal(await page.locator('.course-sidebar').isVisible(),false);
   assert.equal(await toggle.evaluate(el=>el===document.activeElement),true);
   const after=await page.locator('.course-main').boundingBox();
   assert.ok(Math.abs(before.x-after.x)<1&&Math.abs(before.width-after.width)<1,'closing menu moved content');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  console.log(`PASS all 20 unit layouts at ${width}px: gutters, open/close, Escape, focus, overflow`);
  await context.close();
 }
 for(const path of ['/units/unit-1/variables-types.html','/data/unit-1/reading-a-csv-file.html']) for(const width of [390,1440]) {
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
  const page=await context.newPage();await page.goto(base+path);
  console.log(`Checking lesson ${path} at ${width}`);
  await page.locator('.quiz-inline').first().waitFor();
  const result=await page.evaluate(()=>{
   const content=document.querySelector('.lesson-content');
   const quizzes=[...content.querySelectorAll('.quiz')];
   return {inline:quizzes.filter(q=>q.classList.contains('quiz-inline')).length,
    final:content.querySelector('.quiz-final').querySelectorAll('.quiz-q').length,
    teaching:quizzes.filter(q=>q.classList.contains('quiz-inline')).every(q=>q.previousElementSibling.matches('.content-section')),
    ids:[...content.querySelectorAll('.quiz-q')].map(q=>q.dataset.questionId)};
  });
  assert.ok(result.inline>=3);assert.equal(result.final,2);assert.ok(result.teaching);
  assert.equal(new Set(result.ids).size,result.ids.length);
  await page.locator('.lesson-outline summary').click();
  assert.ok(await page.locator('.lesson-outline a').filter({hasText:'Quick check'}).count()>=3);
  const positions=await page.locator('.lesson-outline a').evaluateAll(links=>links.map(a=>document.querySelector(a.hash).getBoundingClientRect().top));
  assert.deepEqual(positions,[...positions].sort((a,b)=>a-b));
  await page.locator('.quiz-inline .quiz-review-link').first().click();
  assert.equal(await page.evaluate(()=>document.activeElement.tagName),'H2');
  await page.locator('#editor-practice-transfer + .CodeMirror').waitFor();
  assert.equal(await page.locator('.lesson-back-link').getAttribute('href'),path.startsWith('/data')?'/data.html':'/index.html');
  const audit=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  assert.deepEqual(audit.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[]);
  if(path.startsWith('/data') && width===1440) {
   await page.locator('[data-editor-id="practice-transfer"] .btn-run').click();
   await page.waitForFunction(()=>document.getElementById('output-practice-transfer').textContent.includes('Lee, Jo') && document.getElementById('output-practice-transfer').textContent.includes('18'),{},{timeout:120000});
   await page.locator('#editor-practice-transfer + .CodeMirror').evaluate(el=>el.CodeMirror.setValue('print(999)'));
   await page.locator('[data-editor-id="practice-transfer"] .btn-reset').click();
   assert.match(await page.locator('#editor-practice-transfer + .CodeMirror').evaluate(el=>el.CodeMirror.getValue()),/import csv/);
   console.log('PASS transfer editor runs real Python and resets to the authored starter');
  }
  await page.locator('.quiz-inline').first().scrollIntoViewIfNeeded();
  await page.screenshot({path:`/tmp/pacing-${path.startsWith('/data')?'data':'python'}-${width}.png`});
  console.log(`PASS lesson ${path} ${width}: interleaving, final review, outline order, editor, exit link, axe`);
  await context.close();
 }
} finally {await browser.close();}
