# Experimental poster topics

This branch adds approximate topic groups to the poster map. They help browse a session; they are **not official research areas**, and individual assignments can be wrong. The live site is unchanged.

## What the prototype does

Open `/poster-map/`, turn on **Colour by topic**, and choose a group to highlight its boards. **Browse posters** opens the group's paper list. Selecting a paper reveals its board. Turn the layer off to restore the ordinary map. Saved-paper stars, source-numbering warnings, and conflicting handbook locations retain their meaning.

Groups are fitted separately for A–G. D and Industry 6 share one physical session, so they are clustered together. A colour has no consistent meaning across different sessions. No model runs in the browser; the generated dataset is about 412 KB before compression.

## Comparison, 25 October 2026

The handbook has 2,833 entries. Two competing assignments for one board are excluded. The remaining 2,831 verified locations include one title without a finder ID. Of these, 2,827 have an abstract matched through the finder's existing verified Underline links; four use their title alone. No new fuzzy matching was introduced.

Compared three representations at 8, 12, and 16 groups per physical session. Each KMeans fit used ten initializations, with three random seeds (0, 1, 2). That is 189 fits across 63 configurations. The exported assignment is seed 0, not the best-looking seed selected after inspection.

| Representation | Mean stability ARI, 8 groups | 12 groups | 16 groups |
| --- | ---: | ---: | ---: |
| Word/bigram TF-IDF | 0.104 | 0.120 | 0.132 |
| TF-IDF → 100-dimensional LSA, normalized | 0.429 | 0.428 | 0.388 |
| MiniLM sentence embeddings, normalized | 0.509 | 0.443 | 0.348 |

Stability is the average adjusted Rand index across the three seed pairs, then averaged over sessions. It measures agreement between runs, not correctness. The complete [metrics](metrics.json) also retain cosine silhouette and group sizes. Silhouettes should not be compared directly between these different representation spaces.

The prototype uses **12 MiniLM groups per session**. Eight was more stable but merged useful distinctions: session A combined retrieval with RAG, agents with reinforcement learning, and most vision/video papers. Sixteen was less stable and produced groups as small as four papers. Twelve is a browsing compromise, not an estimated natural number of research topics.

### Inspection

Inspected contrastive keywords, representative titles, and low-margin titles across all 84 selected groups. The [inspection file](groups.md) retains four centroid-near titles and three boundary titles per group. Labels were written after that review; the algorithm assigns papers without using those labels. This was a qualitative inspection, not a blinded or exhaustive relevance annotation.

Useful examples include session A's dense-retrieval/embedding papers, C's KV-cache compression and quantization groups, E's privacy and clinical groups, and G's machine-translation group. LSA produced useful lexical themes too, but in A it grouped refusal with model internals and left a broad knowledge/prompt/reasoning cluster. Raw TF-IDF had weak stability and more assignments apparently driven by shared surface terms.

There are still clear failures. B combines audio and model-internals papers. F has a mixed encoders/representations group that also contains molecular NLP. A's multilingual-evaluation group includes unrelated evaluation work. Broad labels cannot repair these assignments. The most visibly mixed groups are marked in the UI, but unmarked groups are not guaranteed coherent. Boundary cases and papers spanning several areas remain the main weakness of forcing each paper into one cluster.

## Reproduce

The normal site build remains dependency-free. These dependencies are only for the offline experiment; use Python 3.12 in an isolated environment.

```sh
uv venv --python 3.12 work/topics-venv
uv pip install --python work/topics-venv/bin/python -r experiments/poster-topics/requirements.txt
python3 experiments/poster-topics/fetch_sources.py
HF_HOME="$PWD/work/topics-hf" OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2 TOKENIZERS_PARALLELISM=false \
  work/topics-venv/bin/python experiments/poster-topics/compare.py --source-dir work/topics-source
python3 experiments/poster-topics/export.py
python3 scripts/build.py
```

This run used the already-cached `work/underline-oral-refresh/underline-api-page-*.json` snapshot. A new fetch can differ. Corpus and handbook hashes are recorded in `metrics.json`; reviewed labels are bound to the corpus hash. If the corpus changes, inspect the new groups and update `labels.json` before exporting. If the handbook changes, the site build refuses stale topics. The original raw responses, corpus text, model weights, embeddings, and all candidate assignments remain under ignored `work/`; they are not shipped to browsers.

TF-IDF uses globally fitted IDF, unigram/bigram features, sublinear term frequency, `min_df=3`, and `max_df=.4`, with English and generic NLP stopwords removed. Its input repeats the title twice, followed by the abstract. LSA uses the same matrix and a fixed SVD seed. Clustering itself always uses only members of the selected physical session.

The embedding input is title once, then abstract, with the pinned [all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2) revision in `compare.py`. It uses the model's 256-wordpiece limit: **1,681 of 2,831 inputs were truncated**. It is a small general-purpose English model, not a model trained specifically for scientific-paper similarity. Both truncation and domain mismatch could affect grouping. Model inference used CPU, with normalized 384-dimensional vectors. HTML is removed from abstracts; source titles are retained separately for exact map-assignment checks.

The implementation follows established [Sentence Transformers clustering](https://www.sbert.net/examples/sentence_transformer/applications/clustering/README.html) and [scikit-learn text clustering](https://scikit-learn.org/stable/auto_examples/text/plot_document_clustering.html) patterns. Keywords are contrastive TF-IDF terms used for inspection and naming, not a second classifier. Paper assignments use local model inference without an external embedding API.

## Validation

The existing 57 Python and 98 Node tests pass, plus four new topic tests. They cover session/board identity, stale title or paper mismatches, invalid topic data, group counts, exact coverage, exclusion of conflicting boards, and packaging of the static dataset. Browser checks cover highlighting, switching sessions, toggle-off behaviour, paper-list navigation, and saved markers. With the topic JSON deliberately unavailable, all 424 boards and the session's handbook assignments remained usable and the topic toggle was disabled. Light/dark appearance and a 390-pixel iframe viewport were checked; this is not a physical-device test.

The experiment needs broader relevance evaluation before promotion to main. A useful next comparison would be a scientific-document embedding model or overlapping topic assignments, evaluated against a small independently annotated sample rather than silhouette alone.
