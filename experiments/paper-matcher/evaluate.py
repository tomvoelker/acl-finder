"""Score profile and ranking variants on the self-retrieval benchmark; writes results.json.
    python experiments/paper-matcher/evaluate.py
"""

import json

import numpy as np

from common import HERE, WORK, Programme, recency_centroid, unit

programme = Programme()
benchmark = json.loads((HERE / "benchmark.json").read_text())
prior = json.loads((WORK / "prior.json").read_text())
order = json.loads((WORK / "prior-order.json").read_text())
PV = np.frombuffer((WORK / "prior.f32").read_bytes(), dtype="<f4").reshape(len(order), -1).astype("f8")
row_of_prior = {paper: i for i, paper in enumerate(order)}
row_of_entry = {e["id"]: i for i, e in enumerate(programme.entries)}
authors = benchmark["authors"]
Vc = programme.centered()
Vr = unit(programme.V)


def embedding(space, how, half_life=None):
    V = Vc if space == "centered" else Vr
    def score(author):
        P = PV[[row_of_prior[p] for p in author["prior"]]]
        P = programme.centered(P) if space == "centered" else unit(P)
        if how == "centroid":
            years = [prior[p]["year"] for p in author["prior"]]
            return V @ (recency_centroid(P, years, half_life) if half_life else unit(P.mean(0)))
        S = V @ P.T
        if how == "max":
            return S.max(1)
        if how == "top3":
            return np.sort(S, 1)[:, -3:].mean(1)
        if how == "lse":
            return 0.05 * np.log(np.exp((S - S.max()) / 0.05).mean(1)) + S.max()
    return score


def lexical(author):
    return programme.lexical([prior[p]["title"] + " " + prior[p]["abstract"] for p in author["prior"]])[0]


recency = embedding("centered", "centroid", 2)
VARIANTS = {
    "embedding, raw centroid": embedding("raw", "centroid"),
    "embedding, raw max": embedding("raw", "max"),
    "embedding, centered centroid": embedding("centered", "centroid"),
    "embedding, centered max": embedding("centered", "max"),
    "embedding, centered top-3 mean": embedding("centered", "top3"),
    "embedding, centered log-sum-exp": embedding("centered", "lse"),
    "embedding, centered recency centroid": recency,
    "TF-IDF": lexical,
    "hybrid (recency centroid + TF-IDF, RRF)": lambda a: programme.hybrid(recency(a), lexical(a)),
    **{f"hybrid, TF-IDF gated to embedding top {g:.0%}": (lambda g: lambda a: programme.hybrid(recency(a), lexical(a), gate=g))(g)
       for g in (0.05, 0.1, 0.2, 0.3)},
}

rng = np.random.default_rng(0)
resample = rng.integers(0, len(authors), (1000, len(authors)))
results = {}
for name, scorer in VARIANTS.items():
    rr, r10, r50, med, first_rr, first_r50 = [], [], [], [], [], []
    for author in authors:
        rows = [row_of_entry[t] for t in author["targets"]]
        r = programme.ranks(scorer(author))[rows]
        rr.append(np.mean(1 / r)); r10.append(np.mean(r <= 10)); r50.append(np.mean(r <= 50)); med.append(np.median(r))
        first = [rank for rank, row in zip(r, rows) if (programme.entries[row].get("authors") or [""])[0].casefold() == author["name"]]
        if first:
            first_rr.append(np.mean(1 / np.array(first))); first_r50.append(np.mean(np.array(first) <= 50))
    rr = np.array(rr)
    low, high = np.percentile(rr[resample].mean(1), [2.5, 97.5])
    results[name] = {"mrr": round(rr.mean(), 4), "mrrCI95": [round(low, 4), round(high, 4)], "recall@10": round(np.mean(r10), 4),
                     "recall@50": round(np.mean(r50), 4), "medianRank": float(np.median(med)),
                     "firstAuthor": {"authors": len(first_rr), "mrr": round(np.mean(first_rr), 4), "recall@50": round(np.mean(first_r50), 4)}}
    m = results[name]
    print(f"{name:42} MRR {m['mrr']:.3f} [{low:.3f}–{high:.3f}]  R@10 {m['recall@10']:.3f}  R@50 {m['recall@50']:.3f}  "
          f"median {m['medianRank']:.0f}  | first author (n={len(first_rr)}) MRR {m['firstAuthor']['mrr']:.3f} R@50 {m['firstAuthor']['recall@50']:.3f}", flush=True)

summary = {"authors": len(authors), "targets": sum(len(a["targets"]) for a in authors),
           "candidates": int(programme.active.sum()), "variants": results}
(HERE / "results.json").write_text(json.dumps(summary, indent=1) + "\n")
