# Topics from Hadi Mohammadi’s EMNLP Atlas

The poster map imports the assignments and labels from **[Hadi Mohammadi’s EMNLP 2026 Atlas](https://mohammadi.cv/emnlp/2026/atlas.html)**. Credit belongs to Hadi for the embeddings, clustering, taxonomy and published labels. The upstream project is [mohammadi-hadi/emnlp](https://github.com/mohammadi-hadi/emnlp), pinned at commit `58dd3536c32a4a101cc1e064e44ab25702829559` (24 October 2026).

The Atlas embeds titles and abstracts with Qwen3-Embedding-0.6B and clusters papers into 100 fine topics and 16 broad areas. These are inferred groups, not official acceptance tracks. A paper receives one topic even when several could fit. We preserve the upstream labels and numeric IDs. Colours identify broad areas consistently across all seven poster sessions; the topic selector narrows an area further. Lists use board order because the published source does not provide confidence scores.

## Committed inputs and results

- `papers_index.csv.gz`: losslessly compressed upstream `outputs/papers_index.csv`, including all 5,534 paper identities and assignments.
- `labels_2026.json`: exact upstream `data/labels/labels_2026.json`, with area/topic IDs, names and descriptions.
- `source.json`: author, URLs, Git revision, and SHA-256 hashes of the uncompressed source files.
- `audit.json`: coverage and every unclassified poster, with its session, board, identity and reason.
- `../poster-topics.json`: the generated browser dataset, including its input hash.
- `../../scripts/import_topics.py`: standard-library Python importer; no third-party dependencies.

The join uses the finder's verified ACL Anthology IDs. It classifies **2,803 of 2,831** unambiguous poster assignments. The remaining **28** stay explicitly unclassified; no fuzzy title match or guessed topic is substituted. They remain searchable, selectable and browsable through **Not classified in Atlas**. The two conflicting handbook entries receive no topic assignment. Industry posters belong to physical session D.

Only topic assignments and descriptions are imported. Upstream schedule fields are ignored. Dates, rooms and boards continue to come from the finder's verified sources. The source CSV includes bibliographic data which upstream attributes to ACL Anthology under CC BY 4.0. Upstream has no separate repository licence file at this revision; we do not assert a licence for its added labels.

## Reproduce or refresh

Run this after changes to the schedule, Anthology matches or handbook:

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
