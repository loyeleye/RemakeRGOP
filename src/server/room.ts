// One room: a lobby, then rounds. The room owns the authoritative Game and runs its clock.
// It knows nothing about the transport: the Node server and the Cloudflare Durable Object
// both hand it a `send` function per connection and feed it parsed messages.

import { BOT_LEVELS, botCommand, botTraces, type BotStyle } from "../engine/bot.js";
import { COUNTDOWN_TICKS, Game, MAX_TEAMS, TICK_MS, type Action, type Guild } from "../engine/game.js";
import { SHRINES, shrineById, shrineFor } from "../engine/maps.js";
import { FLAMES, type ClientMsg, type Flame, type LobbyPlayer, type Phase, type RoomView, type ServerMsg } from "../engine/protocol.js";

export const MAX_PER_GUILD = 4;
const NAME_MAX = 16;

export interface Clock {
  every(ms: number, fn: () => void): () => void;
}

export const realClock: Clock = {
  every(ms, fn) {
    const h = setInterval(fn, ms);
    return () => clearInterval(h);
  },
};

interface Seat extends Omit<LobbyPlayer, "bot"> {
  token: string;
  send: ((m: ServerMsg) => void) | null;
  bot: BotStyle | null;
}

const BOT_NAMES = ["Wick", "Ember", "Moth", "Cinder", "Glim", "Soot", "Tallow", "Flint"];

export class Room {
  private seats: Seat[] = [];
  private nextId = 1;
  private phase: Phase = "lobby";
  private host: number | null = null;
  private shrine = SHRINES[0]!.id;
  private countdown = 0;
  private game: Game | null = null;
  private stop: (() => void) | null = null;
  private teams = 2;
  private lastScores: number[] | null = null;

  constructor(
    readonly code: string,
    private clock: Clock = realClock,
    private seed: () => number = () => Math.floor(Math.random() * 2 ** 31),
    private makeToken: () => string = () => Math.random().toString(36).slice(2) + Date.now().toString(36),
  ) {}

  get empty() {
    return this.seats.every((s) => !s.connected || s.bot);
  }

  /** A new connection. Returns the handlers the transport calls. */
  connect(send: (m: ServerMsg) => void) {
    let seat: Seat | null = null;
    return {
      message: (raw: string) => {
        let msg: ClientMsg;
        try {
          msg = JSON.parse(raw) as ClientMsg;
        } catch {
          return;
        }
        if (!msg || typeof msg !== "object") return;
        if (msg.t === "ping") return send({ t: "pong", at: Number(msg.at) || 0 });
        if (msg.t === "hello") {
          seat = this.hello(msg, send);
          return;
        }
        if (seat) this.handle(seat, msg);
      },
      close: () => {
        if (!seat) return;
        seat.connected = false;
        seat.send = null;
        if (this.phase === "lobby") this.seats = this.seats.filter((s) => s !== seat);
        this.fixHost();
        this.broadcastRoom();
        if (this.empty) this.endClock();
      },
    };
  }

  private hello(msg: Extract<ClientMsg, { t: "hello" }>, send: (m: ServerMsg) => void): Seat | null {
    const name = cleanName(msg.name);
    let seat = msg.token ? this.seats.find((s) => s.token === msg.token) : undefined;
    if (seat) {
      // Reconnect: take the seat back.
      seat.send = send;
      seat.connected = true;
      if (name) seat.name = name;
    } else {
      if (this.phase !== "lobby") {
        send({ t: "error", message: "A round is in progress. Try again when it ends." });
        return null;
      }
      const counts = this.guildCounts();
      const guild = this.smallestGuild();
      if (counts[guild]! >= MAX_PER_GUILD) {
        send({ t: "error", message: `This room is full (${MAX_PER_GUILD} per guild).` });
        return null;
      }
      seat = {
        id: this.nextId++,
        name: name || `Lamplighter ${this.nextId - 1}`,
        guild,
        flame: FLAMES[(this.nextId - 2) % FLAMES.length]!,
        connected: true,
        token: this.makeToken(),
        send,
        bot: null,
      };
      this.seats.push(seat);
    }
    this.fixHost();
    send({ t: "welcome", you: seat.id, token: seat.token });
    this.broadcastRoom();
    if (this.game) send({ t: "tick", snap: this.game.snapshot(), tickMs: TICK_MS });
    return seat;
  }

  private handle(seat: Seat, msg: ClientMsg) {
    switch (msg.t) {
      case "guild":
        if (this.phase !== "lobby" || !this.validGuild(msg.guild)) return;
        if (this.guildCounts()[msg.guild]! >= MAX_PER_GUILD && seat.guild !== msg.guild) return;
        seat.guild = msg.guild;
        return this.broadcastRoom();
      case "flame":
        if (!FLAMES.includes(msg.flame as Flame)) return;
        seat.flame = msg.flame;
        return this.broadcastRoom();
      case "shrine":
        if (seat.id !== this.host || this.phase !== "lobby") return;
        this.shrine = shrineById(String(msg.shrine)).id;
        return this.broadcastRoom();
      case "teams": {
        if (seat.id !== this.host || this.phase !== "lobby") return;
        const n = Number(msg.teams);
        if (!Number.isInteger(n) || n < 2 || n > MAX_TEAMS) return;
        this.teams = n;
        // Anyone on a team that's gone moves to the smallest team left (bots that don't fit go).
        for (const s of [...this.seats]) {
          if (s.guild < n) continue;
          const g = this.smallestGuild();
          if (this.guildCounts()[g]! >= MAX_PER_GUILD) {
            if (s.bot) this.seats = this.seats.filter((o) => o !== s);
            else s.guild = g;
          } else s.guild = g;
        }
        return this.broadcastRoom();
      }
      case "bot": {
        if (seat.id !== this.host || this.phase !== "lobby") return;
        if (!this.validGuild(msg.guild)) return;
        const g = msg.guild;
        if (msg.remove) {
          const bots = this.seats.filter((s) => s.bot && s.guild === g);
          const last = bots[bots.length - 1];
          if (last) this.seats = this.seats.filter((s) => s !== last);
        } else {
          const level = msg.level && msg.level in BOT_LEVELS ? msg.level : msg.hard ? "hard" : "medium";
          this.addBot(g, BOT_LEVELS[level]);
        }
        return this.broadcastRoom();
      }
      case "start":
        if (seat.id !== this.host || this.phase !== "lobby") return;
        return this.startCountdown();
      case "lobby":
        if (seat.id !== this.host || this.phase !== "results") return;
        this.phase = "lobby";
        this.game = null;
        this.seats = this.seats.filter((s) => s.connected || s.bot);
        return this.broadcastRoom();
      case "act": {
        if (!this.game || this.phase !== "playing") return;
        const action = cleanAction(msg.action, this.game.wisps.length, this.game.board.width, this.game.board.height);
        this.game.command(seat.id, { action, toggleRun: !!msg.toggleRun, toggleMode: !!msg.toggleMode });
        return;
      }
    }
  }

  /** Adds a computer lamplighter to a guild, if there's room. */
  addBot(guild: Guild, style: BotStyle) {
    if (!this.validGuild(guild) || this.guildCounts()[guild]! >= MAX_PER_GUILD) return;
    const id = this.nextId++;
    this.seats.push({
      id,
      name: `${BOT_NAMES[id % BOT_NAMES.length]} (bot)`,
      guild,
      flame: FLAMES[id % FLAMES.length]!,
      connected: true,
      token: "",
      send: null,
      bot: style,
    });
  }

  private startCountdown() {
    const connected = this.seats.filter((s) => s.connected);
    if (connected.length === 0) return;
    this.game = new Game(
      shrineFor(this.shrine, this.teams),
      connected.map((s) => ({ id: s.id, guild: s.guild, name: s.name })),
      this.seed(),
    );
    this.phase = "countdown";
    this.countdown = COUNTDOWN_TICKS;
    this.broadcastRoom();
    this.broadcastTick();
    this.endClock();
    this.stop = this.clock.every(TICK_MS, () => this.onTick());
  }

  /** One clock tick. Public so tests can drive it. */
  onTick() {
    if (this.phase === "countdown") {
      this.countdown--;
      if (this.countdown <= 0) this.phase = "playing";
      this.broadcastRoom();
      return;
    }
    if (this.phase !== "playing" || !this.game) return;
    for (const s of this.seats) {
      if (!s.bot) continue;
      const cmd = botCommand(this.game, s.id, s.bot);
      if (cmd) this.game.command(s.id, cmd);
    }
    this.game.step();
    this.broadcastTick();
    if (this.game.finished) {
      this.phase = "results";
      this.lastScores = [...this.game.scores];
      this.endClock();
      this.broadcastRoom();
    }
  }

  private endClock() {
    this.stop?.();
    this.stop = null;
  }

  private broadcastTick() {
    if (!this.game) return;
    const traces = botTraces(this.game);
    const level = (b: BotStyle) => (Object.entries(BOT_LEVELS).find(([, v]) => v === b)?.[0] ?? "custom");
    const bots = this.seats
      .filter((s) => s.bot)
      .map((s) => ({ id: s.id, name: s.name, guild: s.guild, level: level(s.bot!), role: "solo", intent: "", ...traces.get(s.id) }));
    const m: ServerMsg = { t: "tick", snap: this.game.snapshot(), tickMs: TICK_MS, bots };
    for (const s of this.seats) s.send?.(m);
  }

  view(): RoomView {
    return {
      code: this.code,
      phase: this.phase,
      host: this.host,
      shrine: this.shrine,
      teams: this.teams,
      players: this.seats.map(({ id, name, guild, flame, connected, bot }) => ({ id, name, guild, flame, connected, bot: !!bot })),
      countdown: this.countdown,
      lastScores: this.lastScores,
    };
  }

  private broadcastRoom() {
    const m: ServerMsg = { t: "room", room: this.view() };
    for (const s of this.seats) s.send?.(m);
  }

  private fixHost() {
    const live = this.seats.filter((s) => s.connected && !s.bot);
    if (!live.some((s) => s.id === this.host)) this.host = live[0]?.id ?? null;
  }

  private guildCounts(): number[] {
    const c = Array<number>(this.teams).fill(0);
    for (const s of this.seats) if (s.guild < this.teams) c[s.guild]!++;
    return c;
  }

  private smallestGuild(): Guild {
    const c = this.guildCounts();
    return c.indexOf(Math.min(...c)) as Guild;
  }

  private validGuild(g: unknown): g is Guild {
    return Number.isInteger(g) && (g as number) >= 0 && (g as number) < this.teams;
  }
}

function cleanName(raw: unknown): string {
  return String(raw ?? "")
    .replace(/[\u0000-\u001f<>]/g, "")
    .trim()
    .slice(0, NAME_MAX);
}

function cleanAction(raw: unknown, wisps: number, w: number, h: number): Action | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const a = raw as Record<string, unknown>;
  if (a.kind === "idle") return { kind: "idle" };
  if (a.kind === "staff" && Number.isInteger(a.wisp) && (a.wisp as number) >= 0 && (a.wisp as number) < wisps)
    return { kind: "staff", wisp: a.wisp as number };
  if (a.kind === "walk" && a.to && typeof a.to === "object") {
    const { x, y } = a.to as Record<string, unknown>;
    if (Number.isInteger(x) && Number.isInteger(y) && (x as number) >= 0 && (y as number) >= 0 && (x as number) < w && (y as number) < h)
      return { kind: "walk", to: { x: x as number, y: y as number } };
  }
  return undefined;
}

/** Room codes: 4 letters, no vowels-that-spell-things, no lookalikes. */
export function newRoomCode(): string {
  const A = "BCDFGHJKLMNPQRSTVWXZ";
  let s = "";
  for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}

export function normalizeCode(raw: string): string | null {
  const c = raw.toUpperCase().replace(/[^A-Z]/g, "");
  return c.length === 4 ? c : null;
}
