from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent
IMAGES_DIR = ROOT / "images"
SOURCE_ICON = IMAGES_DIR / "icon.png"
ICON_SIZES = (16, 48, 128)


def require_sips() -> str:
    sips_path = shutil.which("sips")
    if not sips_path:
        raise RuntimeError("The 'sips' command is required to generate icons on macOS.")
    return sips_path


def create_icon(sips_path: str, size: int) -> Path:
    output_path = IMAGES_DIR / f"icon{size}.png"
    command = [
        sips_path,
        "-z",
        str(size),
        str(size),
        str(SOURCE_ICON),
        "--out",
        str(output_path),
    ]
    subprocess.run(command, check=True, capture_output=True, text=True)
    return output_path


def main() -> int:
    if not SOURCE_ICON.exists():
        print(f"Source icon not found: {SOURCE_ICON}", file=sys.stderr)
        return 1

    try:
        sips_path = require_sips()
        for size in ICON_SIZES:
            output_path = create_icon(sips_path, size)
            print(f"Created {output_path}")
    except subprocess.CalledProcessError as exc:
        print(exc.stderr.strip() or str(exc), file=sys.stderr)
        return exc.returncode or 1
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
