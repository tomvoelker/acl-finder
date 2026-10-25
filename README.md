# EMNLP 2026 Finder

An unofficial paper and presentation finder for EMNLP 2026 in Budapest. The main-conference schedule covers 25–27 October at HUNGEXPO. The full conference runs 24–29 October.

**Live site:** [emnlp.vlkr.org](https://emnlp.vlkr.org/)

Search by title, author, presenter, paper ID, or topic. Combine day, track, format, attendance, room, and schedule filters. Click a paper title to open its ACL Anthology page. Use **Schedule link** to share its presentation details; filters can also be shared through the URL.

Click an author’s name to see their papers across all conference days and tracks. Author views have shareable URLs and support the same search, filters, shortlist, and calendar links. **Clear filters** keeps the author selected; **All conference papers** returns to the full programme. Pages group full names as credited in the available publication metadata. Spelling variants are kept separate, and people with identical names share a page. Presenter-only entries do not establish authorship.

Each **Underline ↗** link opens that paper’s own presentation page, where Underline provides its available video, slides, or poster. Underline may require your conference login for those materials.

The header’s theme button cycles through Auto, Light, and Dark. Its icon and label show the current choice. Auto follows the system colour preference; explicit choices are saved in this browser and applied before the page renders. White and cool gray surfaces, charcoal text, and restrained red accents follow the [conference website](https://2026.emnlp.org/). The header uses its [official logo](https://2026.emnlp.org/assets/images/logos/emnlp_2026_logo_v1.png) with a gold **Unofficial** ribbon. A separate gold search icon identifies the finder in browser tabs. SVG and PNG favicons have content hashes so icon changes receive new URLs. Day buttons above the filters switch between conference days, all days, and papers without a date.

Full author lists appear in publication order. Presenters whose names match are bold and labelled within the list. Otherwise, the spreadsheet's presenter entry appears separately in bold, including when author metadata is unavailable. Name differences and ambiguous matches are not guessed.

The finder selects the current conference day in Budapest unless the URL specifies a day. Outside the scheduled dates, it shows all days. Each session groups papers with the same date, time, session label, topic, and room, so parallel sessions remain separate. Headers show the topic and room alongside the time and session label. Sessions start collapsed; searches, filters other than day, shortlist views, and paper links open the matching sessions. Open session headings stay below the search bar as you scroll.

Save papers to a browser-local shortlist and export confirmed presentations as calendar files. Missing, conflicting, withdrawn, desk-rejected, and non-presenting assignments are excluded from calendar export.

## Schedule data

The source is the official [author presentation spreadsheet](https://docs.google.com/spreadsheets/d/1aXGTy_7Xeh-OXIs3iJSbDpUsZ6YhbfA76b17kBZH0Yk/edit?gid=943432490), linked from the [conference program](https://2026.emnlp.org/program/). The committed snapshot was retrieved on 24 October 2026 and contains 5,603 entries across Main, Findings, Industry, Demonstrations, TACL, and Computational Linguistics.

The sheet provides **presenter names**, not complete author lists or abstracts. Missing assignments remain unknown. Withdrawn papers and papers marked “Not Presenting” or “Desk Reject” retain those statuses. Conflicting times are flagged rather than inferred from other sessions. See `data/audit.json` for the import report and `data/source.csv` for the original values.

Times remain in **Europe/Budapest**. The main-conference dates use CET (UTC+1); daylight saving time ends on 25 October. The spreadsheet’s workbook timezone setting is not used to convert presentation times.

Publication links come from the [EMNLP 2026 proceedings](https://aclanthology.org/events/emnlp-2026/) and the TACL and Computational Linguistics volumes. The metadata snapshot was retrieved on 24 October 2026. It matches 5,584 schedule entries; 19 entries without a verified match remain unlinked. Titles are matched within each track after normalizing typography and TeX. Reviewed title changes are recorded in `data/anthology-overrides.json`, and `data/anthology-audit.json` lists unmatched entries. The publication metadata does not alter presentation details.

Underline links use the public metadata for [event 535](https://underline.io/events/535/schedule), retrieved on 25 October 2026. Of 5,603 schedule entries, 4,351 have a published Underline session page, 1,251 match unpublished records or records without a session, and one has no verified match. The importer matches unique normalized schedule or verified Anthology titles. A reviewed title change is recorded in `data/underline-overrides.json`; `data/underline-audit.json` records coverage and missing pages. Unpublished records receive no link. Schedule dates, rooms, and times still come from the source spreadsheet.

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
python3 scripts/import_underline.py
```

Review the changes to `data/source.csv`, `data/papers.json`, `data/audit.json`, and `data/anthology-audit.json` before committing. The schedule importer rejects unknown column layouts, duplicate IDs, and invalid values so a changed source cannot silently corrupt the site.

To reproduce the committed snapshot without network access:

```sh
python3 scripts/import_schedule.py --source data/source.csv --updated-at 2026-10-24
```

To refresh publication metadata from ACL Anthology:

```sh
python3 scripts/import_anthology.py --fetch
```

To refresh Underline metadata, run `python3 scripts/import_underline.py --fetch`. This reads the public API in pages of 500 records without login credentials. Review `data/underline-catalog.json` and `data/underline-audit.json` before committing. Missing pages, duplicate IDs, ambiguous matches, and changed reviewed titles are checked before replacing the snapshot. Run `python3 scripts/import_underline.py` to recheck matches without network access.

Review the catalog and audit changes before committing. Add a title override only after verifying the paper's title and authors. If either reviewed title changes later, the importer and build require another review. Uncertain matches stay unlinked.

## Verify and deploy

```sh
python3 -m unittest discover -s tests -p 'test_*.py'
node --input-type=module --check < app.js
node --test tests/*.mjs
python3 scripts/build.py
```

The build adds verified Anthology IDs, author lists, and Underline links to the public schedule in `_site/data/papers.json`, leaving the source schedule unchanged. It copies only public site assets into `_site/` and adds content hashes to JavaScript and CSS filenames so cached assets cannot mix across releases. Push to `main` to run the checks and deploy through the repository’s existing GitHub Pages configuration. Pull requests run the checks and build without deploying.

The site uses plain HTML, CSS, and JavaScript. It replaces the previous conference edition; older data and code remain available in Git history.
