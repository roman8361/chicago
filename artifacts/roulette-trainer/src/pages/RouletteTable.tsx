import { useState } from "react";
import { ROULETTE_ZONES, BASE_WIDTH, BASE_HEIGHT } from "@/data/zones";
import ruletImage from "@assets/rulet_track2_1781011699361.png";

export default function RouletteTable() {
  const [showGrid, setShowGrid] = useState(false);

  return (
    <div className="roulette-page">
      <button
        className={`grid-toggle-btn ${showGrid ? "active" : ""}`}
        onClick={() => setShowGrid((v) => !v)}
      >
        {showGrid ? "Скрыть сетку" : "Показать сетку"}
      </button>

      <div className="roulette-wrapper">
        <img
          src={ruletImage}
          alt="Roulette table"
          className="roulette-image"
          draggable={false}
        />

        <svg
          className="roulette-overlay"
          viewBox={`0 0 ${BASE_WIDTH} ${BASE_HEIGHT}`}
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {showGrid &&
            ROULETTE_ZONES.map((zone) => {
              const ptStr = zone.points
                .map((p) => `${p.x},${p.y}`)
                .join(" ");

              return (
                <g key={zone.number}>
                  <polygon
                    points={ptStr}
                    fill="rgba(255, 220, 0, 0.18)"
                    stroke="#FFD700"
                    strokeWidth="1.5"
                  />
                  <text
                    x={zone.centerX}
                    y={zone.centerY}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize="13"
                    fontWeight="bold"
                    fill="#FFD700"
                    stroke="rgba(0,0,0,0.6)"
                    strokeWidth="0.4"
                    paintOrder="stroke"
                  >
                    {zone.number}
                  </text>
                </g>
              );
            })}
        </svg>
      </div>
    </div>
  );
}
