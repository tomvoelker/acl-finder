# Experimental poster topics

**Historical experiment.** The live map now imports [Hadi Mohammadi’s EMNLP Atlas](../../data/atlas/README.md). This directory retains the original corpus, pinned dependencies, scripts, labels and assignments for reproduction. Its exporter writes `experiments/poster-topics/assignments.json`; it does not modify the deployed dataset. The assessment below describes the original MiniLM experiment.

The poster map offers approximate topic groups as an optional layer, off by default. They help browse a session; they are **not official research areas**, and individual assignments can be wrong.

## What the prototype does

Open `/poster-map/`, turn on **Colour by topic**, and choose a group to highlight its boards. **Browse posters** opens a focused list, ordered by assignment margin (strongest matches first). Selecting a paper reveals its board and closes the list; Previous/Next on the selection card steps through the same order without reopening it. Papers with a margin below 0.02 are marked “Loose fit”. This threshold is a browsing hint, not a calibrated confidence score. Turn the layer off to restore the ordinary map. Saved-paper stars, source-numbering warnings, and conflicting handbook locations retain their meaning.

Groups are fitted separately for A–G. D and Industry 6 share one physical session, so they are clustered together. A colour has no consistent meaning across different sessions. No model runs in the browser; the generated dataset is about 457 KB before compression.

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

Inspected contrastive keywords, representative titles, and low-margin titles across all 84 selected groups. The [inspection file](groups.md) retains four centroid-near titles and three boundary titles per group. Labels were written after that review; the algorithm assigns papers without using those labels. After independent review, labels were also checked against two high-margin and two middle-ranked titles in each group. Several labels were broadened or marked “mixed”. This was a qualitative inspection, not a blinded or exhaustive relevance annotation.

Useful examples include session A's dense-retrieval/embedding papers, C's efficiency/long-context and quantization groups, E's privacy and clinical groups, and G's machine-translation group. LSA produced useful lexical themes too, but in A it grouped refusal with model internals and left a broad knowledge/prompt/reasoning cluster. Raw TF-IDF had weak stability and more assignments apparently driven by shared surface terms.

There are still clear failures. B combines audio and model-internals papers. F has a mixed encoders/representations group that also contains molecular NLP. A's multilingual-evaluation group includes unrelated evaluation work. Broad labels cannot repair these assignments. The most visibly mixed groups are marked in the UI, but unmarked groups are not guaranteed coherent. Boundary cases and papers spanning several areas remain the main weakness of forcing each paper into one cluster.

## Archived output

`assignments.json` contains the reviewed MiniLM assignments for all seven physical sessions. It is retained for comparison and is not loaded by the current website. The active Atlas import and build commands are documented in [data/atlas/README.md](../../data/atlas/README.md).

## Reproduce the experiment

The normal site build remains dependency-free. These dependencies are only for the offline experiment; use Python 3.12 in an isolated environment.

```sh
uv venv --python 3.12 work/topics-venv
uv pip install --python work/topics-venv/bin/python -r experiments/poster-topics/requirements.txt
HF_HOME="$PWD/work/topics-hf" OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2 TOKENIZERS_PARALLELISM=false \
  work/topics-venv/bin/python experiments/poster-topics/compare.py
python3 experiments/poster-topics/export.py
```

The default input is the committed **`corpus.json.gz`**, a 1.37 MB compressed snapshot of the exact titles and abstracts used in this run. It contains only poster-session IDs, board numbers, paper IDs, titles and public abstract text; no authentication or private account data. It is not copied into the website. The matching snapshot was prepared from public Underline event 535 responses retrieved on 25 October 2026, through the existing verified title matches. Model weights are downloaded from Hugging Face on the first experiment run.

Corpus and handbook hashes are recorded in `metrics.json`. Reviewed labels are bound to both the corpus and the actual cluster memberships in `labels.json`. Hardware or dependency changes can alter k-means assignments even with a fixed seed. If they do, export stops for label review rather than attaching old names to changed clusters. The checked-in website dataset remains unchanged until an export succeeds. Model weights, embeddings, raw API responses, and candidate outputs remain under ignored `work/`.

To experiment with fresh source data instead of the committed snapshot:

```sh
python3 experiments/poster-topics/fetch_sources.py
HF_HOME="$PWD/work/topics-hf" OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2 TOKENIZERS_PARALLELISM=false \
  work/topics-venv/bin/python experiments/poster-topics/compare.py --source-dir work/topics-source --output-dir work/topics-new
```

Review `work/topics-new/candidates.json`, then update the reviewed labels and their hashes. Export with `python3 experiments/poster-topics/export.py --input-dir work/topics-new`. Commit the generator changes, updated input snapshot, reviewed labels, report and metrics, and `experiments/poster-topics/assignments.json` together. Do not replace the input snapshot or label hashes merely to bypass a failed check. The input snapshot is gzip-compressed UTF-8 JSON; `compare.py` writes its uncompressed equivalent to the output directory as `corpus.json`.

TF-IDF uses globally fitted IDF, unigram/bigram features, sublinear term frequency, `min_df=3`, and `max_df=.4`, with English and generic NLP stopwords removed. Its input repeats the title twice, followed by the abstract. LSA uses the same matrix and a fixed SVD seed. Clustering itself always uses only members of the selected physical session.

The embedding input is title once, then abstract, with the pinned [all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2) revision in `compare.py`. It uses the model's 256-wordpiece limit: **1,681 of 2,831 inputs were truncated**. It is a small general-purpose English model, not a model trained specifically for scientific-paper similarity. Both truncation and domain mismatch could affect grouping. Model inference used CPU, with normalized 384-dimensional vectors. HTML is removed from abstracts; source titles are retained separately for exact map-assignment checks.

The implementation follows established [Sentence Transformers clustering](https://www.sbert.net/examples/sentence_transformer/applications/clustering/README.html) and [scikit-learn text clustering](https://scikit-learn.org/stable/auto_examples/text/plot_document_clustering.html) patterns. Keywords are contrastive TF-IDF terms used for inspection and naming, not a second classifier. The exported margin is the cosine similarity to the assigned centroid minus the highest similarity to another centroid. It can be negative because KMeans assigns by Euclidean distance to unnormalized centroids; normalizing centroids for cosine comparison can change a few boundary cases. Margins order the browsing list, not the cluster memberships. Paper assignments use local model inference without an external embedding API.

## Validation

All 59 Python and 105 Node tests pass. They cover session/board identity, stale title or paper mismatches, invalid topic data, group counts, exact coverage, exclusion of conflicting boards, packaging of the static dataset, the committed input snapshot, and refusal to overwrite reviewed groups with changed memberships. Before the UI review, a complete rerun from the committed corpus with newly computed embeddings reproduced the generated dataset, group examples, and metrics byte for byte on the original machine. The subsequent signed-margin correction reran the comparison and preserved all 2,831 cluster memberships. Browser checks cover all seven sessions (12 groups each), highlighting, switching sessions, toggle-off behaviour, paper-list navigation, and saved markers. With the topic JSON deliberately unavailable, all 424 boards and the session's handbook assignments remained usable and the topic toggle was disabled. Light/dark appearance and a 390-pixel iframe viewport were checked; this is not a physical-device test.

The layer remains opt-in and approximate. A broader relevance evaluation is needed before treating these assignments as a reliable topic taxonomy. A useful next comparison would be a scientific-document embedding model or overlapping topic assignments, evaluated against a small independently annotated sample rather than silhouette alone.
