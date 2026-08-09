import { useState } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RulesProvider } from "@/lib/rulesContext";
import RouletteTable from "@/pages/RouletteTable";
import SettingsScreen from "@/pages/SettingsScreen";
import RulesScreen from "@/pages/RulesScreen";
import DebugScreen from "@/pages/DebugScreen";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/LoginPage";
import ManagerPage from "@/pages/manager/ManagerPage";
import DealerDetailsPage from "@/pages/manager/DealerDetailsPage";
import CreateTrainingPage from "@/pages/manager/CreateTrainingPage";
import SelectGamePage from "@/pages/manager/SelectGamePage";
import GameSettingsPlaceholderPage from "@/pages/manager/GameSettingsPlaceholderPage";
import SelectDealersPlaceholderPage from "@/pages/manager/SelectDealersPlaceholderPage";
import TrainingReviewPage from "@/pages/manager/TrainingReviewPage";
import DealerPage from "@/pages/dealer/DealerPage";
import { GameSettings, DEFAULT_SETTINGS } from "@/types/gameSettings";
import { TrainingWizardProvider } from "@/lib/trainingWizardContext";

const queryClient = new QueryClient();

type Screen = "roulette" | "settings" | "rules" | "debug";

function AppContent() {
  const [screen, setScreen] = useState<Screen>("roulette");
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const [rulesFrom, setRulesFrom] = useState<"settings" | "debug">("settings");

  // Debug state — lifted so it persists across screen changes
  const [showGrid,   setShowGrid]   = useState(false);
  const [showTrack,  setShowTrack]  = useState(false);
  const [showDozens, setShowDozens] = useState(false);
  const [editMode,   setEditMode]   = useState(false);

  function openRulesFrom(from: "settings" | "debug") {
    setRulesFrom(from);
    setScreen("rules");
  }

  function handleOpenEditor() {
    // Activate edit mode with required overlays, then show game screen
    setEditMode(true);
    setShowTrack(true);
    setShowDozens(true);
    setScreen("roulette");
  }

  return (
    <TrainingWizardProvider>
      <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/manager/training/new/game" component={SelectGamePage} />
      <Route path="/manager/training/new/settings" component={GameSettingsPlaceholderPage} />
      <Route path="/manager/training/new/dealers" component={SelectDealersPlaceholderPage} />
      <Route path="/manager/training/new/review" component={TrainingReviewPage} />
      <Route path="/manager/dealers/:dealerId/training/new" component={CreateTrainingPage} />
      <Route path="/manager/dealers/:dealerId" component={DealerDetailsPage} />
      <Route path="/manager" component={ManagerPage} />
      <Route path="/dealer" component={DealerPage} />
      <Route path="/">
        <>
          {/*
           * RouletteTable is ALWAYS mounted so its internal game/round state
           * is never lost when navigating to Debug, Settings, or Rules.
           * CSS display:none hides it visually while other screens are active.
           */}
          <div style={{ display: screen === "roulette" ? undefined : "none" }}>
            <RouletteTable
              settings={settings}
              onOpenSettings={() => setScreen("settings")}
              onOpenDebug={() => setScreen("debug")}
              showGrid={showGrid}
              setShowGrid={setShowGrid}
              showTrack={showTrack}
              setShowTrack={setShowTrack}
              showDozens={showDozens}
              setShowDozens={setShowDozens}
              editMode={editMode}
              setEditMode={setEditMode}
            />
          </div>

          {screen === "settings" && (
            <SettingsScreen
              initialSettings={settings}
              onStart={(s) => { setSettings(s); setScreen("roulette"); }}
            />
          )}

          {screen === "rules" && (
            <RulesScreen onBack={() => setScreen(rulesFrom)} />
          )}

          {screen === "debug" && (
            <DebugScreen
              showGrid={showGrid}
              setShowGrid={setShowGrid}
              showTrack={showTrack}
              setShowTrack={setShowTrack}
              showDozens={showDozens}
              setShowDozens={setShowDozens}
              onOpenEditor={handleOpenEditor}
              onOpenRules={() => openRulesFrom("debug")}
              onBack={() => setScreen("roulette")}
            />
          )}
        </>
      </Route>
      <Route component={NotFound} />
      </Switch>
    </TrainingWizardProvider>
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
