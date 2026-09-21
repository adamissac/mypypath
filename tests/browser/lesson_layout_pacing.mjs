import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
const base=process.argv[2]||'http://localhost:8096';
const browser=await chromium.launch();
try {
 /* The lesson layout is a product decision, not a typographic one: near full
    width, with the unit's lesson list as a real column that hands its space to
    the lesson when it closes. See CLAUDE.md.

    Deliberately NOT asserted here: a character-per-line ceiling, and that the
    lesson does not move when the menu opens. Both were held by this file
    before and both encode the opposite layout -- a capped, centred column, and
    a menu that overlays rather than reflows. Long lines on a wide window are
    the accepted trade-off, and the reflow is the point of the control. */
 async function headerSettled(page){
  // The header fades in. Measuring during that is measuring a transition.
  await page.waitForFunction(()=>{const h=document.querySelector('.site-header');
   return h&&getComputedStyle(h).opacity==='1';});
  await page.waitForTimeout(250);
 }

 for(const width of (process.argv.includes('--lessons-only')?[]:[390,1280,1440,1920])) {
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
  const page=await context.newPage();
  for(const prefix of ['units','data']) for(let unit=1;unit<=10;unit++) {
   const manifest=JSON.parse(fs.readFileSync(prefix==='data'?'assets/data/curriculum-data.json':'assets/data/curriculum.json'));
   const lesson=manifest.lessons.find(l=>l.unit===unit);
   const where=`${prefix}/${unit}/${width}`;
   await page.goto(base+lesson.path);
   await page.locator('.course-sidebar').waitFor({state:'attached'});
   await headerSettled(page);

   const open=await page.locator('.course-main').boundingBox();
   assert.ok(open.x>=16,`${where}: left gutter ${Math.round(open.x)}`);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${where}: horizontal overflow`);
   assert.equal(await page.evaluate(()=>{
    const p=[...document.querySelectorAll('.lesson-content p')].find(e=>e.textContent.trim().length>120);
    return p?getComputedStyle(p).fontSize:'16px';
   }),'16px',`${where}: body text is not 16px`);

   if(width>=981){
    // The lesson list is a column, showing THIS unit's lessons, with the
    // current one marked.
    const sidebar=await page.locator('.course-sidebar').boundingBox();
    assert.ok(sidebar&&sidebar.width>200,`${where}: no lesson sidebar`);
    assert.ok(sidebar.x>=16&&sidebar.x<=72,`${where}: sidebar at ${Math.round(sidebar.x)}px`);
    assert.ok(sidebar.x+sidebar.width<=open.x,`${where}: sidebar overlaps the lesson`);
    const list=await page.evaluate(()=>{
     const s=document.querySelector('.course-sidebar');
     return {links:s.querySelectorAll('a').length,
             current:s.querySelectorAll('a.active,a[aria-current="page"]').length,
             dialog:!!s.getAttribute('role')};
    });
    assert.ok(list.links>=4,`${where}: sidebar lists ${list.links} lessons`);
    assert.equal(list.current,1,`${where}: ${list.current} lessons marked current`);
    assert.equal(list.dialog,false,`${where}: the column is still a dialog`);
    // Gutters stay small: this layout fills the window rather than centring a
    // capped column.
    const right=width-open.x-open.width;
    assert.ok(sidebar.x<=72&&right<=72,`${where}: gutters ${Math.round(sidebar.x)}/${Math.round(right)} exceed 72px`);

    // Closing hands the space to the lesson: it moves left and gets wider.
    await page.locator('.sidebar-collapse-btn').click();
    await page.waitForTimeout(450);
    const shut=await page.locator('.course-main').boundingBox();
    assert.ok(shut.x<open.x-100,`${where}: closing did not move the lesson left`);
    assert.ok(shut.width>open.width+100,`${where}: closing did not widen the lesson`);
    assert.ok(shut.x>=16&&width-shut.x-shut.width>=16,`${where}: gutters lost when shut`);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${where}: overflow when shut`);
    // The floating chip is the way back, and it must not sit on the breadcrumb.
    const clash=await page.evaluate(()=>{
     const r=document.querySelector('.sidebar-reopen-btn');
     const home=document.querySelector('.course-main > nav[aria-label="Breadcrumb"] a');
     if(!r||r.hidden||!home)return 'missing';
     const a=r.getBoundingClientRect(),b=home.getBoundingClientRect();
     return !(a.right<b.left||a.left>b.right||a.bottom<b.top||a.top>b.bottom);
    });
    assert.equal(clash,false,`${where}: the Lessons chip covers the breadcrumb`);

    // Reopening restores the original box exactly.
    await page.locator('.sidebar-reopen-btn').click();
    await page.waitForTimeout(450);
    const again=await page.locator('.course-main').boundingBox();
    assert.ok(Math.abs(again.x-open.x)<1&&Math.abs(again.width-open.width)<1,
     `${where}: reopening did not restore the lesson box`);
   } else {
    // Below 981 the list is a drawer over the page, not a column.
    assert.ok(await page.locator('.sidebar-toggle').isVisible(),`${where}: no way to open the lesson list`);
    await page.locator('.sidebar-toggle-btn').click();
    await page.waitForTimeout(400);
    const drawer=await page.evaluate(()=>{
     const s=document.querySelector('.course-sidebar');
     return {role:s.getAttribute('role'),modal:s.getAttribute('aria-modal'),
             links:s.querySelectorAll('a').length,
             backdrop:!document.querySelector('.lesson-menu-backdrop').hidden};
    });
    assert.equal(drawer.role,'dialog',`${where}: drawer is not a dialog`);
    assert.equal(drawer.modal,'true');
    assert.equal(drawer.backdrop,true,`${where}: no backdrop`);
    assert.ok(drawer.links>=4,`${where}: drawer lists ${drawer.links} lessons`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    assert.equal(await page.locator('.course-sidebar').isVisible(),false,`${where}: Escape did not close the drawer`);
    assert.equal(await page.locator('.sidebar-toggle-btn').evaluate(el=>el===document.activeElement),true,
     `${where}: focus did not return to the trigger`);
   }
  }
  console.log(`PASS all 20 unit layouts at ${width}px: sidebar, gutters, reflow, overflow, 16px body`);
  await context.close();
 }

 /* The choice is remembered on the next lesson. */
 if(!process.argv.includes('--lessons-only')) {
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const page=await context.newPage();
  await page.goto(base+'/units/unit-1/variables-types.html');
  await page.locator('.sidebar-collapse-btn').waitFor();
  await headerSettled(page);
  await page.locator('.sidebar-collapse-btn').click();
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(()=>localStorage.getItem('pypath-sidebar-closed')),'1');
  await page.goto(base+'/units/unit-1/type-io.html');
  await headerSettled(page);
  assert.equal(await page.evaluate(()=>document.body.classList.contains('sidebar-closed')),true,
   'the closed sidebar was not remembered on the next lesson');
  await page.locator('.sidebar-reopen-btn').click();
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(()=>localStorage.getItem('pypath-sidebar-closed')),'0');
  assert.equal(await page.evaluate(()=>document.querySelector('.course-sidebar').parentElement.classList.contains('layout-course')),true,
   'the sidebar is not a column of the lesson grid');
  console.log('PASS the open/closed choice persists across lessons');
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
  await page.locator('.lesson-toc__summary').click();
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

 /* The section list is a disclosure above the lesson text, at every width --
    not a second column. One left column only. */
 {
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const page=await context.newPage();
  await page.goto(base+'/units/unit-1/variables-types.html');
  await page.locator('.lesson-toc').waitFor();
  await headerSettled(page);
  const shape=await page.evaluate(()=>{
   const toc=document.querySelector('.lesson-toc');
   const content=document.querySelector('.lesson-content');
   return {docked:toc.classList.contains('lesson-toc--docked'),
           aboveText:toc.compareDocumentPosition(content)&Node.DOCUMENT_POSITION_FOLLOWING?true:false,
           insideMain:!!toc.closest('.course-main'),
           closed:!toc.querySelector('details').open,
           hideToggle:!!toc.querySelector('.lesson-toc__toggle'),
           links:toc.querySelectorAll('a').length};
  });
  assert.equal(shape.docked,false,'the section list is docked as a column again');
  assert.equal(shape.aboveText,true,'the section list is not above the lesson text');
  assert.equal(shape.insideMain,true,'the section list escaped the lesson column');
  assert.equal(shape.closed,true,'the section list does not start collapsed');
  assert.equal(shape.hideToggle,false,'the section list has a Hide toggle again');
  assert.ok(shape.links>1);
  console.log('PASS the section list is a collapsed disclosure above the lesson, not a column');
  await context.close();
 }
} finally {await browser.close();}
