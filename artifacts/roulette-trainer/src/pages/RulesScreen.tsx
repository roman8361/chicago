import rules from "@/data/rouletteRules.json";

interface Props {
  onBack: () => void;
}

const PAYOUT_ROWS = [
  { label: "Страйт-ап (Straight Up)", key: "straightUp" as const, description: "1 номер" },
  { label: "Сплит (Split)",           key: "split"     as const, description: "2 номера" },
  { label: "Стрит (Street)",          key: "street"    as const, description: "3 номера" },
  { label: "Корнер (Corner)",         key: "corner"    as const, description: "4 номера" },
  { label: "Сикс-лайн (Six Line)",   key: "sixLine"   as const, description: "6 номеров" },
];

const TRACK_ORDER = ["SERIE_5_8", "ORPHELINS", "SERIE_0_2_3", "ZERO_SPIEL"] as const;

export default function RulesScreen({ onBack }: Props) {
  return (
    <div className="settings-page">
      <div className="settings-card" style={{ maxWidth: 780 }}>

        {/* Title */}
        <div className="settings-title">
          <span className="settings-title-ornament">✦</span>
          Правила рулетки
          <span className="settings-title-ornament">✦</span>
        </div>
        <div style={{ textAlign: "center", color: "#8a7a5a", fontSize: 13, marginTop: -6, marginBottom: 4, letterSpacing: 1 }}>
          версия {rules.version}
        </div>
        <div className="settings-divider" />

        {/* ── Выплаты ── */}
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
              <tr key={row.key} style={trStyle}>
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

        {/* ── Серии ── */}
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
                <tr key={key} style={trStyle}>
                  <td style={{ ...tdStyle, fontWeight: 600, color: "#d4b97a" }}>{bet.label}</td>
                  <td style={{ ...tdStyle, textAlign: "center", color: "#C9A227", fontWeight: 700 }}>
                    {bet.divisor}
                  </td>
                  <td style={{ ...tdStyle, color: "#8a7a5a", fontSize: 12 }}>
                    {bet.numbers.join(", ")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="settings-divider" />

        {/* ── Комплиты ── */}
        <div className="settings-section-title">Комплиты</div>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={{ ...thStyle, textAlign: "center" }}>№</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Фишек на комплит</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Выплата (фишки)</th>
            </tr>
          </thead>
          <tbody>
            {rules.completeBets.map(cb => (
              <tr key={cb.number} style={trStyle}>
                <td style={{ ...tdStyle, textAlign: "center", fontWeight: 700,
                  color: cb.number === 0 ? "#4caf50" : "inherit" }}>
                  {cb.number}
                </td>
                <td style={{ ...tdStyle, textAlign: "center",
                  color: cb.chipsRequired !== null ? "#C9A227" : "#4a4030" }}>
                  {cb.chipsRequired !== null ? cb.chipsRequired : "—"}
                </td>
                <td style={{ ...tdStyle, textAlign: "center",
                  color: cb.payoutInChips !== null ? "#d4b97a" : "#4a4030" }}>
                  {cb.payoutInChips !== null ? cb.payoutInChips : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="settings-divider" />

        {/* ── Соседи ── */}
        <div className="settings-section-title">Соседи номера</div>
        <div style={{ color: "#4a4030", fontSize: 13, padding: "10px 4px", fontStyle: "italic" }}>
          Правила соседей будут добавлены в следующей версии.
        </div>

        <div className="settings-divider" />

        {/* Back */}
        <div className="settings-footer">
          <button className="settings-start-btn" onClick={onBack}>
            ← Назад к настройкам
          </button>
        </div>

      </div>
    </div>
  );
}

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  marginBottom: 4,
};

const thStyle: React.CSSProperties = {
  padding: "6px 10px",
  textAlign: "left",
  color: "#8a7a5a",
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: 0.8,
  borderBottom: "1px solid #2a2010",
  textTransform: "uppercase",
};

const tdStyle: React.CSSProperties = {
  padding: "6px 10px",
  fontSize: 13,
  color: "#c8b88a",
  borderBottom: "1px solid #1e1808",
};

const trStyle: React.CSSProperties = {};
