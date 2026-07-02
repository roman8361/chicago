/**
 * rouletteRulesService
 *
 * Single source of truth for all roulette rules.
 * Components must NOT import rouletteRules.json directly — use this service.
 *
 * API:
 *   getPayouts()             → payouts table
 *   getTrackBetRule(type)    → one series rule
 *   getCompleteBetRule(n)    → complete-bet rule for number n
 *   getNeighboursRule()      → neighbours rules
 *   getAllRules()             → full rules object
 *   updateRules(newRules)    → save to localStorage + update state
 *   resetRules()             → clear localStorage + restore defaults
 */

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import defaultRules from "@/data/rouletteRules.json";

const STORAGE_KEY = "rouletteRules";

export type RulesData = typeof defaultRules;
export type TrackBetKey = keyof RulesData["trackBets"];

// ── Service interface ─────────────────────────────────────────────────────────
export interface RouletteRulesService {
  getPayouts: () => RulesData["payouts"];
  getTrackBetRule: (type: TrackBetKey) => RulesData["trackBets"][TrackBetKey];
  getCompleteBetRule: (number: number) => RulesData["completeBets"][number] | undefined;
  getNeighboursRule: () => RulesData["neighbours"];
  getAllRules: () => RulesData;
  updateRules: (newRules: RulesData) => void;
  resetRules: () => void;
}

const RulesContext = createContext<RouletteRulesService | null>(null);

// ── Persistence helpers ───────────────────────────────────────────────────────
function loadRules(): RulesData {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as RulesData;
      if (!Array.isArray((parsed as any)?.dozenComplete?.dozens)) {
        parsed.dozenComplete = defaultRules.dozenComplete;
      }
      return parsed;
    }
  } catch {}
  return defaultRules;
}

// ── Provider ──────────────────────────────────────────────────────────────────
export function RulesProvider({ children }: { children: ReactNode }) {
  const [rules, setRulesState] = useState<RulesData>(loadRules);

  const updateRules = useCallback((newRules: RulesData) => {
    setRulesState(newRules);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newRules, null, 2));
  }, []);

  const resetRules = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setRulesState(defaultRules);
  }, []);

  const getPayouts         = useCallback(() => rules.payouts,                             [rules]);
  const getTrackBetRule    = useCallback((type: TrackBetKey) => rules.trackBets[type],    [rules]);
  const getCompleteBetRule = useCallback((n: number) => rules.completeBets.find(cb => cb.number === n), [rules]);
  const getNeighboursRule  = useCallback(() => rules.neighbours,                           [rules]);
  const getAllRules         = useCallback(() => rules,                                      [rules]);

  const service: RouletteRulesService = {
    getPayouts,
    getTrackBetRule,
    getCompleteBetRule,
    getNeighboursRule,
    getAllRules,
    updateRules,
    resetRules,
  };

  return (
    <RulesContext.Provider value={service}>
      {children}
    </RulesContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useRouletteRules(): RouletteRulesService {
  const ctx = useContext(RulesContext);
  if (!ctx) throw new Error("useRouletteRules must be used within RulesProvider");
  return ctx;
}
