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
            poster_view_name = re.search(r"from './(poster-view\.[a-f0-9]+\.mjs)'", app).group(1)
            saved_name = re.search(r"from './(saved-papers\.[a-f0-9]+\.mjs)'", app).group(1)
            sharing_name = re.search(r"from './(saved-sharing\.[a-f0-9]+\.mjs)'", app).group(1)
            for name in [sharing_name, saved_name, poster_view_name, app_name, css_name, module_name, math_name, theme_name, traffic_name, analytics_name, favicon_png, favicon_svg]:
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
            catalog = json.loads((ROOT / "data/poster-boards.json").read_text())
            verified = {entry["paperId"]: entry for entry in catalog["entries"] if entry["paperId"] and entry["verified"]}
            self.assertEqual(len(verified), 2830)
            self.assertEqual(by_id["9736-FIND"]["posterBoard"], 200)
            self.assertEqual(by_id["9736-FIND"]["posterSession"], "F")
            self.assertEqual(by_id["4212-FIND"]["posterBoard"], 166)
            for paper_id in ["2638-MAIN", "6137-MAIN"]:
                self.assertNotIn("posterBoard", by_id[paper_id])
                self.assertIn("unconfirmed", by_id[paper_id]["posterLocationIssue"])
            for paper in deployed["papers"]:
                if paper["id"] in verified:
                    entry = verified[paper["id"]]
                    self.assertEqual((paper["posterBoard"], paper["posterSession"], paper["posterSourcePage"]),
                                     (entry["board"], entry["session"], entry["boardPage"]))
                for key in ["posterBoard", "posterSession", "posterSourcePage", "posterLocationIssue", "posterClaimedBoard"]:
                    paper.pop(key, None)
                if "anthologyId" in paper:
                    self.assertEqual(paper["authors"], publications[paper["anthologyId"]]["authors"])
                paper.pop("anthologyId", None)
                paper.pop("authors", None)
                paper.pop("underlineUrl", None)
            self.assertEqual(deployed.pop("posterSessions"), catalog["sessions"])
            self.assertEqual(deployed, source, "Adding paper links must not change the schedule")
            self.assertEqual(sorted(p.name for p in (output / "data").iterdir()), ["papers.json", "poster-boards.json"])
            map_output = output / "poster-map"
            map_html = (map_output / "index.html").read_text()
            map_app_name = re.search(r'src="(map\.[a-f0-9]+\.mjs)"', map_html).group(1)
            map_css_name = re.search(r'href="(map\.[a-f0-9]+\.css)"', map_html).group(1)
            map_app = (map_output / map_app_name).read_text()
            self.assertIn(f"'../{math_name}'", map_app)
            self.assertIn(f"'../{saved_name}'", map_app)
            self.assertIn(f"'../{analytics_name}'", map_app)
            self.assertIn(f'src="../{theme_name}"', map_html)
            self.assertLess(map_html.index(theme_name), map_html.index(map_css_name), "Map theme applies before CSS")
            for name in [map_app_name, map_css_name] + re.findall(r"from './([^']+)'", map_app):
                content = (map_output / name).read_bytes()
                self.assertIn(hashlib.sha256(content).hexdigest()[:12], name)
            self.assertFalse((map_output / "qa.md").exists())
            self.assertFalse((map_output / "tests").exists())


if __name__ == "__main__":
    unittest.main()
