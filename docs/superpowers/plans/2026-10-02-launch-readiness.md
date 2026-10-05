# Launch readiness implementation plan

**Goal:** Verify the supplied October 1 audit against current production and fix confirmed defects without misrepresenting operational or legal verification.

**Architecture:** Preserve the static client/Firebase design. Keep classroom aliases separate from private names, preserve teacher-controlled certificate decisions after membership changes, and harden existing authorization boundaries. Independent CI jobs validate unit, security, and browser behavior.

**Source:** User-supplied launch-readiness audit and issue backlog dated 2026-10-01. Their recommendations are evidence to assess, not additional authorization.

## Constraints and decisions
- No attribution in commits. No real student data mutations for testing.
- Preserve standalone learning and current teacher workflows.
- Default to privacy-preserving classroom aliases, consistent with the existing promise.
- Preserve self-declared teacher roles and optional email verification unless evidence requires a change; describe their trust limits accurately.
- Do not claim automated retention, production alerts, backups, or legal review without verified evidence.
- Test with emulators; deploy tested backward-compatible rules before the client, then verify deployed content.

## Tasks
- [ ] LR-001/016/018/023: isolate Python harness files per setup, remove JSDOM noise, split CI security and browser jobs, update supported runtimes/actions. Regression-test concurrent harness use and run full suite.
- [ ] LR-003: create and expose a separate classroom alias; both roster schemas receive alias only, including OAuth/older accounts. Test joining as Ada Lovelace with alias ada-l and verify no private name enters classroom copies.
- [ ] LR-004: preserve teacher-controlled certificate requirement across leave/rejoin/removal. Fail closed while approval reads fail or load. Test student cannot delete/approve the decision, and pending stays pending after leaving.
- [ ] LR-010/013/021/022/025: inventory profile and roster writers, constrain fields and payloads without breaking valid legacy records; verify admin parity and account switching. Add negative rules tests.
- [ ] LR-002/006/011/015: inspect deployed rules and retention settings; harden security headers and caching with browser validation. Do not enable unconfigured App Check enforcement.
- [ ] LR-005/007/008/009/012/014: reconcile product disclosures with actual code and available deletion/retention mechanisms; clearly state learning/certificate trust model. Record decisions that need owner/legal follow-up.
- [ ] LR-017: triage production vs development advisories and perform compatible direct dependency upgrades with checks.
- [ ] LR-019/020/024: provide production smoke checks and concrete backup/deletion/incident runbooks; verify public endpoints and deployment. Record external settings not accessible rather than asserting completion.
- [ ] Final: full unit/rules/teacher/browser checks, independent review, deploy and inspect exact revision, record each audit ID and evidence in docs/launch-readiness-2026-10-02.md.

## Review focus
- Returning/OAuth users without an alias must never silently share Auth displayName.
- Legacy certificate and membership records must not grant approval through deletion or transfer.
- Strict rules must accept all existing legitimate client writes while denying arbitrary fields and oversized payloads.
- CSP must permit Firebase, authentication popups, Pyodide workers/WASM and course rendering.
- Sign-out/account switching must not expose another learner's local work.
