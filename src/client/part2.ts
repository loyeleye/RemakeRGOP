// Arc 1, Part 2, played through: the wake to the first kill, with no trip back to the menu
// (Ladi, 27 Nov 10:37 PM: "Let's start building out part 2 up to and including run 4"). The order
// of pieces is the gameplay thread's assembly brief (gameplay/part2-assembly-brief.md), which came
// from the story thread's between-runs notes. Like Part 1 (client/part1.ts), a piece is a run or a
// card, and a card is either its words (a scene not built yet) or held pictures where the cutscene
// thread has pictures Ladi locked. Captions carry only the lines the story thread marks FINAL
// (story/part2-lines-for-build.md); draft lines stay in the cards' words until Ladi picks them.
// Runs 3 and 4 are the one fight room (server/offspring.ts), which hands 3 to 4 on her flare: two
// pieces, so the saved place moves on to run 4 by itself. His place is kept in this browser.

import type { Held, Piece } from "./part1.js";

const DRAFT = "Draft: not ruled by Ladi yet.";

export const PART2: Piece[] = [
  // Pictures A2 to A5 (locked by Ladi); A1 is the black.
  { id: "0", name: "The wake", kind: "card", scene: "held", card: { heading: "The wake", summary: "Black, the last light of Part 1 going out. Rook on his back in a new net in a rotten wreck, Lumi's dark lantern beside him. \"She sent me the long way.\" He sits up: \"Ground doesn't just go. Not like that.\"", ruled: "Part ruled: the net, the lantern beside him and both thoughts are Ladi's. Pictures A2 to A5 are locked." } },
  { id: "1", name: "Run 1, the dark run", kind: "card", card: { heading: "Run 1, the dark run", summary: "Alone in the wreck with short sight and no voice, he relights the dead brazier. Nightshades snuff the lights at the edge. The brazier catches and the dark draws back.", ruled: "Part ruled: the two thoughts are Ladi's. That it can't be lost is the gameplay thread's recommendation, not ruled. The map is designed, not in the game yet." } },
  // Pictures B1 (v2), B2, B3, locked by Ladi. Outrider's two lines are draft, so none is shown.
  { id: "1e", name: "The lamps find him", kind: "card", scene: "held", card: { heading: "The lamps find him", summary: "Lamps come through the gap toward his light. Outrider looks up at the net, not at him, then comes down with the grin.", ruled: "Part ruled: that somebody says the rope is new is Ladi's. Outrider's lines are draft and not in yet. The three pictures are locked." } },
  // Pictures C1 and C3 locked; C2 is not drawn yet.
  { id: "1-2a", name: "At the crew's fire", kind: "card", scene: "held", card: { heading: "At the crew's fire", summary: "A bowl pushed at him; the fire with the boy at its edge; Outrider pricing him.", ruled: "Part ruled: the boy in plain sight is Ladi's. Pictures C1 and C3 are locked; C2 is not drawn yet." } },
  { id: "1-2b", name: "The camp walk", kind: "card", card: { heading: "The camp walk", summary: "The warm camp: seven things to tap, each with one thought (\"Five of them, and the boy makes six.\"), the gate standing open with nightshades past it, and at the gateway: \"Not without the kid.\" Tapping Outrider at the cold brazier ends it.", ruled: "Part ruled: the feeling, the open gate, the gate thought and the nightshades are Ladi's. The crew's lines are draft. The yard's warm state is drawn by the maps thread, not built yet." } },
  // Pictures D1 and D4, locked; D2 and D3 are not drawn yet.
  { id: "1-2c", name: "The ask", kind: "card", scene: "held", card: { heading: "The ask", summary: "Outrider at the cold brazier asks for one run. The boy is put to bed in the back cart, the gate is barred. Rook looks from the gate to the cart to the brazier.", ruled: "Part ruled: Rook's thought is Ladi's; the crew's lines are draft and not in yet. Pictures D1 and D4 are locked." } },
  { id: "2", name: "Run 2, the crew's brazier", kind: "card", card: { heading: "Run 2, the crew's brazier", summary: "A standard run on the crew's brazier, the crew on the board as weak players calling warm, slightly wrong calls. It fills, they cheer, and he is already walking for the cart.", ruled: "Part ruled: the ending, where he sees the lines of light and keeps walking, is Ladi's. The crew's calls are draft." } },
  // Pictures D7 and D8, locked; D6 is not drawn yet.
  { id: "2e", name: "The cage lights", kind: "card", scene: "held", card: { heading: "The cage lights", summary: "Lines of light run from the brazier over his boots to the cart. He doesn't slow. The cart's bars light: a cage, and he has just powered it.", ruled: "Part ruled: that he doesn't slow is Ladi's. Pictures D7 and D8 are locked." } },
  { id: "2-3", name: "The den", kind: "card", card: { heading: "The den", summary: "Eleven pictures, about five minutes, ending on Solenne lifting the boy and the eye turning to follow. Straight into run 3.", ruled: "Part ruled: the staging is Ladi's (22 Nov), and the two Solenne and Rook exchanges are final. Outrider's lines are draft. The pictures are not drawn yet." } },
  { id: "3", name: "Run 3, keep it off them", kind: "run", fight: 3 },
  { id: "4", name: "Run 4, the first kill", kind: "run", fight: 4 },
  { id: "end", name: "Part 2 continues", kind: "card", card: { heading: "Part 2 continues", summary: "The yard afterwards is the start of the next stretch.", ruled: DRAFT, end: true } },
];

/** The held pictures of Part 2's picture pieces, by piece id (an empty slot is a black frame). */
export const HELD2: Record<string, Held> = {
  "0": {
    tag: "Pictures locked by Ladi",
    fade: 0.8,
    lead: 1.2,
    line: 3,
    gap: 0.6,
    pictures: [
      { slot: "", hold: 1.5 },
      { slot: "part2-a2-v1", hold: 3.5 },
      { slot: "part2-a3-v1", hold: 1.2, lines: [{ who: ["Rook"], text: "She sent me the long way.", quiet: true }] },
      { slot: "part2-a4-v2", hold: 1.2, lines: [{ who: ["Rook"], text: "Ground doesn't just go. Not like that.", quiet: true }] },
      { slot: "part2-a5-v2", hold: 3.5 },
    ],
  },
  "1e": {
    tag: "Pictures locked by Ladi; Outrider's draft lines not in yet",
    fade: 0.7,
    lead: 0,
    line: 3,
    gap: 0.4,
    pictures: [
      { slot: "part2-b1-v2", hold: 3.5 },
      { slot: "part2-b2-v1", hold: 3 },
      { slot: "part2-b3-v1", hold: 3 },
    ],
  },
  "1-2a": {
    tag: "Pictures locked by Ladi; C2 to come",
    fade: 0.7,
    lead: 0,
    line: 3,
    gap: 0.4,
    pictures: [
      { slot: "part2-c1-v1", hold: 3.5 },
      { slot: "part2-c3-v1", hold: 3.5 },
    ],
  },
  "1-2c": {
    tag: "Pictures locked by Ladi; the crew's draft lines not in yet",
    fade: 0.7,
    lead: 0,
    line: 3.2,
    gap: 0.5,
    pictures: [
      { slot: "part2-d1-v1", hold: 3.5 },
      { slot: "part2-d4-v1", hold: 1.5, lines: [{ who: ["Rook"], text: "When it lights they will all be looking at the fire, and I go for the cart.", quiet: true }] },
    ],
  },
  "2e": {
    tag: "Pictures locked by Ladi",
    fade: 0.7,
    lead: 0,
    line: 3,
    gap: 0.4,
    pictures: [
      { slot: "part2-d7-v2", hold: 3.5 },
      { slot: "part2-d8-v1", hold: 4 },
    ],
  },
};

export const piece2Index = (id: string) => PART2.findIndex((p) => p.id === id);

/** The fight's piece by its run's title (OFFSPRING.run3 and run4), or -1. */
export function piece2OfRun(title: string, run3: string, run4: string): number {
  return title === run3 ? piece2Index("3") : title === run4 ? piece2Index("4") : -1;
}

const KEY = "lanternfall.part2";

/** The piece of Part 2 he is on (its index), or -1 if it was never started here. */
export function loadPlace2(): number {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as { at?: string } | null;
    return v?.at ? piece2Index(v.at) : -1;
  } catch {
    return -1;
  }
}

export function savePlace2(i: number) {
  try {
    if (i < 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify({ at: PART2[i]!.id }));
  } catch {
    /* storage blocked: the place lasts this page only */
  }
}
