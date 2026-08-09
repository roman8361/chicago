import { useState } from "react";
import { useLocation } from "wouter";
import RouletteTable from "@/pages/RouletteTable";
import SettingsScreen from "@/pages/SettingsScreen";
import RulesScreen from "@/pages/RulesScreen";
import DebugScreen from "@/pages/DebugScreen";
import { DEFAULT_SETTINGS, type GameSettings } from "@/types/gameSettings";

type Screen = "roulette" | "settings" | "rules" | "debug";

export default function PracticeRoulettePage() {
  const [, navigate] = useLocation();
  const [screen, setScreen] = useState<Screen>("roulette");
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const [rulesFrom, setRulesFrom] = useState<"settings" | "debug">("settings");
  const [showGrid, setShowGrid] = useState(false);
  const [showTrack, setShowTrack] = useState(false);
  const [showDozens, setShowDozens] = useState(false);
  const [editMode, setEditMode] = useState(false);

  function openRulesFrom(from: "settings" | "debug") {
    setRulesFrom(from);
    setScreen("rules");
  }

  function handleOpenEditor() {
    setEditMode(true);
    setShowTrack(true);
    setShowDozens(true);
    setScreen("roulette");
  }

  return (
    <>
      <div style={{ display: screen === "roulette" ? undefined : "none" }}>
        <RouletteTable
          settings={settings}
          onBackHome={() => navigate("/")}
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
          onStart={(nextSettings) => {
            setSettings(nextSettings);
            setScreen("roulette");
          }}
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
  );
}