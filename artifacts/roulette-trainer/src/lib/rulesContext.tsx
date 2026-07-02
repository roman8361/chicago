import { createContext, useContext, useState, type ReactNode } from "react";
import defaultRules from "@/data/rouletteRules.json";

const STORAGE_KEY = "rouletteRules";

export type RulesData = typeof defaultRules;

interface RulesContextValue {
  rules: RulesData;
  setRules: (r: RulesData) => void;
  resetRules: () => void;
}

const RulesContext = createContext<RulesContextValue | null>(null);

function loadRules(): RulesData {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored) as RulesData;
  } catch {}
  return defaultRules;
}

export function RulesProvider({ children }: { children: ReactNode }) {
  const [rules, setRulesState] = useState<RulesData>(loadRules);

  function setRules(r: RulesData) {
    setRulesState(r);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(r, null, 2));
  }

  function resetRules() {
    localStorage.removeItem(STORAGE_KEY);
    setRulesState(defaultRules);
  }

  return (
    <RulesContext.Provider value={{ rules, setRules, resetRules }}>
      {children}
    </RulesContext.Provider>
  );
}

export function useRules() {
  const ctx = useContext(RulesContext);
  if (!ctx) throw new Error("useRules must be used within RulesProvider");
  return ctx;
}
