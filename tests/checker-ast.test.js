import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

beforeAll(() => {
  new Function(fs.readFileSync('assets/js/checker-ast.js', 'utf8')).call(window);
});

const A = () => window.PyPathAst;

// A report shaped the way the Python analyzer builds one.
function report(extra) {
  return {
    parsed: true, loops: [], conditionals: 0, functions: [], calls: [],
    binop: [], names: [], returns: 0, imports: [], maxNesting: 0,
    hardcoded: [], prints: 0, ...extra,
  };
}

describe('requirements', () => {
  it('accepts a multiplication of the right two names', () => {
    const r = report({ binop: ['Mult'], names: ['length', 'width'] });
    const c = { requires: { binop: ['Mult'], names: ['length', 'width'] } };
    expect(A().check(c, r).ok).toBe(true);
  });

  it('refuses when a required name is absent', () => {
    const r = report({ binop: ['Mult'], names: ['length'] });
    const c = { requires: { binop: ['Mult'], names: ['length', 'width'] } };
    expect(A().check(c, r).ok).toBe(false);
  });

  it('reads true as any at all', () => {
    expect(A().check({ requires: { loops: true } }, report({ loops: ['for'] })).ok).toBe(true);
    expect(A().check({ requires: { loops: true } }, report()).ok).toBe(false);
  });

  it('counts conditionals and returns rather than listing them', () => {
    expect(A().check({ requires: { conditionals: 2 } }, report({ conditionals: 3 })).ok).toBe(true);
    expect(A().check({ requires: { conditionals: 2 } }, report({ conditionals: 1 })).ok).toBe(false);
    expect(A().check({ requires: { returns: true } }, report({ returns: 1 })).ok).toBe(true);
  });

  it('matches a function by name and by parameter count', () => {
    const r = report({ functions: [{ name: 'greet', params: 2 }] });
    expect(A().check({ requires: { functions: ['greet'] } }, r).ok).toBe(true);
    expect(A().check({ requires: { functions: [{ name: 'greet', params: 2 }] } }, r).ok).toBe(true);
    expect(A().check({ requires: { functions: [{ name: 'greet', params: 3 }] } }, r).ok).toBe(false);
    expect(A().check({ requires: { functions: ['shout'] } }, r).ok).toBe(false);
  });
});

describe('prohibitions', () => {
  it('refuses code that calls something the exercise ruled out', () => {
    const c = { requires: { loops: true }, forbids: { calls: ['sum', 'sorted'] } };
    expect(A().check(c, report({ loops: ['for'], calls: ['sum'] })).ok).toBe(false);
    expect(A().check(c, report({ loops: ['for'], calls: ['len'] })).ok).toBe(true);
  });

  it('caps nesting where an exercise asks for it', () => {
    expect(A().check({ max_nesting: 2 }, report({ maxNesting: 3 })).ok).toBe(false);
    expect(A().check({ max_nesting: 2 }, report({ maxNesting: 2 })).ok).toBe(true);
  });

  /* A hidden case never names what caught it. A forbidden call was named in
     the prompt, so there is nothing left to give away by saying so. */
  it('says a rule was broken without naming the drawn input', () => {
    const out = A().check({ forbids: { calls: ['sum'] } }, report({ calls: ['sum'] }));
    expect(out.actual).toMatch(/asks you not to/);
    expect(out.actual).not.toMatch(/sum/);
  });
});

describe('code that does not parse', () => {
  /* A student mid-edit has code that does not parse. That is a normal state to
     be in, not an error to shout about. */
  it('fails the case and says why, in words a beginner has met', () => {
    const out = A().check({ requires: { loops: true } }, { parsed: false });
    expect(out.ok).toBe(false);
    expect(out.actual).toMatch(/syntax error/);
  });
});

describe('hardcode reporting', () => {
  it('describes what the code does, never what the student did', () => {
    const lines = A().describeHardcoding(report({
      hardcoded: [{ name: 'area', why: 'ignores-parameters' },
        { name: 'grade', why: 'literal-lookup' }],
    }));
    expect(lines[0]).toBe('area does not use the values passed into it');
    expect(lines[1]).toBe('grade returns a fixed answer for each input it recognises');
    for (const line of lines) {
      expect(line).not.toMatch(/cheat|cheating|dishonest|copied|faked/i);
    }
  });

  it('says nothing when there is nothing to say', () => {
    expect(A().describeHardcoding(report())).toEqual([]);
  });

  /* Reported, never failed. A student who has not understood parameters yet
     writes exactly this shape by accident, and failing them on a heuristic
     would be marking a guess. */
  it('does not make a case fail on its own', () => {
    const r = report({ loops: ['for'], hardcoded: [{ name: 'f', why: 'ignores-parameters' }] });
    expect(A().check({ requires: { loops: true } }, r).ok).toBe(true);
  });
});

describe('the analyzer source', () => {
  it('parses with ast rather than searching the text', () => {
    expect(A().ANALYZER).toMatch(/import ast/);
    expect(A().ANALYZER).toMatch(/ast\.parse\(source\)/);
  });

  it('survives a SyntaxError rather than raising into the page', () => {
    expect(A().ANALYZER).toMatch(/except SyntaxError/);
  });
});
