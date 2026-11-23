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
  /** At the end: how bright the sky got (0 to 1), and the closing lines. */
  end?: { banked: number; kes: number; sky: number; lines: StoryLine[] };
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
