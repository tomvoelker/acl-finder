# Paper matcher experiment

**Offline experiment; the website is unchanged.** It asks how well the committed [SPECTER2 vectors](../../data/embeddings/README.md) recommend programme entries to a researcher, given their earlier papers.

## Reproducing Semantic Scholar's vectors

`check_specter2_config.py` embeds 12 reference papers with Semantic Scholar's own title and abstract under every combination of base model (original, Aug 2023 refresh), adapter (none, proximity, ad-hoc query, classification, regression), input format and pooling. Only `specter2_base` + proximity adapter + `title [SEP] abstract` + first-token output reproduces `specter_v2` (minimum cosine 1.000000, maximum absolute difference 2.6 × 10⁻⁶). Omitting `[SEP]` gives 0.9986; no adapter 0.963; the refresh model 0.947. Profile vectors fetched from Semantic Scholar and programme vectors computed here therefore share one space.

## Self-retrieval benchmark

Semantic Scholar had not indexed EMNLP 2026 on 27 October 2026, and we have no relevance judgements yet. As a proxy, `build_benchmark.py` samples 400 programme authors (seed 0) with 3–40 earlier Anthology papers that have abstracts. Each profile contains their papers up to 2025; the targets are their own scheduled EMNLP 2026 entries, which the profile never contains. A good matcher should rank those entries high among all 4,340 scheduled entries. Authors are joined by exact name between the BibTeX and the Anthology pages, so some profiles merge namesakes.

`evaluate.py` reports mean reciprocal rank per author (95% bootstrap interval over authors), recall at 10 and 50, the median of authors' median target rank, and the subset where the author is the target's first author. From [`results.json`](results.json), 400 authors and 703 targets:

| Variant | MRR [95% CI] | R@10 | R@50 | Median rank | First-author R@50 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Embedding, raw centroid | 0.037 [0.024–0.052] | 0.065 | 0.117 | 1,240 | 0.150 |
| Embedding, raw max | 0.058 [0.041–0.075] | 0.090 | 0.144 | 1,000 | 0.140 |
| Embedding, centered centroid | 0.050 [0.033–0.069] | 0.071 | 0.144 | 1,308 | 0.167 |
| Embedding, centered max | 0.050 [0.035–0.066] | 0.087 | 0.170 | 1,042 | 0.183 |
| Embedding, centered top-3 mean | 0.052 [0.035–0.069] | 0.088 | 0.172 | 1,139 | 0.199 |
| Embedding, centered log-sum-exp | 0.051 [0.036–0.067] | 0.096 | 0.174 | 1,038 | 0.183 |
| Embedding, centered recency centroid (half-life 2 years) | 0.058 [0.040–0.076] | 0.096 | 0.163 | 1,188 | 0.167 |
| TF-IDF, word and bigram | **0.084** [0.063–0.106] | **0.125** | 0.192 | 918 | **0.232** |
| Hybrid: recency centroid + TF-IDF, reciprocal rank fusion | 0.075 [0.055–0.095] | 0.116 | **0.203** | **848** | **0.232** |

- Embedding variants are within noise of one another. Centering (subtracting the programme mean) matters for interpretable scores: raw cosines to any profile cluster around 0.92, centered ones around 0.
- TF-IDF retrieves an author's own new paper better than embeddings. Authors reuse their terminology, datasets and model names, so this proxy favours lexical overlap; it does not show that TF-IDF finds better papers by others.
- The hybrid is the most robust: best recall at 50 and best median rank.
- Absolute numbers are low. Name collisions, middle-author papers and topic changes all lower self-retrieval; it bounds, rather than estimates, recommendation quality. Judgements from real researchers remain necessary.

## Prototype recommender

`recommend.py` takes Semantic Scholar author IDs. It drops proceedings volumes and older near-duplicates (cosine ≥ 0.95, e.g. preprint and published versions) from the profile, scores the hybrid above, and lists three picks per poster session and for orals, diversified by maximal marginal relevance (λ = 0.7). Each pick names the closest own paper and the top shared TF-IDF terms. For one author, their own EMNLP 2026 paper, absent from the profile, ranked 6th of 4,340.

Known weaknesses from inspecting two profiles: lexical false friends (literary *characters* vs. script *characters*); generic shared terms such as “approach”, “f1 score” or years in explanations; and weak third picks where diversity outweighs relevance. Candidate fixes are an embedding gate before lexical fusion, a research-term stoplist with an IDF floor, and a relevance floor for MMR.

## Reproduce

The site build stays dependency-free; these scripts need Python 3.12 and the pinned packages. Run `python3 scripts/build.py` first, because they read `_site/data/papers.json`.

```sh
uv venv --python 3.12 work/matcher-venv
uv pip install --python work/matcher-venv/bin/python -r experiments/paper-matcher/requirements.txt
work/matcher-venv/bin/python experiments/paper-matcher/check_specter2_config.py
work/matcher-venv/bin/python experiments/paper-matcher/build_benchmark.py --fetch
work/matcher-venv/bin/python experiments/paper-matcher/evaluate.py
work/matcher-venv/bin/python experiments/paper-matcher/recommend.py <semantic scholar author id>
```

`benchmark.json` records the sampled authors, their profile Anthology IDs, target schedule IDs and the SHA-256 of the BibTeX used (retrieved 27 October 2026). The Anthology updates that file regularly; a newer download can change the sample. Profile embeddings, the BibTeX and Semantic Scholar responses stay in ignored `work/paper-matcher/`. Anonymous Semantic Scholar requests are rate-limited; `s2.py` backs off and retries.
