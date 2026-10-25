# EMNLP 2026 Finder

An unofficial paper and presentation finder for EMNLP 2026 in Budapest. The main-conference schedule covers 25–27 October at HUNGEXPO. The full conference runs 24–29 October.

**Live site:** [emnlp.vlkr.org](https://emnlp.vlkr.org/)

Search by title, author, presenter, paper ID, or topic. Combine day, track, format, attendance, room, and schedule filters. Click a paper title to open its ACL Anthology page. Use **Schedule link** to share its presentation details; filters can also be shared through the URL.

Click an author’s name to see their papers across all conference days and tracks. Author views have shareable URLs and support day and track filters, shortlist, and calendar links. Starting a search leaves the author view and searches the whole conference. **Clear all** also removes the author selection. Searches from the regular programme retain its selected filters. Pages group full names as credited in the available publication metadata. Spelling variants are kept separate, and people with identical names share a page. Presenter-only entries do not establish authorship.

Each **Underline ↗** link opens that paper’s own presentation page, where Underline provides its available video, slides, or poster. Underline may require your conference login for those materials.

Inline LaTeX in paper titles renders with self-hosted KaTeX 0.19.1, including Greek letters and superscripts. Search accepts the original TeX text and rendered symbols, such as `lambda`, `λ`, or `𝜆`. Unsupported or malformed expressions remain readable as their original text.

The header’s theme button cycles through Auto, Light, and Dark. Its icon shows the current choice, with the current and next choices in its tooltip and accessible label. Auto follows the system colour preference; explicit choices are saved in this browser and applied before the page renders. White and cool gray surfaces, charcoal text, and restrained red accents follow the [conference website](https://2026.emnlp.org/). The header uses its [official logo](https://2026.emnlp.org/assets/images/logos/emnlp_2026_logo_v1.png) with a gold **Unofficial** ribbon. A separate gold search icon identifies the finder in browser tabs. SVG and PNG favicons have content hashes so icon changes receive new URLs. Day buttons above the filters switch between conference days, all days, and papers without a date. On phones, a day selector and a Filters disclosure share one row. The disclosure shows the number of active filters and opens the full labelled native pickers, including option names and counts. Update and time-zone information lives in the footer.

Full author lists appear in publication order. Presenters whose names match are bold and labelled within the list. Otherwise, the spreadsheet's presenter entry appears separately in bold, including when author metadata is unavailable. Name differences and ambiguous matches are not guessed.

The finder selects the current conference day in Budapest unless the URL specifies a day. Outside the scheduled dates, it shows all days. Each session groups papers with the same date, time, session label, topic, and room, so parallel sessions remain separate. Headers show the topic and room alongside the time and session label. The first session starts open so papers are immediately visible. Searches, filters other than day, and shortlist views open matching sessions unless you have explicitly collapsed them. Disclosure choices survive filter changes, and shared paper links always open their session. Open session headings stay below the search bar as you scroll.

Save papers to a browser-local shortlist and export confirmed presentations as calendar files. Missing, conflicting, withdrawn, desk-rejected, and non-presenting assignments are excluded from calendar export.

## Usage stats and contact

A small LinkedIn icon in the header links to Tom Völker’s profile. The footer links to `emnlp-finder@tomvoelker.de` for questions and corrections. LinkedIn loads only after following the link. Contact opens the visitor’s email app with a subject and no message body. There is no hosted contact form. The header keeps the official programme, poster map, LinkedIn icon and theme control together. The map’s source notes link to the official venue information.

The footer’s native **Privacy** disclosure works without JavaScript. It identifies Tom Völker as the personal operator and describes GitHub hosting, Cloudflare statistics and retention, browser storage, public programme data, email contact, transfers and visitor rights. Provider policies are linked in the notice.

Cloudflare Web Analytics reports traffic, referrers, countries, devices, and performance for `emnlp.vlkr.org`. Its public site token lives in `traffic.mjs`. SPA tracking is disabled because filters and author pages use query-only navigation. A filter change does not count as another page load. View traffic in the [private Cloudflare dashboard](https://dash.cloudflare.com/2935c549fd1faa5c6c59a17b5659101e/web-analytics/overview?siteTag~in=ff02a94769c8425b96158f95afd66da9&excludeBots=Yes).

A separate Cloudflare Worker records action categories in the `emnlp_finder_events` Analytics Engine dataset. It accepts searches, filter changes, author and schedule links, shortlist additions and removals, shortlist views, calendar exports, Anthology and Underline links, and contact clicks. A search counts after one second without typing or on submission. Submitting an already counted query does not add another count. Clearing a whole shortlist counts as one removal action. Calendar counts mean a download was started, not that the calendar app imported it.

The action payload contains only an allowlisted event name. It contains no search text, author names, paper IDs, shortlist contents, email addresses, visitor IDs, or page URLs. The Worker stores the category, a count, and Analytics Engine’s timestamp. It has no public read endpoint. Tracking is disabled on local and preview hosts and for browsers that send Do Not Track or Global Privacy Control. The counter does not retry failed requests, so blocked or interrupted requests can be missing. Counts are approximate usage indicators and can include forged events.

Open [Analytics Engine Studio](https://dash.cloudflare.com/2935c549fd1faa5c6c59a17b5659101e/workers/analytics-engine/studio) and run [`worker/action-counts.sql`](worker/action-counts.sql) for action totals over the last seven days. The query uses sampling weights so higher traffic still produces estimated totals. Initial counts include release verification events.

Collector source and deployment configuration are in `worker/`. Its origin check accepts only the production site, request bodies are limited to 128 bytes, and extra fields are rejected. Worker request logging stays disabled. Deploy collector changes separately with `npx wrangler deploy --config worker/wrangler.jsonc` after authenticating to the correct Cloudflare account. The GitHub Pages workflow deploys only the static finder.

## Poster boards and map

A **Board N** link on a paper opens its session and position on the [poster map](https://emnlp.vlkr.org/poster-map/). The header also opens the full map. Choose the session before looking up a board, because positions are reused. Board numbers and titles come from the [conference handbook](https://drive.google.com/file/d/1UGPjD7jPfax0RVaZPcb1gZhCUhK4v3ti/view), modified on 24 October 2026. The venue geometry comes from the photograph reconstructed in the map chat. It remains schematic, with the original cautions around positions 41–56.

The compact catalog, `data/poster-boards.json`, contains 2,833 explicit board labels across A–G and the Industry session. It matches 2,832 paper IDs, of which 2,830 have unambiguous locations. The map shows one additional handbook title that has no matched finder ID. D and Industry share the same October 26, 11:00–12:30 slot and appear together on the map. Industry occupies boards 1–156. The handbook starts the main D list at 158. Board 311 is printed for two D papers, so neither paper receives a confirmed board badge and the map shows the conflict.

The importer preserves 32 differences between the handbook and the source sheet. The finder retains the sheet’s programme and separately identifies a handbook poster slot when its time, room or presentation format differs. Calendar exports retain the programme time and include the separately labelled handbook poster information. Search accepts board numbers, for example `board 166`. Map details provide the handbook page, paper title, authors and a link back to the matching finder entry. The public map is read-only and does not load or alter old browser-local draft assignments.

To reproduce the board catalog, download the original handbook PDF and run:

```sh
python3 scripts/import_handbook.py --source /path/to/handbook.pdf
```

This extraction requires `pdftotext` from Poppler. The site build uses the committed compact catalog and requires no PDF tools. Source SHA-256, modification time and physical PDF page numbers are stored with the catalog. The importer uses explicit **Board** labels, exact normalized publication or schedule titles, and narrowly reviewed aliases for glyphs missing in the PDF. It rejects unmarked physical collisions. The PDF and intermediate extraction previews stay local.

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
