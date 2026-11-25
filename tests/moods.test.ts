import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MOODS, faceOf, moodOf } from "../src/engine/moods.js";

describe("portrait moods", () => {
  it("picks a mood from the line", () => {
    expect(moodOf("Lumi", "Dad. North one.")).toBe("calling");
    expect(moodOf("Lumi", "...Fine. That one.")).toBe("grudging");
    expect(moodOf("Lumi", "I pulled.")).toBe("smug");
    expect(moodOf("Lumi", "So I'm coming tomorrow.")).toBe("delighted");
    expect(moodOf("Rook", "How did you do that?")).toBe("baffled");
    expect(moodOf("Hesta", "Back to your square, Rook.")).toBe("firm");
    expect(moodOf("Hesta", "Now, Rook.")).toBe("neutral");
    expect(moodOf("Hesta", "Clean.", "firm")).toBe("firm");
    expect(moodOf("Sefa", "How did you do that?")).toBe("awed");
    expect(moodOf("Nell", "No fair!")).toBe("determined");
    expect(moodOf("Moth", "Here.")).toBeNull();
    expect(faceOf("Lumi", "Dad. North one.")).toBe("lumi-calling");
  });

  it("gives Tilda a face for every line of hers in run 8", async () => {
    const { readFileSync } = await import("node:fs");
    const { SIEVE } = await import("../src/engine/sieve.js");
    expect(moodOf("Tilda", "You're Rook. I'm Tilda. I keep this now.")).toBe("neutral");
    expect(moodOf("Tilda", "Don't look. We don't.")).toBe("watching");
    expect(moodOf("Tilda", "Ten.")).toBe("watching");
    expect(moodOf("Tilda", "Twenty-one.")).toBe("watching");
    expect(moodOf("Tilda", "The book says sixteen. Every year, back to the first page.")).toBe("watching");
    expect(moodOf("Tilda", "They don't do that.")).toBe("lost");
    expect(moodOf("Tilda", "They've never done that.")).toBe("lost");
    expect(moodOf("Tilda", "They don't do that. They've never done that.")).toBe("lost");
    expect(moodOf("Tilda", "Is it me?")).toBe("asking");
    expect(moodOf("Tilda", SIEVE.again)).toBe("tired");
    expect(moodOf("Tilda", "Mum kept this thirty years. Nothing ever went down a well.")).toBe("tired");
    // Every line the run gives her has a face.
    const src = readFileSync("src/server/sieve.ts", "utf8");
    const hers = [...src.matchAll(/KEEPER, (?:text: )?"([^"]+)"/g)].map((m) => m[1]!);
    expect(hers.length).toBeGreaterThan(8);
    for (const t of hers) expect(faceOf("Tilda", t), t).toMatch(/^tilda-/);
  });

  it("has a portrait file for every mood", () => {
    for (const [who, moods] of Object.entries(MOODS))
      for (const m of moods) expect(existsSync(`public/${`faces/${faceOf(who, "", m)}.webp`}`), `${who}-${m}`).toBe(true);
  });
});

describe("Lumi's one open-mouth face in runs 1 and 2", () => {
  it("shows only when a line names it", () => {
    expect(moodOf("Lumi", "!", "delight-flash")).toBe("delight-flash");
    for (const t of ["Dad. North one.", "So I'm coming tomorrow.", "I pulled.", "Again."]) expect(moodOf("Lumi", t)).not.toBe("delight-flash");
  });
});

describe("voice clips", () => {
  it("every clip file exists, and Rook's run 2 lines each have one", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/client/sound.ts", "utf8");
    for (const m of src.matchAll(/^  \{ who: .*src: "(voice\/[^"]+)"/gm)) expect(existsSync(`public/${m[1]}`), m[1]).toBe(true);
    const lesson = readFileSync("src/server/lesson.ts", "utf8");
    const rook = [...lesson.matchAll(/say\(ROOK, "([^"]+)"/g)].map((m) => m[1]!);
    expect(rook.length).toBeGreaterThan(8);
    const clips = [...src.matchAll(/who: "Rook", match: \/(.+?)\/, src/g)].map((m) => new RegExp(m[1]!));
    for (const t of rook) expect(clips.some((r) => r.test(t)), t).toBe(true);
  });
});

describe("Hesta and Lumi voice clips", () => {
  it("every clip exists, and every plain Hesta or Lumi line has one", async () => {
    const { readFileSync } = await import("node:fs");
    const { VOICE_LINES, VOICE_STOCK } = await import("../src/client/voice-lines.js");
    // A clip may be a time range of a joined file (voice/<group>.mp3#t=a,b).
    for (const f of [...Object.values(VOICE_LINES), ...Object.values(VOICE_STOCK).flatMap((l) => l.map((c) => c.src))]) expect(existsSync(`public/${f.replace(/#t=.*$/, "")}`), f).toBe(true);
    const src = readFileSync("src/server/story.ts", "utf8") + readFileSync("src/server/lesson.ts", "utf8");
    for (const m of src.matchAll(/say\((HESTA|LUMI), "([^"]+)"/g)) {
      const who = m[1] === "HESTA" ? "Hesta" : "Lumi";
      if (m[2] === "!") continue;
      expect(VOICE_LINES[`${who}|${m[2]}`], `${who}: ${m[2]}`).toBeDefined();
    }
  });
});
