// Runs 3 and 4: the offspring's own sounds, and Rook's grunt when it throws him (p2-rook-hit-1, -2) (the gameplay thread's DRAFT pack, 27 Nov:
// gameplay/audio/part2/offspring/, its README the cue sheet). ElevenLabs sound effects, shipped only
// inside music/p2-fight.pack.json with the fight music stems (base64 by name), never as loose files.
//
// Each tick the fight's view is compared with the last one, and what changed is what it did: it
// stepped, ate, turned its eye, was struck, jumped, and so on. Anything it does at a distance goes
// through the knock's own curve (`nearness`, fight-music.ts) and is panned to its side of him, so in
// the dark he hears where it is. The gains are the gameplay thread's starting guesses, to be set by
// Ladi's ear.

import type { StoryView } from "../engine/protocol.js";
import { FIGHT_MUSIC, FIGHT_MUTE, duckFightMusic, nearness } from "./fight-music.js";
import { audioOut } from "./sound.js";

type Fight = NonNullable<StoryView["fight"]>;

export const OFFSPRING_SFX = {
  /** The whole pack's level, under the music's. */
  gain: 0.9,
  /** Each sound's starting gain (the README's guesses; the rest 1). */
  gains: { step: 0.35, limp: 0.5, drink: 0.5, "light-land": 0.5, tear: 0.7, "eye-turn": 0.8, gaze: 0.8 } as Record<string, number>,
  /** A step every `stepEvery` ticks while it walks; the limp's scrape every `limpEvery`. */
  stepEvery: 2,
  limpEvery: 3,
  /** The drink loop's fade in and out (s). */
  drinkFade: [0.2, 0.3] as const,
  /** A flung light lands this long after it is torn out (the view's arc, offspring-dress.ts). */
  flight: 0.55,
  /** Rook's grunt when he is thrown, this long after the hit (s): Gemini, in his voice, a semitone down. */
  gruntAfter: 0.05,
};

const NAMES = ["step", "limp", "wake", "alert", "eat", "drink", "eye-turn", "gaze", "catch", "loss", "strike", "hurt", "tear", "light-land", "bolt", "bolt-land", "ward", "stun", "held", "hop", "land", "knockdown", "kill", "rook-hit-1", "rook-hit-2"] as const;
type Name = (typeof NAMES)[number];

/** Its sounds are `p2-off-<name>` in the pack; Rook's own, `p2-<name>`. */
const key = (n: Name) => (n.startsWith("rook-") ? `p2-${n}` : `p2-off-${n}`);

let buffers: Partial<Record<Name, AudioBuffer>> | null = null;
let asked = false;
function load(c: AudioContext) {
  if (asked) return;
  asked = true;
  fetch("music/p2-fight.pack.json")
    .then((r) => (r.ok ? (r.json() as Promise<Record<string, string>>) : Promise.reject(new Error(String(r.status)))))
    .then((b64s) =>
      Promise.all(
        NAMES.filter((n) => b64s[key(n)]).map((n) =>
          c.decodeAudioData(Uint8Array.from(atob(b64s[key(n)]!), (ch) => ch.charCodeAt(0)).buffer).then((b) => [n, b] as const),
        ),
      ),
    )
    .then((es) => (buffers = Object.fromEntries(es)))
    .catch(() => {
      /* missing: the fight plays without its sounds */
    });
}

interface Voice {
  src: AudioBufferSourceNode;
  g: GainNode;
}

/** Where it is to be heard from: the dark's reading, or full and centred when there is none. */
function place(f: Fight) {
  const h = f.dark?.hear, H = FIGHT_MUSIC.hearing;
  return h ? { g: nearness(h.d), pan: Math.max(-1, Math.min(1, h.dx / H.panAt)) * H.pan } : { g: 1, pan: 0 };
}

class Sfx {
  bus: GainNode;
  last: Fight | null = null;
  drink: Voice | null = null;
  held: Voice | null = null;
  gaze: Voice | null = null;
  walked = 0;
  /** Which of Rook's two grunts is next, so a throw never sounds the same twice running. */
  grunt = 0;
  limped = 0;
  constructor(
    private c: AudioContext,
    out: GainNode,
    private b: Partial<Record<Name, AudioBuffer>>,
  ) {
    this.bus = c.createGain();
    this.bus.gain.value = OFFSPRING_SFX.gain;
    this.bus.connect(out);
  }

  /** Play a sound now (or `delay` s from now), at its own gain times `g`, panned; looping if asked. */
  play(n: Name, at: { g: number; pan: number } = { g: 1, pan: 0 }, delay = 0, loop = false): Voice | null {
    const buf = this.b[n];
    if (!buf) return null;
    const src = this.c.createBufferSource(), g = this.c.createGain();
    src.buffer = buf;
    src.loop = loop;
    g.gain.value = (OFFSPRING_SFX.gains[n] ?? 1) * at.g;
    const pan = typeof this.c.createStereoPanner === "function" ? this.c.createStereoPanner() : null;
    if (pan) (pan.pan.value = at.pan), src.connect(g).connect(pan).connect(this.bus);
    else src.connect(g).connect(this.bus);
    src.start(this.c.currentTime + delay);
    src.onended = () => (src.disconnect(), g.disconnect(), pan?.disconnect());
    return { src, g };
  }
  stop(v: Voice | null, fade = 0) {
    if (!v) return null;
    const a = this.c.currentTime;
    try {
      if (fade > 0) {
        v.g.gain.setTargetAtTime(0, a, fade / 3);
        v.src.stop(a + fade);
      } else v.src.stop();
    } catch {
      /* already stopped */
    }
    return null;
  }

  step(f: Fight) {
    const S = OFFSPRING_SFX, p = this.last, at = place(f), it = f.it;
    this.last = f;
    if (!p || f.tick <= p.tick) return;
    // The kill: its death cry and the chimes as its light leaves it, at once; every loop let go; nothing else.
    if (f.dying) {
      if (!p.dying) {
        this.play("kill");
        this.drink = this.stop(this.drink, 0.2);
        this.held = this.stop(this.held, 0.2);
        this.gaze = this.stop(this.gaze);
        duckFightMusic(false);
      }
      return;
    }
    // Walking (one step every other tick), or the hurt crawl and the limp back (a scrape every third).
    const moved = Math.hypot(it.x - p.it.x, it.y - p.it.y) > 0.05 && !it.leap;
    if (moved && it.crawl) (this.walked = 0), ++this.limped % S.limpEvery === 1 && this.play("limp", at);
    else if (moved) (this.limped = 0), ++this.walked % S.stepEvery === 1 && this.play("step", at);
    else this.walked = this.limped = 0;
    // It turns on the shard.
    if (it.after === "shard" && p.it.after !== "shard") this.play("alert", at);
    // A loose light eaten; the brazier drunk from, looped for as long as it drinks.
    if (it.inside > p.it.inside && it.after !== "brazier") this.play("eat", at);
    const drinking = !!it.eating && it.after === "brazier";
    if (drinking && !this.drink) {
      this.drink = this.play("drink", at, 0, true);
      if (this.drink) (this.drink.g.gain.value = 0), this.drink.g.gain.setTargetAtTime((S.gains.drink ?? 1) * at.g, this.c.currentTime, S.drinkFade[0] / 3);
    } else if (drinking && this.drink) this.drink.g.gain.setTargetAtTime((S.gains.drink ?? 1) * at.g, this.c.currentTime, 0.1);
    else if (!drinking && this.drink) this.drink = this.stop(this.drink, S.drinkFade[1]);
    // Its eye: the turn (exactly its ticks), then the gaze (exactly its hold), cut dead if it lets go early. The music ducks under both.
    if (f.eye && !p.eye) this.play("eye-turn", at);
    if (f.eye?.gaze !== undefined && p.eye?.gaze === undefined) this.gaze = this.play("gaze", at);
    if (!f.eye && p.eye) this.gaze = this.stop(this.gaze);
    duckFightMusic(!!f.eye);
    // His strike lands (the wound opens), with its cry.
    if (it.wound > 0 && !(p.it.wound > 0)) (this.play("strike"), this.play("hurt"));
    // A light torn out, and where it falls.
    if (it.inside < p.it.inside) this.play("tear");
    for (const q of f.flung ?? []) if (q.tick === f.tick) this.play("light-land", place(f), S.flight);
    // The catch (the second is the loss, played at the end).
    if (f.catches > p.catches && f.catches === 1) this.play("catch");
    // Its jump to safety: the shriek at take-off, a far thud where it lands; its growl when its time away ends.
    if (f.bolt && f.bolt.t0 !== p.bolt?.t0) this.play("bolt", at);
    if (f.bolt && f.tick === f.bolt.t0 + f.bolt.ticks) this.play("bolt-land", at);
    if (p.safe && !f.safe) this.play("wake", at);
    if (f.safe?.ward !== undefined && f.safe.ward !== p.safe?.ward) this.play("ward", at);
    // Her blast or flare hits it; held, its trembling for as long as she holds it.
    const fl = f.her.flash;
    if (fl && (fl.kind === "blast" || fl.kind === "flare") && fl.tick !== p.her.flash?.tick) this.play("stun", at);
    // It reaches the boy: its drink as his light streams out of him.
    if (f.drain && !p.drain) this.play("drink", at, 0.55);
    // Her save: the stun as her beam lands on its eye, and its cry as it is thrown back.
    if (fl && fl.kind === "save" && fl.tick !== p.her.flash?.tick) (this.play("stun", at, 0.25), this.play("hurt", at, 0.35));
    if (it.held && !this.held) this.held = this.play("held", at, 0, true);
    if (!it.held && this.held) this.held = this.stop(this.held, 0.15);
    // A hop or leap (not the jump to safety): take-off, and the thud as it lands.
    const L = it.leap, bolt = !!f.bolt && L?.t0 === f.bolt.t0;
    if (L && !bolt && L.t0 !== p.it.leap?.t0) this.play("hop", at);
    if (L && !bolt && f.tick === L.t0 + L.ticks) this.play("land", at);
    // It ran through him or landed on him: the hit, and his grunt as it knocks the wind out of him.
    if (f.down > p.down) (this.play("knockdown"), this.play(this.grunt++ % 2 ? "rook-hit-2" : "rook-hit-1", undefined, S.gruntAfter));
  }

  /** The fight is over: the kill, or the loss when it caught him twice. */
  end(e: { won: boolean; caught: boolean }) {
    if (e.won) this.play("kill");
    else if (e.caught) this.play("loss");
  }

  silence() {
    this.drink = this.stop(this.drink, 0.2);
    this.held = this.stop(this.held, 0.2);
    this.gaze = this.stop(this.gaze);
    duckFightMusic(false);
    // The bus stays connected a moment so the last sound (the kill, the loss) plays out.
    const bus = this.bus;
    setTimeout(() => bus.disconnect(), 6000);
  }
}

let sfx: Sfx | null = null;

/** Each tick of a fight being played: its sounds. With no fight, or play over, the loops stop (`won` says how it ended, if it did). */
export function offspringSfx(f: Fight | undefined, playing: boolean, ended?: { won: boolean; caught: boolean }) {
  const o = audioOut();
  if (o && f) load(o.c);
  if (!f || !playing || !o) {
    if (sfx) {
      if (ended) sfx.end(ended);
      sfx.silence();
      sfx = null;
    }
    return;
  }
  if (!buffers) return;
  sfx ??= new Sfx(o.c, o.o, buffers);
  sfx.bus.gain.value = FIGHT_MUTE.sounds ? 0 : OFFSPRING_SFX.gain;
  sfx.step(f);
}

/** The debug menu's sound board: every one of the fight's sounds by name. */
export const FIGHT_SOUNDS: readonly string[] = NAMES;
let board: Sfx | null = null;
/** Plays one of them now, at its own gain, whether or not a fight is on (false while the pack is still loading). */
export function playFightSound(n: string) {
  const o = audioOut();
  if (!o) return false;
  load(o.c);
  if (!buffers || !(NAMES as readonly string[]).includes(n)) return false;
  board ??= new Sfx(o.c, o.o, buffers);
  return !!board.play(n as Name);
}
