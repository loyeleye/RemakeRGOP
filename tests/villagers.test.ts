import { describe, expect, it } from "vitest";
import { VILLAGERS, villagerRoster } from "../src/client/villagers.js";

/** The landing's wings as the run lays them out: 24 places, three boats of eight, dealt to both sides. */
function wings() {
  const places: [number, number][] = [], groups: number[] = [], seats: number[] = [];
  for (let i = 0; i < 24; i++) {
    const group = i % 3, seat = Math.floor(i / 3), side = seat % 2 ? 1 : -1, k = Math.floor(seat / 2) * 3 + group, col = k % 4, row = Math.floor(k / 4);
    places.push([side * (5.3 + col * 2.2 + (row % 2) * 0.3), -4.5 + row * 1.45 + ((i * 13) % 4) * 0.1]);
    groups.push(group);
    seats.push(seat);
  }
  return { places, groups, seats };
}

describe("Run 9's villagers", () => {
  it("are the same people every run", () => {
    const { places, groups, seats } = wings();
    expect(villagerRoster(places, groups, seats)).toEqual(villagerRoster(places, groups, seats));
  });

  it("are 24 different people from the six bases: no two alike, and no two who stand together in the same outfit or with the same base and skin", () => {
    const { places, groups, seats } = wings(), all = villagerRoster(places, groups, seats);
    expect(all).toHaveLength(24);
    expect(new Set(all.map((v) => `${v.base}|${v.skin}|${v.outfit}`)).size).toBe(24);
    expect(new Set(all.map((v) => v.base)).size).toBe(6);
    expect(new Set(all.map((v) => v.skin)).size).toBe(VILLAGERS.skins.length);
    expect(new Set(all.map((v) => v.outfit)).size).toBe(VILLAGERS.outfits.length);
    let pairs = 0;
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++) {
        if (Math.hypot(places[i]![0] - places[j]![0], places[i]![1] - places[j]![1]) > VILLAGERS.near) continue;
        pairs++;
        expect(all[i]!.outfit).not.toBe(all[j]!.outfit);
        expect(`${all[i]!.base}${all[i]!.skin}`).not.toBe(`${all[j]!.base}${all[j]!.skin}`);
      }
    expect(pairs).toBeGreaterThan(8);
  });

  it("puts the little ones on the first boat, and nobody little on the others", () => {
    const { places, groups, seats } = wings(), all = villagerRoster(places, groups, seats);
    const child = (i: number) => all[i]!.base === "villager-girl" || all[i]!.base === "villager-boy";
    all.forEach((v, i) => {
      expect(child(i)).toBe(groups[i] === 0 && seats[i]! < VILLAGERS.children);
      // Children are the smallest, and everyone is within a few per cent of their base's height.
      const want = VILLAGERS.man * VILLAGERS.heights[v.base];
      expect(Math.abs(v.height / want - 1)).toBeLessThanOrEqual(VILLAGERS.vary + 1e-9);
    });
  });
});
