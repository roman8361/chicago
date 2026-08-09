import { MOCK_DEALERS, type Dealer } from "@/data/mockDealers";

export const DEALERS_STORAGE_KEY = "roulette-trainer-dealers";

function cloneMockDealers(): Dealer[] {
  return MOCK_DEALERS.map((dealer) => ({ ...dealer }));
}

function isDealer(value: unknown): value is Dealer {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Dealer>;
  return typeof candidate.id === "string" && typeof candidate.fullName === "string";
}

export function getDealers(): Dealer[] {
  if (typeof window === "undefined") return cloneMockDealers();

  const raw = window.localStorage.getItem(DEALERS_STORAGE_KEY);
  if (!raw) {
    const initialDealers = cloneMockDealers();
    saveDealers(initialDealers);
    return initialDealers;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every(isDealer)) {
      return parsed;
    }
  } catch {
    // Fall back to the initial test data below if storage is malformed.
  }

  const initialDealers = cloneMockDealers();
  saveDealers(initialDealers);
  return initialDealers;
}

export function saveDealers(dealers: Dealer[]): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(DEALERS_STORAGE_KEY, JSON.stringify(dealers));
  }
}

function createDealerId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `dealer-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function addDealer(fullName: string): Dealer {
  const dealer: Dealer = { id: createDealerId(), fullName };
  const dealers = [...getDealers(), dealer];
  saveDealers(dealers);
  return dealer;
}

export function updateDealer(id: string, fullName: string): Dealer | null {
  const dealers = getDealers();
  const index = dealers.findIndex((dealer) => dealer.id === id);
  if (index === -1) return null;

  const updatedDealer = { ...dealers[index], fullName };
  const updatedDealers = [...dealers];
  updatedDealers[index] = updatedDealer;
  saveDealers(updatedDealers);
  return updatedDealer;
}

export function deleteDealer(id: string): void {
  saveDealers(getDealers().filter((dealer) => dealer.id !== id));
}