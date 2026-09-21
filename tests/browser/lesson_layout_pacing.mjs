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
   // The reading column is capped rather than fluid: a lesson that filled the
   // window ran to 215 characters a line at 1920. What is held here is the
   // measure and a floor on the gutters, not a full-width canvas.
   const chars=await page.evaluate(()=>{
    const p=[...document.querySelectorAll('.lesson-content p')].find(e=>e.textContent.trim().length>120);
    if(!p)return null;const cs=getComputedStyle(p);
    const cv=document.createElement('canvas').getContext('2d');cv.font=`${cs.fontSize} ${cs.fontFamily}`;
    return Math.round(p.getBoundingClientRect().width/(cv.measureText('abcdefghijklmnopqrstuvwxyz ').width/27));
   });
   // 45-90 is the usual comfortable range. The column deliberately sits at the
   // wide end of it: capped tighter, a laptop showed ~200px of empty page down
   // each side and the lesson read as a strip marooned in the middle.
   if(chars) assert.ok(chars<=92,`${prefix}/${unit}/${width}: ${chars} characters a line`);
   // ...and the gutters it buys. Above 1440 the canvas is capped, so this only
   // holds where the lesson should be filling the window.
   if(width>=1280&&width<=1512){
    const toc=await page.locator('.lesson-toc--docked').boundingBox();
    if(toc) assert.ok(toc.x<=170,`${prefix}/${unit}/${width}: ${Math.round(toc.x)}px of empty page at the left edge`);
   }
   assert.ok(before.x>=16,`${prefix}/${unit}/${width}: left gutter ${before.x}`);
   assert.ok(width-before.x-before.width>=16,`${prefix}/${unit}/${width}: right gutter`);
   if(width>=1024){
    const toc=await page.locator('.lesson-toc--docked').boundingBox();
    assert.ok(toc&&toc.x>=16,`${prefix}/${unit}/${width}: contents column missing or flush left`);
    assert.ok(toc.x+toc.width<before.x,`${prefix}/${unit}/${width}: contents column overlaps the lesson`);
   }
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
  if(width<1024) await page.locator('.lesson-toc__summary').click();
  assert.ok(await page.locator('.lesson-toc__link').filter({hasText:'Quick check'}).count()>=3);
  // Every link resolves, and the list is in reading order.
  const positions=await page.locator('.lesson-toc__link').evaluateAll(links=>links.map(a=>{
   const h=document.getElementById(decodeURIComponent(a.hash.slice(1)));
   if(!h) throw new Error('dead contents link '+a.hash);
   return h.getBoundingClientRect().top;}));
  assert.deepEqual(positions,[...positions].sort((a,b)=>a-b));
  // The review link is rendered with the quiz but its target heading and click
  // handler settle a tick later; clicking inside that window leaves focus on
  // the link. Previously the outline's summary click covered this by accident.
  const review=page.locator('.quiz-inline .quiz-review-link').first();
  await review.waitFor();
  await page.waitForFunction(()=>{
   const a=document.querySelector('.quiz-inline .quiz-review-link');
   return a && document.getElementById(decodeURIComponent(a.hash.slice(1)));
  });
  await page.waitForTimeout(200);
  await review.click();
  // As above: the heading is where focus settles, not necessarily where it
  // is on the frame the click returns.
  await page.waitForFunction(()=>document.activeElement.tagName==='H2',null,{timeout:5000});
  await page.locator('#editor-practice-transfer + .CodeMirror').waitFor();
  assert.equal(await page.locator('.lesson-back-link').getAttribute('href'),path.startsWith('/data')?'/data.html':'/index.html');
  const audit=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  assert.deepEqual(audit.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[]);
  if(path.startsWith('/data') && width===1440) {
   await page.locator('[data-editor-id="practice-transfer"] .btn-run').click();
   // Pyodide's runtime is fetched from a CDN on first use. A warm cache runs
   // this in about a second; a cold one has to pull the whole interpreter
   // first, which has taken longer than two minutes here. The wait is sized
   // for the cold case so a CI run does not fail on a download.
   await page.waitForFunction(()=>document.getElementById('output-practice-transfer').textContent.includes('Lee, Jo') && document.getElementById('output-practice-transfer').textContent.includes('18'),{},{timeout:240000});
   await page.locator('#editor-practice-transfer + .CodeMirror').evaluate(el=>el.CodeMirror.setValue('print(999)'));
   await page.locator('[data-editor-id="practice-transfer"] .btn-reset').click();
   assert.match(await page.locator('#editor-practice-transfer + .CodeMirror').evaluate(el=>el.CodeMirror.getValue()),/import csv/);
   console.log('PASS transfer editor runs real Python and resets to the authored starter');
  }
  // A refresh on #some-topic lands on that section, clear of the fixed header.
  const slug=await page.locator('.lesson-toc__link').nth(1).evaluate(a=>a.hash);
  await page.goto(base+path+slug);
  await page.locator('.lesson-toc').waitFor();
  await page.waitForTimeout(400);
  const landed=await page.evaluate(h=>{
   const el=document.getElementById(decodeURIComponent(h.slice(1)));
   const header=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-height'))||76;
   return {top:el.getBoundingClientRect().top,header};},slug);
  assert.ok(landed.top>=landed.header,`deep link parked "${slug}" under the header: ${JSON.stringify(landed)}`);
  assert.ok(landed.top<landed.header+220,`deep link missed "${slug}": ${JSON.stringify(landed)}`);
  await page.locator('.quiz-inline').first().scrollIntoViewIfNeeded();
  await page.screenshot({path:`/tmp/pacing-${path.startsWith('/data')?'data':'python'}-${width}.png`});
  console.log(`PASS lesson ${path} ${width}: interleaving, final review, outline order, editor, exit link, axe`);
  await context.close();
 }

 /* A short window is where the contents column has to scroll inside itself.
    At 1000px tall nothing overflows, which is why this was silently broken:
    <details> puts its children in an anonymous content box, the flex chain
    from the panel never reached the list, and on a 560px-tall window the list
    ran hundreds of pixels below the fold with no way to reach its last
    topics. */
 {
  const context=await browser.newContext({viewport:{width:1440,height:560},reducedMotion:'reduce'});
  const page=await context.newPage();
  await page.goto(base+'/units/unit-1/variables-types.html');
  await page.locator('.lesson-toc--docked').waitFor();
  await page.waitForTimeout(500);
  const fits=await page.evaluate(()=>{
   const list=document.querySelector('.lesson-toc__list');
   const panel=document.querySelector('.lesson-toc--docked');
   return {scrolls:list.scrollHeight>list.clientHeight+1,
    panelHeight:Math.round(panel.getBoundingClientRect().height),vh:innerHeight};
  });
  assert.ok(fits.scrolls,'a 13-topic list does not scroll inside itself at 560px tall');
  assert.ok(fits.panelHeight<fits.vh,`contents panel ${fits.panelHeight}px in a ${fits.vh}px window`);
  // Reaching the last section moves the list, not the page, and keeps the
  // current topic visible.
  await page.evaluate(()=>{const ls=document.querySelectorAll('.lesson-toc__link');
   document.getElementById(decodeURIComponent(ls[ls.length-1].hash.slice(1))).scrollIntoView();});
  await page.waitForTimeout(600);
  const tracked=await page.evaluate(()=>{
   const list=document.querySelector('.lesson-toc__list');
   const active=list.querySelector('a.is-active');
   if(!active) return {ok:false,why:'no active topic'};
   const l=list.getBoundingClientRect(),a=active.getBoundingClientRect();
   return {ok:a.top>=l.top-1&&a.bottom<=l.bottom+1,scrollTop:Math.round(list.scrollTop),
    overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth};
  });
  assert.ok(tracked.ok,`current topic not visible in the list: ${JSON.stringify(tracked)}`);
  assert.ok(tracked.scrollTop>0,'the list never scrolled to follow the reader');
  assert.equal(tracked.overflow,0);
  console.log('PASS 1440x560: contents list scrolls inside itself and follows the reader');
  await context.close();
 }

 /* Shutting the contents column must not move the lesson.
    The version of a collapsible menu this replaced was a column in the
    lesson's own grid: opening it moved the left edge and re-wrapped the
    paragraph the reader was in the middle of. The grid track keeps its width
    in both states, so the freed space becomes gutter rather than being handed
    to the text. */
 {
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const page=await context.newPage();
  await page.goto(base+'/units/unit-1/variables-types.html');
  await page.locator('.lesson-toc--docked').waitFor();
  await page.waitForTimeout(600);
  const toggle=page.locator('.lesson-toc__toggle');
  const open=await page.locator('.course-main').boundingBox();
  await toggle.click();
  await page.waitForTimeout(300);
  const shut=await page.locator('.course-main').boundingBox();
  assert.ok(Math.abs(shut.x-open.x)<1&&Math.abs(shut.width-open.width)<1,
   `shutting the contents column moved the lesson: ${JSON.stringify({open,shut})}`);
  assert.equal(await page.locator('.lesson-toc__nav').evaluate(n=>n.hidden),true);
  assert.equal(await toggle.getAttribute('aria-expanded'),'false');
  assert.equal(await toggle.evaluate(el=>el===document.activeElement),true);

  // It is remembered on the next lesson, and reopening puts everything back.
  await page.goto(base+'/units/unit-1/type-io.html');
  await page.locator('.lesson-toc--docked').waitFor();
  await page.waitForTimeout(600);
  assert.equal(await page.locator('.lesson-toc').evaluate(el=>el.classList.contains('is-collapsed')),true);
  const stillShut=await page.locator('.course-main').boundingBox();
  await page.locator('.lesson-toc__toggle').click();
  await page.waitForTimeout(300);
  const reopened=await page.locator('.course-main').boundingBox();
  assert.ok(Math.abs(reopened.x-stillShut.x)<1&&Math.abs(reopened.width-stillShut.width)<1,
   'reopening the contents column moved the lesson');
  assert.ok(await page.locator('.lesson-toc__link').count()>1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  console.log('PASS contents column shuts, reopens, is remembered, and never moves the lesson');
  await context.close();
 }
} finally {await browser.close();}
