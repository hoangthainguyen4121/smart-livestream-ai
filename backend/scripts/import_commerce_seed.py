from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db.engine import get_session_factory  # noqa: E402
from app.services.commerce_seed_service import import_commerce_seed, load_seed_artifact  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Import checked-in commerce seed artifact.")
    parser.add_argument(
        "--path",
        type=Path,
        default=None,
        help="Optional override path to commerce_seed_v1.json",
    )
    args = parser.parse_args()
    artifact = load_seed_artifact(args.path) if args.path else None
    with get_session_factory() as session:
        summary = import_commerce_seed(session, artifact)
    print(summary)


if __name__ == "__main__":
    main()
