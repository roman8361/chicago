import { useState } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RulesProvider } from "@/lib/rulesContext"; // rouletteRulesService entry point
import RouletteTable from "@/pages/RouletteTable";
import SettingsScreen from "@/pages/SettingsScreen";
import RulesScreen from "@/pages/RulesScreen";
import NotFound from "@/pages/not-found";
import { GameSettings, DEFAULT_SETTINGS } from "@/types/gameSettings";

const queryClient = new QueryClient();

type Screen = "roulette" | "settings" | "rules";

function AppContent() {
  const [screen, setScreen] = useState<Screen>("roulette");
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);

  return (
    <Switch>
      <Route path="/">
        {screen === "settings" ? (
          <SettingsScreen
            initialSettings={settings}
            onStart={(s) => { setSettings(s); setScreen("roulette"); }}
            onOpenRules={() => setScreen("rules")}
          />
        ) : screen === "rules" ? (
          <RulesScreen onBack={() => setScreen("settings")} />
        ) : (
          <RouletteTable
            settings={settings}
            onOpenSettings={() => setScreen("settings")}
          />
        )}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RulesProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AppContent />
          </WouterRouter>
        </RulesProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
