import type { Dispatch, SetStateAction } from "react";

interface Props {
  showGrid: boolean;
  setShowGrid: Dispatch<SetStateAction<boolean>>;
  showTrack: boolean;
  setShowTrack: Dispatch<SetStateAction<boolean>>;
  showDozens: boolean;
  setShowDozens: Dispatch<SetStateAction<boolean>>;
  onOpenEditor: () => void;
  onOpenRules: () => void;
  onBack: () => void;
}

export default function DebugScreen({
  showGrid, setShowGrid,
  showTrack, setShowTrack,
  showDozens, setShowDozens,
  onOpenEditor,
  onOpenRules,
  onBack,
}: Props) {
  return (
    <div className="settings-page">
      <div className="settings-card" style={{ maxWidth: 560 }}>
        <div className="settings-title">
          <span className="settings-title-ornament">✦</span>
          Отладка
          <span className="settings-title-ornament">✦</span>
        </div>
        <div className="settings-divider" />

        {/* Section 1: Visual debug */}
        <div className="settings-section-title">Визуальная отладка поля</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 4 }}>

          <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
            <div
              onClick={() => setShowGrid(v => !v)}
              style={{
                width: 44, height: 24, borderRadius: 12, position: "relative", cursor: "pointer",
                background: showGrid ? "#C9A227" : "#2a2010",
                border: showGrid ? "1px solid #C9A227" : "1px solid #5a4a2a",
                transition: "background 0.2s, border-color 0.2s",
                flexShrink: 0,
              }}
            >
              <div style={{
                position: "absolute", top: 2, left: showGrid ? 22 : 2,
                width: 18, height: 18, borderRadius: "50%",
                background: showGrid ? "#fff" : "#8a7a5a",
                transition: "left 0.2s",
              }} />
            </div>
            <span
              className="settings-label"
              style={{ marginBottom: 0, cursor: "pointer" }}
              onClick={() => setShowGrid(v => !v)}
            >
              {showGrid ? "Скрыть сетку" : "Показать сетку"}
            </span>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
            <div
              onClick={() => setShowTrack(v => !v)}
              style={{
                width: 44, height: 24, borderRadius: 12, position: "relative", cursor: "pointer",
                background: showTrack ? "#C9A227" : "#2a2010",
                border: showTrack ? "1px solid #C9A227" : "1px solid #5a4a2a",
                transition: "background 0.2s, border-color 0.2s",
                flexShrink: 0,
              }}
            >
              <div style={{
                position: "absolute", top: 2, left: showTrack ? 22 : 2,
                width: 18, height: 18, borderRadius: "50%",
                background: showTrack ? "#fff" : "#8a7a5a",
                transition: "left 0.2s",
              }} />
            </div>
            <span
              className="settings-label"
              style={{ marginBottom: 0, cursor: "pointer" }}
              onClick={() => setShowTrack(v => !v)}
            >
              {showTrack ? "Скрыть трек" : "Показать трек"}
            </span>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
            <div
              onClick={() => setShowDozens(v => !v)}
              style={{
                width: 44, height: 24, borderRadius: 12, position: "relative", cursor: "pointer",
                background: showDozens ? "#C9A227" : "#2a2010",
                border: showDozens ? "1px solid #C9A227" : "1px solid #5a4a2a",
                transition: "background 0.2s, border-color 0.2s",
                flexShrink: 0,
              }}
            >
              <div style={{
                position: "absolute", top: 2, left: showDozens ? 22 : 2,
                width: 18, height: 18, borderRadius: "50%",
                background: showDozens ? "#fff" : "#8a7a5a",
                transition: "left 0.2s",
              }} />
            </div>
            <span
              className="settings-label"
              style={{ marginBottom: 0, cursor: "pointer" }}
              onClick={() => setShowDozens(v => !v)}
            >
              {showDozens ? "Скрыть дюжины" : "Показать дюжины"}
            </span>
          </label>

          <div style={{ marginTop: 4 }}>
            <button
              className="settings-start-btn"
              onClick={onOpenEditor}
              style={{ background: "transparent", border: "1px solid #C9A227", color: "#C9A227", width: "100%" }}
            >
              🎯 Настроить трек
            </button>
          </div>
        </div>

        <div className="settings-divider" />

        {/* Section 2: Rules */}
        <div className="settings-section-title">Конфигурация правил</div>
        <div style={{ marginBottom: 4 }}>
          <button
            className="settings-start-btn"
            onClick={onOpenRules}
            style={{ background: "transparent", border: "1px solid #5a4a2a", color: "#8a7a5a", width: "100%" }}
          >
            📖 Правила игры
          </button>
        </div>

        <div className="settings-divider" />

        <div className="settings-footer" style={{ justifyContent: "center" }}>
          <button className="settings-start-btn" onClick={onBack}>
            ← Вернуться к игре
          </button>
        </div>
      </div>
    </div>
  );
}
