# Topics from Hadi Mohammadi’s EMNLP Atlas

The poster map imports the assignments and labels from **[Hadi Mohammadi’s EMNLP 2026 Atlas](https://mohammadi.cv/emnlp/2026/atlas.html)**. Credit belongs to Hadi for the embeddings, clustering, taxonomy and published labels. The upstream project is [mohammadi-hadi/emnlp](https://github.com/mohammadi-hadi/emnlp), pinned at commit `58dd3536c32a4a101cc1e064e44ab25702829559` (24 October 2026).

The Atlas embeds titles and abstracts with Qwen3-Embedding-0.6B and clusters papers into 100 fine topics and 16 broad areas. These are inferred groups, not official acceptance tracks. A paper receives one topic even when several could fit. We preserve the upstream labels and numeric IDs. Codex assigned additional broad areas to 71 programme entries missing from the Atlas; these have no fine topic and their provenance is recorded separately. Area colours start enabled on the map and can be switched off. Colours identify broad areas consistently across all seven poster sessions; the topic selector narrows an area further. Lists use board order because the published source does not provide confidence scores.

## Committed inputs and results

- `papers_index.csv.gz`: losslessly compressed upstream `outputs/papers_index.csv`, including all 5,534 paper identities and assignments.
- `labels_2026.json`: exact upstream `data/labels/labels_2026.json`, with area/topic IDs, names and descriptions.
- `source.json`: author, URLs, Git revision, and SHA-256 hashes of the uncompressed source files.
- `audit.json`: Atlas coverage, local assignment counts and any remaining gaps, for both posters and the whole programme.
- `local-areas.json`: the 71 local broad-area decisions, titles, public evidence, rationale, reviewer and date. Of these, 64 use available Underline abstracts and seven use titles only. The former handbook-only Gricean title is now linked directly by the schedule to `9295-TACL`.
- `../poster-topics.json`: the generated browser dataset, including global Anthology assignments, local areas, poster assignments and its input hash.
- `../../scripts/import_topics.py`: standard-library Python importer; no third-party dependencies.

The Atlas join uses the finder's verified ACL Anthology IDs. It supplies fine topics and broad areas for **2,769 of 2,797** unambiguous poster assignments, and **5,532 of 5,603** programme entries. The local review supplies broad areas for the remaining **28 posters / 71 programme entries**. Every current paper therefore has an area, but local additions have no fine topic and are recorded separately from Hadi’s assignments. The UI uses the same area styling and explains the additional review once in its source notes. The duplicate D board 311 pair and nine rows with timeline or room discrepancies receive no verified map assignment. Industry posters belong to physical session D.

The importer checks local reviews against exact programme IDs and titles, validates the area IDs, and rejects attempts to override a paper that now has an upstream Atlas assignment. Local review changes are included in the build's stale-input guard. A future paper without either source remains explicitly unclassified until reviewed.

Only topic assignments and descriptions are imported from the Atlas. The normal build attaches them to programme entries as well as the poster map. Upstream schedule fields are ignored. Dates, rooms and boards continue to come from the finder's verified sources. The source CSV includes bibliographic data which upstream attributes to ACL Anthology under CC BY 4.0. Upstream has no separate repository licence file at this revision; we do not assert a licence for its added labels.

## Reproduce or refresh

Run this after changes to the schedule, timeline or Anthology matches:

```sh
python3 scripts/import_topics.py
python3 scripts/build.py
```

The import is deterministic and works offline from the committed snapshot. The build rejects stale inputs and otherwise copies the assignments unchanged. A colleague's normal deployment cannot recluster or silently drop the topics.

To refresh from a reviewed upstream revision, use its full Git commit SHA:

```sh
python3 scripts/import_topics.py --revision FULL_40_CHARACTER_COMMIT_SHA
```

Review the source, labels, audit and generated assignments before committing them together. The importer rejects duplicate paper IDs, ambiguous topic-to-area mappings, corrupt snapshots and a changed taxonomy size. If upstream changes the meaning of its IDs, review the palette mapping as well.

The original MiniLM experiment, corpus, pinned dependencies, scripts and assignments remain in `experiments/poster-topics/` for reproduction and comparison. Its exporter writes only inside that directory and cannot replace the deployed Atlas dataset.
