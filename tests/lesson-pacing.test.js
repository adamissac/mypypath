import {beforeAll,beforeEach,it,expect} from 'vitest';
import fs from 'node:fs';
let quiz;
beforeAll(()=>{new Function(fs.readFileSync('assets/js/lesson-quiz.js','utf8')).call(window);quiz=window.PyPathQuiz;});
beforeEach(()=>{document.body.innerHTML='<main><div class="lesson-content"><section class="content-section" id="objectives"><h2>What You Will Learn</h2></section><section class="content-section" id="teach-a"><h2>Step 1: Values</h2><p>Values are data.</p></section><section class="content-section" id="teach-b"><h2>Step 2: Names</h2><p>Names refer to values.</p></section><section class="content-section" id="teach-c"><h2>Step 3: Assignment</h2><p>Assignment stores a result.</p></section><div class="exercise-section"><h2>Exercises</h2></div></div></main>';});
const questions=Array.from({length:5},(_,i)=>({id:'pacing-'+i,prompt:'Question '+i,choices:['a','b'],answer:0,explain:'Because a.'}));
it('puts checks after teaching sections and keeps two questions for final review',()=>{
 quiz.render(questions);
 expect(document.querySelectorAll('.quiz-inline').length).toBeGreaterThan(0);
 expect(document.querySelector('.quiz-inline').previousElementSibling.id).toBe('teach-a');
 expect(document.querySelector('#objectives').nextElementSibling.id).toBe('teach-a');
 expect(document.querySelector('.quiz-final').querySelectorAll('.quiz-q')).toHaveLength(2);
 expect(document.querySelectorAll('.quiz-q')).toHaveLength(5);
});
it('honours an authored section placement without duplicating questions on reinitialisation',()=>{
 quiz.render([{...questions[0],afterSection:1},...questions.slice(1)]);
 expect(document.querySelector('#teach-b').nextElementSibling.querySelector('legend').textContent).toContain('Question 0');
 quiz.render(questions);
 expect(document.querySelectorAll('.quiz-q')).toHaveLength(5);
});
it('falls back to a complete final review if there are no teaching sections',()=>{
 document.body.innerHTML='<main></main>';quiz.render(questions);
 expect(document.querySelectorAll('.quiz-inline')).toHaveLength(0);
 expect(document.querySelectorAll('.quiz-q')).toHaveLength(5);
});

it('waits for complete matching answers before revealing the explanation',()=>{
 new Function(fs.readFileSync('assets/js/question-types.js','utf8')).call(window);
 new Function(fs.readFileSync('assets/js/question-render.js','utf8')).call(window);
 const block=quiz.renderRich({id:'incomplete',kind:'match',prompt:'Match',left:['A','B'],right:['One','Two'],answer:[0,1],explain:'Answer key should stay hidden.'},0);
 document.body.appendChild(block);block.querySelector('.quiz-q__check').click();
 expect(block.querySelector('.quiz-feedback').textContent).toContain('every row');
 expect(block.querySelector('.quiz-feedback').textContent).not.toContain('Answer key');
});

it('interleaves every published lesson without losing or duplicating a question',()=>{
 for(const course of ['foundations','data']) {
  const manifest=JSON.parse(fs.readFileSync(`assets/data/curriculum${course==='data'?'-data':''}.json`));
  for(const lesson of manifest.lessons) {
   const html=fs.readFileSync(lesson.path.slice(1),'utf8');
   document.body.innerHTML=html.match(/<main[\s\S]*?<\/main>/)[0];
   const checkPath=`assets/data/checks/${course==='data'?'data/':''}unit-${lesson.unit}/${lesson.slug}.json`;
   const qs=JSON.parse(fs.readFileSync(checkPath)).questions;
   if(!qs?.length) continue;
   quiz.render(qs);
   expect(document.querySelectorAll('.quiz-q').length,lesson.path).toBe(qs.length);
   expect(document.querySelectorAll('.quiz-inline').length,lesson.path).toBeGreaterThan(0);
   expect(document.querySelector('.quiz-final .quiz__list').children.length,lesson.path).toBe(2);
   for(const q of qs.filter(q=>Number.isInteger(q.afterSection))) {
    const rendered=document.querySelector(`[data-question-id="${q.id}"]`);
    expect(rendered.closest('.quiz-inline'),q.id).not.toBeNull();
   }
  }
 }
},20000);
