#!/usr/bin/env python3
"""A small Python model of the Great Orb Project tick engine.

This is an independent re-implementation, for documentation, of the rules used
by Vief's Trapdoor (https://github.com/yongyi781/great-orb-project), the
community GOP emulator, in src/GOP/Scripts/Engine/{GopBoard,Orb,Player,
GameState}.ts. Those rules were reverse-engineered by GOP players from the live
game; they are not Jagex code. docs/05-tick-engine.md explains every rule.

Scope: board geometry (tiles, walls, mini-pillars), line of sight, reach, the
orb "offset" (angle) rule, orb stepping, scoring and respawn timing, and a
stationary player holding attract or repel. Player walking/dragging, the
prototick flags and multi-player control are documented but not modelled here.
"""
from __future__ import annotations

import json
import math
import os
from dataclasses import dataclass, field

# Tile codes (Enums.ts)
FLOOR, BARRIER, ROCK, WATER, WALL_W, WALL_S, WALL_SW, MINI1, MINI2 = range(9)
# Path modes (Enums.ts): Sight < Orb < Player
SIGHT, ORB, PLAYER = 0, 1, 2

REACH = 10                 # GopBoard.defaults.reachDistance
REPEL_REACH = REACH - 2    # canReach(..., repel=True)
TICKS_PER_ALTAR = 199      # GameState.defaults.ticksPerAltar

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "altars")
ALTARS = ["air", "mind", "water", "earth", "fire", "body"]

Pt = tuple[int, int]


def sign(v: float) -> int:
    return 0 if v == 0 else (1 if v > 0 else -1)


def cheb(a: Pt, b: Pt) -> int:
    return max(abs(a[0] - b[0]), abs(a[1] - b[1]))


def in_scoring_zone(p: Pt) -> bool:
    """Orb.step: an orb within the 5x5 square around the centre has 'hit the altar'."""
    return abs(p[0]) <= 2 and abs(p[1]) <= 2


def in_altar(p: Pt) -> bool:
    return abs(p[0]) <= 1 and abs(p[1]) <= 1


def player_adjacent(p: Pt) -> bool:
    """Player standing next to the altar; the four diagonal corners excluded."""
    return abs(p[0]) <= 2 and abs(p[1]) <= 2 and not (abs(p[0]) == 2 and abs(p[1]) == 2)


class Board:
    def __init__(self, name: str):
        d = json.load(open(os.path.join(DATA, f"{name}.json")))
        self.name = name
        self.n = d["size"]
        self.half = self.n // 2
        rows = d["rows"]                       # north first
        self.grid = [[int(c) for c in rows[self.n - 1 - y]] for y in range(self.n)]  # grid[y+half][x+half]
        self.spawns: list[Pt] = [tuple(s) for s in d["spawns"]]
        self.extra_barriers: set[Pt] = set()

    # -- tiles --------------------------------------------------------------
    def in_range(self, p: Pt) -> bool:
        return abs(p[0]) <= self.half and abs(p[1]) <= self.half

    def get(self, p: Pt) -> int:
        if p in self.extra_barriers:
            return BARRIER
        if not self.in_range(p):
            return BARRIER
        return self.grid[p[1] + self.half][p[0] + self.half]

    def passable(self, p: Pt, mode: int) -> bool:
        t = self.get(p)
        return not (t == BARRIER or (mode >= ORB and t == ROCK) or (mode == PLAYER and t == WATER))

    def can_move_west(self, p: Pt, mode: int) -> bool:
        p2 = (p[0] - 1, p[1])
        t = self.get(p)
        return (self.in_range(p) and self.in_range(p2) and t != WALL_W and t != WALL_SW
                and self.passable(p, mode) and self.passable(p2, mode))

    def can_move_south(self, p: Pt, mode: int) -> bool:
        p2 = (p[0], p[1] - 1)
        t = self.get(p)
        return (self.in_range(p) and self.in_range(p2) and t != WALL_S and t != WALL_SW
                and self.passable(p, mode) and self.passable(p2, mode))

    def can_move(self, p: Pt, dx: int, dy: int, mode: int) -> bool:
        """GopBoard.canMove: one step of (dx, dy), each in {-1,0,1}."""
        if abs(dx) > 1 or abs(dy) > 1:
            return False
        ddx = 1 if dx == 1 else 0
        ddy = 1 if dy == 1 else 0
        x, y = p
        # "If it starts on a barrier, pretend that it's not for the moment."
        saved = None
        if not self.passable(p, mode) and self.in_range(p):
            saved = self.grid[y + self.half][x + self.half]
            self.grid[y + self.half][x + self.half] = FLOOR
        W, S = self.can_move_west, self.can_move_south
        try:
            if dy == 0:
                return W((x + ddx, y), mode)
            if dx == 0:
                return S((x, y + ddy), mode)
            a, b = (x + ddx, y + ddy), (x + ddx, y + ddy - 1)
            c = (x + ddx - 1, y + ddy)
            if mode == SIGHT:
                if (not W(a, mode) and not W(b, mode)) or (not S(a, mode) and not S(c, mode)):
                    return False
                if dx == dy:
                    return not ((not W(a, mode) and not S(a, mode)) or (not W(b, mode) and not S(c, mode)))
                return not ((not W(a, mode) and not S(c, mode)) or (not W(b, mode) and not S(a, mode)))
            target_tile = self.get((x + ddx, y + ddy))
            if (dx == -dy and target_tile == MINI1) or (dx == dy and target_tile == MINI2):
                return False
            return W(a, mode) and W(b, mode) and S(a, mode) and S(c, mode)
        finally:
            if saved is not None:
                self.grid[y + self.half][x + self.half] = saved

    # -- sight and reach ----------------------------------------------------
    def find_obstacle(self, los: list[Pt]) -> int:
        if not los:
            return -1
        if self.get(los[0]) == BARRIER:
            return 0
        for i in range(1, len(los)):
            p, prev = los[i], los[i - 1]
            if (i != len(los) - 1 or self.passable(p, ORB)) and \
                    not self.can_move(prev, p[0] - prev[0], p[1] - prev[1], SIGHT):
                return i
        return -1

    def can_reach(self, player: Pt, orb: Pt, repel: bool = False) -> bool:
        return (player != orb
                and cheb(player, orb) <= (REPEL_REACH if repel else REACH)
                and self.find_obstacle(line_of_sight(player, orb)) == -1)


def line_of_sight(p1: Pt, p2: Pt) -> list[Pt]:
    """GopBoard.getLineOfSight, including its two hard-coded edge cases."""
    (x1, y1), (x2, y2) = p1, p2
    dist_x, dist_y = x2 - x1, y2 - y1
    if dist_x == 0 and dist_y == 0:
        return []
    if x1 > x2:
        return list(reversed(line_of_sight(p2, p1)))
    if y1 > y2:
        return [(x, -y) for x, y in line_of_sight((x1, -y1), (x2, -y2))]
    if dist_x == 0:
        return [(x1, y) for y in range(y1, y2 + 1)]
    if dist_y == 0:
        return [(x, y1) for x in range(x1, x2 + 1)]
    if dist_x == dist_y:
        return [(x1 + i, y1 + i) for i in range(dist_x + 1)]
    if abs(dist_y) > abs(dist_x):
        if dist_x * dist_y > 0:
            return [(y, x) for x, y in line_of_sight((y1, x1), (y2, x2))]
        return [(-y, -x) for x, y in line_of_sight((-y1, -x1), (-y2, -x2))]
    # first octant: 0 < dist_y < dist_x
    result = [p1]
    x, y = x1 + 1, y1
    error = dist_x / 2
    while x <= x2:
        result.append((x, y))
        if error == 0:
            x += 1
            error += dist_y
        else:
            error += dist_y
            x += 1
            if error > dist_x:
                y += 1
                result.append((x - 1, y))
                error -= dist_x
            elif error == dist_x:
                y += 1
                if (dist_x == 6 and dist_y in (1, 5)) or (dist_x == 10 and dist_y in (1, 3, 7, 9)):
                    result.append((x, y - 1))
                else:
                    result.append((x - 1, y))
                error = 0
    return result


def orb_offset(diff: Pt, to_player: bool) -> Pt:
    """GopBoard.getOrbOffset: where a click sends the orb, relative to the orb.

    diff = player - orb. The slope m = |dy/dx| picks one of five 'angle
    buckets'; attract (to_player) never overshoots the tile next to you.
    """
    dxs, dys = sign(diff[0]), sign(diff[1])
    m = math.inf if diff[0] == 0 else abs(diff[1] / diff[0])
    if m > 2:
        r = (0, 2 * dys)
    elif m > 1:
        r = (dxs, 2 * dys)
    elif m == 1:
        r = (2 * dxs, 2 * dys)
    elif m >= 0.5:
        r = (2 * dxs, dys)
    else:
        r = (2 * dxs, 0)
    if not to_player:
        return r

    def absmin(a: int, b: int) -> int:
        return a if abs(a) < abs(b) else b
    return (absmin(r[0], diff[0] - dxs), absmin(r[1], diff[1] - dys))


def angle_bucket(diff: Pt) -> str:
    if diff == (0, 0):
        return "-"
    m = math.inf if diff[0] == 0 else abs(diff[1] / diff[0])
    if m > 2:
        return "V"          # vertical: (0, 2)
    if m > 1:
        return "v"          # steep: (1, 2)
    if m == 1:
        return "X"          # diagonal: (2, 2)
    if m >= 0.5:
        return "h"          # shallow: (2, 1)
    return "H"              # horizontal: (2, 0)


@dataclass
class Orb:
    pos: Pt
    target: Pt | None = None
    dead_time: int = 0
    scored: bool = False
    path: list[Pt] = field(default_factory=list)

    def step(self, board: Board) -> None:
        """Orb.step for one tick."""
        if self.target == self.pos:
            self.target = None
        if in_scoring_zone(self.pos):
            self.target = None
            self.dead_time += 1
            if self.dead_time >= 2:
                self.scored = True
            return
        if self.target is not None:
            off = (sign(self.target[0] - self.pos[0]), sign(self.target[1] - self.pos[1]))
            if not board.can_move(self.pos, off[0], off[1], ORB):
                if board.can_move(self.pos, off[0], 0, ORB):
                    off = (off[0], 0)
                elif board.can_move(self.pos, 0, off[1], ORB):
                    off = (0, off[1])
                else:
                    off = (0, 0)
            if off == (0, 0):
                self.target = None
            else:
                self.pos = (self.pos[0] + off[0], self.pos[1] + off[1])
                self.path.append(self.pos)


def hold(board: Board, player: Pt, orb_pos: Pt, repel: bool = False,
         max_ticks: int = 80) -> tuple[int | None, Orb]:
    """A stationary player clicks the orb on tick 1 and keeps holding.

    Returns (tick on which the score registers, orb) or (None, orb) if it never
    scores. Mirrors GameState.step: orbs step first, then players act.
    """
    orb = Orb(orb_pos, path=[orb_pos])
    for tick in range(1, max_ticks + 1):
        orb.step(board)
        if orb.scored:
            return tick, orb
        if orb.dead_time == 0 and board.can_reach(player, orb.pos, repel):
            if repel:
                if cheb(player, orb.pos) < REACH - 2:
                    o = orb_offset((player[0] - orb.pos[0], player[1] - orb.pos[1]), False)
                    orb.target = (orb.pos[0] - o[0], orb.pos[1] - o[1])
            else:
                o = orb_offset((player[0] - orb.pos[0], player[1] - orb.pos[1]), True)
                orb.target = (orb.pos[0] + o[0], orb.pos[1] + o[1])
        elif orb.target is None and orb.dead_time == 0:
            return None, orb
    return None, orb


def self_test() -> None:
    """Checks against the upstream QUnit test 'Simple scoring: 1-away':
    player (2,0), orb (2,-4) on Air, click then idle -> score after 5 ticks."""
    b = Board("air")
    t, _ = hold(b, (2, 0), (2, -4))
    assert t == 5, t
    # The line of sight is not mirror-symmetric east/west (RS Wiki Guide:
    # "Angles are now different depending on whether the orb is east of you or west of you").
    east = line_of_sight((0, 0), (6, 1))
    west_mirrored = [(-x, y) for x, y in line_of_sight((0, 0), (-6, 1))]
    assert east != west_mirrored
    print("self-test ok")


if __name__ == "__main__":
    self_test()
