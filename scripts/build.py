"""Package the static site for GitHub Pages. No dependencies required."""

import json
import hashlib
import shutil
from pathlib import Path

from import_anthology import match_papers
from import_underline import match_presentations
from import_handbook import load_catalog

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "_site"
FILES = ["index.html", "styles.css", "app.js", "theme.js", "schedule-view.mjs", "favicon.png", "favicon.svg", "conference-logo.png", "data/papers.json",
         "analytics.mjs", "traffic.mjs", "poster-view.mjs", "math-titles.mjs", "vendor/katex-0.19.1/katex.mjs", "vendor/katex-0.19.1/katex.min.css", "vendor/katex-0.19.1/LICENSE",
         "data/anthology-catalog.json", "data/anthology-overrides.json",
         "data/underline-catalog.json", "data/underline-overrides.json", "data/poster-boards.json",
         "poster-map/index.html", "poster-map/map.css", "poster-map/map.mjs", "poster-map/layout.mjs", "poster-map/camera.mjs", "poster-map/catalog.mjs", "LICENSE"]


def enrich_poster_boards(data, catalog):
    """Keep the sheet's schedule and attach only unambiguous handbook locations."""
    by_id = {paper["id"]: paper for paper in data["papers"]}
    seen = set()
    for entry in catalog["entries"]:
        paper_id = entry["paperId"]
        if not paper_id:
            continue  # Source-only titles still appear on the map.
        if paper_id not in by_id:
            raise ValueError(f"Unknown handbook paper ID: {paper_id}")
        if paper_id in seen:
            raise ValueError(f"Multiple handbook poster entries for paper: {paper_id}")
        seen.add(paper_id)
        paper = by_id[paper_id]
        if entry["verified"]:
            paper.update(posterBoard=entry["board"], posterSession=entry["session"], posterSourcePage=entry["boardPage"])
        else:
            paper["posterClaimedBoard"] = entry["board"]
            paper["posterLocationIssue"] = f"The handbook assigns board {entry['board']} to more than one paper in the same poster session. Its location is unconfirmed."
    data["posterSessions"] = catalog["sessions"]


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
    poster_catalog = load_catalog(ROOT / "data/poster-boards.json")
    enrich_poster_boards(data, poster_catalog)
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    OUTPUT.mkdir(parents=True)

    def asset(name, content, directory=OUTPUT):
        path = Path(name)
        digest = hashlib.sha256(content).hexdigest()[:12]
        versioned = f"{path.stem}.{digest}{path.suffix}"
        (directory / versioned).write_bytes(content)
        return versioned

    module_name = asset("schedule-view.mjs", (ROOT / "schedule-view.mjs").read_bytes())
    math_name = asset("math-titles.mjs", (ROOT / "math-titles.mjs").read_bytes())
    app = (ROOT / "app.js").read_text().replace("'./schedule-view.mjs'", f"'./{module_name}'")
    app = app.replace("'./math-titles.mjs'", f"'./{math_name}'")
    analytics_name = asset("analytics.mjs", (ROOT / "analytics.mjs").read_bytes())
    app = app.replace("'./analytics.mjs'", f"'./{analytics_name}'")
    poster_view_name = asset("poster-view.mjs", (ROOT / "poster-view.mjs").read_bytes())
    app = app.replace("'./poster-view.mjs'", f"'./{poster_view_name}'")
    app_name = asset("app.js", app.encode())
    traffic_name = asset("traffic.mjs", (ROOT / "traffic.mjs").read_bytes())
    theme_name = asset("theme.js", (ROOT / "theme.js").read_bytes())
    styles_name = asset("styles.css", (ROOT / "styles.css").read_bytes())
    favicon_png = asset("favicon.png", (ROOT / "favicon.png").read_bytes())
    favicon_svg = asset("favicon.svg", (ROOT / "favicon.svg").read_bytes())
    html = (ROOT / "index.html").read_text().replace('src="app.js"', f'src="{app_name}"')
    html = html.replace('src="traffic.mjs"', f'src="{traffic_name}"')
    html = html.replace('href="styles.css"', f'href="{styles_name}"')
    html = html.replace('src="theme.js"', f'src="{theme_name}"')
    html = html.replace('href="favicon.png"', f'href="{favicon_png}"')
    html = html.replace('href="favicon.svg"', f'href="{favicon_svg}"')
    (OUTPUT / "index.html").write_text(html)
    shutil.copytree(ROOT / "vendor/katex-0.19.1", OUTPUT / "vendor/katex-0.19.1")

    map_output = OUTPUT / "poster-map"
    map_output.mkdir()
    map_modules = {name: asset(name, (ROOT / "poster-map" / name).read_bytes(), map_output)
                   for name in ["layout.mjs", "camera.mjs", "catalog.mjs"]}
    map_app = (ROOT / "poster-map/map.mjs").read_text()
    for original, versioned in map_modules.items():
        map_app = map_app.replace(f"'./{original}'", f"'./{versioned}'")
    map_app = map_app.replace("'../math-titles.mjs'", f"'../{math_name}'")
    map_app_name = asset("map.mjs", map_app.encode(), map_output)
    map_css_name = asset("map.css", (ROOT / "poster-map/map.css").read_bytes(), map_output)
    map_html = (ROOT / "poster-map/index.html").read_text().replace('src="map.mjs"', f'src="{map_app_name}"')
    map_html = map_html.replace('src="../traffic.mjs"', f'src="../{traffic_name}"')
    map_html = map_html.replace('href="map.css"', f'href="{map_css_name}"').replace('href="../favicon.svg"', f'href="../{favicon_svg}"')
    (map_output / "index.html").write_text(map_html)

    (OUTPUT / "data").mkdir()
    shutil.copy2(ROOT / "data/poster-boards.json", OUTPUT / "data/poster-boards.json")
    (OUTPUT / "data/papers.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")
    for name in ["conference-logo.png", "LICENSE"]:
        destination = OUTPUT / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / name, destination)
    (OUTPUT / ".nojekyll").touch()
    print(f"Built {len(data['papers']):,} paper entries with {len(links):,} Anthology links and {len(underline_links):,} Underline links into {OUTPUT}")


if __name__ == "__main__":
    build()
