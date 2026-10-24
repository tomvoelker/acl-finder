"""Check that deployed HTML and its module imports use matching, versioned assets."""

import hashlib
import importlib.util
import re
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
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
            app = (output / app_name).read_text()
            module_name = re.search(r"from './(schedule-view\.[a-f0-9]+\.mjs)'", app).group(1)
            for name in [app_name, css_name, module_name]:
                content = (output / name).read_bytes()
                self.assertIn(hashlib.sha256(content).hexdigest()[:12], name)
            self.assertNotIn("'./schedule-view.mjs'", app)
            self.assertTrue((output / "data/papers.json").is_file())


if __name__ == "__main__":
    unittest.main()
