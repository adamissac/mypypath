# PyPath — The teacher dashboard's information architecture

**Date:** 2026-08-30
**Status:** Approved design, implemented in the same branch

## Problem

`classroom.html` has nine top-level sections in one continuous scroll, in the
order they were built rather than any order a teacher would choose:

1. Join code
2. Assignments, with an inline create-work form
3. Unit access
4. Needs attention
5. The mastery grid, with its own scope toggle, unit picker and sort control
6. Certificates
7. Share this class, with archive and purge nested inside it
8. The weekly digest
9. Class summary stats

Several carry sub-controls of their own. Nothing groups them, nothing is
collapsible, and the first thing on the page is a six-character code that
matters intensely for one week of the year and never again.

The specific failure: a teacher with thirty seconds between lessons opens this
to find out who needs help, and scrolls past a join code, an assignment
builder, ten lock-mode checkboxes and a certificate queue to get to the list
that answers it. The information is all there. The page has no opinion about
which of it matters now.

## Goal

Group the page by *why a teacher came*, so the common visit ends at the top of
the page and the rare one is still one click away.

## Non-goals

- **No feature loses functionality.** Every control listed above stays
  reachable: assignment creation, the three unit-access modes, the grid's scope
  and sort, certificate decisions, co-teacher sharing, archive, purge, CSV
  export, the weekly digest, the summary figures.
- **No visual rebrand.** The site has an established palette and type system,
  and this is an information-architecture problem. Spending the change on new
  colours would be spending it on the one thing that is not broken. The
  structural risk below is where the boldness goes.
- No change to what any number means, or to how any of it is computed.

## Who this is for, and when

A schoolteacher running a Python class of twenty to thirty. They open this page
in three distinguishable situations, and the third is much rarer than the
other two:

| When | What they want | How often |
|---|---|---|
| During or just before a lesson | Who needs help. Is anyone stuck. | Most visits |
| Planning | Set work, open a unit, check what is due | Weekly |
| Paperwork | Approve a certificate, export a sheet, add a co-teacher, close the class | Termly |

The user's own hypothesis was two groups — "how is the class doing" versus
"configure something". Three is closer. Setting work is neither a glance nor
paperwork: it is a deliberate weekly act with its own rhythm, and burying it
under a disclosure with archive-and-purge would be wrong in the other
direction.

## The thesis

**Open with the students, not with the statistics.**

The most characteristic thing in this subject's world is not a completion
percentage. It is a named child who is stuck on the same exercise for the
seventh time. `needsAttention()` already computes exactly that, in sentences,
with a next step — and it currently sits fourth on the page, below a form.

So the needs-attention list becomes the top of the page and the thing the page
is *about*. Names and plain sentences, not tiles and numbers. The summary
figures stay, demoted to one quiet line beneath the class name, because "23
students, 8 active this week" is context for the list rather than a headline of
its own.

This is the deliberate departure from the template answer. A dashboard's
default opening is a row of stat tiles with a big number and a small label, and
this page already has one — `cr-stats`, five tiles, currently at the very
bottom. Promoting that row to the top is the move that would occur to anyone.
It is also the wrong one: no teacher has ever needed to know the median unit
reached in the thirty seconds before a lesson starts, and a number cannot be
acted on the way a name can.

When nothing needs attention, that space says so in a sentence. An empty
dashboard region reads as something failing to load; a teacher whose class is
fine should be told their class is fine.

## Shape: why not tabs

Three shapes were considered.

**Tabs** cut the scroll hardest and were the first instinct. Rejected on two
grounds. The page has a deliberate print stylesheet — `@page { size: landscape }`,
because the mastery grid is printed for department meetings — and a tabbed page
prints one tab. Fixing that means print rules that reveal what the screen
hides, which is a second layout to keep correct forever. Second, tabs put the
class's state behind a click: a teacher cannot see that two certificates are
waiting while looking at the grid.

**A sidebar** was rejected quickly. Nine destinations do not need persistent
navigation, and the grid is the widest thing on the site — it already scrolls
horizontally at 1280px. Spending 200px of width on a permanent menu makes the
one artifact teachers print worse.

**Grouped sections, with the rare ones collapsed** is what this uses. One
document, one scroll, one print, no hidden tab state, and everything is either
visible or one click from visible.

## Structure

```
┌──────────────────────────────────────────────────────────────┐
│  My class ▾              Join code  4T7QKM  [Copy]           │  class bar
│  23 students · 8 active this week · median Unit 4            │
├──────────────────────────────────────────────────────────────┤
│  NEEDS YOU                                                   │  ← the thesis
│   Aiden    Stuck on the same exercise 7 times   Sit with him │
│   Priya    Finished, waiting on her certificate  Decide it   │
│   ── or ──                                                   │
│   Nothing needs you right now.                               │
├──────────────────────────────────────────────────────────────┤
│  PROGRESS        [Units | Lessons in ▾ | Assignment ▾] [Sort]│
│   the mastery grid, unchanged                                │
├──────────────────────────────────────────────────────────────┤
│  WORK SET                                    [Set new work ▾]│
│   Loops and conditionals — due Fri — 12 done, 4 late, 7 open │
│   Unit access:  (•) In order   ( ) By hand   ( ) Open        │
├──────────────────────────────────────────────────────────────┤
│  ▸ Certificates                                 2 waiting    │  collapsed,
│  ▸ Share this class                             1 co-teacher │  but never
│  ▸ Export and reports                                        │  silent
│  ▸ Closing this class                                        │
└──────────────────────────────────────────────────────────────┘
```

Four zones always visible, four disclosures below. Nine flat sections becomes
five things to look at.

### The join code moves and shrinks

It stays at the top, because reading it aloud is a real and frequent act, but
it stops being a card with a heading, a paragraph and a button. It becomes a
code and a copy button on the class bar. It is six characters; it was taking a
fifth of the first screen.

### Counts on collapsed headers

**A collapsed section that has something waiting says so in its own header.**
"Certificates — 2 waiting" is legible with the section shut.

This is the property that makes collapsing safe rather than merely tidier, and
it is not optional. Without it, hiding the certificate queue means a student
who finished the course waits on a teacher who has no way to know. The rule:
anything collapsed that can accumulate work owed to a person must show the
count of what it is holding.

## What must not change

These are properties the current page has, and every one survives:

- **Marks, not colours.** Every mastery cell keeps its character as well as its
  fill, and so does every certificate state. The grid is printed in greyscale
  for department meetings and read by colourblind teachers.
- **The framing stays where it is.** "Evidence for a conversation, not for a
  grade", the retention notes, and the explanation of what a teacher cannot see
  all keep their existing wording and stay attached to the numbers they qualify
  — moving a caveat away from its number is how a caveat stops working.
- **Every `cr-info` button keeps working.** A teacher who cannot interrogate a
  number does not trust it, and an untrusted number is worse than none. The
  explanations move with their sections.
- **Keyboard and screen-reader behaviour.** The grid's cells stay focusable and
  keep announcing the whole fact. New disclosures are `<details>`, which is
  keyboard-operable without any script.
- **Print.** The grid still prints landscape. Collapsed sections open for
  print, so the paper copy is the whole dashboard rather than whatever happened
  to be expanded.

## Testing

Browser verification with `.claude/skills/webapp-testing` against the
emulators, as an actual teacher account with an actual class:

1. Every control from the nine old sections is still reachable and still works.
2. Needs-attention is the first thing under the class bar.
3. A pending certificate shows its count on the collapsed header without
   opening it.
4. Collapsed sections expand for print.
5. The grid still scrolls, still sticks its header row and first column, and
   still shows a mark in every cell.
6. 375px: nothing overflows horizontally except the grid, inside its own
   scroller.
