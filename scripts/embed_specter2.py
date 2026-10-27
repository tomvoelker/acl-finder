"""Embed every programme entry with SPECTER2, as Semantic Scholar does.

Requires the pinned packages in scripts/requirements-embeddings.txt; the site build does not.
    python scripts/embed_specter2.py [--device cpu|mps]

Input per entry: verified Anthology title + [SEP] + abstract from data/embeddings/abstracts.json.gz,
or the schedule title alone without a verified Anthology match. specter2_base with the proximity
adapter, 512-token truncation, first-token output, float32. This reproduces Semantic Scholar's
specter_v2 vectors for the same title and abstract.
"""

import argparse
import gzip
import hashlib
import json
from pathlib import Path

import numpy as np
import torch
from adapters import AutoAdapterModel
from huggingface_hub import HfApi
from transformers import AutoTokenizer

from import_anthology import match_papers

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data/embeddings"
BASE, ADAPTER = "allenai/specter2_base", "allenai/specter2"


def inputs():
    papers = json.loads((ROOT / "data/papers.json").read_text())["papers"]
    catalog = json.loads((ROOT / "data/anthology-catalog.json").read_text())
    overrides = json.loads((ROOT / "data/anthology-overrides.json").read_text())
    links, _ = match_papers(papers, catalog, overrides)
    abstracts_raw = (OUTPUT / "abstracts.json.gz").read_bytes()
    abstracts = json.loads(gzip.decompress(abstracts_raw))["papers"]
    rows = []
    for paper in papers:
        anthology_id = links.get(paper["id"])
        source = abstracts[anthology_id] if anthology_id else {"title": paper["title"], "abstract": ""}
        rows.append({"id": paper["id"], "anthologyId": anthology_id, **source})
    return rows, hashlib.sha256(abstracts_raw).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--device", default="cpu", help="torch device; cpu is the reference")
    parser.add_argument("--batch-size", type=int, default=16)
    args = parser.parse_args()
    rows, abstracts_hash = inputs()

    revisions = {repo: HfApi().model_info(repo).sha for repo in (BASE, ADAPTER)}
    tokenizer = AutoTokenizer.from_pretrained(BASE, revision=revisions[BASE])
    model = AutoAdapterModel.from_pretrained(BASE, revision=revisions[BASE])
    model.load_adapter(ADAPTER, source="hf", load_as="proximity", set_active=True)
    model.to(args.device).eval()

    texts = [row["title"] + tokenizer.sep_token + row["abstract"] for row in rows]
    vectors = np.zeros((len(texts), model.config.hidden_size), dtype="<f4")
    order = sorted(range(len(texts)), key=lambda i: len(texts[i]))  # batch similar lengths together
    with torch.no_grad():
        for start in range(0, len(order), args.batch_size):
            batch = order[start:start + args.batch_size]
            encoded = tokenizer([texts[i] for i in batch], padding=True, truncation=True, max_length=512,
                                return_tensors="pt", return_token_type_ids=False).to(args.device)
            vectors[batch] = model(**encoded).last_hidden_state[:, 0, :].float().cpu().numpy()
            print(f"\r{min(start + args.batch_size, len(order)):,}/{len(order):,}", end="", flush=True)
    print()

    data = vectors.tobytes()
    (OUTPUT / "specter2.f32").write_bytes(data)
    metadata = {
        "model": BASE, "adapter": ADAPTER, "revisions": revisions,
        "input": "title + [SEP] + abstract; 512-token truncation; first-token output",
        "dtype": "float32", "byteOrder": "little", "dimensions": vectors.shape[1], "count": vectors.shape[0],
        "sha256": hashlib.sha256(data).hexdigest(), "abstractsSha256": abstracts_hash,
        "inputsSha256": hashlib.sha256("\n".join(texts).encode()).hexdigest(),
        "device": args.device, "versions": {"torch": torch.__version__, "transformers": __import__("transformers").__version__,
                                            "adapters": __import__("adapters").__version__},
        "papers": [[row["id"], row["anthologyId"], bool(row["abstract"])] for row in rows],
    }
    (OUTPUT / "specter2.json").write_text(json.dumps(metadata, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"Wrote {vectors.shape[0]:,} × {vectors.shape[1]} float32 vectors ({len(data) / 1e6:.1f} MB); "
          f"{sum(not row['abstract'] for row in rows)} entries without an abstract.")


if __name__ == "__main__":
    main()
