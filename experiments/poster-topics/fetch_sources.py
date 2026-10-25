"""Cache public Underline abstracts without changing the finder schedule."""
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from import_underline import fetch_page

destination = ROOT / 'work/topics-source'
destination.mkdir(parents=True, exist_ok=True)
first = fetch_page(1)
(destination / 'underline-api-page-1.json').write_text(json.dumps(first))


def save(number):
    (destination / f'underline-api-page-{number}.json').write_text(json.dumps(fetch_page(number)))


with ThreadPoolExecutor(max_workers=3) as pool:
    list(pool.map(save, range(2, first['meta']['total_pages'] + 1)))
print(f"Saved {first['meta']['total_pages']} public API pages in {destination}")
