"""Package the static site for GitHub Pages. No dependencies required."""

import csv
import io
import json
import hashlib
import shutil
from pathlib import Path

from import_anthology import match_papers
from import_underline import match_presentations
from poster_catalog import load_catalog, create_catalog
from import_topics import input_hash

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "_site"
FILES = ["index.html", "styles.css", "app.js", "theme.js", "atlas.mjs", "schedule-view.mjs", "saved-papers.mjs", "saved-sharing.mjs", "favicon.png", "favicon.svg", "conference-logo.png", "data/papers.json",
         "analytics.mjs", "traffic.mjs", "poster-view.mjs", "math-titles.mjs", "vendor/katex-0.19.1/katex.mjs", "vendor/katex-0.19.1/katex.min.css", "vendor/katex-0.19.1/LICENSE",
         "data/anthology-catalog.json", "data/anthology-overrides.json",
         "data/underline-catalog.json", "data/underline-overrides.json", "data/poster-boards.json",
         "poster-map/index.html", "poster-map/map.css", "poster-map/map.mjs", "poster-map/layout.mjs", "poster-map/camera.mjs", "poster-map/catalog.mjs", "poster-map/topics.mjs", "data/poster-topics.json", "LICENSE"]


def enrich_poster_boards(data, catalog):
    """Attach only locations confirmed by the current schedule and timeline."""
    by_id = {paper["id"]: paper for paper in data["papers"]}
    seen = set()
    for entry in catalog["entries"]:
        paper_id = entry["paperId"]
        if paper_id not in by_id:
            raise ValueError(f"Unknown schedule board paper ID: {paper_id}")
        if paper_id in seen:
            raise ValueError(f"Multiple schedule poster entries for paper: {paper_id}")
        seen.add(paper_id)
        paper = by_id[paper_id]
        if entry["verified"]:
            paper.update(posterBoard=entry["board"], posterSession=entry["session"], posterSourceRow=entry["sourceRow"])
        else:
            paper["posterClaimedBoard"] = entry["board"]
            paper["posterLocationIssue"] = entry["issue"]
    for paper in data["papers"]:
        if paper["id"] not in seen and paper.get("board") and paper["board"].isdigit():
            paper["posterClaimedBoard"] = int(paper["board"])
            paper["posterLocationIssue"] = "The schedule lists a board but does not confirm its poster session. Check the source sheet."
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
    underline_presentations, _ = match_presentations(data["papers"], underline_catalog, publication_titles, underline_overrides)
    for paper in data["papers"]:
        if paper["id"] in links:
            paper["anthologyId"] = links[paper["id"]]
            paper["authors"] = publications[paper["anthologyId"]]["authors"]
        paper.update(underline_presentations.get(paper["id"], {}))
    poster_catalog = load_catalog(ROOT / "data/poster-boards.json")
    source_text = (ROOT / "data/source.csv").read_bytes().decode("utf-8-sig")
    timeline_text = (ROOT / "data/timeline.csv").read_bytes().decode("utf-8-sig")
    expected_catalog = create_catalog(data, csv.reader(io.StringIO(timeline_text)), source_text, timeline_text)
    if poster_catalog != expected_catalog:
        raise ValueError("Schedule board catalog is stale. Run scripts/import_schedule.py before building.")
    # Keep the independent map catalog useful when the finder dataset cannot load.
    by_id = {paper["id"]: paper for paper in data["papers"]}
    for entry in poster_catalog["entries"]:
        paper = by_id[entry["paperId"]]
        entry["authors"] = paper.get("authors", [])
    enrich_poster_boards(data, poster_catalog)
    topics = json.loads((ROOT / "data/poster-topics.json").read_text())
    if topics.get("version") != 2 or topics.get("inputsSHA256") != input_hash(ROOT):
        raise ValueError("Poster topics are stale. Run python3 scripts/import_topics.py before building.")
    data["atlas"] = {key: topics[key] for key in ["source", "localSource", "areas", "topics"]}
    for paper in data["papers"]:
        topic = topics["papers"].get(paper.get("anthologyId"))
        if topic is not None:
            paper["atlasTopic"] = topic
        elif paper["id"] in topics["localAreas"]:
            local = topics["localAreas"][paper["id"]]
            paper.update(atlasArea=local["area"], atlasAreaBasis=local["basis"])
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    OUTPUT.mkdir(parents=True)

    def asset(name, content, directory=OUTPUT):
        path = Path(name)
        digest = hashlib.sha256(content).hexdigest()[:12]
        versioned = f"{path.stem}.{digest}{path.suffix}"
        (directory / versioned).write_bytes(content)
        return versioned

    data_output = OUTPUT / "data"
    data_output.mkdir()
    paper_bytes = (json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
    board_bytes = (json.dumps(poster_catalog, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
    map_topics = {key: topics[key] for key in ["version", "source", "localSource", "areas", "topics", "sessions"]}
    topic_bytes = (json.dumps(map_topics, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
    paper_name = asset("papers.json", paper_bytes, data_output)
    board_name = asset("poster-boards.json", board_bytes, data_output)
    topic_name = asset("map-topics.json", topic_bytes, data_output)
    # Keep canonical snapshots for source checks and external inspection.
    (data_output / "papers.json").write_bytes(paper_bytes)
    (data_output / "poster-boards.json").write_bytes(board_bytes)
    (data_output / "map-topics.json").write_bytes(topic_bytes)

    module_name = asset("schedule-view.mjs", (ROOT / "schedule-view.mjs").read_bytes())
    atlas_name = asset("atlas.mjs", (ROOT / "atlas.mjs").read_bytes())
    math_name = asset("math-titles.mjs", (ROOT / "math-titles.mjs").read_bytes())
    app = (ROOT / "app.js").read_text().replace("'./schedule-view.mjs'", f"'./{module_name}'")
    app = app.replace("'data/papers.json'", f"'data/{paper_name}'")
    app = app.replace("'./atlas.mjs'", f"'./{atlas_name}'")
    app = app.replace("'./math-titles.mjs'", f"'./{math_name}'")
    analytics_name = asset("analytics.mjs", (ROOT / "analytics.mjs").read_bytes())
    app = app.replace("'./analytics.mjs'", f"'./{analytics_name}'")
    poster_view_name = asset("poster-view.mjs", (ROOT / "poster-view.mjs").read_bytes())
    app = app.replace("'./poster-view.mjs'", f"'./{poster_view_name}'")
    saved_name = asset("saved-papers.mjs", (ROOT / "saved-papers.mjs").read_bytes())
    app = app.replace("'./saved-papers.mjs'", f"'./{saved_name}'")
    sharing_name = asset("saved-sharing.mjs", (ROOT / "saved-sharing.mjs").read_bytes())
    app = app.replace("'./saved-sharing.mjs'", f"'./{sharing_name}'")
    app_name = asset("app.js", app.encode())
    traffic_name = asset("traffic.mjs", (ROOT / "traffic.mjs").read_bytes())
    theme_source = (ROOT / "theme.js").read_text()
    if "</script" in theme_source.lower():
        raise ValueError("Theme bootstrap cannot contain a closing script tag")
    styles_name = asset("styles.css", (ROOT / "styles.css").read_bytes())
    favicon_png = asset("favicon.png", (ROOT / "favicon.png").read_bytes())
    favicon_svg = asset("favicon.svg", (ROOT / "favicon.svg").read_bytes())
    html = (ROOT / "index.html").read_text().replace('src="app.js"', f'src="{app_name}"')
    html = html.replace('src="traffic.mjs"', f'src="{traffic_name}"')
    html = html.replace('href="styles.css"', f'href="{styles_name}"')
    html = html.replace('<script src="theme.js"></script>', f'<script>{theme_source}</script>')
    html = html.replace('href="data/papers.json"', f'href="data/{paper_name}"')
    html = html.replace('href="favicon.png"', f'href="{favicon_png}"')
    html = html.replace('href="favicon.svg"', f'href="{favicon_svg}"')
    (OUTPUT / "index.html").write_text(html)
    shutil.copytree(ROOT / "vendor/katex-0.19.1", OUTPUT / "vendor/katex-0.19.1")

    map_output = OUTPUT / "poster-map"
    map_output.mkdir()
    map_modules = {name: asset(name, (ROOT / "poster-map" / name).read_text()
                              .replace("'../atlas.mjs'", f"'../{atlas_name}'")
                              .replace("'../poster-view.mjs'", f"'../{poster_view_name}'").encode(), map_output)
                   for name in ["layout.mjs", "camera.mjs", "catalog.mjs", "topics.mjs"]}
    map_app = (ROOT / "poster-map/map.mjs").read_text()
    map_app = map_app.replace("'../data/poster-boards.json'", f"'../data/{board_name}'")
    map_app = map_app.replace("'../data/map-topics.json'", f"'../data/{topic_name}'")
    for original, versioned in map_modules.items():
        map_app = map_app.replace(f"'./{original}'", f"'./{versioned}'")
    map_app = map_app.replace("'../math-titles.mjs'", f"'../{math_name}'")
    map_app = map_app.replace("'../saved-papers.mjs'", f"'../{saved_name}'")
    map_app = map_app.replace("'../analytics.mjs'", f"'../{analytics_name}'")
    map_app = map_app.replace("'../atlas.mjs'", f"'../{atlas_name}'")
    map_app_name = asset("map.mjs", map_app.encode(), map_output)
    map_css_name = asset("map.css", (ROOT / "poster-map/map.css").read_bytes(), map_output)
    map_html = (ROOT / "poster-map/index.html").read_text().replace('src="map.mjs"', f'src="{map_app_name}"')
    map_html = map_html.replace('src="../traffic.mjs"', f'src="../{traffic_name}"')
    map_html = map_html.replace('<script src="../theme.js"></script>', f'<script>{theme_source}</script>')
    map_html = map_html.replace('href="../data/poster-boards.json"', f'href="../data/{board_name}"')
    map_html = map_html.replace('href="../data/map-topics.json"', f'href="../data/{topic_name}"')
    map_html = map_html.replace('href="map.css"', f'href="{map_css_name}"').replace('href="../favicon.svg"', f'href="../{favicon_svg}"')
    (map_output / "index.html").write_text(map_html)

    shutil.copy2(ROOT / "data/poster-topics.json", OUTPUT / "data/poster-topics.json")
    for name in ["conference-logo.png", "LICENSE"]:
        destination = OUTPUT / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / name, destination)
    (OUTPUT / ".nojekyll").touch()
    print(f"Built {len(data['papers']):,} paper entries with {len(links):,} Anthology links and {len(underline_presentations):,} Underline links into {OUTPUT}")


if __name__ == "__main__":
    build()
