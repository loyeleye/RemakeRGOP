import { describe, expect, it } from "vitest";
import { OPTIONS, SECTIONS, readQuery, tuneKeys, writeQuery } from "../src/client/testing.js";
import { COVE } from "../src/engine/cove.js";

describe("the testing panel's table", () => {
  it("names each parameter once, each in a section the panel shows", () => {
    const keys = OPTIONS.map((o) => o.key);
    expect(new Set(keys).size).toBe(keys.length);
    const shown = new Set<string>(["jump", ...SECTIONS.map((s) => s.id)]);
    for (const o of OPTIONS) expect(shown.has(o.section), o.key).toBe(true);
    expect(keys).not.toContain("room");
  });

  it("reads a link back as it was written, in the table's order", () => {
    const { values, extra } = readQuery("?nopull&part1=7-8a&pull=2&cove=reach:10,tide.in:12&reward=1&speed=0&room=ABCD&later=3");
    expect([...values]).toEqual([["part1", "7-8a"], ["pull", "2"], ["nopull", ""], ["speed", "0"], ["cove", "reach:10,tide.in:12"], ["reward", "1"]]);
    expect(extra).toEqual([["later", "3"]]);
    expect(writeQuery([...values, ...extra])).toBe("?part1=7-8a&pull=2&nopull&speed=0&cove=reach:10,tide.in:12&reward=1&later=3");
  });

  it("leaves out values a run would not take", () => {
    const { values } = readQuery("?reward=2&pull=9&part1=nope&granny=yes");
    expect(values.size).toBe(0);
  });

  it("lists every number a run's link can set, by its path", () => {
    const keys = tuneKeys(COVE).map(([k]) => k);
    expect(keys).toContain("tide.in");
    expect(keys).toContain("reach");
  });

  it("writes nothing when nothing is set", () => {
    expect(writeQuery([])).toBe("");
  });
});
