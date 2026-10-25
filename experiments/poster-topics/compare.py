"""Compare session-local text clusters; all expensive work stays outside the browser."""

import argparse
from collections import Counter
import gzip
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys

import numpy as np
from sklearn.cluster import KMeans
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS, TfidfVectorizer
from sklearn.metrics import adjusted_rand_score, silhouette_score
from sklearn.preprocessing import normalize

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from import_anthology import match_papers
from import_underline import match_presentations

MODEL = 'sentence-transformers/all-MiniLM-L6-v2'
MODEL_REVISION = 'c9745ed1d9f207416be6d2e6f8de32d1f16199bf'
STOP = sorted(set(ENGLISH_STOP_WORDS) | set('language languages model models large llm llms paper propose proposed approach method methods framework using based results performance task tasks new novel study work demonstrate experiments existing show different across benchmark benchmarks evaluation evaluate state art learning data dataset datasets training'.split()))


class PlainText(HTMLParser):
    def __init__(self):
        super().__init__(); self.parts = []

    def handle_data(self, data):
        self.parts.append(data)


def clean(text):
    parser = PlainText(); parser.feed(text or '')
    return re.sub(r'\s+', ' ', ' '.join(parser.parts)).strip()


def read(name):
    return json.loads((ROOT / 'data' / name).read_text(encoding='utf-8'))


def corpus(source):
    handbook = read('poster-boards.json')
    papers = read('papers.json')['papers']
    anthology = read('anthology-catalog.json')
    links, _ = match_papers(papers, anthology, read('anthology-overrides.json'))
    publications = {p['id']: p for p in anthology['papers']}
    titles = {pid: publications[aid]['title'] for pid, aid in links.items()}
    presentations, _ = match_presentations(papers, read('underline-catalog.json'), titles, read('underline-overrides.json'))
    raw = {}
    first = json.loads((source / 'underline-api-page-1.json').read_text(encoding='utf-8'))
    for number in range(1, first['meta']['total_pages'] + 1):
        page = first if number == 1 else json.loads((source / f'underline-api-page-{number}.json').read_text(encoding='utf-8'))
        for row in page['data']:
            if str(row['id']) in raw:
                raise ValueError(f"Duplicate Underline record: {row['id']}. Fetch a consistent snapshot.")
            raw[str(row['id'])] = row['attributes']
    if not raw:
        raise ValueError('No saved Underline responses found')
    physical = {}
    aliases = {}
    for s in handbook['sessions']:
        slot = (s['date'], s['start'], s['end'], s['room'])
        aliases[s['id']] = physical.setdefault(slot, s['id'])
    counts = Counter((aliases[e['session']], e['board']) for e in handbook['entries'])
    rows = []
    for e in handbook['entries']:
        session = aliases[e['session']]
        if not e['verified'] or counts[session, e['board']] != 1:
            continue
        link = presentations.get(e['paperId'], {}).get('underlineUrl', '')
        match = re.search(r'/lecture/(\d+)', link)
        abstract = clean(raw.get(match[1], {}).get('abstract')) if match else ''
        rows.append(dict(session=session, board=e['board'], paperId=e['paperId'],
                         title=clean(e['title']), sourceTitle=e['title'], abstract=abstract))
    return sorted(rows, key=lambda r: (r['session'], r['board']))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group()
    source.add_argument('--source-dir', type=Path, help='Prepare a new corpus from saved Underline API pages')
    source.add_argument('--corpus-file', type=Path, default=Path(__file__).parent / 'corpus.json.gz', help='Compressed input corpus; defaults to the committed snapshot')
    parser.add_argument('--output-dir', type=Path, default=ROOT / 'work/topics')
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    rows = corpus(args.source_dir) if args.source_dir else json.loads(gzip.decompress(args.corpus_file.read_bytes()))
    fingerprint = hashlib.sha256(json.dumps(rows, sort_keys=True).encode()).hexdigest()
    texts = [f"{r['title']}. {r['title']}. {r['abstract']}" for r in rows]
    vectorizer = TfidfVectorizer(stop_words=STOP, ngram_range=(1, 2), min_df=3, max_df=.4, sublinear_tf=True)
    tfidf = vectorizer.fit_transform(texts)
    lsa = normalize(TruncatedSVD(n_components=100, random_state=0).fit_transform(tfidf))
    embedding_key = hashlib.sha256(f'{fingerprint}:{MODEL}:{MODEL_REVISION}:title-abstract:256:normalized'.encode()).hexdigest()[:16]
    cache = args.output_dir / f'embeddings-{embedding_key}.npy'
    if cache.exists():
        embeddings = np.load(cache)
    else:
        from sentence_transformers import SentenceTransformer
        model = SentenceTransformer(MODEL, revision=MODEL_REVISION, device='cpu')
        model.max_seq_length = 256
        embeddings = model.encode([f"{r['title']}. {r['abstract']}" for r in rows], normalize_embeddings=True,
                                  show_progress_bar=True, batch_size=64)
        np.save(cache, embeddings)
    terms = np.array(vectorizer.get_feature_names_out())
    metrics, candidates = [], {}
    sessions = sorted({r['session'] for r in rows})
    for method, matrix in [('tfidf', tfidf), ('lsa', lsa), ('embeddings', embeddings)]:
        for session in sessions:
            indexes = np.array([i for i, r in enumerate(rows) if r['session'] == session])
            x = matrix[indexes]
            for k in [8, 12, 16]:
                fits = [KMeans(n_clusters=k, random_state=seed, n_init=10).fit(x) for seed in [0, 1, 2]]
                fit = fits[0]
                labels = fit.labels_
                centers = normalize(fit.cluster_centers_)
                similarities = np.asarray(x @ centers.T)
                sorted_sim = np.sort(similarities, axis=1)
                margins = sorted_sim[:, -1] - sorted_sim[:, -2]
                sizes = np.bincount(labels, minlength=k)
                metric = dict(method=method, session=session, k=k, papers=len(indexes),
                              silhouette=round(float(silhouette_score(x, labels, metric='cosine')), 4),
                              stabilityARI=round(float(np.mean([adjusted_rand_score(fits[a].labels_, fits[b].labels_) for a,b in [(0,1),(0,2),(1,2)]])), 4),
                              minSize=int(sizes.min()), maxSize=int(sizes.max()),
                              medianMargin=round(float(np.median(margins)), 4))
                metrics.append(metric)
                groups = []
                for group in range(k):
                    members = np.where(labels == group)[0]
                    # Contrastive TF-IDF terms explain clusters without using an LLM to assign papers.
                    inside = np.asarray(tfidf[indexes[members]].mean(axis=0)).ravel()
                    outside = np.asarray(tfidf[indexes[labels != group]].mean(axis=0)).ravel()
                    weights = inside * np.log1p(inside / (outside + .002))
                    keywords = []
                    for term in terms[np.argsort(-weights)]:
                        if any(set(term.split()) <= set(t.split()) or set(t.split()) <= set(term.split()) for t in keywords):
                            continue
                        keywords.append(str(term))
                        if len(keywords) == 8: break
                    ordered = members[np.argsort(-similarities[members, group])]
                    borderline = members[np.argsort(margins[members])[:3]]
                    groups.append(dict(id=group, keywords=keywords, count=len(members),
                                       examples=[rows[indexes[i]]['title'] for i in ordered[:8]],
                                       borderline=[rows[indexes[i]]['title'] for i in borderline]))
                candidates[f'{method}-{session}-{k}'] = dict(groups=groups, assignments=[dict(board=rows[i]['board'],
                    paperId=rows[i]['paperId'], title=rows[i]['sourceTitle'], group=int(labels[j]),
                    margin=round(float(margins[j]), 4)) for j, i in enumerate(indexes)])
                print(json.dumps(metric), flush=True)
    (args.output_dir / 'candidates.json').write_text(json.dumps(candidates, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    report = dict(corpusSHA256=fingerprint, handbookSHA256=hashlib.sha256((ROOT/'data/poster-boards.json').read_bytes()).hexdigest(),
                  model=MODEL, modelRevision=MODEL_REVISION, papers=len(rows), withAbstract=sum(bool(r['abstract']) for r in rows), metrics=metrics)
    (args.output_dir / 'metrics.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    (args.output_dir / 'corpus.json').write_text(json.dumps(rows, ensure_ascii=False) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
