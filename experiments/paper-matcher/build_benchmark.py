"""Build the author self-retrieval benchmark from the ACL Anthology BibTeX with abstracts.

Profile = an author's Anthology papers up to 2025 with an abstract; targets = their scheduled
programme entries. Writes benchmark.json here and embeds the profile papers into work/paper-matcher/.
    python experiments/paper-matcher/build_benchmark.py --fetch
    python experiments/paper-matcher/build_benchmark.py --bib path/to/anthology+abstracts.bib.gz
"""

import argparse
import gzip
import hashlib
import json
import random
import re
import unicodedata
import urllib.request
from collections import defaultdict

import numpy as np

from common import HERE, ROOT, WORK, Programme

BIB_URL = "https://aclanthology.org/anthology+abstracts.bib.gz"
ACCENT = {'"': "\u0308", "'": "\u0301", "`": "\u0300", "^": "\u0302", "~": "\u0303", "c": "\u0327", "v": "\u030c",
          "u": "\u0306", "=": "\u0304", ".": "\u0307", "H": "\u030b", "k": "\u0328", "r": "\u030a"}
SPECIAL = {"l": "ł", "L": "Ł", "o": "ø", "O": "Ø", "aa": "å", "AA": "Å", "ss": "ß", "i": "ı", "ae": "æ", "AE": "Æ", "oe": "œ", "OE": "Œ"}


def delatex(s):
    s = re.sub(r"\{\\([\"'`^~=.])\s*\{?(\\?[A-Za-z])\}?\}", lambda m: m[2].lstrip("\\") + ACCENT[m[1]], s)
    s = re.sub(r"\\([\"'`^~=.])\s*\{?([A-Za-z])\}?", lambda m: m[2] + ACCENT[m[1]], s)
    s = re.sub(r"\{?\\([cvuHkr])\{([A-Za-z])\}\}?", lambda m: m[2] + ACCENT[m[1]], s)
    s = re.sub(r"\{\\(l|L|o|O|aa|AA|ss|i|ae|AE|oe|OE)\}", lambda m: SPECIAL[m[1]], s)
    for latex, text in [("{``}", "“"), ("{''}", "”"), ("{'}", "'"), ("{`}", "‘"), ("{---}", "—"), ("{--}", "–"), ("{-}", "-")]:
        s = s.replace(latex, text)
    s = re.sub(r"\\(?:textit|textbf|emph|texttt|textsc|url|textrm|mathrm|text)\{([^{}]*)\}", r"\1", s)
    return " ".join(unicodedata.normalize("NFC", s.replace("{", "").replace("}", "")).split())


def display_name(bib_name):
    """'Last, First' or 'Last, Jr., First' → 'First Last [Jr.]', matching Anthology page names."""
    parts = [p.strip() for p in delatex(bib_name).split(",")]
    if len(parts) == 3:
        return f"{parts[2]} {parts[0]} {parts[1]}"
    return f"{parts[1]} {parts[0]}" if len(parts) == 2 else parts[0]


def entries(text):
    for chunk in text.split("\n@")[1:]:
        fields, key = {}, None
        for line in chunk.split("\n")[1:]:
            match = re.match(r"    (\w+) = (.*)$", line)
            if match:
                key = match[1]
                fields[key] = match[2]
            elif key and line.startswith("      "):
                fields[key] += " " + line.strip()
        yield {k: v.rstrip(",").strip().strip('"') for k, v in fields.items()}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--fetch", action="store_true", help=f"download {BIB_URL} into work/")
    source.add_argument("--bib", help="local anthology+abstracts.bib.gz")
    parser.add_argument("--authors", type=int, default=400)
    parser.add_argument("--min-papers", type=int, default=3)
    parser.add_argument("--max-papers", type=int, default=40)
    args = parser.parse_args()
    WORK.mkdir(parents=True, exist_ok=True)
    bib_path = WORK / "anthology+abstracts.bib.gz" if args.fetch else args.bib
    if args.fetch:
        urllib.request.urlretrieve(BIB_URL, bib_path)
    raw = open(bib_path, "rb").read()

    programme = Programme()
    catalog_ids = {p["id"] for p in json.loads((ROOT / "data/anthology-catalog.json").read_text())["papers"]}
    prior, by_author = {}, defaultdict(list)
    for e in entries(gzip.decompress(raw).decode()):
        match = re.search(r"aclanthology\.org/([^/]+)/", e.get("url", ""))
        if not match or not e.get("abstract") or not e.get("author") or not e.get("year", "").isdigit():
            continue
        anthology_id = match[1]
        if int(e["year"]) > 2025 or anthology_id in catalog_ids or anthology_id.endswith(".0"):
            continue
        prior[anthology_id] = {"title": delatex(e.get("title", "")), "abstract": delatex(e["abstract"]), "year": int(e["year"])}
        for name in re.split(r"\s+and\s+", e["author"]):
            by_author[display_name(name).casefold()].append(anthology_id)

    targets = defaultdict(list)
    for entry, active in zip(programme.entries, programme.active):
        if active:
            for name in entry.get("authors") or []:
                targets[name.casefold()].append(entry["id"])
    eligible = sorted(a for a in targets if args.min_papers <= len(set(by_author.get(a, []))) <= args.max_papers)
    random.seed(0)
    sample = sorted(random.sample(eligible, min(args.authors, len(eligible))))
    benchmark = {
        "source": {"url": BIB_URL, "sha256": hashlib.sha256(raw).hexdigest()},
        "sampling": {"seed": 0, "authors": args.authors, "minPapers": args.min_papers, "maxPapers": args.max_papers,
                     "eligible": len(eligible), "programmeAuthors": len(targets)},
        "authors": [{"name": a, "prior": sorted(set(by_author[a])), "targets": targets[a]} for a in sample],
    }
    (HERE / "benchmark.json").write_text(json.dumps(benchmark, ensure_ascii=False, indent=1) + "\n")

    needed = sorted({paper for a in benchmark["authors"] for paper in a["prior"]})
    (WORK / "prior.json").write_text(json.dumps({paper: prior[paper] for paper in needed}, ensure_ascii=False))
    import torch
    from adapters import AutoAdapterModel
    from transformers import AutoTokenizer
    revisions = programme.meta["revisions"]
    tokenizer = AutoTokenizer.from_pretrained("allenai/specter2_base", revision=revisions["allenai/specter2_base"])
    model = AutoAdapterModel.from_pretrained("allenai/specter2_base", revision=revisions["allenai/specter2_base"])
    model.load_adapter("allenai/specter2", source="hf", load_as="proximity", set_active=True)
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    model.to(device).eval()
    texts = [prior[p]["title"] + tokenizer.sep_token + prior[p]["abstract"] for p in needed]
    vectors = np.zeros((len(texts), 768), dtype="<f4")
    order = sorted(range(len(texts)), key=lambda i: len(texts[i]))
    with torch.no_grad():
        for start in range(0, len(order), 32):
            batch = order[start:start + 32]
            encoded = tokenizer([texts[i] for i in batch], padding=True, truncation=True, max_length=512,
                                return_tensors="pt", return_token_type_ids=False).to(device)
            vectors[batch] = model(**encoded).last_hidden_state[:, 0, :].float().cpu().numpy()
    (WORK / "prior.f32").write_bytes(vectors.tobytes())
    (WORK / "prior-order.json").write_text(json.dumps(needed))
    print(f"{len(sample)} of {len(eligible)} eligible authors; {sum(len(a['targets']) for a in benchmark['authors'])} targets; "
          f"{len(needed)} profile papers embedded on {device}")


if __name__ == "__main__":
    main()
