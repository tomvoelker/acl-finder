# EMNLP 2026 Finder

An unofficial paper and presentation finder for EMNLP 2026 in Budapest. The main-conference schedule covers 25–27 October at HUNGEXPO. The full conference runs 24–29 October.

**Live site:** [tomvoelker.de/acl-finder](http://tomvoelker.de/acl-finder/)

Search by title, presenter, paper ID, or topic. Combine day, track, format, attendance, room, and schedule filters. Click a paper title to open its ACL Anthology page. Use **Schedule link** to share its presentation details; filters can also be shared through the URL.

The finder selects the current conference day in Budapest unless the URL specifies a day. Outside the scheduled dates, it shows all days. Each session groups papers with the same date, time, session label, topic, and room, so parallel sessions remain separate. Headers show the topic and room alongside the time and session label. Sessions start collapsed; searches, filters other than day, shortlist views, and paper links open the matching sessions. Open session headings stay below the search bar as you scroll.

Save papers to a browser-local shortlist and export confirmed presentations as calendar files. Missing, conflicting, withdrawn, and non-presenting assignments are excluded from calendar export.

## Schedule data

The source is the official [author presentation spreadsheet](https://docs.google.com/spreadsheets/d/1aXGTy_7Xeh-OXIs3iJSbDpUsZ6YhbfA76b17kBZH0Yk/edit?gid=943432490), linked from the [conference program](https://2026.emnlp.org/program/). The committed snapshot was retrieved on 23 October 2026 and contains 5,611 entries across Main, Findings, Industry, Demonstrations, TACL, and Computational Linguistics.

The sheet provides **presenter names**, not complete author lists or abstracts. Missing assignments remain unknown. Withdrawn papers and papers marked “Not Presenting” retain those statuses. Conflicting times are flagged rather than inferred from other sessions. See `data/audit.json` for the import report and `data/source.csv` for the original values.

Times remain in **Europe/Budapest**. The main-conference dates use CET (UTC+1); daylight saving time ends on 25 October. The spreadsheet’s workbook timezone setting is not used to convert presentation times.

The featured paper is **Some Assembly Required: Pointer-Decoded Seq2Seq Models for German Without a Native Seq2Seq Backbone** (`9736-FIND`). Its presentation details come from the same dataset as every other paper.

Publication links come from the [EMNLP 2026 proceedings](https://aclanthology.org/events/emnlp-2026/) and the TACL and Computational Linguistics volumes. The metadata snapshot was retrieved on 24 October 2026. It matches 5,584 schedule entries; 27 entries without a verified match remain unlinked. Titles are matched within each track after normalizing typography and TeX. Reviewed title changes are recorded in `data/anthology-overrides.json`, and `data/anthology-audit.json` lists unmatched entries. The publication metadata does not alter presentation details.

## Run locally

Python 3.11 or newer is sufficient; no package installation is required.

```sh
python3 scripts/build.py
python3 -m http.server 8000 --directory _site
```

Open [localhost:8000](http://localhost:8000).

## Refresh the schedule

Download and normalize the current public spreadsheet:

```sh
python3 scripts/import_schedule.py --fetch
python3 scripts/import_anthology.py
```

Review the changes to `data/source.csv`, `data/papers.json`, `data/audit.json`, and `data/anthology-audit.json` before committing. The schedule importer rejects unknown column layouts, duplicate IDs, and invalid values so a changed source cannot silently corrupt the site.

To reproduce the committed snapshot without network access:

```sh
python3 scripts/import_schedule.py --source data/source.csv --updated-at 2026-10-23
```

To refresh publication metadata from ACL Anthology:

```sh
python3 scripts/import_anthology.py --fetch
```

Review the catalog and audit changes before committing. Add a title override only after verifying the paper's title and authors. If either reviewed title changes later, the importer and build require another review. Uncertain matches stay unlinked.

## Verify and deploy

```sh
python3 -m unittest discover -s tests -p 'test_*.py'
node --input-type=module --check < app.js
node --test tests/test_view.mjs
python3 scripts/build.py
```

The build adds verified Anthology IDs to the public schedule in `_site/data/papers.json`, leaving the source schedule unchanged. It copies only public site assets into `_site/` and adds content hashes to JavaScript and CSS filenames so cached assets cannot mix across releases. Push to `main` to run the checks and deploy through the repository’s existing GitHub Pages configuration. Pull requests run the checks and build without deploying.

The site uses plain HTML, CSS, and JavaScript. It replaces the previous conference edition; older data and code remain available in Git history.
