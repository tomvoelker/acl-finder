# EMNLP 2026 poster map

The public map shows the conference handbook's verified paper assignments on a schematic of 424 numbered positions. Choose the poster session before looking up a board, since the venue reuses board numbers. The selector stays visible above the map. Session D and Industry Track Session 6 share a room and time, so they appear together as **D + Industry**. Links using either source session ID reach that shared map.

Select a board, or search for a paper title or author in **Details**. The selected-paper card shows a larger title, board, session and time. It stays visible beside the desktop map or above the zoom controls on phones, with Details and View paper actions. Details include authors when supplied, the physical handbook PDF page, and a paper finder link when the catalog has a matching paper ID. An unmatched handbook title still appears. Conflicting handbook entries appear together with a warning and are not shown as a verified assignment. An unlisted board says “No assignment listed in handbook for this session”. This does not establish whether a paper is presenting.

Serve the repository root to use the map locally:

```sh
python3 -m http.server 8017 --bind 127.0.0.1
```

Open <http://localhost:8017/poster-map/>. The map reads `../data/poster-boards.json` and `../data/papers.json`. Handbook assignments remain available if the finder dataset cannot load. The complete floor plan remains available if the handbook catalog cannot load. The map does not read or write browser-local assignment drafts. Previous stored drafts are left untouched.

Saved papers from the finder use purple board outlines and white-star badges, plus a clickable badge counting saved posters across all sessions. Click it, or press Enter/Space while it is focused, to jump to the next saved poster. Navigation changes the session when needed and wraps after the last poster. The selection card, board labels and Details also identify saved papers. Only verified assignments in the current physical session receive markers. Reused board numbers and conflicting entries do not inherit a star from another paper. The map reads the shared browser-local saved list and updates on storage changes, focus and page restoration. Use the star in the selected-paper card to save or unstar that paper directly. The finder, map markers and saved-posters shortcut share the same list. Changes stay in browser storage and are not uploaded. Unmatched or conflicting board assignments do not offer an ambiguous save action. A missing list includes the finder authors’ poster at F200 by default. Existing or explicitly emptied lists are respected.

The map uses the finder’s Auto/Light/Dark button and theme preference. Open tabs follow each other’s theme changes. Board colors, labels, saved markers and selection cards support both palettes.

## Navigation and data

The canonical link format is `#session=A&board=123`. Links with only a board produce a warning that identifies the session being shown. The initial session uses Budapest local time: the single active physical session, otherwise the first session on the current date, otherwise the first catalog session. Session groups combine only matching dates, times and rooms. Source session IDs remain aliases of their physical session.

`catalog.mjs` validates the public catalog, resolves session groups and accepts an assignment for placement only when its `verified` flag is `true` and its session/board pair has one entry. `layout.mjs` owns the source geometry and cautions. `map.mjs` handles browsing and personal saved-paper controls, and `camera.mjs` owns fit, anchored zoom, pinch, bounded pan and resize geometry. The map uses the self-hosted math title renderer shared by the finder.

On phones, the map starts at a readable zoom. Drag or swipe to pan, pinch around your fingers to zoom, or double-tap to zoom in. Use **Fit** for the overview. Panning coasts after a flick unless reduced motion is enabled. Map edges and zoom limits keep the drawing reachable. Orientation changes preserve the current area and relative zoom. On a trackpad, scroll pans and pinch zooms. Zoom buttons and Fit animate over 260 ms. Repeated clicks accumulate, and a new gesture interrupts the animation immediately. Reduced motion makes these changes instant.

## Source limits

The venue photograph supplies the geometry and numbering. Paper assignments come from the linked conference handbook. The photograph's external labels are often displaced from the drawn boxes. The reconstruction aligns those labels with their numbered rows, regularizes spacing and moves section headings into the gaps. The exact face orientation and spacing need venue confirmation.

Positions 41–56 are especially crowded in the source and have dashed outlines and a warning. Both printed “Section 5” labels are preserved. The photograph's “Poster Display TV's” area is labelled **Demo sessions**, following the user's clarification. Yellow highlights and B1–B10 markers are reproduced without assigning a meaning. No entrance or compass direction is inferred.

## Verification

```sh
node --check poster-map/map.mjs
node --check poster-map/catalog.mjs
node --test poster-map/tests/*.mjs
```

The tests cover all 424 positions, unique geometry, map bounds, source anchors, verified catalog entries, physical session aliases, conflicts, board reuse and Budapest time defaults. Camera tests check anchored zoom, moving pinch midpoints at map edges, drag distances, zoom and pan limits, and portrait/landscape resizing. Current integration checks and historical browser checks are distinguished in `qa.md`.
