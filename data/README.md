# Altar map data

`altars/<name>.json` holds one free-to-play GOP arena each (Air, Mind, Water, Earth, Fire, Body).
They were converted by [tools/extract_altars.py](../tools/extract_altars.py) from the Vief's
Trapdoor emulator ([yongyi781/great-orb-project](https://github.com/yongyi781/great-orb-project),
`src/GOP/Scripts/Engine/AltarData.ts` at commit `073b074`).

> **Licence:** the upstream repository has no licence file, and the layouts are Jagex's arena
> designs. The emulator's author has told the project owner informally (19 Nov 2026) that
> **non-commercial use is fine**. ❓ Commercial use is not covered: get written permission (and think
> about Jagex's rights) before shipping it in anything commercial. See
> [docs/sources.md](../docs/sources.md#licence-status-of-reused-material).

## Format

```json
{
  "name": "air",
  "size": 53,
  "origin": "altar centre is (0,0); x east, y north; rows listed north (y=+26) to south (y=-26)",
  "tile_legend": {"0": "Floor", "1": "Barrier", "2": "Rock", "3": "Water", "4": "WallW",
                  "5": "WallS", "6": "WallSW", "7": "Minipillar1", "8": "Minipillar2"},
  "rows": ["0000...", "..."],
  "spawns": [[-5, -9], [-4, -9], "..."]
}
```

* `rows[0]` is the northernmost row (y = +26). Character `rows[i][j]` is the tile at
  x = j − 26, y = 26 − i.
* Tile meanings are in [docs/05-tick-engine.md §2.1](../docs/05-tick-engine.md#21-the-board).
  The 3 × 3 altar itself is stored as Rock (`2`).
* `spawns` lists every tile an orb may appear on, as `[x, y]`.

## Regenerating the maps

```sh
python3 tools/gop_engine.py     # self-test against the emulator's "Simple scoring: 1-away" test
python3 tools/angle_atlas.py    # rewrites docs/maps/
```
