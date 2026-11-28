// The crew's camp, warm (Arc 1 Part 2, piece 1-2b, the camp walk). The place is the maps thread's yard
// before the fight (project files sogni/lanternfall/production/places/crew-yard/build/warm-camp.json,
// 28 Nov: rows, pieces, people, the eleven tap spots, the nightshades, the lamps). How it behaves is the
// gameplay thread's brief (gameplay/part2/camp-and-run2-brief.md; its last section, "For the build,
// 28 Nov 1:45 AM", wins where it differs). Words are the story thread's sheet
// (story/part2-lines-for-build.md): each line says FINAL (Ladi approved the wording) or DRAFT (shown with
// a small "draft" mark). Nothing is voiced. Board tiles: x east, y south, from the brazier.

import { oyCoast, oyOutline } from "./offspring.js";

export { oyCoast as campCoast, oyOutline as campOutline };

/** A line as the story sheet has it: who says it (Rook's are thoughts), its words, and whether Ladi has approved them. */
export interface CampLine {
  who: string;
  text: string;
  final?: true;
}
const F = (who: string, text: string): CampLine => ({ who, text, final: true });
const D = (who: string, text: string): CampLine => ({ who, text });

/** The people, by the tags shown over them. Nobody says Rook's name; the crew go by what they do and the boy is "The boy". */
export const CREW = { outrider: "Outrider", cook: "The cook", lantern: "The lantern man", gate: "The gate one", lamp: "The lamp hand", boy: "The boy" } as const;

export const CAMP = {
  shrine: "warm-camp",
  title: "The crew's camp",
  /** Rook walks at 0.85 of his walk on the home island (the brief), so the whole camp's beat is that much slower. */
  slow: 0.85,
  /** Where everyone starts (the maps thread's people). The lantern man sits on the log seat. */
  rook: [-4, 6] as const,
  people: [
    { key: "outrider", name: CREW.outrider, at: [-6, 3] },
    { key: "cook", name: CREW.cook, at: [-8, 5] },
    { key: "lantern", name: CREW.lantern, at: [-9, 4], sits: true },
    { key: "gate", name: CREW.gate, at: [-3, -8] },
    { key: "lamp", name: CREW.lamp, at: [-5, -9] },
    { key: "boy", name: CREW.boy, at: [-1, 9] },
  ] as const,
  /** The goal shows after this many taps, or this many seconds (the brief). Its words are the brief's, a gameplay placeholder. */
  goal: { taps: 2, seconds: 25, text: "Talk to the Outrider at the cold brazier" },
  /** When the goal shows, Outrider gets up and waits at the cold brazier's north rim (the brief, 28 Nov). */
  rim: [0, -2] as const,
  /** He goes there by way of the cart, pausing this many ticks, so the boy backs off in front of the player (the gameplay thread, 28 Nov). */
  outriderVia: { at: [-2, 6] as const, pause: 2 },
  /** Outrider says his line by the fire unprompted, this many ticks in (the gameplay thread). */
  outriderSays: 2,
  /** Called over to the nightshades, the cook goes back once Rook is this far from them without tapping (the gameplay thread). */
  cookLeaves: 6,
  /** The boy keeps at least this far from Outrider (tiles), stepping away when he comes close. */
  boyKeeps: 4,
  /** Who wanders, how far from their place (tiles), and ticks between strolls (build). The cook, the lantern man and Outrider stay. */
  wander: { who: ["gate", "lamp", "boy"] as string[], range: 2, every: [10, 24] as const },
  /** Rook stands in the gateway (or out on the apron) and "Not without the kid." plays; again if he keeps on, this many ticks apart (build). */
  gateway: { at: [1, -11] as const, apron: -12, again: 6 },
  /** The nightshades at the light's edge: within this many tiles of the ones past the gate (to their figures' edge, a tile in from where they stand) they can be tapped, and the cook comes over. */
  shadeReach: 3,
  /** Ticks after her nightshade lines before the cook goes back to the fire (build). */
  cookBack: 8,
  /** Rook walks up to what was tapped and it answers when he is within this many tiles (either way) of where he stands for it. */
  reach: 1,
  /**
   * The tap spots (the maps thread's eleven, less the washing line and the look-up spot, which are silent
   * by the story sheet and have no tap yet): the thing, where it is, where Rook stands, and what is said.
   * People are tapped on their figure, things here.
   */
  taps: [
    { id: "fire", at: [-7, 5], stand: [-4, 6], first: [F("Rook", "Five of them, and the boy makes six.")] },
    { id: "bar", at: [3.2, -9.4], stand: [3, -8], first: [D("Rook", "They bar this every night, and tonight it stands open for me.")] },
    { id: "gate-inside", at: [1.8, -10.2], stand: [1.5, -9], first: [D("Rook", "Those marks are on the inside.")] },
    { id: "gateway", at: [1, -11], stand: [1, -12], first: [F("Rook", "Not without the kid.")] },
  ] as { id: string; at: [number, number]; stand: [number, number]; first: CampLine[]; again?: CampLine[] }[],
  /**
   * What the people say when tapped: the first tap, then later taps in turn. Where the story sheet ties one
   * of Rook's approved thoughts to them (the cook's bowl, the lantern weighed in a hand), it follows their
   * line on the first tap.
   */
  says: {
    outrider: { first: [D(CREW.outrider, "Eat. Nobody down here eats alone twice.")] },
    cook: { first: [D(CREW.cook, "Seconds? You fell a long way for stew."), F("Rook", "I'll eat, and I'll watch their hands while I do.")], again: [D(CREW.cook, "Seconds? You fell a long way for stew.")] },
    lantern: { first: [D(CREW.lantern, "Nice work, this. Sky-made."), F("Rook", "He weighed that like a man who means to sell it.")], again: [D(CREW.lantern, "Easy. I'm only looking.")] },
    gate: { first: [D(CREW.gate, "Gate's open if you fancy it. They don't come past the lamps. Mostly.")] },
    lamp: { first: [F(CREW.lamp, "Never met a sky man before. Is it true you lot eat every day?")] },
    // The boy has no line; on a later tap one of the crew speaks for him.
    boy: { first: [D("Rook", "He's not theirs.")], again: [D("crew", "Don't mind our lad. He doesn't talk much.")] },
  } as Record<string, { first: CampLine[]; again?: CampLine[] }>,
  /** At the nightshades: the cook's two lines once, then Rook's thought on a later tap. */
  shadesSay: { first: [D(CREW.cook, "Those? Nightshades. Been stood there since we lit up, the same four. Or five, I lose count."), D(CREW.cook, "They want whoever's got no light in him. Come away from the edge, your stew's going cold.")], again: [D("Rook", "They stop where the light stops.")] },
  /** Five nightshades where the lamplight ends: three past the gate, two past the east wall (the maps thread's spots). */
  shades: [[-2, -17], [0.5, -17.5], [2.5, -16.8], [16.7, -9.5], [17, -6.5]] as [number, number][],
  /** The ones past the gate, which can be walked up to (the first three). */
  gateShades: 3,
};

/** The walk's board: open ground inside the walls, the gateway's open half and the lit apron past it; everything else solid (drawn by camp-dress.ts). */
export const CAMP_ROWS = [
  "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
  "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
  "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
  "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
  "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
  "!!!!!!!!!!!!!!!.......!!!!!!!!!!!!!!!",
  "!!!!!!!!!!!!!!!.......!!!!!!!!!!!!!!!",
  "!!!!!!!!!!!!!!!.......!!!!!!!!!!!!!!!",
  "!!!!!!!!!!!!!!!!!!!.!!!!!!!!!!!!!!!!!",
  "!!!!!!!........!....!!....!...!!!!!!!",
  "!!!!!!.!!......!.....!.........!!!!!!",
  "!!!!!!.................!!!!!!..!!!!!!",
  "!!!!!!..!!.................!!..!!!!!!",
  "!!!!!!!.......................!!!!!!!",
  "!!!!!!!.......................!!!!!!!",
  "!!!!!!!.......................!!!!!!!",
  "!!!!!!..!!.................!!..!!!!!!",
  "!!!!!!.........................!!!!!!",
  "!!!!!!.........................!!!!!!",
  "!!!!!!!.......................!!!!!!!",
  "!!!!!!.........................!!!!!!",
  "!!!!!!..!!.................!!..!!!!!!",
  "!!!!!!!....!..................!!!!!!!",
  "!!!!!!!..!.!.!................!!!!!!!",
  "!!!!!!!....!!.................!!!!!!!",
  "!!!!!!..!!.!!!1............!!..!!!!!!",
  "!!!!!!.....!!!!!!..............!!!!!!",
  "!!!!!!......!!!!!..............!!!!!!",
  "!!!!!!.!...!!!!!!.......!!..!!.!!!!!!",
  "!!!!!!!....!!!!!!.!...........!!!!!!!",
  "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
  "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
  "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
  "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
  "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
  "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
  "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
  "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
  "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
];

/** Where each piece of the warm camp stands (the maps thread's walk pieces, without the brazier, which the game draws): board x, board y, yaw in degrees. */
export const CAMP_PIECES: readonly { m: string; at: [number, number]; yaw?: number }[] = [
  { m: "yard-walls", at: [0, 0] },
  { m: "yard-stake", at: [0, -15] },
  { m: "yard-wall-stub", at: [-15.8, -13.2], yaw: 25 },
  { m: "yard-wall-stub", at: [-8.5, -13.6], yaw: -10 },
  { m: "yard-wall-stub", at: [8.5, -13.8], yaw: 40 },
  { m: "yard-wall-stub", at: [15.6, -8], yaw: 80 },
  { m: "yard-wall-stub", at: [-15.8, 1], yaw: 95 },
  { m: "yard-wall-stub", at: [15.8, 7], yaw: -75 },
  { m: "yard-wall-stub", at: [-15, 13.4], yaw: 150 },
  { m: "yard-wall-stub", at: [6, 13.4], yaw: 175 },
  { m: "yard-wall-stub", at: [15, 13.2], yaw: -140 },
  { m: "yard-crate", at: [-11, -9], yaw: 20 },
  { m: "yard-barrel", at: [-10, -9], yaw: 0 },
  { m: "yard-crate", at: [11, 9], yaw: -10 },
  { m: "yard-barrel", at: [10, 9], yaw: 0 },
  { m: "yard-crate", at: [-11, 9], yaw: 5 },
  { m: "yard-crate", at: [-3, -9], yaw: 40 },
  { m: "yard-barrel", at: [6, 9], yaw: 0 },
  { m: "yard-crate", at: [7, 9], yaw: 0 },
  { m: "yard-wagon", at: [-13, -5], yaw: 90 },
  { m: "yard-wagon", at: [-13, 4], yaw: 90 },
  { m: "yard-wagon", at: [13, -5], yaw: -90 },
  { m: "yard-wagon", at: [13, 4], yaw: -90 },
  { m: "yard-tarp-awning", at: [-12, -5], yaw: 90 },
  { m: "yard-tarp-awning", at: [-12, 4], yaw: 90 },
  { m: "yard-tarp-awning", at: [12, -5], yaw: -90 },
  { m: "yard-tarp-awning", at: [12, 4], yaw: -90 },
  { m: "yard-cage-cart", at: [-3, 8.6], yaw: 180 },
  { m: "yard-hood-pile", at: [-5.6, 9.3] },
  { m: "yard-tarp-heap", at: [-5.6, 9.3], yaw: 10 },
  { m: "yard-gate-open", at: [0, -11] },
  { m: "yard-gate-bar", at: [3.2, -9.4] },
  { m: "yard-cook-fire", at: [-7, 5] },
  { m: "yard-log-seat", at: [-9, 4], yaw: 30 },
  { m: "yard-stump-seat", at: [-9, 6], yaw: 0 },
  { m: "yard-keg-seat", at: [-7, 7], yaw: 0 },
  { m: "yard-log-seat", at: [-5, 6], yaw: -60 },
  { m: "yard-stump-seat", at: [-5, 4], yaw: 0 },
  { m: "yard-keg-seat", at: [-7, 3], yaw: 0 },
  { m: "yard-washing-line", at: [7.5, -8] },
  { m: "path-lamp", at: [-12, -10] },
  { m: "path-lamp", at: [12, -10] },
  { m: "path-lamp", at: [-12, 10] },
  { m: "path-lamp", at: [12, 10] },
  { m: "path-lamp", at: [-3, -10] },
  { m: "path-lamp", at: [3, -10] },
  { m: "path-lamp", at: [-12, 0] },
  { m: "path-lamp", at: [12, 0] },
  { m: "path-lamp", at: [-7, 9] },
  { m: "path-lamp", at: [8, -10] },
  { m: "path-lamp", at: [-0.2, 10.3] },
];

/** The lamps' lights (the maps thread's): where, how high, what colour; the cooking fire flickers. */
export const CAMP_LIGHTS: readonly { at: [number, number]; h: number; c: string; fire?: true }[] = [
  { at: [-11.75, -10], h: 1.35, c: "#ffb468" },
  { at: [12.25, -10], h: 1.35, c: "#ffb468" },
  { at: [-11.75, 10], h: 1.35, c: "#ffb468" },
  { at: [12.25, 10], h: 1.35, c: "#ffb468" },
  { at: [-2.75, -10], h: 1.35, c: "#ffb468" },
  { at: [3.25, -10], h: 1.35, c: "#ffb468" },
  { at: [-11.75, 0], h: 1.35, c: "#ffb468" },
  { at: [12.25, 0], h: 1.35, c: "#ffb468" },
  { at: [-6.75, 9], h: 1.35, c: "#ffb468" },
  { at: [8.25, -10], h: 1.35, c: "#ffb468" },
  { at: [0.05, 10.3], h: 1.35, c: "#ffb468" },
  { at: [-7, 5], h: 0.7, c: "#ff8a3c", fire: true },
  { at: [0.5, -14.4], h: 1.4, c: "#ffb468" },
];
