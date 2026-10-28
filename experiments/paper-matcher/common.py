"""Shared loading and scoring helpers for the paper-matcher experiment."""

import gzip
import json
from pathlib import Path

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / "work/paper-matcher"
HERE = Path(__file__).resolve().parent
# Research boilerplate that TF-IDF still weights highly but that explains nothing.
GENERIC_TERMS = set("""
approach approaches method methods model models paper task tasks based using use used new novel propose proposed
results result performance study studies work works framework existing previous prior show shows demonstrate
significant significantly improve improves improved improvement improvements state art state art developed develop
f1 score f1 score accuracy evaluate evaluation experiments experimental analysis effective efficient higher lower
large small high low better best general specific various different multiple single valuable source custom
""".split()) | {"state art", "f1 score", "large language", "language models", "language model", "large language models"}


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
        self.vocabulary = np.array(self.tfidf.get_feature_names_out())
        self.document_frequency = np.asarray((self.X > 0).mean(0)).ravel()
        self.uninformative = np.array([t.isdigit() or any(w in GENERIC_TERMS for w in [t, *t.split()]) for t in self.vocabulary])

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

    def hybrid(self, embedding_score, lexical_score, k=60, gate=None):
        """Reciprocal rank fusion of the two signals. With a gate, the lexical signal only counts
        for entries within that fraction of active entries by embedding rank (no false friends)."""
        embedding_rank = self.ranks(embedding_score)
        lexical = 1 / (k + self.ranks(lexical_score))
        if gate is not None:
            lexical = np.where(embedding_rank <= gate * self.active.sum(), lexical, 0)
        return 1 / (k + embedding_rank) + lexical

    def shared_terms(self, i, query, n=3, max_document_frequency=None, min_relative=0.0):
        """Terms contributing most to the lexical match. Optionally drop boilerplate and terms in more than
        max_document_frequency of the programme, and terms contributing less than min_relative of the best."""
        contribution = self.X[i].multiply(query).toarray().ravel()
        if max_document_frequency is not None:
            keep = (self.document_frequency <= max_document_frequency) & ~self.uninformative
            contribution = np.where(keep, contribution, 0)
        top = np.argsort(-contribution)[:n]
        return [self.vocabulary[t] for t in top if contribution[t] > 0 and contribution[t] >= min_relative * contribution[top[0]]]


def recency_centroid(P, years, half_life=2, reference=2026):
    weights = 0.5 ** ((reference - np.asarray(years, float)) / half_life)
    return unit((P * weights[:, None]).sum(0))
