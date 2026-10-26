# EMNLP 2026 Finder

An unofficial paper and presentation finder for EMNLP 2026 in Budapest. The main-conference schedule covers 25–27 October at HUNGEXPO. The full conference runs 24–29 October.

**Live site:** [emnlp.vlkr.org](https://emnlp.vlkr.org/)

The presentation dropdown starts on **Posters**, showing poster sessions for the selected conference day with direct links to papers and maps. Choose **All** for the full programme, or choose Orals, Demos or Virtual presentations. Search by title, author, presenter, paper ID, topic or board number. Combine day, track, format, attendance, room, and schedule filters. Click a paper title to open its ACL Anthology page. Use **Schedule link** to share its presentation details; filters can also be shared through the URL.

Click an author’s name to see their papers across all conference days and tracks. Author views have shareable URLs and support day and track filters, shortlist, and calendar links. Starting a search leaves the author page or poster browse view and searches the whole conference across all days. **Clear all** also removes the author selection. Searches from the regular programme retain its selected filters. Pages group full names as credited in the available publication metadata. Spelling variants are kept separate, and people with identical names share a page. Presenter-only entries do not establish authorship.

Each **Underline ↗** link opens that paper’s own presentation page, where Underline provides its available video, slides, or poster. Underline may require your conference login for those materials.

Inline LaTeX in paper titles renders with self-hosted KaTeX 0.19.1, including Greek letters and superscripts. Search accepts the original TeX text and rendered symbols, such as `lambda`, `λ`, or `𝜆`. Unsupported or malformed expressions remain readable as their original text.

The finder and map share a theme preference. Their theme buttons cycle through Auto, Light, and Dark, and open tabs follow changes made in the other view. Its icon shows the current choice, with the current and next choices in its tooltip and accessible label. Auto follows the system colour preference; explicit choices are saved in this browser and applied before the page renders. White and cool gray surfaces, charcoal text, and restrained red accents follow the [conference website](https://2026.emnlp.org/). The header uses its [official logo](https://2026.emnlp.org/assets/images/logos/emnlp_2026_logo_v1.png) with a gold **Unofficial** ribbon. A separate gold search icon identifies the finder in browser tabs. SVG and PNG favicons have content hashes so icon changes receive new URLs. Day buttons above the filters switch between conference days, all days, and papers without a date. A visible presentation dropdown switches between Posters, All and the other formats. On phones, it shares one row with the day selector and Filters disclosure. The disclosure shows the number of active filters and opens the full labelled native pickers, including option names and counts. Update, time-zone and source information lives in the footer’s **About & sources** disclosure. Contact and Privacy remain directly accessible.

Full author lists appear in publication order. Presenters whose names match are bold and labelled within the list. Otherwise, the spreadsheet's presenter entry appears separately in bold, including when author metadata is unavailable. Name differences and ambiguous matches are not guessed.

Poster browsing selects the current conference day in Budapest unless the URL specifies a day. Outside the scheduled dates, it shows all days. Posters group by handbook session, independently of the sheet’s oral or virtual assignments. Entries without a verified board remain available under **Board unconfirmed**. Inactive entries remain searchable without being advertised as posters to attend. Search, author pages and saved papers use flat pages of up to 16 cards, with verified posters first. Previous and Next replace the current page, keeping every match reachable without accumulating thousands of DOM nodes. Search yields between matching and rendering, cancels stale pending renders when new input arrives, and preserves input focus and scroll position. The full programme groups the source-sheet presentations by their date, time, topic and room. Oral cards show individual talk times and sort by those times within the session; the session heading retains the full session window. One programme session opens at a time, with headings that stay below the search bar as you scroll.

Each paper card leads with its verified board, poster session, date, time and room. Author links remain clickable, with presenters in bold. Underline, Share and Calendar remain available below the authors. **Details** holds track, topic, source schedule differences and attendance notes. Routine IDs and sheet-row links are omitted from cards. Save a paper with its star and open saved papers through the star beside the results heading. Saved papers stay in this browser, with calendar export available in that view. A browser with no saved list starts with the finder authors’ poster (Session F, board 200). Its saved view labels it **Saved by default**. Unstarring it or clearing the list persists an empty list, so it is not added back. Existing lists are left unchanged. The default does not write storage or count as a visitor save action. Missing, conflicting, withdrawn, desk-rejected, and non-presenting assignments are excluded from calendar export.


Open **Saved papers → Share list → Copy link** to move a list to another device. The link contains a compact snapshot of all saved paper IDs in its fragment, independent of current search filters. It needs no account or backend and does not update when the sender changes their list. Opening it previews the list without changing local saves. **Save on this device** saves exactly the incoming list on a new device, or merges it with existing choices. Those stars also appear on the map. Anyone with the link can open the snapshot. Unsupported or malformed links show an error instead of importing a partial list.
## Usage stats and contact

A small LinkedIn icon in the header links to Tom Völker’s profile. The footer links to `emnlp-finder@tomvoelker.de` for questions and corrections. LinkedIn loads only after following the link. Contact opens the visitor’s email app with a subject and no message body. There is no hosted contact form. The header keeps the official programme, poster map, LinkedIn icon and theme control together. The map’s source notes link to the official venue information.

The footer’s native **Privacy** disclosure works without JavaScript. It identifies Tom Völker as the personal operator and describes GitHub hosting, Cloudflare statistics and retention, browser storage, public programme data, email contact, transfers and visitor rights. Provider policies are linked in the notice.

Cloudflare Web Analytics reports traffic, referrers, countries, devices, and performance for `emnlp.vlkr.org`. Its public site token lives in `traffic.mjs`. SPA tracking is disabled because filters and author pages use query-only navigation. A filter change does not count as another page load. View traffic in the [private Cloudflare dashboard](https://dash.cloudflare.com/2935c549fd1faa5c6c59a17b5659101e/web-analytics/overview?siteTag~in=ff02a94769c8425b96158f95afd66da9&excludeBots=Yes).

A separate Cloudflare Worker records action categories in the `emnlp_finder_events` Analytics Engine dataset. It accepts searches, filter changes, author and schedule links, shortlist additions and removals, shortlist views, calendar exports, Anthology and Underline links, and contact clicks. A search counts after one second without typing or on submission. Submitting an already counted query does not add another count. Clearing a whole shortlist counts as one removal action. Calendar counts mean a download was started, not that the calendar app imported it.

The action payload contains only an allowlisted event name. It contains no search text, author names, paper IDs, shortlist contents, email addresses, visitor IDs, or page URLs. The Worker stores the category, a count, and Analytics Engine’s timestamp. It has no public read endpoint. Tracking is disabled on local and preview hosts and for browsers that send Do Not Track or Global Privacy Control. The counter does not retry failed requests, so blocked or interrupted requests can be missing. Counts are approximate usage indicators and can include forged events.

Open [Analytics Engine Studio](https://dash.cloudflare.com/2935c549fd1faa5c6c59a17b5659101e/workers/analytics-engine/studio) and run [`worker/action-counts.sql`](worker/action-counts.sql) for action totals over the last seven days. The query uses sampling weights so higher traffic still produces estimated totals. Initial counts include release verification events.

Collector source and deployment configuration are in `worker/`. Its origin check accepts only the production site, request bodies are limited to 128 bytes, and extra fields are rejected. Worker request logging stays disabled. Deploy collector changes separately with `npx wrangler deploy --config worker/wrangler.jsonc` after authenticating to the correct Cloudflare account. The GitHub Pages workflow deploys only the static finder.

## Poster boards and map

Saved papers receive purple outlines and white-star badges on verified boards in the current map session. The star in the selected map card adds or removes that paper from the same saved list as the finder. Markers, the saved-posters shortcut and open finder tabs update immediately. Saved state stays in this browser. The clickable saved-posters badge cycles through verified saved boards across all sessions in date, time and board order. It prefers the current session when starting and wraps after the last saved poster. Conflicting board assignments never receive confirmed saved markers. The selected-paper card shows its title, board, session and time prominently, with Details and View paper actions.

A **Board N** link on a paper opens its session and position on the [poster map](https://emnlp.vlkr.org/poster-map/). The header also opens the full map. Choose the session before looking up a board, because positions are reused. Board numbers and titles come from the [conference handbook](https://drive.google.com/file/d/1UGPjD7jPfax0RVaZPcb1gZhCUhK4v3ti/view), modified on 24 October 2026. The venue geometry comes from the photograph reconstructed in the map chat. It remains schematic, with the original cautions around positions 41–56.

The compact catalog, `data/poster-boards.json`, contains 2,833 explicit board labels across A–G and the Industry session. It matches 2,832 paper IDs, of which 2,830 have unambiguous locations. The map shows one additional handbook title that has no matched finder ID. D and Industry share the same October 26, 11:00–12:30 slot and appear together on the map. Industry occupies boards 1–156. The handbook starts the main D list at 158. Board 311 is printed for two D papers, so neither paper receives a confirmed board badge and the map shows the conflict.

The importer preserves 32 differences between the handbook and the source sheet. Paper cards prioritize the handbook poster slot. The finder retains differing sheet assignments under **Details**, with the original date, time, room and presentation format. Calendar exports use the individual oral slot when verified, otherwise the programme time, and include the separately labelled handbook poster information. When the slots differ, the card’s calendar action moves into Details and is explicitly labelled **Calendar for programme entry**. Search accepts board numbers, for example `board 166`. Map details provide the handbook page, paper title, authors and a link back to the matching finder entry. Handbook assignments on the public map are read-only. Personal saved-paper stars remain editable, and the map does not load or alter old browser-local draft assignments.

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

Underline links use the public metadata for [event 535](https://underline.io/events/535/schedule), retrieved on 25 October 2026. Of 5,603 schedule entries, 4,351 have a published Underline session page, 1,251 match unpublished records or records without a session, and one has no verified match. The importer matches unique normalized schedule or verified Anthology titles. A reviewed title change is recorded in `data/underline-overrides.json`; `data/underline-audit.json` records coverage and missing pages. Unpublished records receive no link. Session dates, rooms, and full session windows still come from the source spreadsheet. Individual oral times come from Underline’s explicit start/end timestamps, converted to Budapest time. Of 516 oral papers, 507 have verified individual slots. Three extend beyond the sheet’s session window; six Industry talks overlap one another by a minute. These nine retain the existing session or poster information, show **Talk time unconfirmed** with source details, and are excluded from calendar export. The importer never estimates talk order or divides a session into equal slots.

## Run locally

The poster map’s optional **Colour by area** layer uses [Hadi Mohammadi’s EMNLP 2026 Atlas](https://mohammadi.cv/emnlp/2026/atlas.html): 16 broad areas with stable colours across sessions, and 100 fine topics for filtering. These are inferred groups, not official acceptance tracks. The import matches 2,803 of 2,831 verified posters by Anthology ID. The other 28 now have broad areas assigned locally by Codex, with no invented fine topics. Browse lists and Previous/Next follow board order. Broad areas lead both the map cards and regular paper list; finer topics remain secondary.

The regular list has an always-visible **Area** selector and clickable area labels with the same colours as the map. Selecting an area shows a flat paper list within the chosen day, presentation type or poster session. Search then narrows that scope. Fine topics remain searchable and appear in **Details**; they do not add another filter to the list. Shared URLs preserve the area selection.

Across the full programme, 5,532 entries use Atlas topics and 71 have broad areas assigned locally by Codex. The local review used 64 available public abstracts and seven titles only. The additional labels use the same presentation as Atlas labels. About & sources links the review; only the seven title-only assignments carry a brief note in Details. [The committed review](data/atlas/local-areas.json) records each decision, evidence and rationale. These labels do not turn inactive papers into scheduled presentations.

The [Atlas source snapshot, attribution and audit](data/atlas/README.md) and the [dependency-free importer](scripts/import_topics.py) are committed alongside `data/poster-topics.json`. Builds copy these assignments unchanged and require no network or ML packages. After changing the schedule, handbook, Anthology matches or Atlas snapshot, run `python3 scripts/import_topics.py` before building. The build rejects stale data. The original [MiniLM experiment](experiments/poster-topics/README.md), including its corpus, pinned dependencies and assignments, remains available for comparison; its exporter cannot replace the live Atlas data.

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
python3 scripts/import_topics.py
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

The build adds verified Anthology IDs, author lists, Underline links, and individual oral slots to the public schedule in `_site/data/papers.json`, leaving the source schedule unchanged. It copies only public site assets into `_site/` and adds content hashes to JavaScript and CSS filenames so cached assets cannot mix across releases. Push to `main` to run the checks and deploy through the repository’s existing GitHub Pages configuration. Pull requests run the checks and build without deploying.

The site uses plain HTML, CSS, and JavaScript. It replaces the previous conference edition; older data and code remain available in Git history.
