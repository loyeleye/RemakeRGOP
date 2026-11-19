#!/usr/bin/env python3
"""Extract the six free-to-play GOP altar maps from Vief's Trapdoor.

Source: https://github.com/yongyi781/great-orb-project, file
src/GOP/Scripts/Engine/AltarData.ts at commit 073b074 (2016-07-14), the last
commit where the altar grids were stored in the repository (later versions
load them from the site's database). The upstream repository has no licence
file, so see docs/sources.md before reusing this data outside research.

Usage:
  git clone https://github.com/yongyi781/great-orb-project
  git -C great-orb-project show 073b074:src/GOP/Scripts/Engine/AltarData.ts > AltarData.ts
  python3 tools/extract_altars.py AltarData.ts
"""
import json
import os
import re
import sys

TILE_NAMES = ["Floor", "Barrier", "Rock", "Water", "WallW", "WallS", "WallSW",
              "Minipillar1", "Minipillar2"]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "altars")


def main(path: str) -> None:
    src = open(path, encoding="utf-8-sig").read()
    blocks = re.split(r"\n    \{\n", src)[1:]
    os.makedirs(OUT, exist_ok=True)
    for b in blocks:
        name = re.search(r'name:\s*"([^"]+)"', b).group(1)
        if name == "none":
            continue
        grid_txt = re.search(r"grid:\s*(\[\[.*?\]\])", b, re.S).group(1)
        grid = json.loads(grid_txt)
        spawns = [[int(x), int(y)] for x, y in
                  re.findall(r"new Point\((-?\d+),\s*(-?\d+)\)",
                             re.search(r"spawns:\s*\[(.*?)\]", b, re.S).group(1))]
        n = len(grid)
        assert all(len(r) == n for r in grid), name
        data = {
            "name": name,
            "source": "yongyi781/great-orb-project@073b074 src/GOP/Scripts/Engine/AltarData.ts",
            "size": n,
            "origin": "altar centre is (0,0); x east, y north; rows listed north (y=+%d) to south (y=-%d)" % (n // 2, n // 2),
            "tile_legend": {str(i): t for i, t in enumerate(TILE_NAMES)},
            "rows": ["".join(str(v) for v in row) for row in grid],
            "spawns": spawns,
        }
        with open(os.path.join(OUT, f"{name}.json"), "w") as f:
            json.dump(data, f, indent=1)
        print(name, n, "spawns:", len(spawns))


if __name__ == "__main__":
    main(sys.argv[1])
