// Arc 1 Part 2, piece 1: run 1, the dark run. Alone on the wreck, sight of about two tiles, no voice, no
// bell, no clock, no music. He relights the dead brazier, seven banks, and its lit circle is the meter.
// The nightshades hunt him in the dark; light snuffs them. He has three marks of warmth, and at none the
// dark closes over him, the fire goes out and the round starts again [Ladi, 28 Nov, 2:01 to 2:08 AM:
// "light snuffs them and ... they are a threat to Rook in the dark", "a variation of a health bar", "It
// should cost him the fire and reset the round"]. Every number here is the gameplay thread's draft and
// a dial ("Run 1, second design", gameplay/part2/run1-dark-run-brief.md, 28 Nov 2:16 AM), unless marked
// the build's. The place is the maps thread's (places/wreck/build/board.json and pieces.json, 28 Nov),
// padded 6 columns east so the brazier is the board's middle. Board tiles: x east, y south, from the brazier.

export const RUN1 = {
  shrine: "wreck",
  title: "The wreck",
  /** Seven banks light it: the first an ember, the lit circle going 2 to 9 tiles a step a bank. */
  banks: 7,
  lit: { first: 2, full: 9 },
  /** Three lights at a time, appearing 2 to 5 tiles past the fire's edge (never nearer than 4 from the brazier), back 10 ticks after one is banked. */
  wisps: 3,
  spawn: { past: [2, 5] as [number, number], least: 4 },
  respawnPause: 10,
  /** The pull reaches this far in this run (the engine's pullReach), not 10: he has to walk out. */
  pullReach: 4,
  /** In the light: inside the fire's lit circle (and half a tile), or within this many tiles of any light. */
  glow: 1.5,
  /** Warmth: three marks; one back a bank; standing by the fire gives nothing. */
  warmth: 3,
  shades: {
    /** Two at the start, this far from him and still for the first `still` ticks; one more each `per` banks, up to `most`. */
    start: 2,
    far: 10,
    still: 10,
    per: 2,
    most: 5,
    /** A held pose, then 1 or 2 tiles closer: about 0.7 tiles a tick on average (a jump every 1 to 3 ticks, the build's reading). */
    jump: [1, 2] as const,
    hold: [1, 3] as const,
    /** Within this many tiles of him in the dark it takes hold: a mark at once, one more each `again` ticks it stays; it lets go past `free`. */
    hold1: 1.05,
    again: 4,
    free: 1.3,
    /** A light he pulls snuffs any it passes within this many tiles of; the fire's circle snuffs any it reaches when a bank grows it. */
    snuff: 1,
    /** There are always more: one steps out of the dark this many ticks later, at the fire's new edge after a bank, or this far from him after a pull. */
    back: 6,
    backFar: 10,
  },
  /** Rook wakes on the net's foot; Lumi's lantern is set down beside him. */
  rook: [-5, -6] as const,
  lantern: [-4, -6] as const,
  /** The dark closing over him: this long black before the round starts again (s, the build's). */
  closeSec: 2.2,
  /** The end: the light jumps to full and the nightshades are gone; this quiet, then the lamps come in at the south gap and walk the path toward the light; this long after they set off, the next piece (s, the build's within the brief's 3 to 4 quiet seconds). */
  end: {
    quietSec: 3.5,
    lamps: [[-1, 17], [0, 16], [1, 17], [-2, 16]] as [number, number][],
    /** They walk up from the gap to about this far south of the brazier, at the full light's edge. */
    stopAt: 10.5,
    walkSec: 4,
  },
};

/** The wreck's board (board.json's rows: the crack, the break's edge and the lantern's tile as floor, Rook's start kept; fallen stones and rubble heaps solid), 6 columns of void added east. */
export const RUN1_ROWS = [
  "                                         ",
  "                                         ",
  "                                         ",
  "                !!!!....                 ",
  "              !!!!!!.......              ",
  "            !!!!!!!!.........            ",
  "          !!!!!!! !!...........          ",
  "        !!!!!!!!   !...........          ",
  "       !!!!!!!!.. .............          ",
  "       !!!!!!!!!.......... ....          ",
  "      !!!!!!!!!..........   ...          ",
  "     !!!!!!!!!!........... !...          ",
  "     !!!!!!!!!!!...............          ",
  "    !!!!!!.!!!!........!.......          ",
  "    !!!!!!..o!.1............o..          ",
  "   !!!!!!..........#.#.....!...          ",
  "   !!!!   .....................          ",
  "   !!!!   .......o.....o.......          ",
  "   !!!!   .....................          ",
  "   !!!!!.......!...BBB...#.....          ",
  "   !!!!............BBB.........          ",
  "    !!!!!......#...BBB...!.....          ",
  "    !!!!!!!.!................!.          ",
  "    !!!!!!.......o.....o.......          ",
  "   !!!!!....................!..          ",
  "    !! ............#.#.........          ",
  "    !   ....o.....!.........o..          ",
  "    !! ..!.....................          ",
  "    !!!!!!.....................          ",
  "     !!!!!.....!...............          ",
  "      !!!!.... .....!..........          ",
  "       !!!!!!   .......   ...!.          ",
  "        !!!!!! !.......   !!!!.          ",
  "         !!!!!!!.......   !!!!.          ",
  "          !!!!!!.......!!!!!!!.          ",
  "            !!!!.....!!!!!!!!            ",
  "              ........!!!!!              ",
  "                 .....!!!                ",
  "                                         ",
  "                                         ",
  "                                         ",
];

/** Every piece of the wreck (pieces.json): board x, board y, yaw in degrees. Ring stones and boulders are the game's own, on their tiles. */
export const RUN1_PIECES: readonly { m: string; at: [number, number]; yaw?: number }[] = [
  { m: "wreck-dead-brazier", at: [0, 0] },
  { m: "wreck-net", at: [0, 0] },
  { m: "wreck-debris", at: [0, 0] },
  { m: "wreck-break-face", at: [0, 0] },
  { m: "wreck-rib-a", at: [-3, -17], yaw: -170 },
  { m: "wreck-rib-a", at: [-8, -15], yaw: -151.9 },
  { m: "wreck-rib-a", at: [-13, -12], yaw: -132.7 },
  { m: "wreck-rib-b", at: [-15, -7], yaw: -115 },
  { m: "wreck-rib-a", at: [-17, -2], yaw: -96.7 },
  { m: "wreck-rib-a", at: [-16, 3], yaw: -79.4 },
  { m: "wreck-rib-b", at: [-16, 8], yaw: -63.4 },
  { m: "wreck-rib-a", at: [-12, 12], yaw: -45 },
  { m: "wreck-rib-a", at: [-7, 15], yaw: -25 },
  { m: "wreck-rib-a", at: [3, 17], yaw: 10 },
  { m: "wreck-rib-b", at: [8, 15], yaw: 28.1 },
  { m: "wreck-rubble", at: [9, 2], yaw: 0 },
  { m: "wreck-rubble", at: [8, 4], yaw: 47 },
  { m: "wreck-rubble", at: [7, -5], yaw: 94 },
  { m: "wreck-rubble", at: [-8, 2], yaw: 141 },
  { m: "wreck-rubble", at: [-2, 6], yaw: 188 },
  { m: "wreck-rubble", at: [3, -7], yaw: 235 },
  { m: "wreck-rubble", at: [-9, -9], yaw: 282 },
  { m: "wreck-rubble", at: [0, 10], yaw: 329 },
];

/** The lit circle after `banks` banks (tiles; 0 before the first). */
export function run1Lit(banks: number) {
  const L = RUN1.lit;
  return banks <= 0 ? 0 : L.first + ((L.full - L.first) * (Math.min(banks, RUN1.banks) - 1)) / (RUN1.banks - 1);
}
