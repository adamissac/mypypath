import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

/* Who is in the room is the one thing on the dashboard that has to be live.
   A teacher reads the join code out and watches for names; before this they
   arrived on the next page load, so a join that had worked looked like one
   that had failed. */

const store = fs.readFileSync('assets/js/classroom-store.js', 'utf8');
const dash = fs.readFileSync('assets/js/classroom-dashboard.js', 'utf8');

describe('the store exposes one live read', () => {
  it('watches the class roster collection', () => {
    expect(store).toMatch(/export function watchRoster\(classId, onChange\)/);
    expect(store).toMatch(/onSnapshot\(\s*collection\(db, `classes\/\$\{classId\}\/roster`\)/);
  });

  it('hands back rows in the same shape readRoster returns', () => {
    // So a caller can merge a snapshot into what readRoster gave it without
    // translating between two shapes.
    const rows = /snap\.docs\.map\(\(d\) => \(\{ uid: d\.id, \.\.\.d\.data\(\) \}\)\)/g;
    expect(store.match(rows) || []).toHaveLength(2);
  });

  it('is the only live read on the dashboard', () => {
    // Everything else here is one-shot deliberately: a report that rearranges
    // itself while being read is worse than one a minute old.
    expect(store.match(/onSnapshot\(/g) || []).toHaveLength(1);
  });
});

describe('the dashboard subscribes and unsubscribes exactly once', () => {
  it('subscribes on boot, after the first full load', () => {
    // So the first snapshot merges into real progress rather than replacing
    // it with placeholders.
    const boot = dash.slice(dash.indexOf('async function boot'));
    const load = boot.indexOf('await loadClassData(activeClassId)');
    const watch = boot.indexOf('watchActiveRoster(activeClassId)');
    expect(load).toBeGreaterThan(-1);
    expect(watch).toBeGreaterThan(load);
  });

  it('resubscribes when the class switcher changes', () => {
    const sw = dash.slice(dash.indexOf('switcher.addEventListener'));
    expect(sw.slice(0, sw.indexOf('});'))).toMatch(/watchActiveRoster\(activeClassId\)/);
  });

  it('tears the old listener down before awaiting the new class', () => {
    // The old class's listener is live for as long as that load takes, and a
    // fire during it would merge the previous class's roster into the one
    // being switched to.
    const sw = dash.indexOf('switcher.addEventListener');
    const stop = dash.indexOf('stopWatchingRoster();', sw);
    const load = dash.indexOf('await loadClassData(activeClassId)', sw);
    expect(stop).toBeGreaterThan(-1);
    expect(stop).toBeLessThan(load);
  });

  it('drops the previous listener whenever it opens a new one', () => {
    expect(dash).toMatch(/function watchActiveRoster\(classId\) \{\s*\n\s*stopWatchingRoster\(\);/);
  });

  it('ignores a fire that arrives for a class no longer on screen', () => {
    expect(dash).toMatch(/if \(classId !== activeClassId\) return;/);
  });

  it('lets go of the listener when the page goes away', () => {
    expect(dash).toMatch(/addEventListener\('pagehide', stopWatchingRoster\)/);
  });
});

describe('a snapshot does not re-read the whole class', () => {
  it('merges roster rows instead of calling loadClassData', () => {
    // loadClassData is one event-log read plus one mirror read per student.
    // Paying that for the whole class every time one person joins would turn a
    // class of thirty arriving at once into nine hundred reads.
    const handler = dash.slice(
      dash.indexOf('function mergeRoster'),
      dash.indexOf('function stopWatchingRoster')
    );
    expect(handler).not.toMatch(/readEvents|readMirror|loadClassData/);
  });

  it('keeps progress already loaded for a student who is still there', () => {
    expect(dash).toMatch(/const existing = known\.get\(row\.uid\)/);
    expect(dash).toMatch(/if \(existing\) \{/);
  });

  it('marks a student it has only seen on the roster as pending', () => {
    // Not the same fact as "has done nothing", so the row says which it is.
    expect(dash).toMatch(/pending: true/);
    expect(dash).toMatch(/student\.pending.*cr-grid__pending.*just joined/);
  });

  it('repaints only what a roster change can alter', () => {
    const paint = dash.slice(
      dash.indexOf('function paintRosterViews'),
      dash.indexOf('function stopWatchingRoster')
    );
    for (const fn of ['paintAttention', 'paintGrid', 'paintSummary']) {
      expect(paint, fn).toContain(fn);
    }
    // Assignments, unit access, the switcher and the co-teacher list are all
    // untouched by someone joining.
    expect(paint).not.toMatch(/paintAll|paintAssignments|paintAccess|paintTeachers/);
  });

  it('hides the empty state as soon as the first student lands', () => {
    // paintGrid owns both, so the message cannot disagree with the table.
    expect(dash).toMatch(/show\(table, list\.length > 0\);\s*\n\s*show\(empty, list\.length === 0\);/);
  });
});
