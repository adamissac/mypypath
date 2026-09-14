import json
from pathlib import Path

import pytest

from pypath_engine import ingest
from pypath_engine.simulate import SimConfig, write


@pytest.fixture(scope="session")
def small_cohort(tmp_path_factory):
    """25 simulated students, seeded, shared by every test that needs data."""
    root = tmp_path_factory.mktemp("cohort")
    meta = write(root / "sim", SimConfig(students=25, seed=11))
    summary = ingest.run(root / "sim" / "events.jsonl", root / "ingest")
    return {"root": root, "sim": root / "sim", "ingest": root / "ingest", "meta": meta, "summary": summary}
