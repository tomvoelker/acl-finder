"""Package the static site for GitHub Pages. No dependencies required."""

import json
import hashlib
import shutil
from pathlib import Path

from import_anthology import match_papers
from import_underline import match_presentations

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "_site"
FILES = ["index.html", "styles.css", "app.js", "theme.js", "schedule-view.mjs", "favicon.png", "favicon.svg", "conference-logo.png", "data/papers.json",
         "data/anthology-catalog.json", "data/anthology-overrides.json",
         "data/underline-catalog.json", "data/underline-overrides.json", "LICENSE"]


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
    publications = {paper["id"]: paper for paper in catalog["papers"]}
    underline_catalog = json.loads((ROOT / "data/underline-catalog.json").read_text())
    underline_overrides = json.loads((ROOT / "data/underline-overrides.json").read_text())
    publication_titles = {pid: publications[aid]["title"] for pid, aid in links.items()}
    underline_links, _ = match_presentations(data["papers"], underline_catalog, publication_titles, underline_overrides)
    for paper in data["papers"]:
        if paper["id"] in links:
            paper["anthologyId"] = links[paper["id"]]
            paper["authors"] = publications[paper["anthologyId"]]["authors"]
        if paper["id"] in underline_links:
            paper["underlineUrl"] = underline_links[paper["id"]]
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
    theme_name = asset("theme.js", (ROOT / "theme.js").read_bytes())
    styles_name = asset("styles.css", (ROOT / "styles.css").read_bytes())
    favicon_png = asset("favicon.png", (ROOT / "favicon.png").read_bytes())
    favicon_svg = asset("favicon.svg", (ROOT / "favicon.svg").read_bytes())
    html = (ROOT / "index.html").read_text().replace('src="app.js"', f'src="{app_name}"')
    html = html.replace('href="styles.css"', f'href="{styles_name}"')
    html = html.replace('src="theme.js"', f'src="{theme_name}"')
    html = html.replace('href="favicon.png"', f'href="{favicon_png}"')
    html = html.replace('href="favicon.svg"', f'href="{favicon_svg}"')
    (OUTPUT / "index.html").write_text(html)

    (OUTPUT / "data").mkdir()
    (OUTPUT / "data/papers.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")
    for name in ["conference-logo.png", "LICENSE"]:
        destination = OUTPUT / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / name, destination)
    (OUTPUT / ".nojekyll").touch()
    print(f"Built {len(data['papers']):,} paper entries with {len(links):,} Anthology links and {len(underline_links):,} Underline links into {OUTPUT}")


if __name__ == "__main__":
    build()
