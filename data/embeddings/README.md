# SPECTER2 paper embeddings

**Not used by the website yet.** The build does not copy these files into `_site/`.

`specter2.f32` holds one 768-dimensional vector per programme entry in `data/papers.json`: raw little-endian float32, row-major, in the order listed by `specter2.json`. Load it in the browser with `new Float32Array(await response.arrayBuffer())`, or in Python with `numpy.fromfile(path, "<f4").reshape(-1, 768)`.

The vectors use the configuration behind Semantic Scholar's `specter_v2` field: [`allenai/specter2_base`](https://huggingface.co/allenai/specter2_base) with the [`allenai/specter2`](https://huggingface.co/allenai/specter2) proximity adapter, input `title + [SEP] + abstract`, 512-token truncation and the first-token output. On 12 reference papers with Semantic Scholar's own title and abstract, this reproduced its vectors to a maximum absolute difference of 2.6 × 10⁻⁶ (cosine 1.000000). Without the adapter, cosine was 0.963; with the August 2023 refresh model, 0.947. For 14 TACL and CL papers in this programme that Semantic Scholar had indexed on 27 October 2026, the committed vectors match its `specter_v2` vectors at cosine ≥ 0.99988 (11 at 1.000000), despite small text differences between the sources. It had not yet indexed the EMNLP 2026 volumes. Vectors computed here can therefore be compared directly with Semantic Scholar vectors of other papers, for example a reader's own publications.

## Files

- `abstracts.json.gz`: titles and abstracts for all 5,787 catalogued Anthology papers, taken from the [acl-anthology](https://github.com/acl-org/acl-anthology) XML at the revision and file hashes recorded inside. Inline markup is flattened to text; TeX inside `<tex-math>` stays as written. Anthology metadata is licensed CC BY 4.0.
- `specter2.f32`: the vectors.
- `specter2.json`: model and adapter revisions, input description, library versions, SHA-256 hashes of the vectors, the abstract snapshot and the exact input texts, and one `[schedule ID, Anthology ID, has abstract]` row per vector.

Entries with a verified Anthology match use its title and abstract. The 19 entries without a match use their schedule title with an empty abstract, as does the one matched paper without an Anthology abstract.

## Reproduce

The site build stays dependency-free. Embedding needs the pinned packages in an isolated Python 3.12 environment:

```sh
python3 scripts/import_abstracts.py --fetch
uv venv --python 3.12 work/embeddings-venv
uv pip install --python work/embeddings-venv/bin/python -r scripts/requirements-embeddings.txt
work/embeddings-venv/bin/python scripts/embed_specter2.py
```

`--fetch` resolves the current acl-anthology revision and keeps the downloaded XML in ignored `work/anthology-xml/`. To rebuild the snapshot offline, pass `--source-dir work/anthology-xml/<revision> --revision <revision>`. The reference vectors were computed on CPU; `--device mps` is faster but may differ in the last digits. Rerun the embedding after schedule changes that add papers or change Anthology matches. `tests/test_embeddings.py` checks the vectors against their metadata, but not against the current schedule.
