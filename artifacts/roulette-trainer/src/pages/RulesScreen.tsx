import { useState } from "react";
import { useRouletteRules, type RulesData } from "@/lib/rulesContext";

interface Props {
  onBack: () => void;
}

// ── Validation ────────────────────────────────────────────────────────────────
function validateRules(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return "JSON должен быть объектом";
  const d = data as Record<string, unknown>;

  for (const key of ["version", "payouts", "trackBets", "completeBets", "neighbours"]) {
    if (!(key in d)) return `Отсутствует обязательный раздел: "${key}"`;
  }

  const payouts = d.payouts as Record<string, unknown>;
  if (typeof payouts !== "object" || payouts === null) return "payouts должен быть объектом";
  for (const key of ["straightUp", "split", "street", "corner", "sixLine"]) {
    if (typeof payouts[key] !== "number") return `payouts.${key} должно быть числом`;
  }

  const trackBets = d.trackBets as Record<string, unknown>;
  if (typeof trackBets !== "object" || trackBets === null) return "trackBets должен быть объектом";
  for (const [key, bet] of Object.entries(trackBets)) {
    const b = bet as Record<string, unknown>;
    if (typeof b.divisor !== "number" || b.divisor <= 0)
      return `trackBets.${key}.divisor должен быть положительным числом`;
  }

  return null;
}

// ── View tables ───────────────────────────────────────────────────────────────
const PAYOUT_ROWS = [
  { label: "Страйт-ап (Straight Up)", key: "straightUp" as const, description: "1 номер" },
  { label: "Сплит (Split)",           key: "split"      as const, description: "2 номера" },
  { label: "Стрит (Street)",          key: "street"     as const, description: "3 номера" },
  { label: "Корнер (Corner)",         key: "corner"     as const, description: "4 номера" },
  { label: "Сикс-лайн (Six Line)",   key: "sixLine"    as const, description: "6 номеров" },
];
const TRACK_ORDER = ["SERIE_5_8", "ORPHELINS", "SERIE_0_2_3", "ZERO_SPIEL"] as const;

function ViewMode({ rules, onEdit, onReset }: { rules: RulesData; onEdit: () => void; onReset: () => void }) {
  return (
    <>
      <div style={{ textAlign: "center", color: "#8a7a5a", fontSize: 13, marginTop: -6, marginBottom: 4, letterSpacing: 1 }}>
        версия {rules.version}
      </div>
      <div className="settings-divider" />

      <div className="settings-section-title">Выплаты</div>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Тип ставки</th>
            <th style={thStyle}>Покрытие</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Коэффициент</th>
          </tr>
        </thead>
        <tbody>
          {PAYOUT_ROWS.map(row => (
            <tr key={row.key}>
              <td style={tdStyle}>{row.label}</td>
              <td style={{ ...tdStyle, color: "#8a7a5a" }}>{row.description}</td>
              <td style={{ ...tdStyle, textAlign: "right", color: "#C9A227", fontWeight: 700 }}>
                {rules.payouts[row.key]} : 1
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="settings-divider" />
      <div className="settings-section-title">Серии (трек)</div>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Серия</th>
            <th style={{ ...thStyle, textAlign: "center" }}>Делитель</th>
            <th style={thStyle}>Номера</th>
          </tr>
        </thead>
        <tbody>
          {TRACK_ORDER.map(key => {
            const bet = rules.trackBets[key];
            return (
              <tr key={key}>
                <td style={{ ...tdStyle, fontWeight: 600, color: "#d4b97a" }}>{bet.label}</td>
                <td style={{ ...tdStyle, textAlign: "center", color: "#C9A227", fontWeight: 700 }}>{bet.divisor}</td>
                <td style={{ ...tdStyle, color: "#8a7a5a", fontSize: 12 }}>{bet.numbers.join(", ")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="settings-divider" />
      <div className="settings-section-title">Комплиты</div>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={{ ...thStyle, textAlign: "center" }}>№</th>
            <th style={{ ...thStyle, textAlign: "center" }}>Фишек</th>
            <th style={{ ...thStyle, textAlign: "center" }}>Выплата</th>
          </tr>
        </thead>
        <tbody>
          {rules.completeBets.map(cb => (
            <tr key={cb.number}>
              <td style={{ ...tdStyle, textAlign: "center", fontWeight: 700, color: cb.number === 0 ? "#4caf50" : "#C9A227" }}>{cb.number}</td>
              <td style={{ ...tdStyle, textAlign: "center", color: cb.chipsRequired !== null ? "#C9A227" : "#4a4030" }}>
                {cb.chipsRequired !== null ? cb.chipsRequired : "—"}
              </td>
              <td style={{ ...tdStyle, textAlign: "center", color: cb.payoutInChips !== null ? "#d4b97a" : "#4a4030" }}>
                {cb.payoutInChips !== null ? cb.payoutInChips : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="settings-divider" />
      <div className="settings-section-title">Комплит дюжины</div>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Дюжина</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Фишек</th>
          </tr>
        </thead>
        <tbody>
          {rules.dozenComplete.dozens.map(d => (
            <tr key={d.dozen}>
              <td style={tdStyle}>{d.dozen === 1 ? "1-я (1–12)" : d.dozen === 2 ? "2-я (13–24)" : "3-я (25–36)"}</td>
              <td style={{ ...tdStyle, textAlign: "right", color: "#C9A227", fontWeight: 700 }}>
                {d.chipsRequired}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="settings-divider" />
      <div className="settings-section-title">Соседи номера</div>
      <div style={{ color: "#4a4030", fontSize: 13, padding: "10px 4px", fontStyle: "italic" }}>
        Правила соседей будут добавлены в следующей версии.
      </div>

      <div className="settings-divider" />
      <div className="settings-footer" style={{ gap: 12, display: "flex", justifyContent: "center", flexWrap: "wrap" }}>
        <button className="settings-start-btn" onClick={onEdit}
          style={{ background: "transparent", border: "1px solid #C9A227", color: "#C9A227" }}>
          ✏️ Редактировать
        </button>
        <button className="settings-start-btn" onClick={onReset}
          style={{ background: "transparent", border: "1px solid #7b241c", color: "#c0392b" }}>
          ↺ Сбросить к дефолтным
        </button>
      </div>
    </>
  );
}

function EditMode({
  rules, onSave, onCancel, onReset,
}: {
  rules: RulesData;
  onSave: (raw: string) => void;
  onCancel: () => void;
  onReset: () => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(rules, null, 2));
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      setError("JSON невалидный: " + (e instanceof Error ? e.message : String(e)));
      return;
    }
    const err = validateRules(parsed);
    if (err) { setError(err); return; }
    setError(null);
    onSave(text);
  }

  return (
    <>
      <div style={{ textAlign: "center", color: "#8a7a5a", fontSize: 13, marginTop: -6, marginBottom: 8, letterSpacing: 1 }}>
        Редактирование правил
      </div>
      <div className="settings-divider" />

      <div className="settings-section-title">Raw JSON</div>
      <textarea
        value={text}
        onChange={e => { setText(e.target.value); setError(null); }}
        spellCheck={false}
        style={{
          width: "100%",
          minHeight: 400,
          background: "#0a0e06",
          color: "#c8b88a",
          border: error ? "1.5px solid #c0392b" : "1.5px solid #3a2e10",
          borderRadius: 6,
          padding: "10px 12px",
          fontFamily: "monospace",
          fontSize: 12,
          lineHeight: 1.6,
          resize: "vertical",
          outline: "none",
          boxSizing: "border-box",
        }}
      />
      {error && (
        <div style={{
          color: "#e74c3c", fontSize: 13, marginTop: 8,
          background: "rgba(192,57,43,0.12)", border: "1px solid #922b21",
          borderRadius: 4, padding: "6px 10px",
        }}>
          ⚠ {error}
        </div>
      )}

      <div className="settings-divider" />
      <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
        <button className="settings-start-btn" onClick={handleSave}>
          ✓ Сохранить
        </button>
        <button className="settings-start-btn" onClick={onCancel}
          style={{ background: "transparent", border: "1px solid #5a4a2a", color: "#8a7a5a" }}>
          Отмена
        </button>
        <button className="settings-start-btn" onClick={onReset}
          style={{ background: "transparent", border: "1px solid #7b241c", color: "#c0392b" }}>
          ↺ Сбросить к дефолтным
        </button>
      </div>
    </>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function RulesScreen({ onBack }: Props) {
  const { getAllRules, updateRules, resetRules } = useRouletteRules();
  const rules = getAllRules();
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [saved, setSaved] = useState(false);

  function handleSave(raw: string) {
    updateRules(JSON.parse(raw) as RulesData);
    setMode("view");
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  function handleReset() {
    if (!window.confirm("Сбросить все локальные изменения правил к значениям по умолчанию из файла?")) return;
    resetRules();
    setMode("view");
  }

  return (
    <div className="settings-page">
      <div className="settings-card" style={{ maxWidth: 780 }}>

        <div className="settings-title">
          <span className="settings-title-ornament">✦</span>
          Правила рулетки
          <span className="settings-title-ornament">✦</span>
        </div>

        {saved && (
          <div style={{
            textAlign: "center", color: "#27ae60", fontSize: 13,
            background: "rgba(39,174,96,0.1)", border: "1px solid #1e8449",
            borderRadius: 4, padding: "5px 12px", marginTop: 4,
          }}>
            ✓ Правила сохранены
          </div>
        )}

        {mode === "view" ? (
          <ViewMode rules={rules} onEdit={() => setMode("edit")} onReset={handleReset} />
        ) : (
          <EditMode
            rules={rules}
            onSave={handleSave}
            onCancel={() => setMode("view")}
            onReset={handleReset}
          />
        )}

        <div className="settings-divider" />
        <div style={{ textAlign: "center" }}>
          <button className="settings-start-btn" onClick={onBack}
            style={{ background: "transparent", border: "1px solid #3a2e10", color: "#6a5a3a", fontSize: 13 }}>
            ← Назад к настройкам
          </button>
        </div>

      </div>
    </div>
  );
}

const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", marginBottom: 4 };
const thStyle: React.CSSProperties = {
  padding: "6px 10px", textAlign: "left", color: "#8a7a5a",
  fontSize: 12, fontWeight: 600, letterSpacing: 0.8,
  borderBottom: "1px solid #2a2010", textTransform: "uppercase",
};
const tdStyle: React.CSSProperties = {
  padding: "6px 10px", fontSize: 13, color: "#c8b88a",
  borderBottom: "1px solid #1e1808",
};
