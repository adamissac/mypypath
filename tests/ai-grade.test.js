import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest';
import fs from 'node:fs';

beforeAll(() => {
  new Function(fs.readFileSync('assets/js/ai-grade.js', 'utf8')).call(window);
});

afterEach(() => { vi.unstubAllGlobals(); });

const A = () => window.PyPathAiGrade;

const good = {
  verdict: 'pass', confidence: 'high', flag: 'none', feedback: 'Nicely put.',
};

/* The governing rule of the whole module: nothing that goes wrong here is the
   learner's fault, so nothing that goes wrong here reaches them as a fail. */
describe('everything that can go wrong resolves to review', () => {
  it('reads a missing verdict as review', () => {
    expect(A().normalize(null).verdict).toBe('review');
    expect(A().normalize({}).verdict).toBe('review');
    expect(A().normalize({ verdict: 'excellent' }).verdict).toBe('review');
    expect(A().normalize('pass').verdict).toBe('review');
  });

  it('never resolves a failure to pass or to fail', () => {
    for (const bad of [null, {}, { verdict: 'nope' }, []]) {
      expect(['pass', 'fail']).not.toContain(A().normalize(bad).verdict);
    }
  });

  it('says something the learner can live with, not an error', () => {
    const r = A().review('anything');
    expect(r.feedback).toMatch(/saved/i);
    expect(r.feedback).not.toMatch(/error|failed|invalid/i);
  });

  it('resolves an unreachable endpoint to review', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
    const r = await A().grade({ submission: 'x' }, 'token');
    expect(r.verdict).toBe('review');
    expect(r.reason).toBe('unreachable');
  });

  it('resolves a non-200 to review, with the status kept for a log', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve({ ok: false, status: 500 }));
    const r = await A().grade({ submission: 'x' }, 'token');
    expect(r.verdict).toBe('review');
    expect(r.reason).toBe('http-500');
  });

  it('resolves an unparseable body to review', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve({
      ok: true, json: () => Promise.reject(new Error('not json')),
    }));
    expect((await A().grade({ submission: 'x' }, 'token')).verdict).toBe('review');
  });

  it('does not call at all without a token', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const r = await A().grade({ submission: 'x' }, null);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(r.reason).toBe('signed-out');
  });
});

describe('a real verdict', () => {
  it('passes a well-formed response through', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve({ ok: true, json: () => Promise.resolve(good) }));
    const r = await A().grade({ submission: 'x' }, 'token');
    expect(r.verdict).toBe('pass');
    expect(r.feedback).toBe('Nicely put.');
  });

  it('sends the bearer token and nothing else identifying', async () => {
    let seen = null;
    vi.stubGlobal('fetch', (url, opts) => {
      seen = { url, opts };
      return Promise.resolve({ ok: true, json: () => Promise.resolve(good) });
    });
    await A().grade({ submission: 'hello', prompt: 'why?' }, 'tok123');
    expect(seen.url).toBe('/api/grade');
    expect(seen.opts.headers.Authorization).toBe('Bearer tok123');
    expect(JSON.parse(seen.opts.body)).toEqual({ submission: 'hello', prompt: 'why?' });
  });

  it('clamps an unknown flag rather than passing it on', () => {
    expect(A().normalize({ verdict: 'pass', flag: 'lazy' }).flag).toBe('none');
  });

  it('treats any confidence but high as low', () => {
    expect(A().normalize({ verdict: 'pass', confidence: 'certain' }).confidence).toBe('low');
  });

  it('caps the feedback, because it is rendered straight into a page', () => {
    const long = A().normalize({ verdict: 'pass', feedback: 'x'.repeat(1000) });
    expect(long.feedback.length).toBe(400);
  });
});

describe('what a verdict is allowed to do', () => {
  /* Only an outright fail invites a rewrite. A partial is a genuine attempt,
     and a review means nobody has judged it yet. */
  it('invites another go on a fail and on nothing else', () => {
    expect(A().needsAnotherGo({ verdict: 'fail' })).toBe(true);
    expect(A().needsAnotherGo({ verdict: 'partial' })).toBe(false);
    expect(A().needsAnotherGo({ verdict: 'pass' })).toBe(false);
    expect(A().needsAnotherGo({ verdict: 'review' })).toBe(false);
    expect(A().needsAnotherGo(null)).toBe(false);
  });

  /* The ratchet, asserted rather than assumed. Nothing this module exports can
     take back a completion: the deterministic floor decides that, and a
     verdict arriving over the network a second later only suggests a rewrite. */
  it('exports nothing that revokes a completion', () => {
    for (const name of Object.keys(A())) {
      expect(name, name).not.toMatch(/^(unmark|revoke|undo|clear|reset)/i);
    }
  });

  /* A wrong but genuine attempt is between the learner and the lesson. A box
     filled to get past it is what a teacher asked to know about. */
  it('flags to a teacher only where there is something to act on', () => {
    expect(A().worthFlagging({ verdict: 'fail', flag: 'placeholder' })).toBe(true);
    expect(A().worthFlagging({ verdict: 'fail', flag: 'none' })).toBe(false);
    expect(A().worthFlagging({ verdict: 'review', flag: 'incoherent' })).toBe(false);
    expect(A().worthFlagging(null)).toBe(false);
  });

  it('describes what happened rather than what the student is', () => {
    for (const flag of Object.keys(A().FLAG_LABEL)) {
      const label = A().FLAG_LABEL[flag];
      expect(label, flag).not.toMatch(/lazy|careless|weak|poor|bad student|disengaged/i);
      expect(label.length, flag).toBeGreaterThan(10);
    }
  });
});
