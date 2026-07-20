/**
 * One categorical colour ramp for everything that colour-codes a wallet or
 * fund — the allocation slider, the legend swatches, and the analytics trend
 * charts. Keying every consumer off the same `keyToColorIndex(id)` keeps a
 * given fund the SAME colour on the Funds page and in its chart.
 *
 * Each entry pairs a fill (`bg`) with the text colour that reads on it (`fg`),
 * so labels drawn on a segment stay legible even on the light hues (amber,
 * lime, yellow) where white text would fail contrast.
 */
export type SeriesColor = { bg: string; fg: string };

const DARK = "#1a2230";
const LIGHT = "#ffffff";

export const SERIES_COLORS: readonly SeriesColor[] = [
  { bg: "#2563eb", fg: LIGHT }, // blue
  { bg: "#059669", fg: LIGHT }, // emerald
  { bg: "#f59e0b", fg: DARK }, //  amber
  { bg: "#7c3aed", fg: LIGHT }, // violet
  { bg: "#e11d48", fg: LIGHT }, // rose
  { bg: "#0891b2", fg: LIGHT }, // cyan
  { bg: "#ea580c", fg: LIGHT }, // orange
  { bg: "#0d9488", fg: LIGHT }, // teal
  { bg: "#6366f1", fg: LIGHT }, // indigo
  { bg: "#db2777", fg: LIGHT }, // pink
  { bg: "#84cc16", fg: DARK }, //  lime
  { bg: "#0ea5e9", fg: DARK }, //  sky (light hue: white text fails contrast)
  { bg: "#c026d3", fg: LIGHT }, // fuchsia
  { bg: "#facc15", fg: DARK }, //  yellow
] as const;

/** Neutral, hatched fill for the Savings fund (reads on both themes). */
export const SAVINGS_COLOR: SeriesColor = { bg: "#64748b", fg: LIGHT };

/** Deterministic hash from a string to a stable colour index. */
export function keyToColorIndex(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
  }
  const len = SERIES_COLORS.length;
  return ((Math.abs(hash) % len) + len) % len;
}

/** Resolve a colour by index (savings always gets the neutral fill). */
export function seriesColor(index: number, isSavings?: boolean): SeriesColor {
  if (isSavings) return SAVINGS_COLOR;
  const len = SERIES_COLORS.length;
  return SERIES_COLORS[((index % len) + len) % len];
}

/** Resolve a colour straight from a stable key (fund/wallet id). */
export function seriesColorForKey(
  key: string,
  isSavings?: boolean,
): SeriesColor {
  return seriesColor(keyToColorIndex(key), isSavings);
}
