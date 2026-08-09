const CURRENT_DEALER_STORAGE_KEY = "roulette-trainer-current-dealer-id";

export function getCurrentDealerId(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(CURRENT_DEALER_STORAGE_KEY);
}

export function setCurrentDealerId(dealerId: string): void {
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(CURRENT_DEALER_STORAGE_KEY, dealerId);
  }
}

export function clearCurrentDealerId(): void {
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(CURRENT_DEALER_STORAGE_KEY);
  }
}