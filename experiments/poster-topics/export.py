"""Export the reviewed 12-group MiniLM experiment as a static map dataset."""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def export(input_dir, root=ROOT):
    metrics = json.loads((input_dir / 'metrics.json').read_text(encoding='utf-8'))
    if metrics['handbookSHA256'] != hashlib.sha256((root/'data/poster-boards.json').read_bytes()).hexdigest():
        raise ValueError('Handbook changed: rerun compare.py')
    labels = json.loads((root / 'experiments/poster-topics' / 'labels.json').read_text(encoding='utf-8'))
    if labels['corpusSHA256'] != metrics['corpusSHA256']:
        raise ValueError('Corpus changed: review labels before exporting')
    candidates = json.loads((input_dir / 'candidates.json').read_text(encoding='utf-8'))
    assignments = {session: [{k:a[k] for k in ['board','paperId','title','group']} for a in candidates[f'embeddings-{session}-12']['assignments']]
                   for session in labels['sessions']}
    assignment_hash = hashlib.sha256(json.dumps(assignments, sort_keys=True).encode()).hexdigest()
    if labels['assignmentsSHA256'] != assignment_hash:
        raise ValueError('Cluster memberships changed: review labels and their assignment hash before exporting')
    data = {key: metrics[key] for key in ['handbookSHA256', 'corpusSHA256', 'model', 'modelRevision']}
    data.update(version=1, method='MiniLM title + abstract embeddings; session-local KMeans, k=12, seed=0, n_init=10', sessions={})
    review = []
    for session, names in labels['sessions'].items():
        candidate = candidates[f'embeddings-{session}-12']
        if len(names) != 12 or len(candidate['groups']) != 12:
            raise ValueError('Expected 12 reviewed groups per session')
        groups = [{**g, 'label': names[g['id']]} for g in candidate['groups']]
        data['sessions'][session] = dict(groups=[{k:g[k] for k in ['id', 'label', 'keywords']} for g in groups],
                                         assignments=[{**a, 'margin': source['margin']} for a, source in zip(assignments[session], candidate['assignments'])])
        review.append(f'## Session {session}\n')
        for g in groups:
            review.append(f"### {g['label']} ({g['count']})\n\nTerms: {', '.join(g['keywords'])}\n")
            review.append('Closest to the centroid:\n\n' + '\n'.join(f'- {t}' for t in g['examples'][:4]) + '\n')
            review.append('Smallest assignment margins (often ambiguous):\n\n' + '\n'.join(f'- {t}' for t in g['borderline']) + '\n')
    (root / 'data/poster-topics.json').write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    (root / 'experiments/poster-topics' / 'metrics.json').write_text(json.dumps(metrics, indent=2) + '\n', encoding='utf-8')
    (root / 'experiments/poster-topics' / 'groups.md').write_text('# Poster topic inspection\n\nAutomatically selected examples, with manually reviewed group labels. These are inferred groups, not acceptance tracks.\n\n' + '\n'.join(review), encoding='utf-8')
    print(f"Exported {sum(len(s['assignments']) for s in data['sessions'].values())} poster assignments")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input-dir', type=Path, default=ROOT / 'work/topics')
    export(parser.parse_args().input_dir)
