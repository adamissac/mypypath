import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

beforeAll(() => {
  new Function(fs.readFileSync('assets/js/reflection-check.js', 'utf8')).call(window);
});

const R = () => window.PyPathReflection;

/* The floor is not a grader. It cannot tell a thoughtful answer from a fluent
   wrong one and does not try. Everything it refuses is refused on structure. */

describe('what it refuses', () => {
  it('refuses nothing at all', () => {
    expect(R().assess('').ok).toBe(false);
    expect(R().assess('   ').ok).toBe(false);
    expect(R().assess(null).ok).toBe(false);
  });

  it('refuses a single character, which passes today', () => {
    expect(R().assess('a').ok).toBe(false);
  });

  it('refuses keyboard mash', () => {
    ['asdfasdfasdf', 'asdf asdf asdf asdf asdf asdf asdf asdf asdf',
     'jkjkjkjk hjhjhjhj lklklklk mnmnmnmn qwqwqwqw zxzxzxzx bnbnbnbn'].forEach((text) => {
      expect(R().assess(text).ok, text).toBe(false);
    });
  });

  it('refuses one word repeated to reach the length', () => {
    expect(R().assess('yes yes yes yes yes yes yes yes yes yes').ok).toBe(false);
  });

  it('refuses one character repeated', () => {
    expect(R().assess('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa').ok).toBe(false);
  });

  /* The most common way to defeat a length check is to paste the question
     back, so the prompt is compared when the caller can supply it. */
  it('refuses the prompt typed back', () => {
    const prompt = 'Why is it useful to give a variable a meaningful name?';
    expect(R().assess(prompt, { prompt }).ok).toBe(false);
    expect(R().assess('  why is it useful to give a variable a MEANINGFUL name  ',
      { prompt }).ok).toBe(false);
  });
});

describe('what it accepts', () => {
  it('accepts an ordinary short answer', () => {
    expect(R().assess('It makes the code easier to read later on when I forget.').ok).toBe(true);
  });

  it('accepts a paragraph', () => {
    const text = 'A meaningful name tells the next reader what the value is for, '
      + 'which matters most when that reader is me in a month. Naming it x saves '
      + 'two seconds now and costs ten minutes later.';
    expect(R().assess(text).ok).toBe(true);
  });

  it('accepts an answer that quotes some of the prompt without being it', () => {
    const prompt = 'Why is it useful to give a variable a meaningful name?';
    const text = 'A meaningful name is useful because the next person reading it, '
      + 'usually me, can tell what the value holds without tracing the code.';
    expect(R().assess(text, { prompt }).ok).toBe(true);
  });

  it('accepts code-ish answers with few vowels, because Python is like that', () => {
    expect(R().assess('I used len(x) and str(n) and int(s) to convert the input first.').ok)
      .toBe(true);
  });
});

describe('what it says', () => {
  it('always gives a reason that says what to do next', () => {
    const reason = R().assess('a').reason;
    expect(reason.length).toBeGreaterThan(20);
    // A floor that refuses without saying what it wants is a wall.
    expect(reason).toMatch(/sentence|more|own words/i);
  });

  it('never says anything about the person', () => {
    ['a', 'asdfasdf', 'yes yes yes yes yes yes yes yes yes'].forEach((text) => {
      const reason = R().assess(text).reason;
      expect(reason, text).not.toMatch(/lazy|effort|you did not|nonsense|rubbish/i);
    });
  });

  it('says nothing when it accepts', () => {
    expect(R().assess('This is a perfectly ordinary answer about variables.').reason).toBe('');
  });
});

describe('failing toward accepting', () => {
  /* The behaviour before this file existed was "accept everything". A bug in
     here must degrade to that, never to a learner unable to finish a lesson. */
  it('accepts when the options object is hostile', () => {
    expect(R().assess('A perfectly normal answer about naming things well and clearly.',
      { prompt: {} }).ok).toBe(true);
  });

  it('accepts anything long and varied even if a rule throws', () => {
    const text = 'Naming things well is the part of programming I find hardest.';
    expect(R().assess(text, null).ok).toBe(true);
  });
});

describe('MIN_WORDS', () => {
  it('is named and low, because this is a floor on effort not on insight', () => {
    expect(R().MIN_WORDS).toBeGreaterThan(2);
    expect(R().MIN_WORDS).toBeLessThan(15);
  });
});
