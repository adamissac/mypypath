# Due dates across timezones

**Status:** design, for Phase 7 of the 2026-09-01 audit remediation.
**Data model change:** yes — one new field on the class document.

---

## What is actually true today

The audit reported that `classroom-core.js` contains zero occurrences of
`getUTC*`, `toISOString` or `Date.UTC`, uses local-date methods, has no end-of-day
handling and never mentions timezones. Two of those five are wrong, and the
difference matters for what needs fixing.

**There IS end-of-day handling.** `classroom-dashboard.js` reads the `<input
type="date">` and does:

```js
// A date input gives midnight. Work due "on Friday" is due at the end of
// Friday, not at the start of it.
const due = raw ? new Date(raw + 'T23:59:59').getTime() : 0;
```

**It IS stored as an absolute instant.** `dueAt` is epoch milliseconds, and
`assignmentStatus` compares it against `Date.now()`. There is no naive date
arithmetic anywhere in the comparison path.

So the shape the audit asked for — "end of day, stored as an absolute instant"
— is already half built. Live behaviour was verified correct: an assignment due
Aug 31 read "Overdue" and one due Sep 1 read "Not due yet" at 02:29 EDT on Sep 1.

## What is actually wrong

`new Date('2026-09-04T23:59:59')` with no zone suffix is parsed in **the
browser's** timezone. That makes the meaning of a due date a property of
whoever happened to type it.

Three consequences, in increasing order of how much they matter:

1. **Display drift.** The stored instant is right, but every reader formats it
   in their own zone. A teacher in New York sets "due Friday"; the instant is
   Sat 03:59:59 UTC; a student in London sees **"Due Sat 5 Sep"** for work their
   teacher called Friday's.

2. **The deadline moves for the student.** That London student's work is not
   late until 04:59 their Saturday morning. Generous, and wrong — but the
   direction that hurts is the other one.

3. **A co-teacher sets a different deadline than they meant.** Two teachers on
   one class in different zones produce different instants from the same
   calendar date. A co-teacher in Los Angeles picking Friday sets a deadline
   three hours later than their colleague in New York would have. Neither is
   told.

None of this is visible in a single-timezone school, which is why it is latent
rather than broken. It surfaces the first time a class has a student abroad, a
remote co-teacher, or a teacher who travels.

## The contract

> **A due date is the end of a calendar day in the CLASS's timezone, stored as
> an absolute instant.**

Three parts, each load-bearing:

- **A calendar day**, because that is what a teacher types and what a student
  is told. Nobody sets work due at 23:59:59.
- **In the class's timezone**, not the author's and not the reader's. A class
  is a room in a school in a place, and that place is the only defensible
  answer to "whose Friday?".
- **Stored as an absolute instant**, because comparing "is this late" must not
  depend on where the comparison runs.

## The data model change

One field on `classes/{classId}`:

```js
timezone: 'America/New_York'   // an IANA zone name
```

Written at class creation from `Intl.DateTimeFormat().resolvedOptions().timeZone`,
which is the creating teacher's zone and is the right default: a teacher creates
a class from the room it will be taught in far more often than not.

**A class with no `timezone` keeps today's behaviour exactly.** Every existing
class falls back to the reader's zone, which is what it does now, so nothing
migrates and no existing due date moves. That is deliberate: silently
reinterpreting the due dates of live classes would move deadlines under
students who are working to them.

## What is NOT stored

**The offset.** `-04:00` is not a timezone, it is what a timezone was on one
particular day. A class that sets a due date in March for a lesson in April
crosses a DST boundary, and a stored offset would be an hour wrong on the far
side of it. The IANA name is the only thing that survives that.

## Implementation

`classroom-core.js` gains two pure functions, so the dashboard, the tests and
any future writer share one implementation:

```js
zoneOffsetAt(ms, timeZone)      // the zone's offset from UTC at that instant
endOfDayIn(dateStr, timeZone)   // 'YYYY-MM-DD' -> epoch ms at 23:59:59.999 there
```

`endOfDayIn` is computed with `Intl.DateTimeFormat` and `Date.UTC` rather than a
library — the repo has a defended zero-runtime-dependency history, and this is
about twenty lines. It corrects twice, because the offset at the naive guess can
differ from the offset at the true answer across a DST transition.

Display goes through the class zone too, so the date a teacher set and the date
a student reads are the same string.

## Verification

`tests/due-dates-tz.test.js` runs the boundary cases directly, without needing
the test runner's own zone to be anything in particular:

- the same calendar date produces the same instant regardless of author zone;
- a student in another zone sees the same date string;
- "late" flips at the class's midnight, not the reader's;
- a due date on the far side of a DST transition is still 23:59:59 local;
- a class with no timezone behaves exactly as it does today.
