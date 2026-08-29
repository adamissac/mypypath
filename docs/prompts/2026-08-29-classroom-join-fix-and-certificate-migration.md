# Follow-up: finish the join fix, retire the legacy roster view, move certificates

Paste this to Claude Code, run from the root of `mypypath`.

## What's already true, verified by reading the repo and git log directly

`origin/main` (`918f92d`) already has the fix for the bug that was just reported: a student
joining a class only ever wrote the legacy `roster/{uid}` document, never
`classes/{classId}/roster/{uid}`, so they showed up under "Students who joined before classes
existed" instead of in their actual class, and `class-policy.js` (which finds the class through
`users/{uid}.classId`) silently fell back to sequential locking no matter what the teacher had
set. `join-flow.js` now writes both, and `firestore.rules` did not need to change for it
(confirmed: `git diff` from the commit before that fix to now touches no rules). **This part is
already merged and, if Vercel has redeployed since, already live.**

**One commit is not yet pushed.** Local `main` is at `17bae84`, one ahead of `origin/main`
(`918f92d`). That commit is `feat: keep the class roster live while the dashboard sits open` —
`watchRoster()` in `classroom-store.js`, an `onSnapshot` listener so a student who joins while
the teacher has the dashboard open appears within about half a second instead of only on the
next reload. This is exactly the other half of "when people join it shows up" — **push it before
doing anything else**: `git push origin main`.

## Task 1: confirm the join fix is actually live, and handle who joined before it was

Once pushed and Vercel has redeployed, verify end to end against the live site (or, if you'd
rather not touch production directly, against the emulators the way `4fe1caf`'s own commit
message did — it already describes the exact before/after check to repeat): create a class,
join it from a second signed-in account, confirm the student shows up in the roster grid with
their progress, not only in a legacy list.

**Anyone who already joined before this fix shipped is still legacy-only** — the fix changed what
happens on a fresh join, it did not backfill anything, so their `users/{uid}.classId` is unset
and they are invisible to assignments and lock mode. Test specifically what happens when an
already-legacy-enrolled account re-submits the same join code today: confirm `joinAnyClass` in
`join-flow.js` handles that cleanly (the class-roster write's update rule refuses to move
`joinedAt` once set, per the existing comment in `firestore.rules` — check whether a repeat
`create` on an already-enrolled uid is a no-op, an error that's swallowed, or something that
needs a small fix). If it's not already clean, make it clean: re-submitting a code you're already
in should silently succeed, not throw. Report back how many real (non-test) accounts are
currently stuck in legacy-only state — if it's more than a handful, a one-time repair script is
worth writing; if it's just test accounts from this build, it isn't, and telling them to leave
and rejoin is enough.

## Task 2: move certificate approval into the class view, then delete the legacy section

Decision made: certificate approval is not being dropped, it's moving. Right now the Approve /
Decline buttons and the certificate status pill exist only in `classroom-page.js`, reading and
writing the flat `roster/{uid}` document's `certificateRequestedAt` / `certificateApproved` /
`certificateDecidedAt` fields (the rules' `gradingOwnStudent()` predicate, unchanged, still
targets that same document — that part does not need to move, because `join-flow.js` already
guarantees every class-enrolled student also has a legacy `roster/{uid}` doc alongside their
class one).

- Add a certificate column or indicator to the class roster grid in `classroom-dashboard.js` /
  `student-detail.js`: state (none / requested / approved / declined), a request date, and
  Approve / Decline controls that call the same write `classroom-page.js` makes today, just
  reached from the new view. Match `MASTERY_MARK`'s discipline: a certificate state needs to
  read in greyscale and on a printout too, not by color alone.
- A "needs a certificate decision" row belongs somewhere a teacher will actually see it — the
  needs-attention panel is the natural home (a pending certificate request is exactly the kind
  of thing that panel exists for), or its own small section if that reads better once you see it
  built.
- Once that's live and tested, delete the "Students who joined before classes existed" section
  and its rendering out of `classroom.html` and `classroom-page.js` entirely. Leave
  `class-join.js`'s `readRoster` and the legacy write path alone — `join-flow.js` still needs
  them, and `admin.html` (a separate staff page, not this one) has its own reader over the same
  collection and is out of scope here.
- Check `classroom-export.js` and `classroom-page.js`'s own CSV exporter: the legacy exporter's
  certificate columns need to land in `classroom-export.js`'s output instead, so a teacher does
  not lose that column when the old table disappears.

## Task 3: the broader "does the classroom actually work" pass

Before calling this done, run the same kind of true end-to-end check `4fe1caf` and `17bae84`'s
own commit messages modeled (two sessions against the auth + Firestore emulators, not read by
inspection), covering the full loop in one run: create a class, join it from a second account,
watch it appear live, assign a unit with a due date, confirm the joined student can reach it and
it shows correctly as done or late, switch lock mode to manual and confirm an unlisted unit
shows the lock notice for that student while the teacher still sees everything open, request a
certificate as the student and approve it as the teacher from the new location, export the CSV
and confirm the new columns are in it, and confirm `admin.html` still works untouched. Use
`.claude/skills/webapp-testing` for the browser half. Write down exactly what you checked and
what you saw, the way the last two commit messages did — that log is what let this be diagnosed
quickly from git history alone just now, and it's worth keeping doing.
