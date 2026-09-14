"""python -m pypath_engine <command>

  simulate    synthetic cohort -> engine/data/sim/<label>/
  ingest      events export -> engine/data/ingest/<label>/ (clean events, attempts.csv)
  train       fit the shipped logistic model on all ingested rows -> engine/data/model/model.json
  evaluate    cross-validation, temporal holdout, recovery, curves -> engine/reports/metrics-<label>.json
  report      engine/REPORT.md and figures from the metrics files
  recommend   ranked practice for one student's history (JSON events file)
  export      freeze the model into assets/data/model/mastery-v1.json
  fixtures    shared Python/JS parity fixtures -> tests/fixtures/adaptive/
  all         every step above, in order, from nothing: the one reproducible command
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
import time
from pathlib import Path

from . import paths

ALL_SPECS = ["base", "item", "afm", "pfa", "full", "full_cal", "hgb", "hgb_cal"]


def cmd_simulate(a):
    from .simulate import SimConfig, write
    meta = write(Path(a.out), SimConfig(students=a.students, seed=a.seed, generator=a.generator))
    print(json.dumps(meta["stats"]), meta["events"], "events")
    return meta


def cmd_ingest(a):
    from . import ingest
    summary = ingest.run(Path(a.events), Path(a.out), a.salt)
    print(json.dumps(summary, indent=1))
    return summary


def cmd_train(a):
    from . import train
    info = train.run(Path(a.ingest), Path(a.out), seed=a.seed)
    print(json.dumps({k: v for k, v in info.items() if k != "coefficients"}, indent=1))


def cmd_evaluate(a):
    from . import evaluate
    specs = a.specs.split(",") if a.specs else ALL_SPECS
    r = evaluate.run(Path(a.ingest), Path(a.sim) if a.sim else None, paths.REPORTS, specs, seed=a.seed,
                     reps=a.reps, label=a.label)
    print(json.dumps({k: round(v["auc"], 4) for k, v in r["cv"]["metrics"].items()}))


def cmd_report(a):
    from . import report
    report.write(paths.REPORTS, paths.ENGINE / "REPORT.md")
    print("wrote", paths.ENGINE / "REPORT.md")


def cmd_recommend(a):
    from . import policy, export
    artifact = json.loads(Path(a.artifact).read_text())
    events = json.loads(Path(a.history).read_text())
    now = a.now or max((int(e.get("at", 0)) for e in events), default=0)
    recs = policy.recommend(artifact, events, now, courses=a.course.split(",") if a.course else None)
    for i, r in enumerate(recs, 1):
        print(f"{i}. {r['item']}  p={r['p']:.2f}  [{r['skill']}]\n   {r['reason']}")


def cmd_export(a):
    from . import export
    art = export.run(Path(a.model), paths.REPORTS, Path(a.out))
    print("wrote", a.out, len(json.dumps(art)) // 1024, "KB")


def cmd_fixtures(a):
    from . import fixtures
    written = fixtures.run(Path(a.artifact), Path(a.ingest), paths.FIXTURES)
    print("wrote", len(written), "fixtures to", paths.FIXTURES)


def cmd_all(a):
    t0 = time.time()
    data = paths.DATA
    steps = [
        ("simulate", lambda: cmd_simulate(argparse.Namespace(out=str(data / "sim" / "main"), students=a.students, seed=a.seed, generator="logistic"))),
        ("ingest", lambda: cmd_ingest(argparse.Namespace(events=str(data / "sim" / "main" / "events.jsonl"), out=str(data / "ingest" / "main"), salt=None))),
        ("simulate bkt", lambda: cmd_simulate(argparse.Namespace(out=str(data / "sim" / "bkt"), students=a.students, seed=a.seed + 1, generator="bkt"))),
        ("ingest bkt", lambda: cmd_ingest(argparse.Namespace(events=str(data / "sim" / "bkt" / "events.jsonl"), out=str(data / "ingest" / "bkt"), salt=None))),
        ("evaluate", lambda: cmd_evaluate(argparse.Namespace(ingest=str(data / "ingest" / "main"), sim=str(data / "sim" / "main"), specs=None, seed=a.seed, reps=a.reps, label="main"))),
        ("evaluate bkt", lambda: cmd_evaluate(argparse.Namespace(ingest=str(data / "ingest" / "bkt"), sim=str(data / "sim" / "bkt"), specs=None, seed=a.seed, reps=a.reps, label="bkt"))),
        ("train", lambda: cmd_train(argparse.Namespace(ingest=str(data / "ingest" / "main"), out=str(data / "model"), seed=a.seed))),
        ("export", lambda: cmd_export(argparse.Namespace(model=str(data / "model" / "model.json"), out=str(paths.ARTIFACT)))),
        ("fixtures", lambda: cmd_fixtures(argparse.Namespace(artifact=str(paths.ARTIFACT), ingest=str(data / "ingest" / "main")))),
        ("report", lambda: cmd_report(None)),
    ]
    for name, fn in steps:
        print(f"\n== {name}  ({time.time() - t0:.0f}s)", flush=True)
        fn()
        if name == "simulate":
            shutil.copy(data / "sim" / "main" / "meta.json", paths.REPORTS / "sim-meta-main.json")
        if name == "ingest":
            shutil.copy(data / "ingest" / "main" / "ingest_report.json", paths.REPORTS / "ingest-main.json")
    print(f"\ndone in {time.time() - t0:.0f}s")


def main(argv=None):
    p = argparse.ArgumentParser(prog="python -m pypath_engine", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("simulate")
    s.add_argument("--out", default=str(paths.DATA / "sim" / "main"))
    s.add_argument("--students", type=int, default=400)
    s.add_argument("--seed", type=int, default=20260914)
    s.add_argument("--generator", choices=["logistic", "bkt"], default="logistic")
    s.set_defaults(fn=cmd_simulate)
    s = sub.add_parser("ingest")
    s.add_argument("--events", default=str(paths.DATA / "sim" / "main" / "events.jsonl"))
    s.add_argument("--out", default=str(paths.DATA / "ingest" / "main"))
    s.add_argument("--salt", default=None, help="required for real exports; hashes student and class ids")
    s.set_defaults(fn=cmd_ingest)
    s = sub.add_parser("train")
    s.add_argument("--ingest", default=str(paths.DATA / "ingest" / "main"))
    s.add_argument("--out", default=str(paths.DATA / "model"))
    s.add_argument("--seed", type=int, default=7)
    s.set_defaults(fn=cmd_train)
    s = sub.add_parser("evaluate")
    s.add_argument("--ingest", default=str(paths.DATA / "ingest" / "main"))
    s.add_argument("--sim", default=str(paths.DATA / "sim" / "main"))
    s.add_argument("--specs", default=None)
    s.add_argument("--seed", type=int, default=7)
    s.add_argument("--reps", type=int, default=200)
    s.add_argument("--label", default="main")
    s.set_defaults(fn=cmd_evaluate)
    s = sub.add_parser("report")
    s.set_defaults(fn=cmd_report)
    s = sub.add_parser("recommend")
    s.add_argument("--history", required=True, help="JSON array of one student's events")
    s.add_argument("--artifact", default=str(paths.ARTIFACT))
    s.add_argument("--now", type=int, default=None)
    s.add_argument("--course", default=None, help="foundations, data, or both comma-separated")
    s.set_defaults(fn=cmd_recommend)
    s = sub.add_parser("export")
    s.add_argument("--model", default=str(paths.DATA / "model" / "model.json"))
    s.add_argument("--out", default=str(paths.ARTIFACT))
    s.set_defaults(fn=cmd_export)
    s = sub.add_parser("fixtures")
    s.add_argument("--artifact", default=str(paths.ARTIFACT))
    s.add_argument("--ingest", default=str(paths.DATA / "ingest" / "main"))
    s.set_defaults(fn=cmd_fixtures)
    s = sub.add_parser("all")
    s.add_argument("--students", type=int, default=400)
    s.add_argument("--seed", type=int, default=20260914)
    s.add_argument("--reps", type=int, default=200)
    s.set_defaults(fn=cmd_all)
    a = p.parse_args(argv)
    a.fn(a)


if __name__ == "__main__":
    main()
