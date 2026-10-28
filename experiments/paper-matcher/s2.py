"""Tiny Semantic Scholar client with backoff for the anonymous rate limit."""
import json, sys, time, urllib.error, urllib.parse, urllib.request

API = "https://api.semanticscholar.org/graph/v1"


def get(path, params=None, body=None):
    url = f"{API}/{path}" + ("?" + urllib.parse.urlencode(params) if params else "")
    for attempt in range(8):
        req = urllib.request.Request(url, data=json.dumps(body).encode() if body else None,
                                     headers={"Content-Type": "application/json"} if body else {})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code != 429:
                raise
            time.sleep(3 * (attempt + 1))
    raise RuntimeError("rate limited")


if __name__ == "__main__":
    for name in sys.argv[1:]:
        d = get("author/search", {"query": name, "fields": "name,affiliations,paperCount,papers.title,papers.year,papers.venue", "limit": 10})
        print("==", name)
        for a in d.get("data", []):
            papers = sorted(a.get("papers", []), key=lambda p: -(p.get("year") or 0))
            print(f"  {a['authorId']}  {a['name']}  papers={a.get('paperCount')}  aff={a.get('affiliations')}")
            for p in papers[:5]:
                print(f"      {p.get('year')} {p.get('venue', '')[:25]:25} {p['title'][:80]}")
        time.sleep(2)
