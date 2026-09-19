import {beforeAll, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {entries, questions} = require('../scripts/intro-lesson-enrichment.cjs');
let R;
beforeAll(() => {
  new Function(fs.readFileSync('assets/js/question-types.js', 'utf8')).call(window);
  new Function(fs.readFileSync('assets/js/question-render.js', 'utf8')).call(window);
  R = window.PyPathQuestionRender;
});
const drag = (from, to) => {
  from.dispatchEvent(new Event('dragstart', {bubbles:true}));
  to.dispatchEvent(new Event('drop', {bubbles:true, cancelable:true}));
  from.dispatchEvent(new Event('dragend', {bubbles:true}));
};
describe('accessible interactive practice', () => {
  it('matches with taps, dragging and native selects through the same answer state', () => {
    const q = questions(entries[0])[0];
    const built = R.renderMatch(q, 0);
    const chips = built.node.querySelectorAll('.quiz-match__chip');
    const rows = built.node.querySelectorAll('.quiz-match__row');
    expect(built.read()).toEqual([null,null,null]);
    chips[q.answer[0]].click();
    rows[0].querySelector('button').click();
    drag(chips[q.answer[1]], rows[1]);
    rows[2].querySelector('select').value = String(q.answer[2]);
    expect(window.PyPathQuestions.score(q,built.read()).right).toBe(true);
  });
  it('ignores external and other-question drops, and never places an unselected answer', () => {
    const q = questions(entries[0])[0];
    const a = R.renderMatch(q,0), b = R.renderMatch({...q,id:'other'},1);
    a.node.querySelector('.quiz-match__place').click();
    drag(a.node.querySelector('.quiz-match__chip'),b.node.querySelector('.quiz-match__row'));
    expect(a.read()).toEqual([null,null,null]);
    expect(b.read()).toEqual([null,null,null]);
  });
  it('reorders by dragging and buttons, announces changes and keeps keyboard focus', () => {
    const q = questions(entries[0])[1];
    const built = R.renderOrder(q,0,()=>0);
    document.body.appendChild(built.node);
    let changes=0; built.node.addEventListener('change',()=>changes++);
    const before=built.read();
    drag(built.node.querySelectorAll('.quiz-order__row')[0],built.node.querySelectorAll('.quiz-order__row')[2]);
    expect(built.read()).toEqual([before[1],before[2],before[0]]);
    built.node.querySelectorAll('.quiz-order__row')[2].querySelector('button').click();
    expect(built.read()).toEqual([before[1],before[0],before[2]]);
    expect(changes).toBe(2);
    expect(built.node.querySelector('[role="status"]').textContent).toContain('position 2');
    expect(built.node.contains(document.activeElement)).toBe(true);
    built.node.remove();
  });
  it('does not start at a nonidentity authored solution', () => {
    const built=R.renderOrder({id:'nonidentity',items:['a','b','c'],answer:[1,2,0]},0,()=>0);
    expect(built.read()).not.toEqual([1,2,0]);
  });
});
describe('introductory content in both courses',()=>{
  it('covers every introductory lesson with three additional activity types',()=>{
    expect(entries.filter(e=>e.course==='foundations')).toHaveLength(8);
    expect(entries.filter(e=>e.course==='data')).toHaveLength(6);
    for(const entry of entries){
      const path=entry.course==='data'?'data':'units';
      const html=fs.readFileSync(`${path}/unit-1/${entry.slug}.html`,'utf8');
      expect(html).toContain('lesson-deep-dive');
      expect(html.match(/<script[^>]+src="\/assets\/js\/question-render\.js/g)).toHaveLength(1);
      expect(html.indexOf('/assets/js/question-types.js')).toBeLessThan(html.indexOf('/assets/js/question-render.js'));
      const prefix=entry.course==='data'?'data/':'';
      const checks=JSON.parse(fs.readFileSync(`assets/data/checks/${prefix}unit-1/${entry.slug}.json`,'utf8'));
      for(const q of questions(entry)) expect(checks.questions).toContainEqual(q);
    }
  });
  for(const entry of entries){
    it(`${entry.course}/${entry.slug}: Python produces the taught output and worked solution runs`,()=>{
      expect(execFileSync('python3',['-c',entry.code],{encoding:'utf8'}).trim()).toBe(entry.output);
      expect(execFileSync('python3',['-c',entry.solution],{encoding:'utf8'}).trim().length).toBeGreaterThan(0);
      for(const q of questions(entry)){
        const answer=q.kind==='blank'?[entry.output.split('\n')[0]]:q.answer;
        expect(window.PyPathQuestions.score(q,answer).right).toBe(true);
      }
    });
  }
});
