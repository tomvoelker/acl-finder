# EMNLP 2026 Finder

An unofficial paper and presentation finder for EMNLP 2026 in Budapest. The main-conference schedule covers 25–27 October at HUNGEXPO. The full conference runs 24–29 October.

**Live site:** [tomvoelker.de/acl-finder](http://tomvoelker.de/acl-finder/)

Search by title, presenter, paper ID, or topic. Combine day, track, format, attendance, room, and schedule filters. Paper links and filters can be shared through the URL.

The finder selects the current conference day in Budapest unless the URL specifies a day. Outside the scheduled dates, it shows all days. Sessions start collapsed; searches, filters other than day, shortlist views, and paper links open the matching sessions. Open session headings stay below the search bar as you scroll.

Save papers to a browser-local shortlist and export confirmed presentations as calendar files. Missing, conflicting, withdrawn, and non-presenting assignments are excluded from calendar export.

## Schedule data

The source is the official [author presentation spreadsheet](https://docs.google.com/spreadsheets/d/1aXGTy_7Xeh-OXIs3iJSbDpUsZ6YhbfA76b17kBZH0Yk/edit?gid=943432490), linked from the [conference program](https://2026.emnlp.org/program/). The committed snapshot was retrieved on 23 October 2026 and contains 5,611 entries across Main, Findings, Industry, Demonstrations, TACL, and Computational Linguistics.

The sheet provides **presenter names**, not complete author lists or abstracts. Missing assignments remain unknown. Withdrawn papers and papers marked “Not Presenting” retain those statuses. Conflicting times are flagged rather than inferred from other sessions. See `data/audit.json` for the import report and `data/source.csv` for the original values.

Times remain in **Europe/Budapest**. The main-conference dates use CET (UTC+1); daylight saving time ends on 25 October. The spreadsheet’s workbook timezone setting is not used to convert presentation times.

The featured paper is **Some Assembly Required: Pointer-Decoded Seq2Seq Models for German Without a Native Seq2Seq Backbone** (`9736-FIND`). Its presentation details come from the same dataset as every other paper.

## Run locally

Python 3.11 or newer is sufficient; no package installation is required.

```sh
python3 -m http.server 8000
```

Open [localhost:8000](http://localhost:8000).

## Refresh the schedule

Download and normalize the current public spreadsheet:

```sh
python3 scripts/import_schedule.py --fetch
```

Review the changes to `data/source.csv`, `data/papers.json`, and `data/audit.json` before committing. The importer rejects unknown column layouts, duplicate IDs, and invalid values so a changed source cannot silently corrupt the site.

To reproduce the committed snapshot without network access:

```sh
python3 scripts/import_schedule.py --source data/source.csv --updated-at 2026-10-23
```

## Verify and deploy

```sh
python3 -m unittest discover -s tests -p 'test_*.py'
node --input-type=module --check < app.js
node --test tests/test_view.mjs
python3 scripts/build.py
```

The build copies only public site assets into `_site/`. Push to `main` to run the checks and deploy through the repository’s existing GitHub Pages configuration. Pull requests run the checks and build without deploying.

The site uses plain HTML, CSS, and JavaScript. It replaces the previous conference edition; older data and code remain available in Git history.
