// A simple lamplighter bot: stands on the brazier rim across from a wisp and pulls it over
// the rim (a pull stops one tile short of you, so pulling from the near side would park the
// wisp just outside); a far wisp is first pulled closer from the near side. With `pushy`
// set it also shoves rival wisps that get close to the rim.
// Used for practice rivals, tests and (later) story-mode opponents.

import { Mover, cheb, pt, type Pt } from "./board.js";
import type { Command, Game, Wisp } from "./game.js";

export interface BotStyle {
  /** Push rival wisps within this many tiles of the brazier rim (0 = never). */
  pushy: number;
  /** Chance per decision to dawdle for a tick (keeps easy bots beatable). */
  sloppiness: number;
}

export const BOT_EASY: BotStyle = { pushy: 0, sloppiness: 0.35 };
export const BOT_FAIR: BotStyle = { pushy: 3, sloppiness: 0.1 };

export function botCommand(game: Game, id: number, style: BotStyle, rand: () => number = Math.random): Command | null {
  const me = game.players.find((p) => p.id === id);
  if (!me) return null;
  const c = game.board.center;
  const live = (w: Wisp) => !game.board.inBankZone(w.pos);

  // Shove a rival wisp that's about to be banked.
  if (style.pushy > 0) {
    const threat = game.wisps
      .filter((w) => w.guild !== me.guild && live(w) && cheb(w.pos, c) <= 2 + style.pushy && w.target)
      .sort((a, b) => cheb(a.pos, c) - cheb(b.pos, c))[0];
    if (threat && game.inReach({ ...me, mode: "push" }, threat)) {
      if (me.action.kind === "staff" && me.action.wisp === threat.id && me.mode === "push") return null;
      return { action: { kind: "staff", wisp: threat.id }, toggleMode: me.mode !== "push" };
    }
  }

  const fixMode = me.mode !== "pull";
  // Keep holding a wisp we're already pulling while it's in flight, or while we're still
  // walking into reach of it.
  if (me.action.kind === "staff" && !fixMode) {
    const w = game.wisps[me.action.wisp];
    if (w && w.guild === me.guild && live(w) && !me.slipped && (w.target || me.beam !== w.id)) return null;
  }
  if (rand() < style.sloppiness) return fixMode ? { toggleMode: true } : null;

  const target = game.wisps
    .filter((w) => w.guild === me.guild && live(w))
    .sort((a, b) => cheb(a.pos, c) - cheb(b.pos, c))[0];
  if (!target) return fixMode ? { toggleMode: true, action: { kind: "idle" } } : null;

  // Across the brazier if the wisp will be in reach from there, else the near side.
  const far = cheb(target.pos, c) + 2 <= 10;
  const spot = rimSpot(game, far ? pt(2 * c.x - target.pos.x, 2 * c.y - target.pos.y) : target.pos);
  const atSpot = spot && me.pos.x === spot.x && me.pos.y === spot.y;
  if (spot && !atSpot && me.action.kind !== "walk") {
    return { action: { kind: "walk", to: spot }, toggleMode: fixMode || undefined };
  }
  if (spot && !atSpot) return fixMode ? { toggleMode: true } : null;
  return { action: { kind: "staff", wisp: target.id }, toggleMode: fixMode || undefined };
}

/** The walkable tile 2 from the brazier centre that faces `toward` best. */
function rimSpot(game: Game, toward: Pt): Pt | null {
  const c = game.board.center;
  let best: Pt | null = null;
  let bestD = Infinity;
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== 2) continue;
      const p = pt(c.x + dx, c.y + dy);
      if (!game.board.passable(p, Mover.Walker)) continue;
      const d = (p.x - toward.x) ** 2 + (p.y - toward.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
  return best;
}

