# Features (engine/pypath_engine/model_core.py)

Every feature is computed for an attempt from the student's history **before**
that attempt. `test_model_core.py` checks that flipping an outcome changes no
feature of its own row. Per-skill values are averaged over the item's skills.

| Name | Definition | Why |
|---|---|---|
| attempt_log | log1p(attempt index within this item − 1) | retries on the same item |
| is_retry | attempt index > 1 | |
| decay_succ, decay_fail | Σ outcomes on the skills, weighted exp(−days/7), updated incrementally | recency |
| days_since_log | log1p(days since the skill was last attempted) | forgetting |
| no_history | 1 if no prior attempt on any of the skills | cold start |
| partial_rate, has_partial | mean passed/total over prior exercise attempts on the skills | hidden-case pass rate, not just binary |
| err_syntax / err_name / err_type / err_other | log1p counts of prior `code.error` classes, grouped by `CONFIG.error_groups` | error profile, class name only |
| exposure_log | log1p(lessons opened + code runs + free-text submissions) on the skills | prior exposure |
| prereq_min | min over prerequisites of (succ+1)/(succ+fail+2), averaged; 1 if none | prerequisite estimates as input |
| dur_rushed / dur_long / dur_outlier | bucket of the last end-of-unit test on this unit: <120 s, >1800 s, ≥7200 s (0 = missing) | durationSec with outlier handling |
| kind_exercise / kind_test / kind_quiz | item kind (question is the reference) | |
| per skill k: β_k, γ_k·log1p(succ_k), ρ_k·log1p(fail_k) | PFA terms | the core learning model |
| d_i | item one-hot, L2-shrunk | learned item difficulty |

`opp_k = log1p(succ + fail)` appears only in the AFM comparison model.

## Adding one

1. Compute it in `features()` from state, and update that state in
   `update_attempt()` or `replay()`. Plain floats only, no numpy.
2. Append the name to `GLOBAL_FEATURES`. Order matters: it is the column order
   and the order the score adds terms in.
3. Mirror both in `assets/js/recommend.js`, keeping the same operation order.
4. `python -m pypath_engine all`, then `pytest`, then `npx vitest run tests/recommend-parity.test.js`.
5. Read the new coefficient's fold stability in REPORT.md. A sign that flips
   between folds is not a finding.
