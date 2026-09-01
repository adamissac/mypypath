import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

/* A static read of firebase-config.js.
 *
 * The file cannot be imported here: it is an ES module with top-level await
 * over dynamic imports of the Firebase SDK from gstatic, and importing it in
 * jsdom would either hit the network or fail. So this reads the source, which
 * is enough for the one property that matters.
 *
 * That property is that the cache is configured with a tab manager, because
 * the no-argument form of persistentLocalCache() is not "sensible defaults" --
 * it is single-tab persistence, and a second tab under single-tab persistence
 * silently gets a memory-only cache. See the comment in the file itself, and
 * scripts/verify-multi-tab-cache.py, which proves the behaviour in a browser
 * rather than asserting on the text of the source. */

const source = fs.readFileSync('assets/js/firebase-config.js', 'utf8');

/* The comment in that file quotes the broken form in order to explain it, so
   the "never the bare form" assertion below has to read the code and not the
   prose. Crude but adequate: this file has no strings containing /* or //. */
const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('the Firestore cache is configured for more than one tab', () => {
  it('passes a tabManager to persistentLocalCache', () => {
    expect(code).toMatch(/persistentLocalCache\(\s*\{\s*tabManager:/);
  });

  it('uses the multiple-tab manager', () => {
    expect(code).toContain('persistentMultipleTabManager()');
  });

  it('imports the manager it uses', () => {
    // A tab manager referenced but not imported is a TypeError at boot, and
    // boot failures in this file take the whole site with them.
    const importBlock = code.slice(0, code.indexOf('const firebaseConfig'));
    expect(importBlock).toContain('persistentMultipleTabManager');
  });

  it('never falls back to the bare no-argument form', () => {
    // The regression this guards: someone "simplifies" the call back to
    // persistentLocalCache(), which reads as harmless and re-breaks role
    // reads in every second tab.
    expect(code).not.toMatch(/persistentLocalCache\(\s*\)/);
  });

  it('still enables persistence at all', () => {
    // The other way to make the warning go away is to stop persisting, which
    // would cost every learner their offline capability to silence a log line.
    expect(code).toContain('localCache:');
    expect(code).not.toContain('memoryLocalCache');
  });
});
