# -*- coding: utf-8 -*-
"""CLI: generate P1 thesis figures (PNG 300 dpi)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from thesis_figure_draw import FIG_DIR, generate_all

if __name__ == "__main__":
    generate_all(FIG_DIR)
