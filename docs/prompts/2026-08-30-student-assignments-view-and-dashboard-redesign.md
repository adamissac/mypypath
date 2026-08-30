# Follow-up: a student-facing "what's due" view, one class per student, and a teacher dashboard that isn't overwhelming

Paste this to Claude Code, run from the root of `mypypath`.

## Three separate problems, verified against the current repo, not assumed

**1. Assignments are already readable by students. Nothing shows them.** Checked
`firestore.rules`: `classes/{classId}/assignments/{assignmentId}` already allows
`isEnrolled(classId, request.auth.uid)` to read, specifically so "their own page shows what is
due" per the rule's own comment. That page was never built. This is a pure front-end gap, not a
data or rules problem — everything a student needs is already reachable, just not rendered
anywhere a student will see it.

**2. A student can currently enroll in more than one class, and it's silent.** Read
`join-flow.js`: `joinAnyClass` writes the legacy roster (a merge, harmless twice) and then a
brand new `classes/{classId}/roster/{uid}` document for whatever code was just entered, then
overwrites the single cached `currentClassId()` pointer to point at it. Nothing ever removes the
student from a class they were already in. Join class A, then join class B, and the student is
now enrolled in both — teacher A's roster still lists them with real, aging data nobody is
looking at, while only class B's assignments and lock mode actually apply to them, with no
error, no warning, and no visible sign anything unusual happened.

**3. The teacher dashboard grew one feature at a time and it shows.** Counted the top-level
sections on `classroom.html` in document order: join code, assignments (with an inline
create-work form), unit access, needs attention, the mastery grid (with its own scope toggle,
unit picker, and sort control), certificates, share-this-class (with archive/purge nested
inside it), a weekly digest, and the class summary stats. Nine sections, several with their own
sub-controls, all in one continuous scroll with no grouping. That is a genuine information-
architecture problem, not a one-line fix, and it deserves a real design pass rather than
shuffling divs.

## Task 1: the student's "what's due" view

Build the page students actually need, from data that's already there for them to read:
`classroom-core.js`'s `assignmentStatus()` already computes exactly what one row needs (done,
done-late, not-due, overdue, expired, with a day count), and `classroom-core.js`'s
`assignmentUnlocks()` already tells you which units are reachable regardless of lock mode. Both
were written for the teacher side; check whether they work as-is when handed one student's own
event log and their own class's assignment list, or whether they need a small student-facing
wrapper.

Add it as a real nav item — `account.html`'s primary nav already conditionally shows
`data-account-classroom` only for teachers; do the equivalent for students who are enrolled in a
class, pointed at wherever this lives. `progress.html` ("My progress") is the closest existing
analog — a signed-in learner's own status page — and is worth strong consideration as the home
for this rather than a brand new page, but make the call once you've looked at how much room a
real assignment list needs next to what's already there; a separate page is fine too if the
content doesn't fit naturally.

What it needs to show, per assignment: what's required in plain language (a unit name, or the
specific lesson titles, not raw paths), the due date, and its status using the same states
`assignmentStatus()` already defines, in language that matches the honesty conventions already
established (`EXPLANATIONS.assignmentLate` already explains where the completion time comes
from — reuse that copy or its equivalent here rather than writing new copy that says something
subtly different). Nothing to show should read as "you're all caught up," not as an empty gray
box — a student checking this page with nothing due is good news and the page should say so.

## Task 2: one class per student

Change `joinAnyClass` in `join-flow.js`: before writing anything, check whether the student is
already enrolled in a class (`currentClassId()`, falling back to `loadMembership` the way
`leaveAnyClass` already does when the cache is cold). If they are, and the code they just entered
resolves to a *different* class, stop before either write happens and surface a clear error —
"You're already in a class. Leave it first, then use the new code." — rather than silently
double-enrolling them. Re-entering the code for the class they're already in should keep working
exactly as `bd691ea` just made it: silent and harmless.

Decide, and note the decision in the commit: is a blocked second join the whole feature, or does
the join dialog also offer a one-click "leave your current class and join this one" path so a
student who was told to switch does not have to find the separate "Leave this class" control
first. Either is defensible; a flat block with a clear message is the smaller, safer change.

Check whether any of your own test accounts from this build are currently double-enrolled from
before this fix existed, and clean those up directly rather than leaving stale rows in an old
test class's roster.

## Task 3: redesign the teacher dashboard's information architecture

Use `.claude/skills/frontend-design` deliberately here — this needs an actual point of view
about what a teacher needs to see first, not just visual polish on the existing nine sections in
their existing order. Constraints, not a layout spec:

- Nothing currently on the page loses functionality. Every control listed above (assignment
  creation, unit access modes, the mastery grid's scope and sort, certificates, co-teacher
  sharing, archive/purge, the weekly digest, the class summary) has to still be reachable, just
  organized so a teacher isn't scrolling past eight things to find the one they came for.
- A reasonable starting hypothesis, yours to overrule with a better one: most visits are "how's
  the class doing right now" (needs attention, the summary stats, maybe the mastery grid) versus
  occasional visits to actually configure something (assignments, unit access, sharing,
  archiving). Grouping by that distinction, not by when each section happened to be built, is
  probably closer to what a teacher's mental model actually is.
- Keep every existing honesty and accessibility property exactly as strict as it is today: the
  mastery grid's marks still have to read in greyscale, the "not a grade" / "evidence for a
  conversation, not for a grade" framing stays wherever it currently appears, and the `cr-info`
  explanation buttons keep working wherever their sections end up.
- If tabs, a sidebar, collapsed-by-default sections, or something else entirely turns out to be
  the right shape, make that case in the design doc before building it, the way every other
  spec in `docs/superpowers/specs/` argues for its approach rather than just declaring it.

## Testing

Same discipline as the last two sessions: real end-to-end checks against the emulators (or the
live site where that's the only way to be sure), not read-by-inspection. For task 1 specifically,
verify from the student's own account: an assignment appears, its state is correct before and
after the due date passes, and a unit named by a live assignment is actually reachable regardless
of the class's lock mode, matching what `assignmentUnlocks()` already promises the teacher side.
For task 2: two real accounts, one class each, one student, confirming a blocked second join
actually blocks and a same-class rejoin still doesn't error.
