# Independent review and changes

Claude Opus 5.5 at xhigh reviewed the initial experiment on 25 October 2026. It found the grouping useful as an approximate browsing aid and the engineering sound, but requested changes before broader use. It inspected the source, metrics, sample titles, assignment margins, and four desktop/mobile screenshots. It did not run the browser or tests itself.

## Changes made after review

- Export assignment margins and order paper lists by margin, descending. The first C efficiency results are now TaskPress, Behavior-Preserving KV Cache Compression, SCORE, SALT, GRKV and CentralKV. Papers with margin below 0.02 are marked “Loose fit”; they remain accessible.
- Compute a signed margin against the assigned centroid, rather than the two nearest centroids regardless of assignment. Four boundary cases have negative margins. All 2,831 cluster memberships are unchanged.
- Open a focused, centred topic list on desktop and a bottom sheet on mobile. Hide unrelated map details, remove the nested results scrollbar, focus the heading instead of the search input, and close the list when revealing a board.
- Add Previous/Next controls to the selected poster card, following the same margin order. This allows browsing without repeatedly opening the list.
- Compress desktop controls to a wrapping row; retain 44-pixel touch controls. Keep mobile chips in a horizontal strip beside Browse. Desktop toolbar height is 79–113 pixels across sessions at 1280×720; mobile header plus toolbar is about 169 pixels at 390×640.
- Change two similar palette colours. The palette check enforces pairwise CIE76 distance ≥18 and board-number contrast ≥4.5:1. This does not establish colour-vision-deficiency accessibility; labels and single-topic highlighting remain the primary identification methods.
- Sort labels alphabetically, placing mixed groups last. Inspect two strongest and two middle-ranked titles in every group, broaden six labels, and mark additional mixed groups.
- Dim board rectangles/numbers without dimming saved stars; preserve warning/source strokes and hover feedback.

## Coordinator verification

59 Python and 105 Node tests pass. All seven sessions render 12 groups with the expected assignment counts: A 407, B 404, C 391, D 409, E 403, F 419, G 398. Session changes reset the highlight; disabling the layer clears colours and dimming. Browser checks cover ranked results, empty queries, heading focus, list-to-map navigation, Previous/Next, light and dark themes, 390×640 iframe layout, and saved stars outside the selected topic. The temporary saved paper was removed after verification.

The input snapshot, pinned dependencies, comparison/export scripts and generated dataset are committed together. Normal builds preserve the checked-in groups and need no ML dependencies. A stale handbook stops the build rather than silently discarding topics.

The remaining limitations are inherent to this experiment: low separation, forced single membership, occasional mismatches, and title/abstract truncation. These are documented in README.md and the UI labels the layer as inferred, not official tracks. This review does not certify every paper assignment as correct.
