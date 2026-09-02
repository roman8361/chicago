export type CashChipVisual = {
  bodyFill: string;
  textFill: string;
  textStroke: string;
};

const STANDARD_CASH_CHIP_VISUAL: CashChipVisual = {
  bodyFill: "#111418",
  textFill: "#D9D9D9",
  textStroke: "rgba(0,0,0,0.75)",
};

/**
 * Returns the display colors for a cash chip based on its final displayed amount.
 * Amounts below 5 keep the existing standard style for backward compatibility.
 */
export function getCashChipVisual(amount: number): CashChipVisual {
  if (amount >= 5000) {
    return {
      bodyFill: "#35164f",
      textFill: "#f7efff",
      textStroke: "rgba(0,0,0,0.82)",
    };
  }
  if (amount >= 1000) {
    return {
      bodyFill: "#c96f1d",
      textFill: "#fff7ed",
      textStroke: "rgba(0,0,0,0.78)",
    };
  }
  if (amount >= 500) {
    return {
      bodyFill: "#f4f2ea",
      textFill: "#171717",
      textStroke: "rgba(255,255,255,0.9)",
    };
  }
  if (amount >= 100) {
    return STANDARD_CASH_CHIP_VISUAL;
  }
  if (amount >= 25) {
    return {
      bodyFill: "#23833f",
      textFill: "#f2fff5",
      textStroke: "rgba(0,0,0,0.78)",
    };
  }
  if (amount >= 5) {
    return {
      bodyFill: "#671f2c",
      textFill: "#fff1f3",
      textStroke: "rgba(0,0,0,0.82)",
    };
  }
  return STANDARD_CASH_CHIP_VISUAL;
}