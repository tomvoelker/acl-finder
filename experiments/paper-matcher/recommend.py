"""Prototype: per-session recommendations for Semantic Scholar authors, with explanations.
    python experiments/paper-matcher/recommend.py <author id> [<author id> ...]

Profile: the author's Semantic Scholar papers with specter_v2 vectors, without proceedings volumes
and older near-duplicates. Score: hybrid of the centered recency-weighted SPECTER2 centroid and
TF-IDF, fused by reciprocal rank. Each session lists three picks, diversified by MMR.
"""

import json
import sys
import time
from collections import defaultdict

import numpy as np

from common import WORK, Programme, recency_centroid
from s2 import get


def profile(programme, author_id):
    cache = WORK / "s2" / f"{author_id}.json"
    if not cache.exists():
        cache.parent.mkdir(parents=True, exist_ok=True)
        ids = [p["paperId"] for p in get(f"author/{author_id}/papers", {"fields": "title", "limit": 500})["data"]]
        time.sleep(2)
        cache.write_text(json.dumps(get("paper/batch", {"fields": "title,abstract,year,embedding.specter_v2"}, {"ids": ids})))
    papers = [p for p in json.loads(cache.read_text()) if p and (p.get("embedding") or {}).get("vector")]
    papers = sorted((p for p in papers if not p["title"].lower().startswith("proceedings")), key=lambda p: -(p.get("year") or 0))
    P = programme.centered(np.array([p["embedding"]["vector"] for p in papers], dtype="f8"))
    keep = []
    for i in range(len(papers)):  # newest first, so preprints of published papers are dropped
        if all(P[i] @ P[j] < 0.95 for j in keep):
            keep.append(i)
    return [papers[i] for i in keep], P[keep]


def main():
    programme = Programme()
    Vc = programme.centered()
    vocabulary = np.array(programme.tfidf.get_feature_names_out())
    for author_id in sys.argv[1:]:
        own, P = profile(programme, author_id)
        embedding = Vc @ recency_centroid(P, [p.get("year") or 2020 for p in own])
        lexical, query = programme.lexical([p["title"] + " " + (p.get("abstract") or "") for p in own])
        score = np.where(programme.active, programme.hybrid(embedding, lexical), -np.inf)
        print(f"\n#### Semantic Scholar author {author_id}: {len(own)} profile papers")
        sessions = defaultdict(list)
        for i in np.argsort(-score)[:1500]:
            e = programme.entries[i]
            group = f"Poster {e['posterSession']}" if e.get("posterSession") else ("Oral" if e.get("presentation") == "Oral" else None)
            if programme.active[i] and group:
                sessions[group].append(i)
        for group in sorted(sessions):
            candidates, picked = sessions[group][:30], []
            relevance = {i: score[i] / score[candidates[0]] for i in candidates}
            while len(picked) < 3 and candidates:
                i = max(candidates, key=lambda c: 0.7 * relevance[c] - 0.3 * max((Vc[c] @ Vc[p] for p in picked), default=0))
                picked.append(i)
                candidates.remove(i)
            print(f"  — {group}")
            for i in picked:
                e = programme.entries[i]
                closest = own[int((P @ Vc[i]).argmax())]["title"]
                terms = vocabulary[np.argsort(-programme.X[i].multiply(query).toarray().ravel())[:3]]
                where = f"board {e['posterBoard']}" if e.get("posterBoard") else e.get("session") or ""
                print(f"     {e['title'][:80]} ({where})\n        closest own paper: {closest[:60]} · shared terms: {', '.join(terms)}")


if __name__ == "__main__":
    main()
