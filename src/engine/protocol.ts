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
  /** Shown but not voiced (Nell and Sefa in Granny's game, Ladi 25 Nov). */
  quiet?: boolean;
  /** A thought, not said aloud: a thought bubble over its player, never voiced (Rook in run 7, Ladi 25 Nov). */
  thought?: boolean;
  /** Its voice may start while another is still speaking (Nell and Sefa's "Granny!" as Hesta lands). */
  over?: boolean;
}

/** One cell of an optional run's strip: a label over `of` pips with `n` lit, in a tone, and a small badge beside it (e.g. "x2"). */
export interface OptCell {
  label: string;
  n: number;
  of: number;
  tone: "us" | "her" | "chalk" | "water";
  badge?: string;
  /** Pips in groups of this many, with a gap between groups (Kes's strings of three). */
  group?: number;
  /** A bar instead of pips: how full it is, 0 to 1 (the light that is left). */
  bar?: number;
  /** The bar keeps the cell's own colour all the way down, with no warning at the last (run 10's distance home). */
  steady?: boolean;
  /** A notch across the bar at this share (0 to 1); below it the bar is dimmed (run 10: where the lamp keeps pace with the patch). */
  mark?: number;
  /** A tide mark instead of pips: how high the water stands (0 to 1), whether the tide is in, how much of this tide is left (1 to 0), and whether it is about to turn. */
  tide?: { level: number; in: boolean; share: number; soon: boolean };
  /** A tug of war instead of plain pips (the offspring fight): `mine` lit on its side from the left, `bank` lit on the brazier's side from the right, `loose` dim in the middle, the rest unlit. */
  tug?: { mine: number; loose: number; bank: number; /** The boy's light, as a marker counted in from the brazier's end: the brazier is brighter than him once its pips pass it. */ fen?: number };
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
    /** Granny's rematch: the wall's best before this one, the score now, and the times the children have reached four. */
    wall?: { best: number; now: number; hers: number; fours?: number };
    record?: { id: string; best: number; won: boolean; count: number; fours?: number };
    /** No pushing in this run: the button that changes pull to push is not shown. */
    noPush?: boolean;
    /** The Cove (optional run 2): the tide (how high the water stands over the flats, 0 to 1, and whether it is in), how far the pull reaches now, how much light is left (1 to 0), and the wisps left on wet stone. */
    tide?: { level: number; in: boolean; left: number; of: number; n: number };
    reach?: number;
    light?: number;
    stranded?: number[];
    /** The Cove: each tide pool (its middle, in tiles) and how many wisps are in it now. */
    pools?: { x: number; y: number; n: number }[];
    /** Kite Fell (optional run 3c): the mark by each vane (its tile and how near counts), how many wisps are on the wind toward it, and who is standing at it. */
    vanes?: { x: number; y: number; r: number; n: number; you?: boolean; her?: boolean }[];
    /** Tidepool Steps (optional run 3b): how high the water stands over each step's strips, 0 (stone) to 1, by step (0 the court, unused). */
    terraces?: number[];
    /** Moss Hollow (optional run 3a): the moss over each covered wisp (its tile from the brazier, the strokes left in it and what it began with, and its patch), and the last stroke (where, and on which tick). */
    moss?: { x: number; y: number; hp: number; of: number; patch: number }[];
    chip?: { x: number; y: number; tick: number; by: "rook" | "lumi" };
    /** Meters on the ground at people's feet (the offspring fight: Solenne's light, and the boy's in run 4): the tile, how full (0 to 1), the mark needed for what comes next (0 to 1), and whose colour. */
    /** Where to tap on the offspring's back (run 4): its back held with the shard out, `live` when a tap would strike or pull. */
    hit?: { x: number; y: number; live: boolean };
    /** The hunt: its eye's cone on the ground while the eye turns: its middle (tiles), facing (radians), half-width (degrees), its front edge and how far the cone reaches from its middle (tiles), and how far the eye has turned (0 to 1). */
    cone?: { x: number; y: number; face: number; deg: number; near: number; far: number; k: number };
    /** Where it will land (the offspring fight, run 4, through her wind-up): the middle and its half-width, tiles. */
    land?: { x: number; y: number; r: number };
    /** A mark on the ground where to stand (the offspring fight, round 1 of run 4). */
    stand?: { x: number; y: number };
    feet?: { x: number; y: number; f: number; mark?: number; tone: "her" | "fen"; /** It flashes (her hold nearly spent, while he is taught to cover the shard). */ flash?: boolean }[];
  };
  /**
   * Part 2, runs 3 and 4, the offspring fight (gameplay/part2/runs3-4-fight-brief.md). `run`: 3 or
   * 4. `part`: the opening pull, play, her flare between the runs, or the kill (all its light in
   * the brazier). `it`: the offspring, in tiles (fractional), its facing (radians, 0 east, y south),
   * what it is after, how much light is inside it (0 to 10), whether her blast holds it, how open
   * the wound is (0 to 1), and the tick it was last knocked back. `her`: Solenne, her light (0 to
   * `full`), how bright she looks, what she is doing and the ticks of it left, and her last shove,
   * blast or save. `fen`: the boy and his light. `shard`: run 4, whether it is uncovered and how
   * bright it is. `banked`: wisps in the brazier. `cycle`: run 4's blast cycle. `catches`: times it
   * has had Rook. `down`: ticks Rook is still down. `pulling`: ticks left of a pull from the wound.
   */
  fight?: {
    run: 3 | 4;
    part: "open" | "play" | "flare" | "kill";
    tick: number;
    it: { x: number; y: number; face: number; after: "her" | "fen" | "wisp" | "brazier" | "shard" | null; to?: { x: number; y: number }; inside: number; held: boolean; wound: number; knocked?: number; eating?: boolean; /** Run 4, the dark: no light shows its body (draw nothing of it but its eye and cone). */ hidden?: true; /** Its back glows where to strike: 1 held with the shard out, 2 and he is behind it (a tap strikes). */ strike?: 1 | 2; /** A leap to her, drawn by her flare: from, to, the tick it left and how many ticks it takes. */ leap?: { from: { x: number; y: number }; to: { x: number; y: number }; t0: number; ticks: number } };
    her: { x: number; y: number; light: number; full: number; glow: number; doing: "rest" | "windup" | "hold"; left: number; of: number; flash?: { kind: "shove" | "blast" | "save" | "flare"; tick: number } };
    fen: { x: number; y: number; light: number };
    shard?: { shown: boolean; glow: number; of: number };
    banked: number;
    wisps: number;
    /** Loose wisps still asleep (he has not pulled them): it can't see them. */
    asleep: number[];
    cycle: number;
    catches: number;
    down: number;
    pulling: number;
    /** Run 4's teaching (OFFSPRING.teach): the hint bubble to show now, and round 1's mark where to stand. */
    /** The hunt (OFFSPRING.hunt, .eye): its eye turning, ticks left of `of`, its cone either side of its facing (degrees) and how far it reaches (tiles from its front edge); the fire shut while it sits on it; light flung out of the wound lately, from its back to where it fell. */
    /** Run 4, the hunt: its eye turning (`left` of `of` ticks), then (left 0) its gaze holding, `gaze` of `hold` ticks left. */
    eye?: { left: number; of: number; cone: number; r: number; gaze?: number; hold?: number };
    /** Run 4, the dark: the pools of light (their edge is where it starts to show), where it is to be heard from, and whether her light fills the yard. */
    dark?: { pools: { k: "rook" | "shard" | "fire" | "wisp" | "her" | "fen"; x: number; y: number; r: number }[]; hear: { d: number; dx: number; dy: number }; flood?: true };
    shut?: boolean;
    flung?: { id: number; from: { x: number; y: number }; to: { x: number; y: number }; tick: number }[];
    teach?: { hint?: "show" | "strike" | "pull" | "cover" | "lure" | "loose" | "far" | "home" | "eye"; /** Run 4 again after a loss: the short hints. */ retry?: boolean; stand?: { x: number; y: number } };
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
    /** Busy Kes: the tile she keeps her face to while standing, and whether she is waving the people aboard. */
    kesLook?: { x: number; y: number; wave?: boolean };
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
  pond?: { lantern: { x: number; y: number }; leaving?: boolean; walk?: number; light?: "afternoon" | "morning" | "sunset" | "night" | "dusk"; looks?: { id: number; x: number; y: number }[]; kitchen?: number;
    /** Part 1's chain: the walk's last tap was made, and the page goes on. */
    done?: boolean;
    /** An optional run asked for in the walk (counted, so each ask opens it once). */
    optional?: { id: string; n: number };
    /** Who to talk to next, shown on screen (Ladi, 25 Nov). */
    goal?: string;
    /** A tap that would start a run asks first (Ladi, 25 Nov): the question and its two buttons. */
    ask?: { text: string; choices: string[]; no: string } };
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
  /** Part 2, run 4: show or hide the shard, or pull a wisp out of the offspring's wound. */
  | { t: "fight"; shard?: boolean; pull?: boolean; /** A tap on its back: a strike from behind with the shard out, or a pull with the wound open. */ hit?: boolean }
  /** A walk: the answer to its "Play ...?" question. */
  | { t: "answer"; yes: boolean; pick?: number }
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
