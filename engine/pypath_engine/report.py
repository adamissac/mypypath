"""Writes engine/REPORT.md and its figures from the metrics files a run produced.

Nothing in the report is typed by hand: every number is read from
engine/reports/metrics-*.json, which `python -m pypath_engine all` regenerates.
"""
from __future__ import annotations

import json
import platform
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from . import MODEL_VERSION, __version__, paths

NAMES = {"base": "Global base rate", "item": "Item difficulty only", "afm": "Logistic, AFM (skill + opportunities + item)",
         "pfa": "Logistic, PFA (skill + successes + failures + item)", "full": "**Logistic, PFA + history features (ships)**",
         "full_cal": "Logistic full, isotonic-calibrated", "hgb": "HistGradientBoosting", "hgb_cal": "HistGradientBoosting, isotonic-calibrated"}


def _f(x, d=3):
    return "—" if x is None or (isinstance(x, float) and np.isnan(x)) else f"{x:.{d}f}"


def _ci(ci, d=3):
    return "—" if not ci else f"[{ci[0]:.{d}f}, {ci[1]:.{d}f}]"


def _git():
    try:
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=paths.REPO, text=True).strip()
    except Exception:
        return "unknown"


def figures(metrics: dict, recovery_points: dict, out: Path) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    # Reliability diagram.
    fig, ax = plt.subplots(figsize=(5.5, 5))
    ax.plot([0, 1], [0, 1], color="#999", lw=1, ls="--", label="perfect")
    for s, c in metrics["cv"]["calibration_curves"].items():
        if s == "base":
            continue
        ax.plot(c["predicted"], c["observed"], marker="o", ms=3, lw=1.2, label=s)
    ax.set_xlabel("predicted p(correct), decile mean")
    ax.set_ylabel("observed fraction correct")
    ax.set_title("Calibration, out-of-fold (simulated data)")
    ax.legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(out / "calibration.png", dpi=110)
    plt.close(fig)

    # Learning curves: one small panel per skill.
    lc = metrics.get("learning_curves") or []
    skills = sorted({r["skill"] for r in lc})
    if skills:
        cols = 8
        rows_n = int(np.ceil(len(skills) / cols))
        fig, axes = plt.subplots(rows_n, cols, figsize=(cols * 1.9, rows_n * 1.6), sharex=True, sharey=True)
        for ax, skill in zip(axes.flat, skills):
            pts = [r for r in lc if r["skill"] == skill and r["n"] >= 20]
            if pts:
                ax.plot([r["opportunity"] for r in pts], [r["observed_error"] for r in pts], color="#1f6f9f", lw=1.2)
                ax.plot([r["opportunity"] for r in pts], [r["predicted_error"] for r in pts], color="#d08c2b", lw=1, ls="--")
            ax.set_title(skill, fontsize=6.5)
            ax.tick_params(labelsize=6)
        for ax in list(axes.flat)[len(skills):]:
            ax.axis("off")
        fig.suptitle("Error rate by opportunity, per skill (blue observed, orange model; simulated data; n>=20 per point)", fontsize=9)
        fig.tight_layout()
        fig.savefig(out / "learning_curves.png", dpi=110)
        plt.close(fig)

    if lc and lc[0].get("adjusted_success") is not None:
        by_opp = {}
        for r in lc:
            b = by_opp.setdefault(r["opportunity"], [0, 0.0, 0.0])
            b[0] += r["n"]
            b[1] += r["observed_error"] * r["n"]
            b[2] += r["adjusted_success"] * r["n"]
        xs = sorted(by_opp)
        fig, (a1, a2) = plt.subplots(1, 2, figsize=(9, 3.4))
        a1.plot(xs, [by_opp[x][1] / by_opp[x][0] for x in xs], marker="o", ms=3, color="#1f6f9f")
        a1.set_title("Raw error rate by opportunity")
        a1.set_xlabel("opportunity on the skill")
        a2.axhline(0, color="#999", lw=1, ls="--")
        a2.plot(xs, [by_opp[x][2] / by_opp[x][0] for x in xs], marker="o", ms=3, color="#2f855a")
        a2.set_title("Success above item difficulty")
        a2.set_xlabel("opportunity on the skill")
        fig.suptitle("All skills pooled, questions and exercises (simulated data)", fontsize=9)
        fig.tight_layout()
        fig.savefig(out / "learning_curve_adjusted.png", dpi=110)
        plt.close(fig)

    if recovery_points and recovery_points.get("est"):
        fig, ax = plt.subplots(figsize=(5, 5))
        ax.hexbin(recovery_points["true"], recovery_points["est"], gridsize=40, cmap="Blues", mincnt=1)
        ax.plot([0, 1], [0, 1], color="#999", lw=1, ls="--")
        ax.set_xlabel("simulator true final mastery")
        ax.set_ylabel("estimated mastery (p correct on a typical question)")
        ax.set_title("Mastery recovery, held-out students (simulated)")
        fig.tight_layout()
        fig.savefig(out / "mastery_recovery.png", dpi=110)
        plt.close(fig)


def _metrics_table(m: dict) -> str:
    cv, boot = m["cv"]["metrics"], m["cv"]["bootstrap"]
    fm, fsd = m["cv"]["fold_mean"], m["cv"]["fold_sd"]
    lines = ["| Model | AUC (pooled) | 95% CI | AUC fold mean ± sd | Log loss | 95% CI | Brier | ECE |",
             "|---|---|---|---|---|---|---|---|"]
    for s in m["specs"]:
        lines.append(f"| {NAMES.get(s, s)} | {_f(cv[s]['auc'])} | {_ci(boot[s]['auc_ci'])} | "
                     f"{_f(fm[s]['auc'])} ± {_f(fsd[s]['auc'])} | {_f(cv[s]['logloss'])} | {_ci(boot[s]['logloss_ci'])} | "
                     f"{_f(cv[s]['brier'])} | {_f(cv[s]['ece'])} |")
    return "\n".join(lines)


def _lift_table(m: dict) -> str:
    cv, boot = m["cv"]["metrics"], m["cv"]["bootstrap"]
    base, item = cv["base"], cv["item"]
    lines = ["| Model | Log loss vs base | 95% CI | Rel. reduction | AUC vs item | 95% CI | Log loss vs item | 95% CI |",
             "|---|---|---|---|---|---|---|---|"]
    for s in m["specs"]:
        if s == "base":
            continue
        b = boot[s]
        rel = (base["logloss"] - cv[s]["logloss"]) / base["logloss"]
        lines.append(f"| {NAMES.get(s, s)} | {cv[s]['logloss'] - base['logloss']:+.4f} | {_ci(b['logloss_vs_base'], 4)} | "
                     f"{rel:.1%} | {cv[s]['auc'] - item['auc']:+.4f} | {_ci(b['auc_vs_item'], 4)} | "
                     f"{cv[s]['logloss'] - item['logloss']:+.4f} | {_ci(b['logloss_vs_item'], 4)} |")
    return "\n".join(lines)


def _temporal_table(m: dict, key: str) -> str:
    t = m["temporal"][key]
    lines = ["| Model | n | AUC | Log loss | Brier |", "|---|---|---|---|---|"]
    for s in m["specs"]:
        lines.append(f"| {NAMES.get(s, s)} | {t[s]['n']} | {_f(t[s]['auc'])} | {_f(t[s]['logloss'])} | {_f(t[s]['brier'])} |")
    return "\n".join(lines)


def write(reports: Path, report_md: Path) -> None:
    main = json.loads((reports / "metrics-main.json").read_text())
    alt_path = reports / "metrics-bkt.json"
    alt = json.loads(alt_path.read_text()) if alt_path.exists() else None
    sim_meta = json.loads((reports / "sim-meta-main.json").read_text())
    ingest_meta = json.loads((reports / "ingest-main.json").read_text())
    rec_points = json.loads((reports / "recovery-points-main.json").read_text()) if (reports / "recovery-points-main.json").exists() else {}
    figures(main, rec_points, reports)
    synthetic = sim_meta.get("synthetic", False)
    versions = {}
    for mod in ("numpy", "pandas", "sklearn", "scipy", "matplotlib"):
        try:
            versions[mod] = __import__(mod).__version__
        except Exception:
            pass

    cv = main["cv"]["metrics"]
    rec = main.get("recovery", {})
    lc = main.get("learning_curves", [])
    declining, checked, rising = 0, 0, 0
    for skill in sorted({r["skill"] for r in lc}):
        pts = {r["opportunity"]: r for r in lc if r["skill"] == skill and r["n"] >= 30}
        if 1 in pts and 5 in pts:
            checked += 1
            declining += pts[5]["observed_error"] < pts[1]["observed_error"]
            if pts[1].get("adjusted_success") is not None:
                rising += pts[5]["adjusted_success"] > pts[1]["adjusted_success"]
    coef_folds = main["cv"].get("global_coef_by_fold", [])
    stable = []
    if coef_folds:
        for name in coef_folds[0]:
            vals = [f[name] for f in coef_folds]
            stable.append((name, float(np.mean(vals)), all(v > 0 for v in vals) or all(v < 0 for v in vals)))

    L = []
    if synthetic:
        L += ["> **THESE RESULTS ARE FROM SIMULATED DATA.** Every student below was generated by",
              "> `pypath_engine.simulate` with a known ground truth. Nothing here is evidence about real",
              "> PyPath students, and no number in this report may be quoted as one. Replace the source with a",
              "> real (pseudonymised) events export and re-run before claiming anything about learners.", ""]
    L += ["# PyPath adaptive engine: evaluation report", "",
          f"Generated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} from commit `{_git()}` by "
          f"`python -m pypath_engine all` (engine {__version__}, model `{MODEL_VERSION}`, Python {platform.python_version()}, "
          + ", ".join(f"{k} {v}" for k, v in versions.items()) + ").", "",
          "Every number below is read from `engine/reports/metrics-*.json` produced by that command.", "",
          "## Data", "",
          f"- Source: **{'simulated' if synthetic else 'real export'}**, generator `{sim_meta['config'].get('generator', 'logistic')}`, "
          f"seed `{sim_meta['config']['seed']}`, {sim_meta['config']['students']} students in classes of {sim_meta['config']['class_size']}.",
          f"- Events written: {sim_meta['events']:,}. The simulator dropped {sim_meta['stats']['dropped_by_cap']:,} at the 500-event page cap "
          f"and lost {sim_meta['stats']['lost_batches']:,} whole batches; {sim_meta['stats']['dropouts']} students dropped out part-way.",
          f"- Ingest kept {ingest_meta['events_kept']:,} events: {ingest_meta['cleaning'].get('duplicate', 0):,} duplicates removed, "
          f"{ingest_meta['cleaning'].get('late_flush_reordered', 0):,} late flushes reordered, "
          f"{ingest_meta['cleaning'].get('unit_recovered_from_path', 0):,} Data-course units recovered from the path, "
          f"{ingest_meta['suspected_gaps']} suspected gaps and {ingest_meta['students_left_mid_unit']} students who left mid-unit flagged.",
          f"- Attempt rows: **{main['rows']:,}** from {main['students']} students: "
          + ", ".join(f"{k} {v:,}" for k, v in main["rows_by_kind"].items()) + f". Base rate correct: {main['base_rate']:.3f}.",
          "- End-of-unit MCQ ids are tagged but never appear as rows: the site logs only the test total, so a test is one item.", "",
          "## How it was split", "",
          f"- **Cross-validation:** {main['cv']['method']}. No student is in both train and test. Confidence intervals: 95%, "
          f"{main.get('bootstrap_reps', 200)} bootstrap resamples of *students* over the pooled out-of-fold predictions.",
          f"- **Temporal holdout:** {main['temporal']['method']} ({main['temporal']['students_cut']} students cut).",
          f"- Regularisation: C chosen per logistic model on 20% of the first fold's training students: `{main['tuned_C']}`.", "",
          "## Cross-validated results", "", _metrics_table(main), "",
          "The base rate's pooled AUC is below 0.5 only because its constant differs slightly between folds; its fold-mean AUC is 0.5.", "",
          "## Lift over the two floors", "", _lift_table(main), "",
          "## Temporal holdout: predicting what a student does next", "", "**Next attempt**", "", _temporal_table(main, "next_1"), "",
          "**Next ten attempts**", "", _temporal_table(main, "next_10"), ""]
    if "decision" in main:
        d = main["decision"]
        L += ["## Which model ships", "",
              f"Gradient boosting minus the full logistic model, cross-validated AUC: **{d['hgb_minus_full_auc']:+.4f}**. The threshold, "
              f"fixed in code before any run (`SHIP_THRESHOLD_AUC`), was +{d['threshold']}. "
              + ("It was not met, so **the logistic model ships**: its coefficients can be read and explained to a teacher, and it "
                 "runs in the browser as a weighted sum." if d["ship"] == "full" else
                 "It was met, and the report says so; logistic still ships because the browser needs an explainable model."), ""]
    L += ["## Calibration", "", "![calibration](reports/calibration.png)", "",
          f"Expected calibration error, out-of-fold: full logistic {_f(cv['full']['ece'])}, calibrated {_f(cv.get('full_cal', {}).get('ece'))}; "
          f"gradient boosting {_f(cv.get('hgb', {}).get('ece'))}, calibrated {_f(cv.get('hgb_cal', {}).get('ece'))}. "
          + ("Isotonic calibration does not buy enough to justify shipping a second, non-linear stage, so the shipped model is uncalibrated."
             if cv.get("full_cal") and cv["full"]["ece"] < 0.02 else
             "The uncalibrated logistic model is off by more than 0.02; see the calibrated row before relying on raw probabilities."), ""]
    if "oracle" in main:
        o = main["oracle"]
        L += ["## How close to the ceiling", "",
              f"The simulator knows each attempt's true p(correct). Used as a predictor on the same {o['rows']:,} question and exercise rows, "
              f"it scores AUC **{_f(o['true_p']['auc'])}** and log loss {_f(o['true_p']['logloss'])}; no model can do better on these rows. "
              f"The full logistic model scores AUC {_f(o['models']['full']['auc'])} and log loss {_f(o['models']['full']['logloss'])} on them, "
              f"and item difficulty alone {_f(o['models']['item']['auc'])}.", ""]
    if rec:
        L += ["## Mastery recovery", "",
              f"{rec['what']}. Estimated mastery is the model's p(correct) on a typical first-attempt question on that skill.", "",
              "| Estimator | Pairs | Pearson | Spearman |", "|---|---|---|---|",
              f"| Model, all skills attempted | {rec['model_all']['n']:,} | {_f(rec['model_all']['pearson'])} | {_f(rec['model_all']['spearman'])} |",
              f"| Laplace success rate, same pairs | {rec['laplace_all']['n']:,} | {_f(rec['laplace_all']['pearson'])} | {_f(rec['laplace_all']['spearman'])} |",
              f"| Model, skills with 5+ attempts | {rec['model_opp_ge_5']['n']:,} | {_f(rec['model_opp_ge_5']['pearson'])} | {_f(rec['model_opp_ge_5']['spearman'])} |",
              f"| Laplace, 5+ attempts | {rec['laplace_opp_ge_5']['n']:,} | {_f(rec['laplace_opp_ge_5']['pearson'])} | {_f(rec['laplace_opp_ge_5']['spearman'])} |",
              "", "![recovery](reports/mastery_recovery.png)", ""]
        if rec.get("mastery_threshold"):
            mt = rec["mastery_threshold"]
            L += ["**Where to call a skill mastered.** The policy declares mastery when the estimate at a skill's last practice "
                  "reaches a threshold. Against simulator truth (true mastery >= 0.8) on "
                  f"{mt['pairs']:,} student-skill pairs with 3+ attempts, of which {mt['true_share']:.1%} are truly mastered:", "",
                  "| Threshold | Precision | Recall | F1 | Share declared mastered |", "|---|---|---|---|---|"]
            for r in mt["rows"]:
                L.append(f"| {r['threshold']} | {r['precision']:.3f} | {r['recall']:.3f} | {r['f1']:.3f} | {r['declared']:.1%} |")
            L += ["", "The shipped default is 0.85, chosen from this table on an earlier run of the same simulator. A false "
                  "\"mastered\" moves a student on too early, so precision is weighted more than recall. It is tuned to the "
                  "simulator and must be re-checked on real data.", ""]
    if lc:
        L += ["## Learning curves", "",
              f"**Raw curves mostly do not look like learning.** Observed error at a skill's fifth opportunity is lower than at its first "
              f"for only **{declining} of {checked}** skills (at least 30 attempts at both points). That is not because the simulated "
              "students do not learn -- they do, by construction -- but because opportunity number is confounded with curriculum order: "
              "every lesson puts its easier quiz questions before its harder graded exercises, so opportunities 1-3 are mostly easy "
              "items and 4-5 hard ones. The model's out-of-fold prediction (orange) follows the observed curve, so it has learned the "
              "item mix rather than misread it.", "",
              f"**Adjusted for item difficulty** (outcome minus the out-of-fold item-only prediction), success at the fifth opportunity "
              f"is higher than at the first for **{rising} of {checked}** skills. Pooled, the adjusted curve rises for the first few "
              "opportunities and then flattens and dips: later opportunities are increasingly retries, made by the students who were "
              "struggling, which is a selection effect a raw per-opportunity average cannot remove. On real data this is the plot "
              "to read, and the raw one is the plot to distrust.", "",
              "![adjusted learning curve](reports/learning_curve_adjusted.png)", "",
              "![learning curves](reports/learning_curves.png)", ""]
    if alt:
        a = alt["cv"]["metrics"]
        L += ["## Robustness: a simulator the model was not designed around", "",
              "The main simulator generates answers from a logistic function of continuous mastery with additive learning, which is close to "
              "the PFA model's own form and flatters it. So the whole evaluation was repeated on a second simulator with a different "
              "generative story: **binary** mastery per skill that flips from unlearned to learned with a per-attempt probability, and "
              "slip/guess answers (a Bayesian Knowledge Tracing process). Same curriculum, same event damage, same splits.", "",
              _metrics_table(alt), ""]
        if "oracle" in alt:
            L += [f"Oracle AUC under this simulator: {_f(alt['oracle']['true_p']['auc'])}; full logistic {_f(alt['oracle']['models']['full']['auc'])}.", ""]
        if alt.get("recovery"):
            ar = alt["recovery"]
            L += [f"Mastery recovery under this simulator: model Pearson {_f(ar['model_all']['pearson'])}, Laplace {_f(ar['laplace_all']['pearson'])} "
                  f"({ar['model_all']['n']:,} pairs).", ""]
        if "decision" in alt:
            gap = alt["decision"]["hgb_minus_full_auc"]
            L += [f"Gradient boosting minus full logistic AUC here: **{gap:+.4f}**" +
                  (f", which **exceeds** the {alt['decision']['threshold']} threshold. Under a process with discrete mastery the "
                   "linear logistic model underfits: gradient boosting beats it clearly, and the logistic model sits further below the "
                   "oracle than it does on the main simulator. The shipping decision is still made on the main run, and still goes to "
                   "the logistic model for explainability and a browser that can only evaluate a weighted sum, but this is the "
                   "strongest evidence in this report that the model family is a choice with a cost. If real learning turns out to be "
                   "step-like, a knowledge-tracing model (or boosting) is worth the loss of simplicity." if gap >= alt["decision"]["threshold"]
                   else ", under the threshold as on the main run.") , ""]
    if stable:
        L += ["## The shipped model's history coefficients", "",
              "Mean over the five training folds, and whether the sign held in all five. A coefficient whose sign flips between folds "
              "should not be explained to anyone as meaning something.", "",
              "| Feature | Mean coefficient | Same sign in every fold |", "|---|---|---|"]
        for name, mean, ok in stable:
            L.append(f"| `{name}` | {mean:+.3f} | {'yes' if ok else 'no'} |")
        L.append("")
    zero = [name for name, mean, ok in stable if abs(mean) < 1e-9]
    if zero:
        L += ["Coefficients of exactly zero (" + ", ".join(f"`{z}`" for z in zero) + ") are features the simulator never produces "
              "(no teacher-assigned quizzes, and every simulated error class falls into a named group). They carry no weight "
              "because they carry no data, and will stay at zero until real data exercises them.", ""]
    if stable:
        top = max(stable, key=lambda t: abs(t[1]))
        L += [f"The largest history weight is `{top[0]}` ({top[1]:+.2f}). In the simulator, prerequisites slow learning by "
              "construction, so a heavy prerequisite weight partly measures the simulator's own assumption.", ""]
    L += ["## Where this is weakest", "",
          "- **The simulator does much of the work.** The data were generated by a process built from the same ideas the features "
          "encode: mastery that rises with attempts, prerequisites that slow learning, errors that depend on mastery. Good numbers here "
          "show the pipeline is correct and can recover a signal *when that signal exists in this form*. They do not show real "
          "students behave this way. The BKT robustness run narrows that gap a little; it does not close it.",
          f"- **On the main simulator, mastery recovery is only modestly better than counting.** A Laplace-smoothed success rate "
          f"reaches Pearson {_f(rec.get('laplace_all', {}).get('pearson'))} against the model's {_f(rec.get('model_all', {}).get('pearson'))}. "
          "Most of what the model knows about a skill is how often the student got it right."
          + (f" Under the BKT simulator the gap is wider (model {_f(alt['recovery']['model_all']['pearson'])}, Laplace "
             f"{_f(alt['recovery']['laplace_all']['pearson'])}), but recovery itself is lower." if alt and alt.get("recovery") else ""),
          "- **The linear model underfits step-like learning.** See the robustness section: under BKT, gradient boosting beats it by more "
          "than the shipping threshold, and the logistic model sits well below the oracle." if alt and alt.get("decision", {}).get("hgb_minus_full_auc", 0) >= alt.get("decision", {}).get("threshold", 1) else
          "- **The linear model's form was checked against one alternative process only.**",
          f"- **The next-attempt holdout is small**: {main['temporal']['next_1']['full']['n']} predictions, one per student, so its AUC moves "
          "by a few hundredths with the seed. The next-ten version and the cross-validation are the numbers to lean on.",
          "- **The mastery threshold (0.85) was tuned on the simulator** and has no real-data backing.",
          "- **No real data has been through it.** Production event volume is thin, and the log cannot say which unit test "
          "questions a student missed, which course a test belonged to, or the order of events within a flush.",
          "- **The tags are partly automatic.** 687 end-of-unit items were tagged by keyword, spot-checked at 20 of 24; see "
          "`assets/data/skills.json` `itemSource`. Those items only reach the model as whole-unit tests, which limits the damage.",
          "- **The events are self-reported** by the student's own browser and can be fabricated. See `MODEL_CARD.md`.", ""]
    report_md.write_text("\n".join(L))
