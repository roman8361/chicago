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
