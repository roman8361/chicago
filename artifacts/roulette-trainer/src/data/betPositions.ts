// ── Bet positions for the main roulette field ────────────────────────────────
// Grid constants (match zones.ts / RouletteTable defaults)
const headerY = 147;
const botY    = 505;
const rowH    = (botY - headerY) / 3;   // ≈ 119.33

const COL_X: readonly number[] = [
  173, 272, 371, 470, 573, 672, 771, 870, 973, 1072, 1171, 1270, 1355,
];
const ZERO_X1 = 28;
const ZERO_X2 = COL_X[0]; // 173

// ── Helpers ───────────────────────────────────────────────────────────────────
function getCol(n: number): number { return Math.floor((n - 1) / 3); }
function getRow(n: number): number { return (n - 1) % 3; }

// x-center of column c
function colCx(c: number): number { return (COL_X[c] + COL_X[c + 1]) / 2; }
// y-center of row r  (0=bottom, 1=middle, 2=top)
function rowCy(r: number): number { return headerY + (2 - r) * rowH + rowH / 2; }
// y at the TOP boundary of row r (boundary between row r and row r+1)
function rowTopY(r: number): number { return headerY + (2 - r) * rowH; }

import rules from "./rouletteRules.json";

// ── Types ─────────────────────────────────────────────────────────────────────
export type BetType = 'straight' | 'split' | 'street' | 'corner' | 'sixline';

export interface BetPosition {
  id: string;
  type: BetType;
  numbers: number[];
  x: number;
  y: number;
  payout: number;
}

export const PAYOUT: Record<BetType, number> = {
  straight: rules.payouts.straightUp,
  split:    rules.payouts.split,
  street:   rules.payouts.street,
  corner:   rules.payouts.corner,
  sixline:  rules.payouts.sixLine,
};

// ── Build all positions ───────────────────────────────────────────────────────
const positions: BetPosition[] = [];

// ── Zero special bets ─────────────────────────────────────────────────────────
// Straight Up 0
positions.push({
  id: 'su-0', type: 'straight', numbers: [0],
  x: (ZERO_X1 + ZERO_X2) / 2,  // ≈ 100
  y: (headerY + botY) / 2,      // ≈ 326
  payout: PAYOUT.straight,
});

// Split 0-1 / 0-2 / 0-3
([1, 2, 3] as const).forEach(n => {
  positions.push({
    id: `sp-0-${n}`, type: 'split', numbers: [0, n],
    x: ZERO_X2 - 14,           // ≈ 159 (inside zero cell, near right edge)
    y: rowCy(getRow(n)),
    payout: PAYOUT.split,
  });
});

// Street 0-1-2
positions.push({
  id: 'st-0-12', type: 'street', numbers: [0, 1, 2],
  x: ZERO_X2 - 14,
  y: rowTopY(0),               // boundary between rows 0 and 1 ≈ 385
  payout: PAYOUT.street,
});

// Street 0-2-3
positions.push({
  id: 'st-0-23', type: 'street', numbers: [0, 2, 3],
  x: ZERO_X2 - 14,
  y: rowTopY(1),               // boundary between rows 1 and 2 ≈ 266
  payout: PAYOUT.street,
});

// Corner 0-1-2-3
positions.push({
  id: 'co-0', type: 'corner', numbers: [0, 1, 2, 3],
  x: (ZERO_X1 + ZERO_X2) / 2, // ≈ 100
  y: rowTopY(0),               // ≈ 385 (distinct from su-0 which is at ≈326)
  payout: PAYOUT.corner,
});

// ── Straight Up 1–36 ──────────────────────────────────────────────────────────
for (let n = 1; n <= 36; n++) {
  positions.push({
    id: `su-${n}`, type: 'straight', numbers: [n],
    x: colCx(getCol(n)),
    y: rowCy(getRow(n)),
    payout: PAYOUT.straight,
  });
}

// ── Split horizontal (n, n+3): same row, adjacent columns ────────────────────
for (let n = 1; n <= 33; n++) {
  const c = getCol(n);
  positions.push({
    id: `sp-h-${n}`, type: 'split', numbers: [n, n + 3],
    x: COL_X[c + 1],           // vertical boundary between col c and c+1
    y: rowCy(getRow(n)),
    payout: PAYOUT.split,
  });
}

// ── Split vertical (n, n+1): same column, adjacent rows ──────────────────────
for (let n = 1; n <= 35; n++) {
  if (n % 3 === 0) continue;   // multiples of 3 are top-row; n+1 would cross to next col
  const c = getCol(n);
  positions.push({
    id: `sp-v-${n}`, type: 'split', numbers: [n, n + 1],
    x: colCx(c),
    y: rowTopY(getRow(n)),     // boundary between rows
    payout: PAYOUT.split,
  });
}

// ── Street {3c+1, 3c+2, 3c+3} ────────────────────────────────────────────────
// In this horizontal layout the Street chip goes on the TOP OUTER EDGE of the
// column — i.e. on the line between the dozen header and the top number row.
// x = centre of the column; y = headerY (top boundary of the number rows).
for (let c = 0; c <= 11; c++) {
  positions.push({
    id: `st-${c}`, type: 'street', numbers: [3 * c + 1, 3 * c + 2, 3 * c + 3],
    x: colCx(c),               // horizontal centre of the column
    y: headerY,                // top boundary of number rows = bottom of dozen strip
    payout: PAYOUT.street,
  });
}

// ── Corner {n, n+1, n+3, n+4} ────────────────────────────────────────────────
for (let n = 1; n <= 32; n++) {
  if (n % 3 === 0) continue;   // n+1 would cross to next column
  const c = getCol(n);
  positions.push({
    id: `co-${n}`, type: 'corner', numbers: [n, n + 1, n + 3, n + 4],
    x: COL_X[c + 1],           // vertical boundary
    y: rowTopY(getRow(n)),     // horizontal boundary
    payout: PAYOUT.corner,
  });
}

// ── Six-Line {3c+1 … 3c+6} ───────────────────────────────────────────────────
// The Six-Line chip sits on the TOP OUTER EDGE, at the column boundary
// between the two streets that make up the six-line.
for (let c = 0; c <= 10; c++) {
  positions.push({
    id: `sl-${c}`, type: 'sixline',
    numbers: [3*c+1, 3*c+2, 3*c+3, 3*c+4, 3*c+5, 3*c+6],
    x: COL_X[c + 1],           // boundary between the two column groups
    y: headerY,                // top edge (same strip as Street chips)
    payout: PAYOUT.sixline,
  });
}

export const ALL_BET_POSITIONS: readonly BetPosition[] = positions;

// Fast lookup map
export const BET_POSITIONS_MAP: ReadonlyMap<string, BetPosition> =
  new Map(positions.map(p => [p.id, p]));
