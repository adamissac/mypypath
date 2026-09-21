import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const require=createRequire(import.meta.url);
const lessons=require('../scripts/data-course-unit-1.cjs').unit1.lessons;
const source=fs.readFileSync('assets/js/lesson-ui.js','utf8');
describe('lesson navigation',()=>{
 it('links to real headings without duplicate IDs and preserves editor actions',async()=>{
  const dom=new JSDOM('<main class="course-main"><div class="lesson-content"><h2 id="existing">Read</h2><h2>Practice</h2><div class="interactive-editor"><div class="editor-toolbar-small"><button class="btn-run" onclick="runEditorCode(1)">Run</button></div></div></div></main>',{runScripts:'outside-only',url:'https://mypypath.com/data/unit-1/example.html'});
  dom.window.eval(source);dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
  const doc=dom.window.document;
  expect(doc.querySelectorAll('.lesson-toc')).toHaveLength(1);
  expect([...doc.querySelectorAll('.lesson-toc a')].map(a=>a.hash)).toEqual(['#existing','#practice']);
  expect(doc.querySelector('.btn-run').getAttribute('onclick')).toBe('runEditorCode(1)');
  expect(doc.querySelector('.btn-run').textContent).toBe('Run code');
  doc.querySelectorAll('.lesson-toc a')[1].click();
  expect(doc.activeElement.id).toBe('practice');
  const quiz=doc.createElement('h2');quiz.textContent='Check your understanding';doc.querySelector('.lesson-content').appendChild(quiz);
  await Promise.resolve();
  expect(doc.querySelectorAll('.lesson-toc a')).toHaveLength(3);
  expect([...doc.querySelectorAll('.lesson-toc a')].map(a=>a.hash)).toEqual(['#existing','#practice','#check-your-understanding']);
 });
});
describe('section ids',()=>{
 const build=html=>{
  const dom=new JSDOM(`<main class="course-main"><div class="lesson-content">${html}</div></main>`,
   {runScripts:'outside-only',url:'https://mypypath.com/units/unit-1/example.html'});
  dom.window.eval(source);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
  return dom.window.document;
 };

 it('gives repeated section names distinct ids',()=>{
  const doc=build('<h2>Practice</h2><h2>Practice</h2><h2>Practice</h2>');
  const ids=[...doc.querySelectorAll('.lesson-content h2')].map(h=>h.id);
  expect(ids).toEqual(['practice','practice-2','practice-3']);
  expect([...doc.querySelectorAll('.lesson-toc a')].map(a=>a.hash))
   .toEqual(['#practice','#practice-2','#practice-3']);
 });

 it('slugs punctuation, case and accents without colliding with page ids',()=>{
  const doc=build('<h2>Step 1: What *Are* Variables?</h2><h2>Caf\u00e9 \u2014 Na\u00efve Cr\u00e8me</h2><h2>???</h2>');
  expect([...doc.querySelectorAll('.lesson-content h2')].map(h=>h.id))
   .toEqual(['step-1-what-are-variables','cafe-naive-creme','section']);
 });

 it('leaves an existing id alone, because links and bookmarks point at it',()=>{
  const doc=build('<h2 id="quiz-checkpoint-1">Quick check</h2><h2>Wrap up</h2>');
  expect([...doc.querySelectorAll('.lesson-content h2')].map(h=>h.id))
   .toEqual(['quiz-checkpoint-1','wrap-up']);
 });

 it('builds no contents list for a lesson with a single section',()=>{
  const doc=build('<h2>All of it</h2><p>One section.</p>');
  expect(doc.querySelectorAll('.lesson-toc')).toHaveLength(0);
 });
});

describe('worked examples explain the actual Python result',()=>{
 for(const lesson of lessons) it(lesson.slug,()=>{
  const c=lesson.checkpoint;
  expect(c.prompt).toBeTruthy();expect(c.explain).toBeTruthy();expect(c.tryIt).toBeTruthy();
  expect(execFileSync('python3',['-c',c.code],{encoding:'utf8'}).trim()).toBe(c.output);
  const html=fs.readFileSync(`data/unit-1/${lesson.slug}.html`,'utf8');
  expect(html).toContain('Show the output and explanation');
 });
});

describe('Foundations prediction examples',()=>{
 for(const slug of ['first-program','variables-types']) it(slug,()=>{
  const doc=new JSDOM(fs.readFileSync(`units/unit-1/${slug}.html`,'utf8')).window.document;
  const example=doc.querySelector('.lesson-checkpoint');
  expect(execFileSync('python3',['-c',example.querySelector('pre.code code').textContent],{encoding:'utf8'}).trim()).toBe(example.querySelector('.checkpoint-output').textContent.trim());
 });
});
