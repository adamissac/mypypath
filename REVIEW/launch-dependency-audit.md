# Launch dependency audit — 2026-10-02

Commands: `npm audit --json`, `npm audit --omit=dev --json`, and compatible remediation with `npm audit fix --ignore-scripts`. No `--force`, overrides, or major direct dependency upgrades were applied.

| Scope | Before | After |
| --- | --- | --- |
| Production (`--omit=dev`) | 0 | 0 |
| Development-inclusive | 34 (17 moderate, 15 high, 2 critical) | 24 (11 moderate, 11 high, 2 critical) |

All declared dependencies are development tools. Compatible transitive updates remove ten findings. The remaining findings are not considered resolved merely because the production audit is clean.

Direct packages already resolve to the newest versions permitted by their existing major ranges. Current registry upgrades for Vitest (2 → 5), Firebase Tools (13 → 15), Firebase rules testing (4 → 5), and jsdom (25 → 30) require a separate migration and compatibility test. npm's proposed forced rules-testing fix is a downgrade to 2.0.7; it was not applied.

Residual findings include critical `tar` and `vitest`, high Firebase/gRPC and proxy packages, and moderate Vite/esbuild, UUID, Google Cloud, CSV and stream parsing dependencies. These remain tooling risks, particularly when serving development UIs or processing untrusted inputs. The exact npm-reported residual packages follow.

| Package | Severity | npm proposed fix |
| --- | --- | --- |
| `@firebase/firestore` | high | @firebase/rules-unit-testing 2.0.7 (breaking) |
| `@firebase/firestore-compat` | high | @firebase/rules-unit-testing 2.0.7 (breaking) |
| `@firebase/rules-unit-testing` | high | @firebase/rules-unit-testing 2.0.7 (breaking) |
| `@google-cloud/pubsub` | moderate | firebase-tools 15.32.1 (breaking) |
| `@grpc/grpc-js` | high | @firebase/rules-unit-testing 2.0.7 (breaking) |
| `@vitest/mocker` | moderate | vitest 5.0.3 (breaking) |
| `basic-ftp` | high | firebase-tools 15.32.1 (breaking) |
| `csv-parse` | moderate | firebase-tools 15.32.1 (breaking) |
| `esbuild` | moderate | vitest 5.0.3 (breaking) |
| `firebase` | high | @firebase/rules-unit-testing 2.0.7 (breaking) |
| `firebase-tools` | high | firebase-tools 15.32.1 (breaking) |
| `gaxios` | moderate | firebase-tools 15.32.1 (breaking) |
| `get-uri` | high | firebase-tools 15.32.1 (breaking) |
| `google-gax` | moderate | firebase-tools 15.32.1 (breaking) |
| `pac-proxy-agent` | high | firebase-tools 15.32.1 (breaking) |
| `proxy-agent` | high | firebase-tools 15.32.1 (breaking) |
| `retry-request` | moderate | firebase-tools 15.32.1 (breaking) |
| `stream-json` | moderate | Compatible update |
| `tar` | critical | firebase-tools 15.32.1 (breaking) |
| `teeny-request` | moderate | firebase-tools 15.32.1 (breaking) |
| `uuid` | moderate | firebase-tools 15.32.1 (breaking) |
| `vite` | high | vitest 5.0.3 (breaking) |
| `vite-node` | moderate | vitest 5.0.3 (breaking) |
| `vitest` | critical | vitest 5.0.3 (breaking) |

The remaining `stream-json` advisory is reported as compatible by npm, but remains after its compatible fix pass; no dependency overrides were introduced. CI now uses Node 22, matching the existing Firebase toolchain's supported Node versions. Local validation used Node 24.19.0 and emitted the existing `superstatic` engine warning (supports 18/20/22).

Focused verification after lockfile updates: `npx vitest run tests/check-runner.test.js tests/lesson-flow.test.js` (19 passed). The full unit suite and browser/emulator gates are coordinated separately.
