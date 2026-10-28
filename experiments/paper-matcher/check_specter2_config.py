"""Find which local SPECTER2 configuration reproduces Semantic Scholar's specter_v2 vectors.
    python experiments/paper-matcher/check_specter2_config.py

Embeds 12 reference papers with Semantic Scholar's own title and abstract under every combination
of base model, adapter, input format and pooling, and reports cosine similarity to its vectors.
"""

import json
import sys

import torch
from adapters import AutoAdapterModel
from transformers import AutoTokenizer

from common import WORK
from s2 import get

REFERENCE = ["ARXIV:2004.07180", "ACL:N19-1423", "ARXIV:1706.03762", "ACL:D19-1410", "ARXIV:1907.11692", "ARXIV:2005.14165",
             "ACL:2020.acl-main.703", "ARXIV:2104.08821", "ACL:P02-1040", "ARXIV:2201.11903", "ACL:2023.acl-long.1", "ACL:2022.emnlp-main.10"]
BASES = {
    "specter2_base": ("allenai/specter2_base", ["allenai/specter2", "allenai/specter2_adhoc_query",
                                                "allenai/specter2_classification", "allenai/specter2_regression"]),
    "aug2023refresh": ("allenai/specter2_aug2023refresh_base", ["allenai/specter2_aug2023refresh", "allenai/specter2_aug2023refresh_adhoc_query",
                                                                "allenai/specter2_aug2023refresh_classification", "allenai/specter2_aug2023refresh_regression"]),
}
FORMATS = {"title [SEP] abstract": lambda t, a, sep: t + sep + a, "title abstract": lambda t, a, sep: t + " " + a,
           "title": lambda t, a, sep: t}


def main():
    cache = WORK / "specter2-reference.json"
    if not cache.exists():
        WORK.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps(get("paper/batch", {"fields": "title,abstract,embedding.specter_v2"}, {"ids": REFERENCE})))
    papers = [p for p in json.loads(cache.read_text()) if p and p.get("embedding")]
    target = torch.tensor([p["embedding"]["vector"] for p in papers], dtype=torch.float64)
    results = []
    for base_name, (base, adapters) in BASES.items():
        tokenizer = AutoTokenizer.from_pretrained(base)
        model = AutoAdapterModel.from_pretrained(base).eval()
        for adapter in adapters:
            model.load_adapter(adapter, source="hf", load_as=adapter.split("/")[1])
        for adapter in [None] + adapters:
            model.set_active_adapters(adapter.split("/")[1] if adapter else None)
            for fmt_name, fmt in FORMATS.items():
                texts = [fmt(p["title"], p.get("abstract") or "", tokenizer.sep_token) for p in papers]
                enc = tokenizer(texts, padding=True, truncation=True, max_length=512, return_tensors="pt", return_token_type_ids=False)
                with torch.no_grad():
                    hidden = model(**enc).last_hidden_state.double()
                mask = enc["attention_mask"].unsqueeze(-1).double()
                for pool, vec in [("first token", hidden[:, 0]), ("mean", (hidden * mask).sum(1) / mask.sum(1))]:
                    cos = torch.nn.functional.cosine_similarity(vec, target)
                    results.append((cos.mean().item(), cos.min().item(), (vec - target).abs().max().item(),
                                    base_name, adapter or "no adapter", fmt_name, pool))
    print(f"{len(papers)} reference papers\nmean cos  min cos   max|diff|  configuration")
    for mean, low, diff, *config in sorted(results, reverse=True)[:10]:
        print(f"{mean:.6f}  {low:.6f}  {diff:.2e}   {' / '.join(config)}")


if __name__ == "__main__":
    sys.exit(main())
