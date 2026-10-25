# Final review: EMNLP 2026 poster topics (b011ea5)

Reviewer: Claude Opus 5.5, xhigh. Read-only review, 25 October 2026.

## Verdict

**APPROVE FOR OPTIONAL RELEASE.**

I found no material blockers. The feature is useful enough for all seven sessions and should merge as an opt-in browsing aid that is off by default. It is not an official taxonomy, and individual assignments can be wrong. The UI states this ("Inferred · not official tracks"), and so do the README and review notes.

## Scope and evidence

- **Code.** I read `git diff bfad08e..HEAD` in full: `map.mjs`, `map.css`, `topics.mjs`, `index.html`, `compare.py`, `export.py`, `labels.json` and `tests/test_topics.mjs`. I also read `review.md`, `README.md`, all of `groups.md` (every label for A–G) and `data/poster-topics.json`.
- **Data, using read-only Python on the shipped JSON.** There are 2,831 assignments, 12 groups per session, and each assignment has a `margin` field. 231 papers (8.2%) fall below the 0.02 "Loose fit" threshold, and 4 have negative margins. Loose-fit rates within a group peak at 26% (E "Reasoning & interaction") and 22% (D "Language & cognition"; F "Evaluation & alignment (mixed)"). Median margins are 0.068–0.081 per session.
- **Ranked titles.** I spot-checked the strongest, middle and weakest titles in seven of the broadest groups. Top-ranked members are coherent in most groups. Weak members drift, as you would expect.
- **Screenshots.** I viewed sessions A, B and F, plus list-revised, navigation-revised, light-revised, mobile-revised, mobile-list-revised and final-preview. I did not open the C, D, E or G overviews. Their toolbar heights and assignment counts come from `topics-all-session-browser-check.json`: A 407, B 404, C 391, D 409, E 403, F 419, G 398. All show 12 groups, no overflow, a reset to "all" on session change, and toolbar heights of 79–113 px.
- **Not done:** I did not rerun tests, embeddings or a browser. Test pass counts are the coordinator's report. Nothing here is a physical-device test.

## Assessment of the applied fixes

- **Signed margin** (`compare.py`). This is correct: assigned-centroid cosine minus the best other centroid. The `export.py` zip relies on `candidate['assignments']` having the same order as `assignments[session]`. Exact-coverage tests and unchanged memberships make a silent misalignment unlikely.
- **Ranking** (`topicEntries`). Sorting is by descending margin with ties broken by board, and it is tested. The C efficiency list in the screenshot opens with six KV-cache/long-context papers, so the first screen of results is convincing.
- **Focused list.** The list is centred on desktop and opens as a bottom sheet on mobile. Unrelated panels are hidden and the heading takes focus without raising the keyboard. Choosing a result closes the list. The screenshots match.
- **Previous/Next on the card.** Wrap-around works. "Outside highlighted topic" is handled with sensible entry points, and focus stays on the pressed button after re-render. This is the most useful change for walking a poster hall.
- **Detail-panel modes.** Passing `openDetails` directly as a click handler is safe because a MouseEvent has no `topic` property. Normal Details resets the title and label.
- **Map layering.** Dimming now applies to the rect and text rather than the whole group, so saved stars stay at full opacity. Source-yellow and review strokes and the hover stroke are kept.
- **Toolbar and legend.** The toolbar is compact, and in practice the legend fits in two to three rows at 1280 px. The legend is alphabetical with mixed groups last. The mobile layout keeps the chip strip beside Browse with 44 px targets.
- **Palette.** Pairwise ΔE ≥ 18 and 4.5:1 board-text contrast are enforced in tests, and the README is honest that this does not establish CVD safety.

## Remaining concrete blockers

None.

## Non-blocking issues (follow-ups)

1. **Some labels are still too narrow.**
   - F "Cross-lingual reasoning" (49): the three strongest members are not cross-lingual (Occam's-razor reasoning, multilingual maths and table reasoning). "Reasoning & QA" fits better.
   - E "Reasoning & interaction" has the highest loose-fit share (26%). Its strongest member is personalised conversation memory, and it would be more honest marked "(mixed)".
   - D "Language & cognition" mixes psycholinguistics with pruning and tokenisation.

   These are label tweaks, not blockers. The UI already warns that assignments are inferred.
2. **Regular Details panel with a topic highlighted.** `renderPaperResults` filters to the topic whenever one is highlighted, including in normal Details mode. The label then still reads "Find a paper in this session", while the panel shows the whole topic list and searches only within it. The empty-result message explains how to recover. Consider filtering only in `topic-list` mode, or changing the label whenever a filter is active.
3. **Mobile chip strip.** At 390 px only about one chip is visible at a time, so finding a topic means swiping. Usable, but a "12 topics" affordance or a select-style picker on mobile could help.
4. **Dimming in dark mode.** In the dark overview, non-member board numbers become nearly invisible at 0.2 opacity. The highlighted members carry the information, so this is fine, but around 0.3 would keep orientation.
5. **`groups.md` boundary lists.** These occasionally repeat a centroid-near title as a smallest-margin title (A "Reasoning & verification": KG-RLVR). That is possible when two centroids are close. It is harmless, but worth a note for readers.
6. **Research extensions, as already listed in the README:** a scientific-document embedding model, less truncation, overlapping or soft assignment, and a small independently annotated relevance sample.

## Recommendation

Merge to main with the layer off by default. A loose-fit rate of about 8%, coherent top-ranked results, explicit "(mixed)" labels, and continuous Previous/Next browsing make it a credible exploratory aid in every session. The limitations are documented and visible in the UI. None of the follow-ups needs to gate release.
