// Messages between the browser and a room. JSON over one WebSocket per player.

import type { StillCue } from "./stills.js";
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
  /** A reaction still shown with it (engine/stills.ts): the line is its caption, with no bubble. A line with no text is the picture alone. */
  still?: StillCue;
}

/** One cell of an optional run's strip: a label over `of` pips with `n` lit, in a tone, and a small badge beside it (e.g. "x2"). */
export interface OptCell {
  label: string;
  n: number;
  of: number;
  tone: "us" | "her" | "chalk";
  badge?: string;
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
  /**
   * The optional runs of Part 1 (gameplay/optional-runs-prototype-brief.md). `strip`: what the top
   * of the screen shows for the whole run, cell by cell. `caption`: lines held on the screen (the
   * goal at the start, and any line that names the choice). The rest are marks a run draws on the
   * board. O1, Granny's rematch: `eye` (the wisp she is looking at), `goal` (where she has moved
   * the goal to: `live` once it has moved, with ticks left of `of`), `nap` (she dozes), `wall` (the
   * chalked best, and the score now). `record` comes with the end: the best to keep, whether it
   * was beaten, and how many times the run has been played.
   */
  opt?: {
    id: string;
    strip: OptCell[];
    caption?: { who: string; text: string }[];
    eye?: { wisp: number; from: number };
    goal?: { x: number; y: number; r: number; live: boolean; left: number; of: number };
    nap?: { who: number; left: number; of: number };
    wall?: { best: number; now: number; hers: number };
    record?: { id: string; best: number; won: boolean; count: number };
  };
  /** At the end: how bright the sky got (0 to 1, run 1 only), a summary, and the closing lines. */
  end?: { banked: number; kes: number; sky?: number; summary?: string; lines: StoryLine[]; /** No result screen: the page cuts to black and goes on (run 10). */ cut?: boolean };
  /**
   * Run 10, the ship home: the tick of the run and its fixed length; how far ahead of the bow the
   * patch is (tiles); the sea's light (0 night, 1 first light); how far home has come in over the
   * top of the screen (0 to 1, the last seconds); whether the bell from home is tolling; ticks the
   * lamp has guttered (the patch out of sight, before it starts again); and ticks since he went
   * over the rail.
   */
  ship?: { tick: number; ticks: number; lead: number; light: number; home: number; /** The bell from home rings on this tick. */ bell: boolean; /** How far his pull reaches in this run (tiles), and how far from the lamp the farthest lane is: from the band along a rail he reaches out to it. */ reach: number; far: number; gutter?: number; over?: number; /** Wisps the wind has just taken off the stern, or a bank has torn off his line (then with the row): the column (tiles from the lamp) and the tick. */ lost?: { x: number; y?: number; tick: number }[]; /** The lamp's fire (0 to 1), which is the ship's speed; absent when speed is not the difficulty. */ fire?: number; /** The cloud bank there is now: its side (-1 port, 1 starboard), the row its front has reached, its length and its speed in tiles a tick. */ bank?: { side: number; front: number; len: number; speed: number }; /** The big wisps (worth more), and the ones a bank is over now, by id. */ big?: number[]; hid?: number[]; /** The wisp on his line now. */ line?: number; /** What went into the lamp on this tick, in points (a small wisp is 1, a big one 3). */ fed?: number };
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
    /** Ticks the picture on screen is held for, so it can fade in and out over them. */
    stillTicks?: number;
    /** The village is drawn at the island's edge (a switch; off by default). */
    crowd?: boolean;
    /** The comet falling on the map: ticks since it was first seen. */
    comet?: number;
    lift?: number;
    lifts?: number;
    faltered?: boolean;
    hesta?: number;
  };
  /** Run 8, the Sieve: who the keeper is (a player who stands and watches), and which wells are about to have a wisp over them. Nothing is counted on screen. */
  sieve?: { keeper: number; /** How much of the supply has come (0 to 1): the morning's colour drains with it. */ drain?: number; /** The first fall: the tile to look down at, while nothing moves. */ look?: { x: number; y: number }; /** Wells (by their place in the shrine's list) where a wisp is about to appear: the air over them shimmers. */ warn?: number[]; /** The first pull: the rings closing in (`wind`), then everything holding (`hold`), with ticks left; the wisps that jumped, from where and toward which well; the wisp torn off his staff; the staged wisp to look at first; and which take it is. */ pull?: { phase: "wind" | "hold" | "tug" | "after"; left: number; /** The tug: the wisp it drags off his staff, and whether he is still holding it. */ tugged?: number; held?: boolean; moved: { id: number; x: number; y: number; well: number }[]; torn?: number; focus?: { x: number; y: number }; loud?: boolean } };
  /**
   * Run 9, the rescue: who Kes is; each boat's lamp (banks in it, of `perBoat`) and how many boats
   * have lifted; how far the cloud's edge is from the slip; the dark patch while it is about (its
   * middle in tiles, its step a tick, its half-width, ticks of warning left, which crossing, and
   * whether it drags); players whose glow is dark under it; and, once the last lamp is full, the
   * ticks since the boat lifted (-1 before it has) and who went aboard.
   */
  rescue?: {
    kes: number; boats: number[]; perBoat: number; lifted: number; cloud: number;
    /** The docked boat's lamp (the bank): its tile, how near a wisp must come, and whether it is dark just now (the patch over it, or no boat docked). */
    lamp?: { x: number; y: number; take: number; dark?: boolean; gutter?: number; went?: number; /** The patch is sitting on the boat. */ sat?: boolean; /** Ticks since it moved off a boat it sat on (for a while after). */ cold?: number; /** Bait: the lamp is not ready for its next wisp: ticks left of how many, and how many wait in its light. */ sip?: { left: number; of: number; n: number } };
    /** Banks still wanted, the cloud's edge at the start and where it ends the run (tiles from the slip). */
    left?: number; from?: number; reach?: number;
    /** Bait's safety net: wisps of Kes's that she keeps at the stones (hers, not his to pull). */
    kept?: number[];
    /** Kes's drop, the ring of stones: its tile and size. */
    drop?: { x: number; y: number; r: number };
    /** Wisps the lamp has just taken: where each flew in from. */
    flew?: { x: number; y: number; tick: number }[];
    /** The lamp has just flared (the tick): a pip more. */
    flare?: number;
    /** Lines held on the screen: the goal at the start, and any line that must land. */
    caption?: string[];
    /** The full-screen still that stops play, while it is up. */
    hold?: { id: string; left: number; of: number; line: string };
    /** A crossing being told (the patch on a clock): ticks until it sets out, of how many, and which crossing. */
    tell?: { left: number; of: number; n: number; /** Bait: what it would go for if it set out now (tile, how bright, and what it is). */ to?: { x: number; y: number; n: number; kind: "heap" | "string" | "lamp" | "none" } };
    patch?: { x: number; y: number; dx: number; dy: number; r: number; warn: number; n: number; drag?: boolean; /** React: the size it is swelling to. Sitting still at the end. */ big?: number; sit?: boolean }; dark?: number[]; /** Wisps it has covered, not seen again; and where each went out (tiles) and on which tick. */ taken?: number[]; outs?: { x: number; y: number; tick: number }[]; ending?: number; aboard?: number[];
  };
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
  /** Story run 9: go on from the full-screen still. */
  | { t: "on" }
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
