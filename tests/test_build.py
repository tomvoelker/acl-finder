"""Check that deployed HTML and its module imports use matching, versioned assets."""

import hashlib
import importlib.util
import json
import re
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
spec = importlib.util.spec_from_file_location("site_build", ROOT / "scripts/build.py")
site_build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(site_build)


class BuildTests(unittest.TestCase):
    def test_versioned_assets_exist_and_match_their_hashes(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "site"
            with patch.object(site_build, "OUTPUT", output):
                site_build.build()
            html = (output / "index.html").read_text()
            app_name = re.search(r'src="(app\.[a-f0-9]+\.js)"', html).group(1)
            css_name = re.search(r'href="(styles\.[a-f0-9]+\.css)"', html).group(1)
            theme_name = re.search(r'src="(theme\.[a-f0-9]+\.js)"', html).group(1)
            favicon_png = re.search(r'href="(favicon\.[a-f0-9]+\.png)"', html).group(1)
            favicon_svg = re.search(r'href="(favicon\.[a-f0-9]+\.svg)"', html).group(1)
            traffic_name = re.search(r'src="(traffic\.[a-f0-9]+\.mjs)"', html).group(1)
            app = (output / app_name).read_text()
            analytics_name = re.search(r"from './(analytics\.[a-f0-9]+\.mjs)'", app).group(1)
            module_name = re.search(r"from './(schedule-view\.[a-f0-9]+\.mjs)'", app).group(1)
            math_name = re.search(r"from './(math-titles\.[a-f0-9]+\.mjs)'", app).group(1)
            for name in [app_name, css_name, module_name, math_name, theme_name, traffic_name, analytics_name, favicon_png, favicon_svg]:
                content = (output / name).read_bytes()
                self.assertIn(hashlib.sha256(content).hexdigest()[:12], name)
            self.assertNotIn("'./schedule-view.mjs'", app)
            self.assertNotIn("'./math-titles.mjs'", app)
            vendor = output / "vendor/katex-0.19.1"
            self.assertTrue((vendor / "katex.mjs").is_file())
            self.assertTrue((vendor / "LICENSE").is_file())
            for font in re.findall(r'url\(([^)]+)\)', (vendor / "katex.min.css").read_text()):
                self.assertTrue((vendor / font.strip('\"\'')).is_file(), f"Missing math font: {font}")
            self.assertLess(html.index(theme_name), html.index(css_name), "Theme must apply before CSS loads")
            source = json.loads((ROOT / "data/papers.json").read_text())
            deployed = json.loads((output / "data/papers.json").read_text())
            by_id = {paper["id"]: paper for paper in deployed["papers"]}
            self.assertEqual(by_id["9736-FIND"]["anthologyId"], "2026.findings-emnlp.2464")
            self.assertEqual(by_id["9736-FIND"]["authors"], ["Jan Pfister", "Tom Völker", "Andreas Hotho"])
            self.assertNotIn("anthologyId", by_id["6620-MAIN"])
            self.assertNotIn("authors", by_id["6620-MAIN"])
            publications = {paper["id"]: paper for paper in json.loads((ROOT / "data/anthology-catalog.json").read_text())["papers"]}
            self.assertIn("/lecture/162458-multi-block-diffusion-language-models", by_id["6176-MAIN"]["underlineUrl"])
            self.assertNotIn("underlineUrl", by_id["403-MAIN"])
            for paper in deployed["papers"]:
                if "anthologyId" in paper:
                    self.assertEqual(paper["authors"], publications[paper["anthologyId"]]["authors"])
                paper.pop("anthologyId", None)
                paper.pop("authors", None)
                paper.pop("underlineUrl", None)
            self.assertEqual(deployed, source, "Adding paper links must not change the schedule")
            self.assertEqual([p.name for p in (output / "data").iterdir()], ["papers.json"])


if __name__ == "__main__":
    unittest.main()
