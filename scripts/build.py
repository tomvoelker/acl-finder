"""Package the static site for GitHub Pages. No dependencies required."""

import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "_site"
FILES = ["index.html", "styles.css", "app.js", "schedule-view.mjs", "favicon.svg", "data/papers.json", "LICENSE"]


def build():
    missing = [name for name in FILES if not (ROOT / name).is_file()]
    if missing:
        raise SystemExit(f"Missing site files: {', '.join(missing)}")
    data = json.loads((ROOT / "data/papers.json").read_text())
    assert data["conference"]["name"] == "EMNLP 2026"
    assert data["papers"], "The conference dataset must not be empty"
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    for name in FILES:
        destination = OUTPUT / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / name, destination)
    (OUTPUT / ".nojekyll").touch()
    print(f"Built {len(data['papers']):,} paper entries into {OUTPUT}")


if __name__ == "__main__":
    build()
