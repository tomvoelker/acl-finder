"""Shared loading and scoring helpers for the paper-matcher experiment."""

import gzip
import json
from pathlib import Path

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / "work/paper-matcher"
HERE = Path(__file__).resolve().parent


def unit(x):
    return x / np.linalg.norm(x, axis=-1, keepdims=True)


class Programme:
    """Committed SPECTER2 vectors joined with the built schedule (run scripts/build.py first)."""

    def __init__(self):
        self.meta = json.loads((ROOT / "data/embeddings/specter2.json").read_text())
        raw = (ROOT / "data/embeddings/specter2.f32").read_bytes()
        self.V = np.frombuffer(raw, dtype="<f4").reshape(self.meta["count"], -1).astype("f8")
        built = {p["id"]: p for p in json.loads((ROOT / "_site/data/papers.json").read_text())["papers"]}
        self.entries = [built[paper_id] for paper_id, _, _ in self.meta["papers"]]
        self.active = np.array([e.get("status") == "scheduled" for e in self.entries])
        self.mean = self.V[self.active].mean(0)
        abstracts = json.loads(gzip.decompress((ROOT / "data/embeddings/abstracts.json.gz").read_bytes()))["papers"]
        self.texts = [(abstracts[aid]["title"] + " " + abstracts[aid]["abstract"]) if aid else e["title"]
                      for e, (_, aid, _) in zip(self.entries, self.meta["papers"])]
        self.tfidf = TfidfVectorizer(sublinear_tf=True, stop_words="english", ngram_range=(1, 2), min_df=2, max_df=0.5)
        self.X = self.tfidf.fit_transform(self.texts)

    def centered(self, vectors=None):
        return unit((self.V if vectors is None else vectors) - self.mean)

    def ranks(self, score):
        """1-based rank of every entry among active entries (inactive entries rank last)."""
        s = np.where(self.active, score, -np.inf)
        order = np.argsort(-s, kind="stable")
        rank = np.empty(len(s), int)
        rank[order] = np.arange(1, len(s) + 1)
        return rank

    def lexical(self, profile_texts):
        query = self.tfidf.transform([" ".join(profile_texts)])
        return (self.X @ query.T).toarray().ravel(), query

    def hybrid(self, embedding_score, lexical_score, k=60):
        """Reciprocal rank fusion of the two signals."""
        return 1 / (k + self.ranks(embedding_score)) + 1 / (k + self.ranks(lexical_score))


def recency_centroid(P, years, half_life=2, reference=2026):
    weights = 0.5 ** ((reference - np.asarray(years, float)) / half_life)
    return unit((P * weights[:, None]).sum(0))
