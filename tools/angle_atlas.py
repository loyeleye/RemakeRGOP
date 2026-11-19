#!/usr/bin/env python3
"""Generate the Great Orb Project maps and angle atlas.

Reads the altar maps in data/altars/*.json (see tools/extract_altars.py) and
uses tools/gop_engine.py to work out, for every tile on every altar, how many
ticks it takes to score an orb from there while standing still on each of the
four 'home squares' next to the altar.

Run:  python3 tools/angle_atlas.py      (writes docs/maps/)
Only the Python standard library is needed.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gop_engine import (ALTARS, BARRIER, FLOOR, MINI1, MINI2, REACH, REPEL_REACH, ROCK,  # noqa: E402
                        WALL_S, WALL_SW, WALL_W, WATER, Board, angle_bucket, cheb, hold,
                        in_altar, in_scoring_zone, line_of_sight, orb_offset)

OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs", "maps"))
HOMES = {"N": (0, 2), "E": (2, 0), "S": (0, -2), "W": (-2, 0)}
TICK_CHARS = "0123456789abcdefghijklmnopqrstuvwxyz"
TILE_CHAR = {FLOOR: ".", BARRIER: "#", ROCK: "R", WATER: "~", WALL_W: "|", WALL_S: "_",
             WALL_SW: "L", MINI1: "/", MINI2: "\\"}
TILE_COLOUR = {FLOOR: "#d8d2bf", BARRIER: "#3b3b3b", ROCK: "#7a6a55", WATER: "#7fb2d6",
               WALL_W: "#d8d2bf", WALL_S: "#d8d2bf", WALL_SW: "#d8d2bf",
               MINI1: "#5b5b5b", MINI2: "#5b5b5b"}

TITLE = {"air": "Air", "mind": "Mind", "water": "Water", "earth": "Earth", "fire": "Fire", "body": "Body"}


def bounds(b: Board) -> tuple[int, int, int, int]:
    """Crop to the spawn points plus a 2-tile margin (and always the altar's surroundings)."""
    xs = [x for x, _ in b.spawns] + [-5, 5]
    ys = [y for _, y in b.spawns] + [-5, 5]
    m = 2
    return (max(-b.half, min(xs) - m), min(b.half, max(xs) + m),
            max(-b.half, min(ys) - m), min(b.half, max(ys) + m))


def render(b: Board, cell, box) -> str:
    x0, x1, y0, y1 = box
    lines = []
    # Column header: a label above every x that is a multiple of 5.
    width = 2 * (x1 - x0 + 1)
    head = [" "] * (width + 4)
    for x in range(x0, x1 + 1):
        if x % 5 == 0:
            label = str(x)
            col = 2 * (x - x0) - (len(label) - 1)
            for k, ch in enumerate(label):
                if col + k < len(head):
                    head[col + k] = ch
    head = "      " + "".join(head)
    lines.append(head.rstrip())
    for y in range(y1, y0 - 1, -1):
        row = "".join(f"{cell((x, y)):<2}" for x in range(x0, x1 + 1))
        lines.append(f"{y:>4}  {row.rstrip()}")
    return "\n".join(lines)


def base_char(b: Board, p, spawns) -> str:
    if in_altar(p):
        return "A"
    t = b.get(p)
    if t == FLOOR and p in spawns:
        return "*"
    return TILE_CHAR[t]


def heat_char(b: Board, home, p, spawns, stats) -> str:
    if p == home:
        return "P"
    if in_altar(p):
        return "A"
    t = b.get(p)
    if t not in (FLOOR, WATER):
        return TILE_CHAR[t]
    if in_scoring_zone(p):
        return "o"
    if cheb(home, p) > REACH:
        return " " if t == WATER else "·"
    if not b.can_reach(home, p):
        if p in spawns:
            stats["hidden"] += 1
        return "#" if t == FLOOR else "~"
    ticks, _ = hold(b, home, p)
    if ticks is None:
        if p in spawns:
            stats["stuck"] += 1
        return "x"
    if p in spawns:
        stats["scored"] += 1
        stats["ticks"] += ticks
    return TICK_CHARS[ticks] if ticks < len(TICK_CHARS) else "+"


def team_char(b: Board, p, spawns, stats) -> str:
    if p in HOMES.values():
        return "P"
    if in_altar(p):
        return "A"
    t = b.get(p)
    if t not in (FLOOR, WATER):
        return TILE_CHAR[t]
    if in_scoring_zone(p):
        return "o"
    best = None
    for h in HOMES.values():
        if cheb(h, p) <= REACH and b.can_reach(h, p):
            tk, _ = hold(b, h, p)
            if tk is not None and (best is None or tk < best):
                best = tk
    if best is None:
        if p in spawns:
            stats["none"] += 1
        return "·" if t == FLOOR else " "
    if p in spawns:
        stats["covered"] += 1
        stats["ticks"] += best
    return TICK_CHARS[best] if best < len(TICK_CHARS) else "+"


def svg_map(b: Board, box, title: str) -> str:
    x0, x1, y0, y1 = box
    s = 14
    w, h = (x1 - x0 + 1) * s, (y1 - y0 + 1) * s
    spawns = set(b.spawns)
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h + 22}" '
           f'viewBox="0 0 {w} {h + 22}" font-family="sans-serif" font-size="12">',
           '<rect width="100%" height="100%" fill="#ffffff"/>',
           f'<text x="4" y="15">{title}</text>']
    for j, y in enumerate(range(y1, y0 - 1, -1)):
        for i, x in enumerate(range(x0, x1 + 1)):
            px, py = i * s, 22 + j * s
            t = b.get((x, y))
            fill = "#b5462f" if in_altar((x, y)) else TILE_COLOUR[t]
            out.append(f'<rect x="{px}" y="{py}" width="{s}" height="{s}" fill="{fill}"/>')
            if t in (WALL_W, WALL_SW):
                out.append(f'<line x1="{px}" y1="{py}" x2="{px}" y2="{py + s}" stroke="#222" stroke-width="3"/>')
            if t in (WALL_S, WALL_SW):
                out.append(f'<line x1="{px}" y1="{py + s}" x2="{px + s}" y2="{py + s}" stroke="#222" stroke-width="3"/>')
            if t == MINI1:
                out.append(f'<line x1="{px}" y1="{py + s}" x2="{px + s}" y2="{py}" stroke="#eee" stroke-width="2"/>')
            if t == MINI2:
                out.append(f'<line x1="{px}" y1="{py}" x2="{px + s}" y2="{py + s}" stroke="#eee" stroke-width="2"/>')
            if (x, y) in spawns and t == FLOOR:
                out.append(f'<circle cx="{px + s / 2}" cy="{py + s / 2}" r="2.5" fill="#2e7d32"/>')
            if (x, y) in HOMES.values():
                out.append(f'<circle cx="{px + s / 2}" cy="{py + s / 2}" r="4" fill="#1f5fbf"/>')
    out.append("</svg>")
    return "\n".join(out)


LEGEND_MAP = ("Legend: `A` altar (3×3, solid) · `.` floor · `*` floor tile that is an orb spawn "
              "point · `#` barrier (blocks orbs, players and sight) · `R` rock (blocks orbs and "
              "players, not sight) · `~` water/edge (blocks players only; orbs can cross it) · "
              "`|` wall on the tile's west edge · `_` wall on its south edge · `L` both · `/` `\\` "
              "mini-pillars (block one diagonal through the tile). North is up; x grows east.")

LEGEND_HEAT = ("Legend: `P` you, standing still · `o` the scoring zone (an orb anywhere in the 5×5 "
               "square round the centre has scored) · digit/letter = ticks from your first click "
               "until the point registers, holding attract the whole time (0-9, then a=10, b=11, "
               "...) · `#` within 10 tiles but out of sight · `x` in sight, but holding attract "
               "never scores: the orb either parks on the tile next to you outside the zone (it "
               "is 'behind' you) or stalls against scenery · `·` beyond the 10-tile reach "
               "· other symbols are scenery as on the map.")


def altar_page(name: str) -> tuple[str, dict]:
    b = Board(name)
    box = bounds(b)
    spawns = set(b.spawns)
    title = TITLE[name]
    md = [f"# {title} altar: map and angles\n",
          "> Generated by `tools/angle_atlas.py` from `data/altars/" + name + ".json`. Map data: "
          "Vief's Trapdoor GOP emulator (see [sources](../sources.md)); timings from the engine "
          "model in [05](../05-tick-engine.md). Not a Jagex source: treat as community data.\n"]
    md.append(f"![{title} altar map]({name}.svg)\n")
    md.append(f"## The map\n\n{LEGEND_MAP}\n")
    md.append(f"Spawn points: **{len(b.spawns)}**. Grid: {b.n}×{b.n} tiles centred on the altar.\n")
    md.append("```text\n" + render(b, lambda p: base_char(b, p, spawns), box) + "\n```\n")
    summary = {"spawns": len(b.spawns)}
    md.append("## Standing still on each home square\n")
    md.append("The four home squares are the tiles in the middle of each side of the altar: "
              "N (0,2), E (2,0), S (0,-2) and W (-2,0). Each map shows where an orb could be and "
              "how long it takes to score it from that square without moving.\n")
    md.append(LEGEND_HEAT + "\n")
    rows = []
    for key, home in HOMES.items():
        st = {"scored": 0, "hidden": 0, "stuck": 0, "ticks": 0}
        grid = render(b, lambda p: heat_char(b, home, p, spawns, st), box)
        n = len(b.spawns)
        mean = st["ticks"] / st["scored"] if st["scored"] else 0
        rows.append((key, home, st, mean))
        summary[key] = (st["scored"], mean)
        md.append(f"### Home square {key} {home}\n")
        md.append(f"Spawn points you can score from here without moving: **{st['scored']} of {n}** "
                  f"({100 * st['scored'] / n:.0f}%), mean {mean:.1f} ticks. Hidden from here: "
                  f"{st['hidden']}. Visible but stall: {st['stuck']}. The rest are out of reach.\n")
        md.append("```text\n" + grid + "\n```\n")
    st = {"covered": 0, "none": 0, "ticks": 0}
    grid = render(b, lambda p: team_char(b, p, spawns, st), box)
    mean = st["ticks"] / st["covered"] if st["covered"] else 0
    summary["team"] = (st["covered"], mean)
    md.append("## Four players, one on each home square\n")
    md.append("Each tile shows the fastest of the four. `·` means no home square scores it without "
              "moving: these are the orbs that need a walk, a relay (one player pulls it into "
              "someone else's angle) or a repel from behind.\n")
    md.append(f"Spawn points covered: **{st['covered']} of {len(b.spawns)}** "
              f"({100 * st['covered'] / len(b.spawns):.0f}%), mean best time {mean:.1f} ticks.\n")
    md.append("```text\n" + grid + "\n```\n")
    with open(os.path.join(OUT, f"{name}.svg"), "w") as f:
        f.write(svg_map(b, box, f"{title} altar (Vief's Trapdoor data) · green dots = spawns · blue = home squares"))
    return "\n".join(md), summary


def bucket_page() -> str:
    md = ["# The angle rule (generated)\n",
          "> Generated by `tools/angle_atlas.py` from the offset rule in `tools/gop_engine.py` "
          "(`orb_offset`). See [05 §2.3](../05-tick-engine.md#23-the-angle-rule-where-a-click-sends-an-orb).\n"]
    md.append("## Which of the five angles a click uses\n")
    md.append("The orb `O` is in the middle. Every other tile is a place you could stand. The "
              "letter says which bucket the server picks from the slope |dy/dx| between you and the "
              "orb:\n")
    md.append("| Letter | Slope | Orb is sent (relative to itself) |\n|---|---|---|\n"
              "| `H` | below 1/2 | 2 tiles straight along x |\n"
              "| `h` | 1/2 up to (not incl.) 1 | 2 along x, 1 along y |\n"
              "| `X` | exactly 1 | 2 and 2 (pure diagonal) |\n"
              "| `v` | above 1, up to 2 | 1 along x, 2 along y |\n"
              "| `V` | above 2 | 2 straight along y |\n")

    def cell(p):
        if p == (0, 0):
            return "O"
        return angle_bucket(p)
    lines = []
    for y in range(10, -11, -1):
        lines.append(f"{y:>4}  " + " ".join(cell((x, y)) for x in range(-10, 11)))
    lines.append("      " + " ".join(str(abs(x) % 10) for x in range(-10, 11)))
    md.append("```text\n" + "\n".join(lines) + "\n```\n")
    md.append("Because the buckets are cut at slopes 1/2, 1 and 2, an orb can only ever be sent in "
              "16 headings. Counting both signs: 4 straight (`H`/`V`), 4 pure diagonals (`X`) and 8 "
              "\"knight-like\" ones (`h`/`v`). **That is the complete list of angles in GOP.** Every "
              "named angle is a way of standing so that one of these 16 headings carries the orb "
              "into the scoring zone without clipping scenery.\n")
    md.append("## Where the orb actually goes on open ground\n")
    md.append("You `P` hold attract on an orb that starts on the tile shown. Each tile shows the "
              "heading of the orb's first step: `-` and `|` straight, `/` and `\\` diagonal. An orb "
              "sent (1,2) steps diagonally first, then straight. This is what gives the 'dogleg' "
              "paths players learn to read.\n")

    def first_step(p):
        if p == (0, 0):
            return "P"
        o = orb_offset((-p[0], -p[1]), True)
        sx = (o[0] > 0) - (o[0] < 0)
        sy = (o[1] > 0) - (o[1] < 0)
        return {(0, 0): "·", (1, 0): "-", (-1, 0): "-", (0, 1): "|", (0, -1): "|",
                (1, 1): "/", (-1, -1): "/", (1, -1): "\\", (-1, 1): "\\"}[(sx, sy)]
    lines = []
    for y in range(8, -9, -1):
        lines.append(f"{y:>4}  " + " ".join(first_step((x, y)) for x in range(-8, 9)))
    md.append("```text\n" + "\n".join(lines) + "\n```\n")
    md.append("## Repel\n")
    md.append(f"Repel uses the same buckets with the direction reversed (no anti-overshoot clamp). "
              f"You can click an orb up to {REPEL_REACH} tiles away with the repeller, but the push "
              f"is cancelled when the orb is {REACH - 2} or more tiles away, so in practice a repel "
              f"only moves orbs up to {REACH - 3} tiles from you.\n")
    md.append("## Line of sight is not mirror-symmetric\n")
    md.append("The emulator's line-of-sight routine walks a Bresenham-style line and has two "
              "hard-coded special cases (runs of 6 tiles with rise 1 or 5, and runs of 10 with rise "
              "1, 3, 7 or 9). Rays to mirror-image targets east and west of you pass through "
              "different tiles, so an obstacle can hide an orb on one side but not the other:\n")
    rows = []
    for t in [(6, 1), (10, 3), (3, 6), (4, 2)]:
        e = line_of_sight((0, 0), t)
        w = line_of_sight((0, 0), (-t[0], t[1]))
        rows.append(f"east {t}: {e}\nwest {(-t[0], t[1])}: {w}\n")
    md.append("```text\n" + "\n".join(rows) + "```\n")
    return "\n".join(md)


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    summaries = {}
    for name in ALTARS:
        page, summ = altar_page(name)
        summaries[name] = summ
        with open(os.path.join(OUT, f"{name}.md"), "w") as f:
            f.write(page)
        print("wrote", name)
    with open(os.path.join(OUT, "angle-rule.md"), "w") as f:
        f.write(bucket_page())
    idx = ["# Maps and angle atlas (generated)\n",
           "> Generated by `tools/angle_atlas.py`. Re-run it after changing the engine or data.\n",
           "* [The angle rule: the 16 headings an orb can take](angle-rule.md)\n"]
    for name in ALTARS:
        idx.append(f"* [{TITLE[name]} altar]({name}.md)")
    idx.append("\nChaos and Nature (members) are not in the emulator's data, so they have no "
               "generated maps. See [07](../07-altars-and-maps.md) for what is known about them.\n")
    idx.append("## Summary: spawn points scoreable from a home square without moving\n")
    idx.append("| Altar | Spawns | N | E | S | W | All four home squares | Mean best ticks |\n"
               "|---|---|---|---|---|---|---|---|")
    for name in ALTARS:
        s = summaries[name]
        n = s["spawns"]

        def pc(k):
            return f"{100 * s[k][0] / n:.0f}%"
        idx.append(f"| {TITLE[name]} | {n} | {pc('N')} | {pc('E')} | {pc('S')} | {pc('W')} | "
                   f"{100 * s['team'][0] / n:.0f}% | {s['team'][1]:.1f} |")
    with open(os.path.join(OUT, "README.md"), "w") as f:
        f.write("\n".join(idx) + "\n")


if __name__ == "__main__":
    main()
