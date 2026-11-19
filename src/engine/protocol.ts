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
}

export type Phase = "lobby" | "countdown" | "playing" | "results";

export interface RoomView {
  code: string;
  phase: Phase;
  host: number | null;
  shrine: string;
  players: LobbyPlayer[];
  countdown: number;
  lastScores: [number, number] | null;
}

export type ClientMsg =
  | { t: "hello"; name: string; token?: string }
  | { t: "guild"; guild: Guild }
  | { t: "flame"; flame: Flame }
  | { t: "shrine"; shrine: string }
  | { t: "bot"; guild: Guild; hard?: boolean; remove?: boolean }
  | { t: "start" }
  | { t: "act"; action?: Action; toggleRun?: boolean; toggleMode?: boolean }
  | { t: "lobby" }
  | { t: "ping"; at: number };

export type ServerMsg =
  | { t: "welcome"; you: number; token: string }
  | { t: "room"; room: RoomView }
  | { t: "tick"; snap: GameSnapshot; tickMs: number }
  | { t: "error"; message: string }
  | { t: "pong"; at: number };
