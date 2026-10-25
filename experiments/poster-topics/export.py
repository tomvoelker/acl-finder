"""Export the reviewed 12-group MiniLM experiment as a static map dataset."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / 'work/topics'
metrics = json.loads((WORK / 'metrics.json').read_text())
assert metrics['handbookSHA256'] == hashlib.sha256((ROOT/'data/poster-boards.json').read_bytes()).hexdigest(), 'Handbook changed: rerun compare.py'
labels = json.loads((Path(__file__).parent / 'labels.json').read_text())
assert labels['corpusSHA256'] == metrics['corpusSHA256'], 'Corpus changed: review labels before exporting'
candidates = json.loads((WORK / 'candidates.json').read_text())
data = {key: metrics[key] for key in ['handbookSHA256', 'corpusSHA256', 'model', 'modelRevision']}
data.update(version=1, method='MiniLM title + abstract embeddings; session-local KMeans, k=12, seed=0, n_init=10', sessions={})
review = []
for session, names in labels['sessions'].items():
    candidate = candidates[f'embeddings-{session}-12']
    assert len(names) == len(candidate['groups']) == 12
    groups = [{**g, 'label': names[g['id']]} for g in candidate['groups']]
    data['sessions'][session] = dict(groups=[{k:g[k] for k in ['id', 'label', 'keywords']} for g in groups],
                                     assignments=[{k:a[k] for k in ['board','paperId','title','group']} for a in candidate['assignments']])
    review.append(f'## Session {session}\n')
    for g in groups:
        review.append(f"### {g['label']} ({g['count']})\n\nTerms: {', '.join(g['keywords'])}\n")
        review.append('Closest to the centroid:\n\n' + '\n'.join(f'- {t}' for t in g['examples'][:4]) + '\n')
        review.append('Smallest assignment margins (often ambiguous):\n\n' + '\n'.join(f'- {t}' for t in g['borderline']) + '\n')
(ROOT / 'data/poster-topics.json').write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
(Path(__file__).parent / 'metrics.json').write_text(json.dumps(metrics, indent=2) + '\n')
(Path(__file__).parent / 'groups.md').write_text('# Poster topic inspection\n\nAutomatically selected examples, with manually reviewed group labels. These are inferred groups, not acceptance tracks.\n\n' + '\n'.join(review))
print(f"Exported {sum(len(s['assignments']) for s in data['sessions'].values())} poster assignments")
