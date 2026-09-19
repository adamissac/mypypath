import {chromium} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
const base=process.argv[2]||'http://localhost:8096';
const browser=await chromium.launch();
async function pointerDrag(page, source, target, edge=false) {
 await source.scrollIntoViewIfNeeded();
 const a=await source.boundingBox(), b=await target.boundingBox();
 await page.mouse.move(a.x+(edge?8:a.width/2),a.y+(edge?8:a.height/2));
 await page.mouse.down();
 await page.mouse.move(a.x+10,a.y+10,{steps:3});
 const x=b.x+(edge?8:b.width/2), y=b.y+(edge?8:b.height/2);
 await page.mouse.move(x,y,{steps:12});
 await page.mouse.move(x+1,y+1);
 await page.mouse.up();
}

try {
 for(const course of ['foundations','data']) for(const mobile of [false,true]) for(const theme of ['light','dark']) {
  const context=await browser.newContext({viewport:{width:mobile?390:1440,height:1000},hasTouch:mobile,isMobile:mobile,reducedMotion:'reduce'});
  await context.addInitScript(t=>localStorage.setItem('pypath-theme',t),theme);
  const page=await context.newPage();
  const path=course==='data'?'/data/unit-1/reading-a-csv-file.html':'/units/unit-1/variables-types.html';
  await page.goto(base+path);
  const match=page.locator('.quiz-q').filter({has:page.locator('.quiz-match__bank')}).last();
  await match.waitFor();
  await page.waitForFunction(()=>document.querySelectorAll('.CodeMirror').length >= document.querySelectorAll('textarea.code-editor-small').length);
  await page.evaluate(()=>document.fonts.ready);
  // Editor setup changes lesson height. Wait for a stable position before a
  // real pointer drag, whose coordinates otherwise go stale mid-gesture.
  await match.evaluate(el=>new Promise(resolve=>{
    let last=null, stable=0;
    function frame(){const y=el.getBoundingClientRect().y;stable=y===last?stable+1:0;last=y;
      if(stable>=20) resolve();else requestAnimationFrame(frame);}
    frame();
  }));
  await match.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
  const chips=match.locator('.quiz-match__chip'), rows=match.locator('.quiz-match__row');
  for(let i=0;i<3;i++) {
   const answer=(i+2)%3;
   if(mobile){await chips.nth(answer).tap();await rows.nth(i).locator('button').tap();}
   else await pointerDrag(page,chips.nth(answer),rows.nth(i).locator('button'));
  }
  assert.deepEqual(await match.locator('select').evaluateAll(s=>s.map(x=>x.value)),['2','0','1']);
  await match.locator('.quiz-q__check').click();
  assert.match(await match.locator('.quiz-feedback').textContent(),/Correct.*3 of 3/);
  await match.locator('select').first().selectOption('0');
  assert.equal(await match.locator('.quiz-feedback').isVisible(),false);
  const order=page.locator('.quiz-q').filter({has:page.locator('.quiz-order')}).last();
  await order.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
  const before=await order.locator('.quiz-order__code').allTextContents();
  if(mobile) await order.locator('.quiz-order__row').first().getByRole('button',{name:/Move down/}).tap();
  else await pointerDrag(page,order.locator('.quiz-order__row').first(),order.locator('.quiz-order__row').last(),true);
  const after=await order.locator('.quiz-order__code').allTextContents();
  assert.notDeepEqual(after,before);
  assert.equal(new Set(after).size,before.length);
  const up=order.locator('.quiz-order__row').last().getByRole('button',{name:/Move up/});
  await up.focus();await page.keyboard.press('Enter');
  assert.match(await order.locator('.quiz-activity-status').textContent(),/Moved line/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const geometry=await page.locator('.quiz-q__set').evaluateAll(sets=>sets.map(el=>{
   const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth};
  }));
  for(const r of geometry) assert.ok(r.left>=0 && r.right<=r.width,JSON.stringify(r));
  const audit=await new AxeBuilder({page}).include('.quiz').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  assert.deepEqual(audit.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);
  if(course==='data'&&mobile&&theme==='dark') await page.screenshot({path:'/tmp/mypypath-intro-mobile.png'});
  console.log(`PASS ${course} ${mobile?'touch':'drag'} ${theme}: matching, ordering, keyboard, feedback, overflow, axe`);
  await context.close();
 }
} finally {await browser.close();}
