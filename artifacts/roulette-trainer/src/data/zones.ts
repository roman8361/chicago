export interface ZonePoint {
  x: number;
  y: number;
}

export interface RouletteZone {
  number: number;
  points: ZonePoint[];
  centerX: number;
  centerY: number;
}

function poly(...coords: number[]): ZonePoint[] {
  const pts: ZonePoint[] = [];
  for (let i = 0; i < coords.length; i += 2) {
    pts.push({ x: coords[i], y: coords[i + 1] });
  }
  return pts;
}

function centroid(pts: ZonePoint[]): { cx: number; cy: number } {
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  return { cx, cy };
}

// ─── Image natural dimensions ─────────────────────────────────────────────────
// Image: rulet_track2_1781011699361.png — 1480 × 1063 pixels
//
// The image has THICKER gold dividers between the 1st/2nd and 2nd/3rd dozen
// sections. Uniform column widths drift visually at those boundaries.
// Each column boundary is therefore specified manually.
//
// Vertical layout:
//   headerY = 147  (top of the number rows — bottom edge of 1ST/2ND/3RD header)
//   botY    = 505  (bottom of the number rows)
//   rowH    = (505-147)/3 = 119.3 px  (per row)
//
//   Top row  (3  6 … 36) : y₁=147  y₂=266
//   Mid row  (2  5 … 35) : y₁=266  y₂=386
//   Bot row  (1  4 … 34) : y₁=386  y₂=505
//
// Horizontal layout  (13 boundary x-values for 12 columns):
//   Regular cell width ≈ 99 px
//   Extra gap at 1st↔2nd and 2nd↔3rd dozen borders ≈ 3 px each

const headerY = 147;
const botY    = 505;
const rowH    = (botY - headerY) / 3;  // ≈ 119.3

// 13 x-positions (left edges of each column, plus right edge of last column)
// Col 0–3  : 1st dozen (numbers 3,6,9,12 / 2,5,8,11 / 1,4,7,10)
// Col 4–7  : 2nd dozen (15,18,21,24 / 14,17,20,23 / 13,16,19,22)
// Col 8–11 : 3rd dozen (27,30,33,36 / 26,29,32,35 / 25,28,31,34)
const COL_X: readonly number[] = [
   173,  // left  of col  0  (3 / 2 / 1)
   272,  // left  of col  1  (6 / 5 / 4)
   371,  // left  of col  2  (9 / 8 / 7)
   470,  // left  of col  3  (12/11/10)
   573,  // left  of col  4  (15/14/13)  ← after thick 1ST→2ND border
   672,  // left  of col  5  (18/17/16)
   771,  // left  of col  6  (21/20/19)
   870,  // left  of col  7  (24/23/22)
   973,  // left  of col  8  (27/26/25)  ← after thick 2ND→3RD border
  1072,  // left  of col  9  (30/29/28)
  1171,  // left  of col 10  (33/32/31)
  1270,  // left  of col 11  (36/35/34)
  1355,  // right of col 11  (colEnd — before 2TO1 column)
];

const ZERO_X1 = 28;
const ZERO_X2 = COL_X[0]; // right edge of 0 cell = left edge of col 0

// y top-edge of row  (r=2→top, r=1→mid, r=0→bottom)
const rowY = (r: number) => headerY + (2 - r) * rowH;

function makeCell(c: number, r: number): ZonePoint[] {
  const x1 = COL_X[c];
  const x2 = COL_X[c + 1];
  const y1 = rowY(r);
  const y2 = rowY(r) + rowH;
  return poly(x1, y1, x2, y1, x2, y2, x1, y2);
}

function makeZone(n: number): RouletteZone {
  // col = floor((n-1)/3),  row: 0=bot 1=mid 2=top
  const col = Math.floor((n - 1) / 3);
  const row = (n - 1) % 3;
  const points = makeCell(col, row);
  const { cx, cy } = centroid(points);
  return { number: n, points, centerX: cx, centerY: cy };
}

// Number 0 — tall rectangle on the left
const zeroPoints = poly(
  ZERO_X1, headerY,
  ZERO_X2, headerY,
  ZERO_X2, botY,
  ZERO_X1, botY,
);
const { cx: zeroCX, cy: zeroCY } = centroid(zeroPoints);
const zeroZone: RouletteZone = {
  number: 0,
  points: zeroPoints,
  centerX: zeroCX,
  centerY: zeroCY,
};

const numberZones: RouletteZone[] = Array.from({ length: 36 }, (_, i) =>
  makeZone(i + 1)
);

export const ROULETTE_ZONES: RouletteZone[] = [zeroZone, ...numberZones];

export const ZONE_BY_NUMBER: Record<number, RouletteZone> =
  Object.fromEntries(ROULETTE_ZONES.map((z) => [z.number, z]));

export const BASE_WIDTH  = 1480;
export const BASE_HEIGHT = 1063;
