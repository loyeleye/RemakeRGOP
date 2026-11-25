// Every spoken line in the later runs that has no voice clip, and every still with no picture.
//   npx tsx tools/unvoiced-lines.ts [out.json] [seeds=12]
// Lines are read from each run's room (src/server/<run>.ts): every `say(...)` and every
// `{ who, text }` it builds. A line has a clip when "Speaker|exact text" is a key of VOICE_LINES
// (src/client/voice-lines.ts), which is how the page finds one. Each run is then played by its
// stand-ins on a few seeds, to say how often each line is really heard (a line never heard may
// belong to an older rule the run no longer uses) and to fill in the lines that carry a number.
// Stills are the cards in src/engine/stills.ts with no picture at public/stills/<id>.webp.

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import ts from "typescript";
import { VOICE_LINES } from "../src/client/voice-lines.js";
import { STILLS } from "../src/engine/stills.js";
import { CoveRoom } from "../src/server/cove.js";
import { KiteRoom } from "../src/server/kite.js";
import { RematchRoom } from "../src/server/rematch.js";
import { RescueRoom } from "../src/server/rescue.js";
import { ShipRoom } from "../src/server/shiphome.js";
import { SieveRoom } from "../src/server/sieve.js";

const out = process.argv[2] ?? "/mnt/project-files/gameplay/voice/unvoiced-lines.json", seeds = Number(process.argv[3] ?? 12);
const root = new URL("..", import.meta.url).pathname;

type Kind = "dialogue box" | "bark bubble" | "end screen";
interface Found { speaker: string; text: string; kind: Kind; caption: boolean; mustLand: boolean; where: string; vars?: Record<string, string>; unresolved?: boolean }
interface Run { run: string; name: string; file: string; engine: string; make: (seed: () => number, stand: string, n: number) => unknown; stands: string[] }

const clock = { every: () => () => {} };
const RUNS: Run[] = [
  { run: "run8", name: "A harder job (the Sieve)", file: "sieve", engine: "sieve", stands: ["juggle", "hold"], make: (s, st) => new SieveRoom(clock, s, st as never) },
  { run: "run9", name: "The rescue", file: "rescue", engine: "rescue", stands: ["heap", "hold", "wary", "bait"], make: (s, st) => new RescueRoom(clock, s, st as never) },
  { run: "run10", name: "The ship home", file: "shiphome", engine: "shiphome", stands: ["hold", "rails", "port"], make: (s, st) => new ShipRoom(clock, s, st as never) },
  {
    run: "optional-o1", name: "Granny's rematch", file: "rematch", engine: "rematch", stands: ["smart", "ignore"],
    make: (s, st, n) => Object.assign(new RematchRoom(clock, s), { stand: st, cheatPick: ["hold", "goal", "nap"][n % 3] }),
  },
  { run: "optional-o2", name: "Lumi's lesson with Kes", file: "cove", engine: "cove", stands: ["smart", "near", "stay", "wander"], make: (s, st) => Object.assign(new CoveRoom(clock, s), { stand: st }) },
  { run: "optional-o3c", name: "Kes's rematch on Kite Fell (built, not yet published)", file: "kite", engine: "kite", stands: ["smart", "stay", "wander"], make: (s, st) => Object.assign(new KiteRoom(clock, s), { stand: st }) },
];

// ---------------------------------------------------------------- reading a room's lines

function read(file: string, engine: string): Found[] {
  const path = `${root}src/server/${file}.ts`, src = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
  const enginePath = `${root}src/engine/${engine}.ts`;
  const eng = existsSync(enginePath) ? ts.createSourceFile(enginePath, readFileSync(enginePath, "utf8"), ts.ScriptTarget.Latest, true) : null;
  // Names for strings: this file's constants, and the engine file's properties.
  const consts = new Map<string, ts.Expression>(), props = new Map<string, ts.Expression>();
  const gather = (n: ts.Node, into: Map<string, ts.Expression>, propsToo: boolean) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) into.set(n.name.text, n.initializer);
    if (propsToo && ts.isPropertyAssignment(n) && (ts.isIdentifier(n.name) || ts.isStringLiteral(n.name)) && !props.has(n.name.text)) props.set(n.name.text, n.initializer);
    ts.forEachChild(n, (c) => gather(c, into, propsToo));
  };
  gather(src, consts, false);
  if (eng) gather(eng, new Map(), true);

  /** Every string an expression can be. A part that is not a plain string becomes {name}. */
  const strings = (e: ts.Expression, vars: Record<string, string>, depth = 0): string[] | null => {
    if (depth > 6) return null;
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return [e.text];
    if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e)) return strings(e.expression, vars, depth + 1);
    if (ts.isConditionalExpression(e)) {
      const a = strings(e.whenTrue, vars, depth + 1), b = strings(e.whenFalse, vars, depth + 1);
      return a && b ? [...a, ...b] : null;
    }
    if (ts.isBinaryExpression(e) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(e.operatorToken.kind)) {
      const a = strings(e.left, vars, depth + 1), b = strings(e.right, vars, depth + 1);
      return a && b ? [...a, ...b] : (a ?? b);
    }
    if (ts.isElementAccessExpression(e)) {
      const arr = ts.isIdentifier(e.expression) ? consts.get(e.expression.text) : ts.isPropertyAccessExpression(e.expression) ? props.get(e.expression.name.text) : e.expression;
      if (arr && ts.isArrayLiteralExpression(arr)) {
        const all = arr.elements.map((x) => strings(x, vars, depth + 1));
        return all.every(Boolean) ? all.flatMap((x) => x!) : null;
      }
      return null;
    }
    if (ts.isIdentifier(e)) {
      const v = consts.get(e.text);
      return v ? strings(v, vars, depth + 1) : null;
    }
    if (ts.isPropertyAccessExpression(e)) {
      const v = props.get(e.name.text);
      return v ? strings(v, vars, depth + 1) : null;
    }
    if (ts.isTemplateExpression(e)) {
      let outs = [e.head.text];
      for (const span of e.templateSpans) {
        const alts = strings(span.expression, vars, depth + 1)?.filter((s, i, a) => s && a.indexOf(s) === i);
        let parts: string[];
        if (alts && alts.length && alts.length * outs.length <= 24) parts = alts;
        else {
          const plain = span.expression.getText().replace(/^this\./, ""), name = /^[A-Za-z]\w{0,11}$/.test(plain) ? plain : "n";
          vars[name] = span.expression.getText().replace(/\s+/g, " ");
          parts = [`{${name}}`];
        }
        outs = outs.flatMap((o) => parts.map((p) => o + p + span.literal.text));
      }
      return outs;
    }
    return null;
  };

  const found: Found[] = [], held = new Set<string>();
  const where = (n: ts.Node) => `src/server/${file}.ts:${src.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
  const prop = (o: ts.Expression | undefined, name: string) => (o && ts.isObjectLiteralExpression(o) ? o.properties.find((p) => p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) && p.name.text === name) : undefined);
  const add = (n: ts.Node, who: ts.Expression, text: ts.Expression, kind: Kind, caption: boolean, mustLand: boolean) => {
    const vars: Record<string, string> = {};
    const speakers = strings(who, {}), texts = strings(text, vars);
    // A speaker that is not a name in the code is a line being passed along, not a line of its own.
    if (!speakers) return;
    for (const speaker of speakers) {
      if (!speaker) continue; // narration: a line with no speaker is never spoken
      if (!texts) found.push({ speaker, text: text.getText().replace(/\s+/g, " "), kind, caption, mustLand, where: where(n), unresolved: true });
      else for (const t of texts) if (t) found.push({ speaker, text: t, kind, caption, mustLand, where: where(n), ...(Object.keys(vars).length && t.includes("{") ? { vars } : {}) });
    }
  };
  const inEnd = (n: ts.Node) => {
    for (let p: ts.Node | undefined = n.parent; p; p = p.parent) if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === "lines" && p.parent.getText().includes("summary")) return true;
    return false;
  };
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && /(^|\.)say$/.test(n.expression.getText()) && n.arguments.length >= 2) {
      const [who, text, how, key, land] = n.arguments as unknown as ts.Expression[];
      const talk = !!prop(how, "talk") || (!!how && ts.isIdentifier(how) && /talk/i.test(how.text));
      const must = talk || (!!key && (key.getText() === "true" || key.getText() === '"key"' || key.getText().includes("key")));
      add(n, who!, text!, talk ? "dialogue box" : "bark bubble", !!land && land.getText() !== "0" && land.getText() !== "undefined", must);
    } else if (ts.isObjectLiteralExpression(n) && prop(n, "text") && prop(n, "until")) {
      // A caption: the text is held on the screen.
      const text = prop(n, "text");
      if (text && ts.isPropertyAssignment(text)) strings(text.initializer, {})?.forEach((t) => held.add(t));
    } else if (ts.isObjectLiteralExpression(n) && prop(n, "who") && prop(n, "text")) {
      const who = prop(n, "who") as ts.PropertyAssignment | ts.ShorthandPropertyAssignment, text = prop(n, "text") as ts.PropertyAssignment | ts.ShorthandPropertyAssignment;
      if (ts.isPropertyAssignment(who) && ts.isPropertyAssignment(text)) {
        const end = inEnd(n), talk = !!prop(n, "talk");
        add(n, who.initializer, text.initializer, end ? "end screen" : talk ? "dialogue box" : "bark bubble", false, true);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(src);
  for (const f of found) if (held.has(f.text)) f.caption = true;
  return found;
}

// ---------------------------------------------------------------- hearing a run

/** Plays a run with its stand-ins and counts, for each "Speaker|text", the plays it was heard in. */
function hear(run: Run): { heard: Map<string, number>; plays: number } {
  const heard = new Map<string, number>();
  let plays = 0;
  for (const stand of run.stands)
    for (let k = 1; k <= seeds; k++) {
      let s = k * 7919 + plays;
      const room = run.make(() => (s = (s * 48271) % 2147483647), stand, k) as { connect(send: (m: { t: string; lines?: { who: string; text: string }[] }) => void): { message(raw: string): void }; onTick(): void; state: { phase: string }; storyView?(): { end?: { lines?: { who: string; text: string }[] } } };
      const mine = new Set<string>();
      const note = (lines?: { who: string; text: string }[]) => lines?.forEach((l) => l.who && l.text && mine.add(`${l.who}|${l.text}`));
      try {
        room.connect((m) => m.t === "say" && note(m.lines)).message(JSON.stringify({ t: "hello", name: "Rook" }));
        for (let n = 0; n < 5000 && room.state.phase !== "results"; n++) room.onTick();
        note(room.storyView?.().end?.lines);
      } catch (e) {
        console.error(`${run.run} ${stand} seed ${k}: ${(e as Error).message}`);
      }
      plays++;
      for (const key of mine) heard.set(key, (heard.get(key) ?? 0) + 1);
    }
  return { heard, plays };
}

// ---------------------------------------------------------------- names for clips

const taken = new Set<string>([...Object.values(VOICE_LINES).map((v) => v.replace(/^voice\//, "").replace(/\.mp3$/, "")), ...(existsSync(`${root}public/voice`) ? readdirSync(`${root}public/voice`).map((f) => f.replace(/\.[a-z0-9]+$/, "")) : [])]);
const DROP = new Set(["a", "the", "to", "of", "it", "is", "and", "you", "i", "at", "in", "on", "that", "for"]);
function clipName(speaker: string, text: string) {
  const words = text.toLowerCase().replace(/\{[^}]*\}/g, " n ").replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  const key = words.filter((w) => !DROP.has(w));
  const base = `${speaker.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, "-")}-${(key.length >= 2 ? key : words).slice(0, 4).join("-")}`.slice(0, 44).replace(/-$/, "");
  let name = base;
  for (let n = 2; taken.has(name); n++) name = `${base}-${n}`;
  taken.add(name);
  return name;
}

// ---------------------------------------------------------------- the list

/** What the number in a line can be, by hand: the code only names where it comes from. */
const VALUES: Record<string, string> = {
  "Wall says {wall}. Beat {wall}!": "2, 3 or 4: the children's best on the pond wall. It starts at 2 and they cannot pass 4.",
  "{kids}! That's the most!": "3 or 4: the children's score when it beats the wall.",
  "Still {was}.": "2, 3 or 4: the wall's best, when they did not beat it.",
  "The book says {n}. Every year, back to the first page.": "sixteen: the count in Tilda's book (the run's supply). It does not change.",
  "{n} at the stones, Rook!": "One, Two or Three: how many she set down. With her pair it is Two.",
  "Stones! {n} more!": "One, Two or Three, as above. With her pair it is Two.",
};

const lines: Record<string, unknown>[] = [], summary: Record<string, unknown>[] = [];
for (const run of RUNS) {
  const found = read(run.file, run.engine), { heard, plays } = hear(run);
  // One entry for each speaker and text; the first place it is said gives its kind.
  const by = new Map<string, Found & { more: string[] }>();
  for (const f of found) {
    const key = `${f.speaker}|${f.text}`, had = by.get(key);
    if (!had) by.set(key, { ...f, more: [] });
    else (had.more.push(f.where), (had.caption ||= f.caption), (had.mustLand ||= f.mustLand));
  }
  // What a line with a number in it was really said as.
  const filled = (text: string) => {
    const re = new RegExp("^" + text.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\{[^}]*\}/g, "(.+?)") + "$");
    return [...heard.keys()].filter((k) => re.test(k.slice(k.indexOf("|") + 1)));
  };
  let voiced = 0, unvoiced = 0;
  const seenKeys = new Set<string>();
  for (const [key, f] of by) {
    const templ = f.text.includes("{");
    if (templ) {
      // Each value heard is its own line to voice; the pattern is listed too, with what its number can be.
      const as = filled(f.text).filter((k) => k.startsWith(f.speaker + "|"));
      as.forEach((k) => seenKeys.add(k));
      const need = as.filter((k) => !VOICE_LINES[k]);
      lines.push({ run: run.run, speaker: f.speaker, text: f.text, clip: null, kind: f.kind, mustLand: f.caption, alwaysPlays: f.mustLand, pattern: true, values: VALUES[f.text] ?? Object.values(f.vars ?? {}).join("; "), heardAs: as.map((k) => k.slice(k.indexOf("|") + 1)), note: "A line with a number in it. Each text under heardAs that has no clip is listed as its own entry; what else the number can be is in `values`.", where: [f.where, ...f.more] });
      for (const k of need) {
        const text = k.slice(k.indexOf("|") + 1);
        lines.push({ run: run.run, speaker: f.speaker, text, clip: clipName(f.speaker, text), kind: f.kind, mustLand: f.caption, alwaysPlays: f.mustLand, fromPattern: f.text, heardIn: heard.get(k) ?? 0, plays, where: [f.where, ...f.more] });
        unvoiced++;
      }
      continue;
    }
    seenKeys.add(key);
    if (VOICE_LINES[key]) {
      voiced++;
      continue;
    }
    unvoiced++;
    lines.push({ run: run.run, speaker: f.speaker, text: f.text, clip: clipName(f.speaker, f.text), kind: f.kind, mustLand: f.caption, alwaysPlays: f.mustLand, heardIn: heard.get(key) ?? 0, plays, ...(f.unresolved ? { unresolved: true, note: "The script could not read this line's text from the code; the text shown is the code itself." } : {}), ...((heard.get(key) ?? 0) === 0 && !f.unresolved ? { note: "Not heard in any stand-in play: rare, or a line of a rule the run no longer uses. Check before rendering." } : {}), where: [f.where, ...f.more] });
  }
  // Heard but not found in the code as written (built from parts).
  for (const [key, n] of heard) {
    if (seenKeys.has(key) || VOICE_LINES[key]) continue;
    const [speaker, ...rest] = key.split("|"), text = rest.join("|");
    unvoiced++;
    lines.push({ run: run.run, speaker, text, clip: clipName(speaker!, text), kind: "bark bubble", mustLand: false, alwaysPlays: false, heardIn: n, plays, note: "Heard in play; the script did not find it written out in the room's code, so its kind is a guess.", where: [] });
  }
  summary.push({ run: run.run, name: run.name, room: `src/server/${run.file}.ts`, linesWithAClip: voiced, linesWithout: unvoiced, standIns: run.stands, plays });
}

// Stills with no picture. A still fills the screen when some line calls it with `full`.
const all = readdirSync(`${root}src/server`).map((f) => readFileSync(`${root}src/server/${f}`, "utf8")).join("\n") + readFileSync(`${root}src/engine/rescue.ts`, "utf8");
const pictures = new Set(readdirSync(`${root}public/stills`).map((f) => f.replace(/\.[a-z0-9]+$/, "")));
const stills = Object.entries(STILLS)
  .filter(([id]) => !pictures.has(id))
  .map(([id, card]) => {
    const used = all.includes(`"${id}"`), full = new RegExp(`"${id}"[^\\n}]{0,40}full: true`).test(all) || /^r9-what-is-that/.test(id);
    const run = /^r(\d+)/.exec(id)?.[1];
    return { slot: id, run: run ? `run${run}` : "?", shown: full ? "full screen" : "panel", who: card.who, faces: card.faces, file: `public/stills/${id}.webp`, ...(pictures.has(`${id}-1`) ? { note: "Replaced by its frames (-1, -2, -3), which have pictures. Nothing to draw." } : used ? {} : { note: "No line in any room calls this slot today." }) };
  });

const doc = {
  made: new Date().toISOString(),
  by: "tools/unvoiced-lines.ts in RemakeRGOP (the build thread). Run it again after lines change: npx tsx tools/unvoiced-lines.ts",
  how: {
    clip: "The page looks a clip up by \"Speaker|exact text\". A line listed here has none, so it is babbled. `clip` is the name I would give its file (speaker, then the line's first telling words); send <clip>.mp3 with a manifest of who, text, file, as for run 5.",
    kind: "dialogue box: said in the talk before play starts. bark bubble: said over play, in a bubble on the speaker. end screen: on the results panel.",
    mustLand: "true: a line that must land. It is also held on the screen as a caption for some seconds (the goal, and lines that name the choice).",
    alwaysPlays: "true: the room always plays it, in its turn, even if someone is speaking. false: a quip, dropped if it cannot start at once.",
    heardIn: "How many of `plays` stand-in plays the line was heard in. 0 is flagged in `note`.",
    pattern: "An entry with pattern: true is a line with a number in it, listed for reference only (clip is null).",
  },
  runs: summary,
  lines,
  stills,
};
writeFileSync(out, JSON.stringify(doc, null, 1));
console.log(`${out}: ${lines.filter((l) => l.clip).length} lines without a clip, ${stills.length} stills without a picture`);
for (const s of summary) console.log(`  ${s.run}: ${s.linesWithout} without, ${s.linesWithAClip} with (${s.plays} plays)`);
