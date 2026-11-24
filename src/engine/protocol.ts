// Messages between the browser and a room. JSON over one WebSocket per player.

import type { Action, GameSnapshot, Guild } from "./game.js";

export const FLAMES = ["amber", "rose", "jade", "frost", "ember", "pearl"] as const;
export type Flame = (typeof FLAMES)[number];
export const FLAME_COLORS: Record<Flame, string> = {
  amber: "#ffc94a",
  rose: "#ff7aa8",
  jade: "#5fe0a0",
  frost: "#8fd8ff",
  ember: "#ff6a3a",
  pearl: "#f4f0ff",
};

export interface LobbyPlayer {
  id: number;
  name: string;
  guild: Guild;
  flame: Flame;
  connected: boolean;
  bot: boolean;
  /** For a bot: its level, and whether it plays as a team with its guild. */
  botLevel?: BotLevelName;
  coop?: boolean;
}

export type BotLevelName = "easy" | "medium" | "hard";

export type Phase = "lobby" | "countdown" | "playing" | "results";

export interface RoomView {
  code: string;
  phase: Phase;
  host: number | null;
  shrine: string;
  /** Teams this round: 2, 3 or 4. With 3 or 4 the round is played on the four-way island. */
  teams: number;
  players: LobbyPlayer[];
  countdown: number;
  lastScores: number[] | null;
  /** Ticks in this round, when it isn't the usual length (a story movement). */
  roundTicks?: number;
  /** Set in a story run: what the story layer shows. */
  story?: StoryView;
}

/** A line of a story run, shown as a caption with the speaker's name. */
export interface StoryLine {
  who: string;
  text: string;
  /**
   * How it's shown. "talk": a dialog box with a portrait, at the bells, when play is stopped.
   * Otherwise it's a bark during play: by the wisp `wisp`, by Hesta's ring (`ring`), or in a
   * small chip in the corner.
   */
  talk?: boolean;
  wisp?: number;
  ring?: boolean;
  /** A bark over this player (the speaker herself, in run 2). */
  player?: number;
  /** The portrait's mood, e.g. "smug"; left out, it's picked from the line (engine/moods.ts). */
  mood?: string;
}

export interface StoryView {
  /** The run's name, e.g. "The Grand Kindling". */
  run: string;
  /** Which movement (0, 1, 2) and its title. */
  movement: number;
  title: string;
  /** The tile Hesta's ring marks, if any. */
  ring: { x: number; y: number } | null;
  /** A wisp picked out for Rook: one the crew left him (Hesta), or the one Lumi is calling. */
  mark: { wisp: number; who: string } | null;
  /** Kes's island's score (scripted). */
  kes: number;
  /** The other score in the HUD, if any: Kes's island in run 1, Rook in run 2's last round. */
  rival?: { name: string; short: string; score: number } | null;
  /** Shown in place of the clock, e.g. "Pulls left: 4". */
  note?: string;
  /** The player can call a partner to a tile (run 2), or send one (run 4). */
  canCall?: boolean;
  /** Who a call goes to, when it's someone to send (run 4: "Lumi"); left out, it's run 2's call to Rook. */
  callWho?: string;
  /** Run 4's Steps: the pool the next wave will come up on, shimmering until it does. */
  shimmer?: { x: number; y: number }[];
  /** Where a wisp pulled by two heads: the point halfway between them. */
  halfway?: { x: number; y: number } | null;
  /** The tile the partner was last called to, while he's on his way or standing there. */
  called?: { x: number; y: number } | null;
  /** At the end: how bright the sky got (0 to 1, run 1 only), a summary, and the closing lines. */
  end?: { banked: number; kes: number; sky?: number; summary?: string; lines: StoryLine[] };
  /**
   * Runs 6 and 7, the night the island goes down. `part`: run 6, its scripted bottom, the three
   * stills, run 7, the hold after the last bank, the picture of the island clear of the cloud, and
   * the village gathering after. `cloud`: where the cloud's edge is in run 6, tiles from the
   * brazier. `lurch`: how many times the ground has lurched (down in run 6, up in run 7).
   * `fire`, `great` (the shrine's alarm bell), `bell` (Lumi's hand bell): which sounds are still going. `blind`: the cloud is over Rook and he sees no
   * wisp. `orange`: lit from above. `still`: which picture is held. `lift`: banks in run 7, each
   * lifting the island, of `lifts` to fill the fire; `cloudGone`: the lifts that clear the wall.
   */
  dying?: {
    part: "six" | "bottom" | "stills" | "seven" | "lifted" | "risen" | "after";
    strike: { x: number; y: number; r: number };
    cloud?: number;
    lurch?: number;
    fire?: boolean;
    bell?: boolean;
    great?: boolean;
    blind?: boolean;
    orange?: boolean;
    still?: number;
    lift?: number;
    lifts?: number;
    faltered?: boolean;
    hesta?: number;
  };
  /** Run 8, the Sieve: who the keeper is (a player who stands and watches), and which wells are about to have a wisp over them. Nothing is counted on screen. */
  sieve?: { keeper: number; /** How much of the supply has come (0 to 1): the morning's colour drains with it. */ drain?: number; /** The first fall: the tile to look down at, while nothing moves. */ look?: { x: number; y: number }; /** Wells (by their place in the shrine's list) where a wisp is about to appear: the air over them shimmers. */ warn?: number[]; /** The first pull: the rings closing in (`wind`), then everything holding (`hold`), with ticks left and the wisps that jumped. */ pull?: { phase: "wind" | "hold"; left: number; moved: number[] } };
  /** The free walk on the pond: no score, people can be tapped, and Lumi's lantern lies by the water. */
  /** kitchen: how many times Rook has gone in his door this walk (from walk 2); a rise opens the kitchen still. */
  pond?: { lantern: { x: number; y: number }; leaving?: boolean; walk?: number; light?: "afternoon" | "morning" | "night" | "dusk"; kitchen?: number };
}

export type ClientMsg =
  | { t: "hello"; name: string; token?: string }
  | { t: "guild"; guild: Guild }
  | { t: "flame"; flame: Flame }
  | { t: "shrine"; shrine: string }
  | { t: "teams"; teams: number }
  | { t: "bot"; guild: Guild; level?: "easy" | "medium" | "hard"; hard?: boolean; remove?: boolean }
  | { t: "botset"; id: number; level?: BotLevelName; coop?: boolean }
  | { t: "start" }
  | { t: "act"; action?: Action; toggleRun?: boolean; toggleMode?: boolean }
  | { t: "lobby" }
  /** Story run 2: call the partner to a tile. */
  | { t: "call"; x: number; y: number }
  | { t: "ping"; at: number };

export type ServerMsg =
  | { t: "welcome"; you: number; token: string }
  | { t: "room"; room: RoomView }
  | { t: "tick"; snap: GameSnapshot; tickMs: number; bots?: BotDebug[] }
  /** Story runs: lines said on this tick. */
  | { t: "say"; lines: StoryLine[] }
  | { t: "error"; message: string }
  | { t: "pong"; at: number };

/** A bot's state for the debug overlay. */
export interface BotDebug {
  id: number;
  name: string;
  guild: number;
  level: string;
  role: string;
  half?: string;
  home?: string;
  team?: string;
  intent: string;
}
