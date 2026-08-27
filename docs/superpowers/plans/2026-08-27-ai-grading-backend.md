# AI Grading Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. If that plugin is unavailable, work the tasks in order, tests first, one commit per task.

**Goal:** A second opinion on reflections, property checks and FRQ code, behind the project's first and only server, degrading to the deterministic behaviour whenever it cannot be reached.

**Design:** `docs/superpowers/specs/2026-08-27-ai-grading-backend-design.md`.

## Global Constraints

- The function holds the API key and nothing else. No Firebase service account, no admin credentials, no Firestore write of any kind.
- Every failure resolves to `review`. Never `pass`, never `fail`.
- Nothing here revokes a completion. The deterministic floor decides; this suggests.
- The rubric, the model's reasoning, and hidden test cases never cross the wire.
- `GRADING_MODEL` and the retry policy are one constant each, because both are the account holder's decision.

---

### Task 1: token verification  -- done

- [x] `api/_verify-token.js`, webcrypto against Google's JWKS, no `firebase-admin`.
- [x] Signature, `aud`, `iss`, `exp` and `iat` all checked; any failure is a 401.

### Task 2: the function  -- done

- [x] `api/grade.js`: verify, rate-limit per instance, call, shape the verdict, log usage.
- [x] `output_config.format` with a `json_schema`, `effort: 'low'`, cached system prompt.
- [x] Refusal, timeout, non-JSON and missing-key all resolve to `review`.

### Task 3: the client  -- done

- [x] `assets/js/ai-grade.js` with the pure half tested with no server.
- [x] `assets/js/auth-token.js`, the ES-module bridge to a Firebase ID token.
- [x] `tests/ai-grade.test.js`: 16 cases, every failure mode asserted to land on `review`.

### Task 4: rules  -- done

- [x] `users/{uid}/state/aiGrading`: today's date only, count may rise by exactly one.
- [x] `aiUsage/{day}`: admin-read, monotonic, undeletable.
- [x] `gradingOwnStudent` extended by the three override keys; a student may write none of them.
- [x] Ten new cases in `tests/rules/classroom-rules.test.js`.

### Task 5: surfaces  -- done

- [x] Second opinion asked for once the floor passes, and never allowed to un-tick.
- [x] `flagged` needsAttention kind at three flagged answers, with its own honesty caveat.
- [x] `tests/browser/ai-grading-degraded.py`: six checks with no endpoint reachable at all.

---

### Task 6: provisioning  -- NOT DONE, and cannot be done from a coding session

- [ ] **Create an Anthropic API key** in the Anthropic console.
- [ ] **Set `ANTHROPIC_API_KEY`** in the Vercel project, for Production and Preview
      separately. Consider a distinct key for Preview: a preview deployment is
      reachable by anyone holding the URL.
- [ ] **Optionally set `GRADING_MODEL`** if the account holder wants something other
      than `claude-opus-5`. `claude-haiku-4-5` is roughly a fifth of the cost; the
      worked figures are in the design doc.
- [ ] **Optionally set `FIREBASE_PROJECT_ID`** if the project is ever renamed. It
      defaults to `mypypath`, which is what the audience check is scoped to.
- [ ] **Confirm the first live call caches.** If `usage.cached` comes back zero across
      repeated calls, something volatile has entered the prompt prefix and the cost
      estimates in the design doc are wrong by roughly a factor of three.

Until the key is set the function returns `review` for everything, which is the
correct degraded state and not an outage. Nothing else in the site is affected.
