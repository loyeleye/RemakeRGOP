// Which portrait goes with a line. A line can name its mood; otherwise these rules pick one.

export const MOODS: Record<string, readonly string[]> = {
  Hesta: ["neutral", "approving", "firm"],
  Lumi: ["neutral", "calling", "delighted", "grudging", "smug", "unimpressed"],
  Rook: ["neutral", "warm", "proud", "baffled"],
};

const RULES: [who: string, match: RegExp, mood: string][] = [
  ["Hesta", /^(That's it\.|Clean\.|Good\.|That's the way\.|That's the where|Good\. You heard)/, "approving"],
  ["Hesta", /^(Hold still|Back to your square|Stay there)/, "firm"],
  ["Lumi", /^(\.\.\.)?Fine\. (That one|I suppose)/, "grudging"],
  ["Lumi", /^(Dad\. I know\.|I didn't ask for any\.|Forget it\.|Never mind|Fine\. Ignore me\.)/, "unimpressed"],
  ["Lumi", /^(I pulled\.|I don't need rings\.|You didn't miss one)/, "smug"],
  ["Lumi", /^(So I'm coming tomorrow\.|First light!|That's the last bell!)/, "delighted"],
  ["Lumi", /^(Dad\.|Okay\.|[A-Z][a-z]+(-[a-z]+)? one)/, "calling"],
  ["Rook", /^(That's it\.|Just like that\.)/, "proud"],
  ["Rook", /^How did you do that\?/, "baffled"],
  ["Rook", /^(Yes, ma'am\.|See\?|Now you're the boss)/, "warm"],
];

/** The mood for a line, or null if the speaker has no portraits. */
export function moodOf(who: string, text: string, mood?: string): string | null {
  const moods = MOODS[who];
  if (!moods) return null;
  if (mood && moods.includes(mood)) return mood;
  for (const [w, re, m] of RULES) if (w === who && re.test(text)) return m;
  return "neutral";
}
