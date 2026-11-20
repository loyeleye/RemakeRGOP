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
