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
// Layout of the UPPER table (main betting grid):
//   Outer frame    : x₁=28   y₁=28   x₂=1452  y₂=522
//   Header row     : y₁=28   y₂=112             (1ST 12 / 2ND 12 / 3RD 12)
//   Number rows    : y₁=112  y₂=522             (height 410 → 3 rows × 136.7)
//   Zero cell      : x₁=28   x₂=148             (full row height)
//   Number columns : x₁=148  x₂=1350            (12 cols × 100.2 px)
//   2-TO-1 col     : x₁=1350 x₂=1452
//
//   Row y ranges:
//     Top row  (3  6 … 36) : y₁=112  y₂=249
//     Mid row  (2  5 … 35) : y₁=249  y₂=386
//     Bot row  (1  4 … 34) : y₁=386  y₂=522

const G = {
  headerY: 162,   // bottom edge of "1ST 12 / 2ND 12 / 3RD 12" header row
  botY: 520,      // bottom edge of the bottom number row
  zeroX1: 28,     // left edge of the 0 cell
  zeroX2: 148,    // right edge of the 0 cell / left edge of number grid
  colStart: 148,
  colEnd: 1338,   // right edge of number grid (before the 2TO1 column)
  colCount: 12,
  rowCount: 3,
} as const;

const colW = (G.colEnd - G.colStart) / G.colCount; // ≈ 100.2
const rowH = (G.botY - G.headerY) / G.rowCount;    // ≈ 136.7

// x left-edge of column c (0 = leftmost)
const colX = (c: number) => G.colStart + c * colW;

// y top-edge of row r (r=2→top, r=1→mid, r=0→bottom)
const rowY = (r: number) => G.headerY + (2 - r) * rowH;

function makeCell(c: number, r: number): ZonePoint[] {
  const x1 = colX(c);
  const x2 = colX(c + 1);
  const y1 = rowY(r);
  const y2 = rowY(r) + rowH;
  return poly(x1, y1, x2, y1, x2, y2, x1, y2);
}

function makeZone(n: number): RouletteZone {
  // Column: floor((n-1)/3),   Row: 0=bot 1=mid 2=top
  const col = Math.floor((n - 1) / 3);
  const row = (n - 1) % 3;
  const points = makeCell(col, row);
  const { cx, cy } = centroid(points);
  return { number: n, points, centerX: cx, centerY: cy };
}

// Number 0 — tall trapezoid on the left
const zeroPoints = poly(
  G.zeroX1, G.headerY,
  G.zeroX2, G.headerY,
  G.zeroX2, G.botY,
  G.zeroX1, G.botY,
);
const { cx: zeroCX, cy: zeroCY } = centroid(zeroPoints);
const zeroZone: RouletteZone = {
  number: 0,
  points: zeroPoints,
  centerX: zeroCX,
  centerY: zeroCY,
};

// Build zones for 1–36
const numberZones: RouletteZone[] = Array.from({ length: 36 }, (_, i) =>
  makeZone(i + 1)
);

export const ROULETTE_ZONES: RouletteZone[] = [zeroZone, ...numberZones];

export const ZONE_BY_NUMBER: Record<number, RouletteZone> =
  Object.fromEntries(ROULETTE_ZONES.map((z) => [z.number, z]));

// Natural image dimensions — used as the SVG viewBox
export const BASE_WIDTH = 1480;
export const BASE_HEIGHT = 1063;
