"""Package the static site for GitHub Pages. No dependencies required."""

import json
import hashlib
import shutil
from pathlib import Path

from import_anthology import match_papers

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "_site"
FILES = ["index.html", "styles.css", "app.js", "schedule-view.mjs", "favicon.svg", "data/papers.json",
         "data/anthology-catalog.json", "data/anthology-overrides.json", "LICENSE"]


def build():
    missing = [name for name in FILES if not (ROOT / name).is_file()]
    if missing:
        raise SystemExit(f"Missing site files: {', '.join(missing)}")
    data = json.loads((ROOT / "data/papers.json").read_text())
    assert data["conference"]["name"] == "EMNLP 2026"
    assert data["papers"], "The conference dataset must not be empty"
    catalog = json.loads((ROOT / "data/anthology-catalog.json").read_text())
    overrides = json.loads((ROOT / "data/anthology-overrides.json").read_text())
    links, _ = match_papers(data["papers"], catalog, overrides)
    for paper in data["papers"]:
        if paper["id"] in links:
            paper["anthologyId"] = links[paper["id"]]
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    OUTPUT.mkdir(parents=True)

    def asset(name, content):
        path = Path(name)
        digest = hashlib.sha256(content).hexdigest()[:12]
        versioned = f"{path.stem}.{digest}{path.suffix}"
        (OUTPUT / versioned).write_bytes(content)
        return versioned

    module_name = asset("schedule-view.mjs", (ROOT / "schedule-view.mjs").read_bytes())
    app = (ROOT / "app.js").read_text().replace("'./schedule-view.mjs'", f"'./{module_name}'")
    app_name = asset("app.js", app.encode())
    styles_name = asset("styles.css", (ROOT / "styles.css").read_bytes())
    html = (ROOT / "index.html").read_text().replace('src="app.js"', f'src="{app_name}"')
    html = html.replace('href="styles.css"', f'href="{styles_name}"')
    (OUTPUT / "index.html").write_text(html)

    (OUTPUT / "data").mkdir()
    (OUTPUT / "data/papers.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")
    for name in ["favicon.svg", "LICENSE"]:
        destination = OUTPUT / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / name, destination)
    (OUTPUT / ".nojekyll").touch()
    print(f"Built {len(data['papers']):,} paper entries with {len(links):,} Anthology links into {OUTPUT}")


if __name__ == "__main__":
    build()
