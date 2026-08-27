# AI grading: a second opinion, behind the project's first server

Date: 2026-08-27
Status: awaiting sign-off, and two decisions are the reader's to make
Related: `2026-08-27-autograder-and-question-types-design.md` (spec 2, shipped),
`2026-08-27-assignments-and-unit-locking-design.md` (spec 1, shipped),
`docs/prompts/2026-08-27-classroom-assignments-and-grading-kickoff.md` (the brief)

Third of three, and the only one that adds a deployed component, an ongoing dollar cost, and
a secret to provision. It is a separate spec for exactly those reasons and should be
approved on its own terms, not carried along by the first two.

## This breaks the project's founding constraint, deliberately

`firestore.rules` says it out loud:

> Written entirely by clients, because this project has no Cloud Functions. Everything a
> server would normally guarantee has to be a rule here or it is not guaranteed at all.

That is not an accident nobody got around to fixing. It is why the whole app deploys as
static files with no build step, why there is nothing to page anyone about at 2am, and why
the security story is one readable file. Every previous feature has been shaped to fit
inside it, including both earlier specs here.

This one cannot be. An Anthropic API key is a credential that bills money to whoever holds
it, and a key shipped in client-side JavaScript is a key published on the internet. There
is no rule, no obfuscation, and no Firebase feature that changes that. Either the grading
runs on a server or it does not happen.

So the exception is stated rather than absorbed:

- **Exactly one function.** `api/grade.js`, on Vercel, where the site already deploys.
  Not a Firebase Cloud Functions project, which would be a second platform, a second
  deploy pipeline, and a second place to look when something breaks.
- **It grades and nothing else.** It never writes to Firestore. It has no service account
  and no admin credentials. Everything it returns is written by the client under the
  client's own credentials, through rules that are still the only thing enforcing
  anything. If the function is compromised, the blast radius is the API key and a stream
  of plausible-looking grades, not the student data.
- **The site keeps working without it.** Every path that calls it degrades to the
  behaviour shipped in spec 2 when it is unreachable. A learner who is offline, whose
  network blocks it, or who hits the daily cap gets the deterministic floor and no error
  they can act on, because there is nothing they did wrong.

If that trade is not worth it, the honest alternative is to ship specs 1 and 2 and stop.
They stand on their own.

## Two decisions this spec cannot make for you

The brief left these open and they are still open. Defaults are written into one constant
each so that changing them is a one-line edit, but they are cost decisions, not
engineering ones.

### 1. Which model, and therefore what this costs

The default in this design is **`claude-opus-5`** ($5 per million input tokens, $25 per
million output). It is the default because downgrading a model to save money is the
account holder's call and not something a design doc should quietly make on their behalf.

A grading call is small: a rubric, a prompt, a student's paragraph, and a short structured
verdict. Budget roughly 1,200 input and 300 output tokens, which is about **$0.014 per
grade** on Opus 5. At the default cap below, one active student costs at most about $0.28
a day, and a class of 30 grading every day of a school month is on the order of **$250 a
month** at the ceiling, and far less in practice because the cap is a ceiling and not a
target.

**`claude-haiku-4-5`** ($1 / $5 per million) is the obvious cheaper option at roughly
**$0.003 per grade**, about a fifth of the cost. Whether a reflection on a beginner Python
lesson needs Opus judgement is a real question with a real answer, and it is yours.
`GRADING_MODEL` is one constant at the top of `api/grade.js`.

Both figures assume the prompt cache is doing its job. The rubric and the system prompt are
identical across every call for a given prompt kind and are marked with `cache_control`, so
after the first call in a five-minute window the bulk of the input is billed at about a
tenth of the rate. If `usage.cache_read_input_tokens` comes back zero across repeated
calls, something volatile has crept into the prefix and the cost estimates above are wrong
by roughly a factor of three.

### 2. Whether a learner may retry an AI-graded reflection freely

The default here is **yes, freely**, matching the ratchet everywhere else in this codebase:
`mergeAttempt`, `recordBest` and `rollUpUnitNumber` all improve and never regress, and a
learner who rewrites a reflection until it lands has done exactly what the exercise wanted.

The argument for a cap is that unlimited retries against a model turn a reflection into a
guessing game, and that a learner on their sixth attempt needs a teacher rather than a
seventh. The counter-argument is that a cap punishes the learner who is genuinely trying
hardest, and that the daily rate limit already bounds the cost.

The default stands unless you say otherwise. If you want the cap, `MAX_AI_ATTEMPTS` is the
constant, and hitting it marks the reflection **needs manual review** rather than failing
it, so it surfaces on the teacher's dashboard instead of stranding the learner.

## What it grades, in priority order

Straight from the brief, and this order matters because the first item is the real gap:

1. **Reflections and short answers.** Spec 2 put a structural floor under these: word
   count, prompt-pasted-back, degenerate text. The floor cannot tell whether an answer is
   about the question. This can.
2. **Property-case checks in `checker.js`.** `nonempty`, `min_lines`, `source_matches`
   check shape and never meaning, and `source_matches` is defeated by a comment containing
   the right substring. The model sees the source and the output and says whether the
   method makes sense.
3. **A second opinion on FRQ and code checks.** The hidden test cases stay the primary
   and trusted signal, exactly as they are. The model adds one thing they cannot give: a
   flag saying "this output is right but the method is nonsense", which is what a human
   grader catches and a test case never will.

## The verdict, and what never crosses the wire

```
{
  "verdict": "pass" | "partial" | "fail" | "review",
  "confidence": "high" | "low",
  "flag": "none" | "off-topic" | "incoherent" | "placeholder" | "output-without-method",
  "feedback": "one or two sentences, addressed to the learner"
}
```

Returned via `output_config.format` with a `json_schema`, so the shape is constrained by
the API rather than parsed hopefully out of prose.

**`flag` is the point of the whole thing.** "Wrong but a genuine attempt" and "did not
engage with the question" are completely different facts about a student, and a dashboard
that renders them the same is a dashboard that sends a teacher to talk to the wrong
person. `off-topic`, `incoherent` and `placeholder` are the three the brief names.
`output-without-method` is the code case: the tests pass and the method is nonsense.

**What the response never contains**, matching the discipline `checker.js` already applies
to hidden cases:

- The rubric. It is the answer key.
- The model's reasoning. `thinking` defaults to `omitted` on Opus 5 and is left there; the
  reasoning is not requested, not returned, and not logged.
- Hidden test cases, for the code path. The function receives the deterministic result
  that was already computed client-side, never the cases that produced it.

**`review` is what failure means.** Any API error, timeout, rate-limit rejection, schema
mismatch, or refusal resolves to `verdict: "review"`. Never `pass`, and never `fail`
either: a network hiccup must not be recorded as a student getting something wrong. This
is the honesty pattern the rest of the codebase already follows, which always fails toward
under-claiming.

## The function

`api/grade.js`. Node runtime, one file, one new production dependency
(`@anthropic-ai/sdk`). No Zod: the output schema is written as a plain JSON schema, because
a second dependency to describe four fields is not worth it in a repo whose entire
dependency list is four dev packages.

**1. Verify the Firebase ID token, server-side, before anything else.** The client sends
`Authorization: Bearer <idToken>`. The function fetches Google's public JWT signing keys
(cached in module scope for their `max-age`) and verifies signature, `aud` against the
project id, `iss`, and expiry. An unverified token is a 401 and nothing is called.

This is not optional and it is not the same as trusting the client. Without it the endpoint
is an open proxy to a paid API, and the bill arrives regardless of who found it.

**2. Rate-limit per student per day.** The cap is enforced against a counter the client
holds in its own Firestore document, read by the function... which it cannot do, having no
credentials. So the counter is enforced in two places, and neither is sufficient alone:

- **In the function, in memory, per instance**, as a coarse ceiling. Serverless instances
  come and go, so this bounds abuse rather than counting exactly.
- **In the rules**, on a `users/{uid}/state/aiGrading` document the learner owns, holding a
  date and a count. The rule permits the count to increase by one, and only for today's
  date, so a client cannot reset it by writing a smaller number or an older date.

Say plainly what this is: a determined student with devtools can burn their own daily
allowance faster than intended. What they cannot do is exceed it, spend anyone else's, or
reach the endpoint without a valid token for an account that exists.

**3. Log usage where cost can be seen.** Every call appends to `aiUsage/{yyyy-mm-dd}`, a
document holding a call count and a token total for the day, readable by `isAdmin()` and by
nobody else. Not per student, because a per-student log of who needed the most help is a
record with no upside and an obvious downside.

**4. The teacher override.** Any AI verdict can be replaced by a teacher, and the override
is final: a later regrade never overwrites it. This extends `gradingOwnStudent` in
`firestore.rules`, which is already the one narrow, key-allowlisted write a teacher has
into a student's record, rather than inventing a second write path. The allowlist grows by
`aiVerdict`, `aiOverriddenBy` and `aiDecidedAt`, and the rule refuses any write that
changes `aiVerdict` while `aiOverriddenBy` is set.

## Where it appears

**For the learner.** Under the reflection box, in the same place spec 2's floor writes its
note, and in the same voice: what to try, never a verdict on them. A `review` says the
answer is saved and a teacher will look, which is true and is not a failure.

**For the teacher.** A flagged answer appears in `needsAttention` as a new kind, alongside
`stuck`, `idle` and `concept`, with the same wording rule: describe what happened, never
what the student is. "Three reflections in this unit did not answer the question asked"
is a reason; "disengaged" is a label, and the file already forbids it.

**The raw model text is shown, and here is why.** The brief flags this as a decision. The
alternative considered was showing only the flag and the verdict, and it was rejected: a
teacher acting on a machine judgement they cannot read has no way to disagree with it, and
this codebase's whole stance is that a number a teacher cannot interrogate is worse than no
number. The feedback is one or two sentences written for the learner, which is the same
thing the learner already sees, so nothing is disclosed to the teacher that the student was
not shown first.

Every surface carries the caveat, extended one clause: an AI grade is a second opinion
generated from client-submitted text, not an authority, and not proof.

## Files

| File | Change |
|---|---|
| `api/grade.js` | new, the whole function |
| `api/_verify-token.js` | new, Firebase ID token verification |
| `assets/js/ai-grade.js` | new, the client call, with its fail-toward-review path |
| `assets/js/lesson-progress.js` | ask for a second opinion once the floor passes |
| `assets/js/classroom-core.js` | the flagged-answer `needsAttention` kind |
| `assets/js/classroom-dashboard.js` | the flag, and the teacher override control |
| `firestore.rules` | `aiGrading` counter, `aiUsage`, wider `gradingOwnStudent` |
| `package.json` | `@anthropic-ai/sdk` as the first production dependency |
| `vercel.json` | Node runtime for `api/` |
| `tests/ai-grade.test.js`, `tests/rules/*` | new |

## Testing

**Unit.** The client wrapper resolving to `review` on a network error, a non-200, a
timeout, a malformed body, and a body missing `verdict`. The rate-limit counter refusing a
decrease and refusing an older date. The verdict-to-copy mapping for all four verdicts and
all five flags.

**Rules.** The counter can only increase, and only for today. `aiUsage` is admin-read and
nobody-else. A teacher can set an override; a student cannot; a later regrade cannot
overwrite one.

**Function.** Token verification against a forged signature, a wrong `aud`, an expired
token, and a valid one. Structured-output conformance against a stubbed API.

**Browser.** A reflection that clears the floor and is graded; the same one with the
endpoint returning 500, showing `review` and no error the learner can act on; the teacher
dashboard showing a flag and an override taking effect.

## The one step that cannot be finished in a coding session

**Provisioning `ANTHROPIC_API_KEY` as a Vercel environment variable.** It has to be created
in the Anthropic console and set in the Vercel project by someone with access to both, and
it must never be committed, never be logged, and never appear in a client bundle. Until it
is set, the function returns `review` for everything, which is the correct degraded state
and not an outage.

Set it for Production and Preview separately, and consider a separate key for Preview: a
preview deployment is reachable by anyone with the URL.

## Out of scope

Grading anything a learner has not submitted. Any use of student text for training, which
is neither done nor permitted here. Per-student cost reporting. Streaming responses, which
buy nothing for a 300-token verdict. Automatic regrading of past work, which would spend
the cap on answers nobody is waiting for.
