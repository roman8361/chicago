// ── Racetrack (lower section) zones ──────────────────────────────────────────
// Image: 1480 × 1063 px
//
// The racetrack oval occupies the bottom ~48% of the image (y ≈ 540–1060).
// Structure:
//   Top row    – 17 cells going LEFT → RIGHT
//   Right arc  –  3 cells going TOP  → BOTTOM
//   Bottom row – 14 cells going LEFT → RIGHT (displayed L→R in image)
//   Left arc   –  3 cells going TOP  → BOTTOM
//
// Numbers in wheel/track order:
//   Top row    : 10  5  24  16  33   1  20  14  31   9  22  18  29   7  28  12  35
//   Right arc  :  3  26   0
//   Bottom row : 11  36  13  27   6  34  17  25   2  21   4  19  15  32
//   Left arc   : 23   8  30
//
// Sectors (classic French roulette):
//   Serie 5/8  (Tiers) : 5,8,10,11,13,16,23,24,27,30,33,36
//   Orphelins          : 1,6,9,14,17,20,31,34
//   Serie 0/2/3 (Voisins): 2,4,7,18,19,21,22,25,28,29
//   Zero Spiel         : 0,3,12,15,26,32,35

// ── Sector definitions ────────────────────────────────────────────────────────
export type SectorId = "serie58" | "orphelins" | "serie023" | "zerospiel";

export interface SectorDef {
  id: SectorId;
  label: string;
  color: string;
  fill: string;
  numbers: Set<number>;
}

export const SECTORS: SectorDef[] = [
  {
    id: "serie58",
    label: "Serie 5/8",
    color: "#3BAFDA",
    fill: "rgba(59,175,218,0.22)",
    numbers: new Set([5, 8, 10, 11, 13, 16, 23, 24, 27, 30, 33, 36]),
  },
  {
    id: "orphelins",
    label: "Orphelins",
    color: "#F6A623",
    fill: "rgba(246,166,35,0.22)",
    numbers: new Set([1, 6, 9, 14, 17, 20, 31, 34]),
  },
  {
    id: "serie023",
    label: "Serie 0/2/3",
    color: "#7ED321",
    fill: "rgba(126,211,33,0.22)",
    numbers: new Set([2, 4, 7, 18, 19, 21, 22, 25, 28, 29]),
  },
  {
    id: "zerospiel",
    label: "Zero Spiel",
    color: "#BD10E0",
    fill: "rgba(189,16,224,0.22)",
    numbers: new Set([0, 3, 12, 15, 26, 32, 35]),
  },
];

export function sectorFor(n: number): SectorDef | undefined {
  return SECTORS.find(s => s.numbers.has(n));
}

// ── Sector band (middle label area between top and bottom rows) ───────────────
export interface SectorBand {
  sector: SectorDef;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  cx: number;
  cy: number;
}

// Top-row sector split indices (0-based):
//   Serie 5/8  → top[0..4]  (10,5,24,16,33)  → x: topX[0]..topX[5]
//   Orphelins  → top[5..9]  (1,20,14,31,9)   → x: topX[5]..topX[10]
//   Serie 0/2/3→ top[10..14](22,18,29,7,28)  → x: topX[10]..topX[15]
//   Zero Spiel → top[15..16](12,35)           → x: topX[15]..arcRX2
const SECTOR_TOP_SPLITS = [5, 10, 15]; // indices into topX

export function buildSectorBands(p: TrackParams): SectorBand[] {
  const y1 = p.topY2;
  const y2 = p.botY1;
  const cy = (y1 + y2) / 2;

  const xEdges = [
    p.arcLX1,
    p.topX[SECTOR_TOP_SPLITS[0]],
    p.topX[SECTOR_TOP_SPLITS[1]],
    p.topX[SECTOR_TOP_SPLITS[2]],
    p.arcRX2,
  ];

  return SECTORS.map((sector, i) => {
    const x1 = xEdges[i];
    const x2 = xEdges[i + 1];
    return { sector, x1, y1, x2, y2, cx: (x1 + x2) / 2, cy };
  });
}

export interface TrackZone {
  number: number;
  section: "top" | "bottom" | "arcL" | "arcR";
  pts: string;
  cx: number;
  cy: number;
}

export interface TrackParams {
  topY1: number;   // outer top of top row
  topY2: number;   // inner bottom of top row
  botY1: number;   // inner top of bottom row
  botY2: number;   // outer bottom of bottom row

  arcLX1: number;  // outer left of left arc
  arcLX2: number;  // inner right of left arc (= left edge of top/bot rows)
  arcLY: [number, number, number, number]; // 4 y-boundaries for 3 left-arc cells

  arcRX1: number;  // inner left of right arc (= right edge of top/bot rows)
  arcRX2: number;  // outer right of right arc
  arcRY: [number, number, number, number]; // 4 y-boundaries for 3 right-arc cells

  topX: number[];  // 18 x-boundaries for 17 top-row cells
  botX: number[];  // 15 x-boundaries for 14 bottom-row cells
}

export const DEFAULT_TRACK_PARAMS: TrackParams = {
  topY1:  553,
  topY2:  648,
  botY1:  940,
  botY2: 1042,

  arcLX1: 115,
  arcLX2: 218,
  arcLY: [553, 714, 878, 1042],

  arcRX1: 1262,
  arcRX2: 1375,
  arcRY: [553, 714, 878, 1042],

  // 18 values for 17 top-row cells (uniform start)
  topX: [218, 279, 341, 402, 463, 524, 586, 647, 708, 769, 831, 892, 953, 1015, 1076, 1137, 1199, 1262],

  // 15 values for 14 bottom-row cells (uniform start)
  botX: [218, 293, 368, 442, 517, 592, 667, 742, 817, 892, 966, 1041, 1116, 1191, 1262],
};

const TOP_NUMBERS    = [10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35];
const ARC_R_NUMBERS  = [3, 26, 0];
const BOT_NUMBERS    = [11, 36, 13, 27, 6, 34, 17, 25, 2, 21, 4, 19, 15, 32];
const ARC_L_NUMBERS  = [23, 8, 30];

function pts4(x1: number, y1: number, x2: number, y2: number): string {
  return `${x1},${y1} ${x2},${y1} ${x2},${y2} ${x1},${y2}`;
}
function cx4(x1: number, x2: number) { return (x1 + x2) / 2; }
function cy4(y1: number, y2: number) { return (y1 + y2) / 2; }

export function buildTrackZones(p: TrackParams): TrackZone[] {
  const zones: TrackZone[] = [];

  // Top row
  for (let i = 0; i < TOP_NUMBERS.length; i++) {
    const x1 = p.topX[i], x2 = p.topX[i + 1];
    zones.push({
      number: TOP_NUMBERS[i],
      section: "top",
      pts: pts4(x1, p.topY1, x2, p.topY2),
      cx: cx4(x1, x2),
      cy: cy4(p.topY1, p.topY2),
    });
  }

  // Right arc
  for (let i = 0; i < ARC_R_NUMBERS.length; i++) {
    const y1 = p.arcRY[i], y2 = p.arcRY[i + 1];
    zones.push({
      number: ARC_R_NUMBERS[i],
      section: "arcR",
      pts: pts4(p.arcRX1, y1, p.arcRX2, y2),
      cx: cx4(p.arcRX1, p.arcRX2),
      cy: cy4(y1, y2),
    });
  }

  // Bottom row
  for (let i = 0; i < BOT_NUMBERS.length; i++) {
    const x1 = p.botX[i], x2 = p.botX[i + 1];
    zones.push({
      number: BOT_NUMBERS[i],
      section: "bottom",
      pts: pts4(x1, p.botY1, x2, p.botY2),
      cx: cx4(x1, x2),
      cy: cy4(p.botY1, p.botY2),
    });
  }

  // Left arc
  for (let i = 0; i < ARC_L_NUMBERS.length; i++) {
    const y1 = p.arcLY[i], y2 = p.arcLY[i + 1];
    zones.push({
      number: ARC_L_NUMBERS[i],
      section: "arcL",
      pts: pts4(p.arcLX1, y1, p.arcLX2, y2),
      cx: cx4(p.arcLX1, p.arcLX2),
      cy: cy4(y1, y2),
    });
  }

  return zones;
}
