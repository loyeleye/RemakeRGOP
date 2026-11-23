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
    expect(moodOf("Moth", "Here.")).toBeNull();
    // Lumi stays closed-mouth in this run until the open-mouth drafts are redrawn.
    expect(faceOf("Lumi", "Dad. North one.")).toBe("lumi-neutral");
    expect(faceOf("Lumi", "So I'm coming tomorrow.")).toBe("lumi-smug");
  });

  it("has a portrait file for every mood", () => {
    for (const [who, moods] of Object.entries(MOODS))
      for (const m of moods) expect(existsSync(`public/faces/${who.toLowerCase()}-${m}.webp`), `${who}-${m}`).toBe(true);
  });
});
