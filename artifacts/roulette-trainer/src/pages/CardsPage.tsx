import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link, useLocation } from "wouter";
import CardsSettingsScreen from "@/pages/CardsSettingsScreen";
import CombinationReferencePage from "@/pages/CombinationReferencePage";
import { loadCardTableSettings, saveCardTableSettings } from "@/data/cardTableSettingsStorage";
import type { CardTableSettings, PokerGameId } from "@/types/cardTableSettings";
import NotFound from "@/pages/not-found";
import {
  getDoubleCombinationCatalog,
  getUniqueCardDeals,
} from "@/poker/games/russian-poker/doubleCombinationCatalog";
import {
  generateRussianPokerSeries,
  type RussianPokerSeriesRound,
} from "@/poker/games/russian-poker/doubleCombinationSeriesGenerator";
import {
  getNextSeriesRoundIndex,
  isSeriesComplete,
} from "@/poker/games/russian-poker/doubleCombinationSeriesState";

const STAR_CHIP_VALUES = [100, 200, 300, 400, 500];
const FLIP_DURATION_MS = 650;
const FLIP_STAGGER_MS = 70;
const CLOSE_DURATION_MS = 350;
const FLIP_COMPLETION_FALLBACK_MS = 500;

type CardsRoundState = "HIDDEN" | "CLOSED" | "CLOSING" | "FLIPPING" | "OPEN";
type CardsAnimationState = "CLOSED" | "CLOSING" | "FLIPPING";

interface CardsRuntimeState {
  settings: CardTableSettings;
  roundState: CardsRoundState;
  cardAnimationState: CardsAnimationState;
  activePokerGame: PokerGameId | null;
  seriesPlan: RussianPokerSeriesRound[];
  currentRoundIndex: number;
}

function getConfiguredPokerGame(settings: CardTableSettings): PokerGameId | null {
  const configuredGames: Array<[PokerGameId, { enabled: boolean }]> = [
    ["russianPoker", settings.pokerGames.russianPoker],
  ];
  return configuredGames.find(([, game]) => game.enabled)?.[0] ?? null;
}

function CardsHand({
  cardCodes,
  roundState,
  cardAnimationState,
  onNext,
  onFlipAnimationEnd,
  currentRoundNumber,
  totalRounds,
  seriesComplete,
}: {
  cardCodes: readonly (string | null)[];
  roundState: Exclude<CardsRoundState, "HIDDEN">;
  cardAnimationState: CardsAnimationState;
  onNext: () => void;
  onFlipAnimationEnd: (index: number, animationName: string) => void;
  currentRoundNumber: number;
  totalRounds: number;
  seriesComplete: boolean;
}) {
  return (
    <div className="cards-hand" aria-label="Карты раздачи русского покера">
      {Array.from({ length: 6 }, (_, index) => cardCodes[index] ?? null).map((code, index) => (
        <div
          key={index}
          className="cards-hand-card-slot"
        >
          <div
            className={`cards-hand-card-flip cards-hand-card-flip--${cardAnimationState.toLowerCase()}`}
            style={{ "--cards-flip-delay": `${index * FLIP_STAGGER_MS}ms` } as CSSProperties}
            onAnimationEnd={(event) => {
              onFlipAnimationEnd(index, event.animationName);
            }}
          >
            <img
              className="cards-hand-card-face cards-hand-card-face--back"
              src="/assets/cards/back-v2.webp"
              alt=""
              aria-hidden="true"
              draggable={false}
            />
            {code && (
              <img
                className="cards-hand-card-face cards-hand-card-face--front"
                src={`/assets/cards/${code}.png`}
                alt={`Карта ${code}`}
                draggable={false}
              />
            )}
          </div>
        </div>
      ))}
      {roundState === "OPEN" && (
        <div className="cards-round-controls">
          {seriesComplete ? (
            <span className="cards-series-complete" role="status">Серия завершена</span>
          ) : (
            <button
              className="grid-toggle-btn cards-hand-next-button"
              type="button"
              onClick={onNext}
              data-testid="button-cards-next"
              aria-label={`Перейти к раздаче ${currentRoundNumber + 1} из ${totalRounds}`}
            >
              Дальше
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function CardsPage() {
  const [location, navigate] = useLocation();
  const combinationRoute = location.match(/^\/cards\/combinations\/([^/]+)\/?$/);
  const combinationGameId = combinationRoute?.[1] ?? null;
  const isCardsRootRoute = location === "/cards" || location === "/cards/";
  const catalog = getDoubleCombinationCatalog();
  const defaultGroupIds = catalog.groups
    .filter((group) => getUniqueCardDeals(group.deals).length > 0)
    .map((group) => group.id);
  const [runtime, setRuntime] = useState<CardsRuntimeState>(() => {
    const settings = loadCardTableSettings(defaultGroupIds);
    const configuredPokerGame = getConfiguredPokerGame(settings);
    return {
      settings,
      roundState: configuredPokerGame ? "CLOSED" : "HIDDEN",
      cardAnimationState: "CLOSED",
      activePokerGame: configuredPokerGame,
      seriesPlan: [],
      currentRoundIndex: 0,
    };
  });
  const [screen, setScreen] = useState<"table" | "settings">(
    () => (combinationGameId ? "settings" : "table"),
  );
  const shuffleVideoRef = useRef<HTMLVideoElement>(null);
  const nextFlipPendingRef = useRef(false);
  const transitionLockRef = useRef(false);
  const pendingSeriesTransitionRef = useRef<{
    roundIndex: number;
    seriesPlan?: RussianPokerSeriesRound[];
  } | null>(null);
  const completedFlipIndexesRef = useRef(new Set<number>());
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    if (runtime.roundState === "CLOSED" && nextFlipPendingRef.current) {
      const frameId = window.requestAnimationFrame(() => {
        nextFlipPendingRef.current = false;
        setRuntime((current) => (
          current.roundState === "CLOSED"
            ? { ...current, roundState: "FLIPPING", cardAnimationState: "FLIPPING" }
            : current
        ));
      });
      return () => window.cancelAnimationFrame(frameId);
    }

    if (runtime.roundState === "CLOSING") {
      completedFlipIndexesRef.current.clear();
      const closeTimer = window.setTimeout(
        finishCardClose,
        CLOSE_DURATION_MS + FLIP_COMPLETION_FALLBACK_MS,
      );
      return () => window.clearTimeout(closeTimer);
    }

    if (runtime.roundState !== "FLIPPING") return;
    completedFlipIndexesRef.current.clear();

    const shuffleVideo = shuffleVideoRef.current;
    if (shuffleVideo) {
      shuffleVideo.currentTime = 0;
      void shuffleVideo.play().catch(() => {
        // The flip is still usable if a browser blocks media playback.
      });
    }

    const flipTimer = window.setTimeout(
      finishCardFlip,
      FLIP_DURATION_MS + FLIP_STAGGER_MS * 5 + FLIP_COMPLETION_FALLBACK_MS,
    );

    return () => {
      window.clearTimeout(flipTimer);
      if (shuffleVideo) {
        shuffleVideo.pause();
        shuffleVideo.currentTime = 0;
      }
    };
  }, [runtime.roundState]);

  function handleSettingsSave(nextSettings: CardTableSettings) {
    saveCardTableSettings(nextSettings);
    const configuredPokerGame = getConfiguredPokerGame(nextSettings);
    transitionLockRef.current = false;
    pendingSeriesTransitionRef.current = null;
    completedFlipIndexesRef.current.clear();
    nextFlipPendingRef.current = false;
    setStartError(null);
    setRuntime({
      settings: nextSettings,
      roundState: configuredPokerGame ? "CLOSED" : "HIDDEN",
      cardAnimationState: "CLOSED",
      activePokerGame: configuredPokerGame,
      seriesPlan: [],
      currentRoundIndex: 0,
    });
    setScreen("table");
  }

  function handleStart() {
    if (transitionLockRef.current) return;
    const configuredPokerGame = getConfiguredPokerGame(runtime.settings);
    if (!configuredPokerGame) {
      setStartError(null);
      setRuntime((current) => ({
        ...current,
        roundState: "HIDDEN",
        cardAnimationState: "CLOSED",
        activePokerGame: null,
        seriesPlan: [],
        currentRoundIndex: 0,
      }));
      return;
    }

    if (catalog.fatalError) {
      setStartError(catalog.fatalError);
      return;
    }

    const pokerSettings = runtime.settings.pokerGames.russianPoker;
    let seriesPlan: RussianPokerSeriesRound[];
    try {
      seriesPlan = generateRussianPokerSeries({
        groups: catalog.groups,
        selectedGroupIds: pokerSettings.selectedGroupIds,
        roundCount: pokerSettings.dealCount,
      });
    } catch (error) {
      setStartError(error instanceof Error ? error.message : "Не удалось подготовить серию раздач.");
      return;
    }

    setStartError(null);
    transitionLockRef.current = true;
    if (runtime.roundState === "OPEN") {
      pendingSeriesTransitionRef.current = { roundIndex: 0, seriesPlan };
      completedFlipIndexesRef.current.clear();
      setRuntime((current) => ({
        ...current,
        roundState: "CLOSING",
        cardAnimationState: "CLOSING",
      }));
      return;
    }

    setRuntime((current) => ({
      ...current,
      roundState: "FLIPPING",
      cardAnimationState: "FLIPPING",
      activePokerGame: configuredPokerGame,
      seriesPlan,
      currentRoundIndex: 0,
    }));
  }

  function handleNext() {
    const nextRoundIndex = getNextSeriesRoundIndex({
      currentRoundIndex: runtime.currentRoundIndex,
      totalRounds: runtime.seriesPlan.length,
      roundState: runtime.roundState,
      transitionLocked: transitionLockRef.current,
    });
    if (nextRoundIndex === null) return;
    transitionLockRef.current = true;
    pendingSeriesTransitionRef.current = { roundIndex: nextRoundIndex };
    completedFlipIndexesRef.current.clear();
    setRuntime((current) => ({
      ...current,
      roundState: "CLOSING",
      cardAnimationState: "CLOSING",
    }));
  }

  function finishCardFlip() {
    completedFlipIndexesRef.current.clear();
    setRuntime((current) => (
      current.roundState === "FLIPPING"
        ? { ...current, roundState: "OPEN" }
        : current
    ));
    transitionLockRef.current = false;
  }

  function finishCardClose() {
    const transition = pendingSeriesTransitionRef.current;
    if (!transition) return;
    pendingSeriesTransitionRef.current = null;
    nextFlipPendingRef.current = true;
    completedFlipIndexesRef.current.clear();
    setRuntime((current) => (
      current.roundState === "CLOSING"
        ? {
            ...current,
            roundState: "CLOSED",
            currentRoundIndex: transition.roundIndex,
            seriesPlan: transition.seriesPlan ?? current.seriesPlan,
          }
        : current
    ));
  }

  function handleCardFlipAnimationEnd(index: number, animationName: string) {
    const isClosing = animationName === "cards-hand-close";
    const isFlipping = animationName === "cards-hand-flip";
    if (!isClosing && !isFlipping) return;
    if (runtime.roundState !== (isClosing ? "CLOSING" : "FLIPPING")) return;

    const completedIndexes = completedFlipIndexesRef.current;
    completedIndexes.add(index);
    if (completedIndexes.size === 6) {
      if (isClosing) finishCardClose();
      else finishCardFlip();
    }
  }

  const currentRound = runtime.seriesPlan[runtime.currentRoundIndex];
  const seriesComplete = isSeriesComplete(
    runtime.currentRoundIndex,
    runtime.seriesPlan.length,
    runtime.roundState,
  );

  if (!isCardsRootRoute && !combinationGameId) return <NotFound />;

  return (
    <>
      {(screen === "settings" || combinationGameId) && (
        <div
          hidden={Boolean(combinationGameId)}
          aria-hidden={Boolean(combinationGameId)}
        >
          <CardsSettingsScreen
            initialSettings={runtime.settings}
            onSave={handleSettingsSave}
            onBack={() => setScreen("table")}
            onViewCombinations={(gameId) => navigate(`/cards/combinations/${gameId}`)}
          />
        </div>
      )}

      {combinationGameId ? (
        <CombinationReferencePage
          gameId={combinationGameId}
          onBack={() => navigate("/cards")}
        />
      ) : screen === "settings" ? null : (
        <main className="roulette-page cards-page">
          <video
            ref={shuffleVideoRef}
            className="cards-shuffle-video"
            src="/assets/card-shuffle.mp4"
            preload="auto"
            playsInline
            aria-hidden="true"
          />
          <div className="controls-bar" aria-label="Управление карточным столом">
            <button
              className="grid-toggle-btn spin-btn"
              type="button"
              onClick={handleStart}
              disabled={runtime.roundState === "FLIPPING" || runtime.roundState === "CLOSING"}
            >
              ▶ Старт
            </button>
            <Link className="grid-toggle-btn" href="/">
              ← На главную
            </Link>
            <button
              className="grid-toggle-btn settings-open-btn"
              type="button"
              onClick={() => setScreen("settings")}
            >
              ⚙ Настройки
            </button>
          </div>
            {startError && (
              <p className="cards-start-error" role="alert">{startError}</p>
            )}

          <div className="table-row cards-table-row">
            <div className="roulette-wrapper cards-table-wrapper">
              <img
                src="/card-table-felt-stars.png"
                alt="Карточный стол"
                className="cards-table-image"
                draggable={false}
              />
              {(runtime.roundState === "FLIPPING" || runtime.roundState === "OPEN") && (
                <>
                  <div className="cards-ante-chip" role="img" aria-label="Фишка 5000">
                    <span>5000</span>
                  </div>
                  <div className="cards-star-chips" aria-label="Фишки внутри звёзд">
                    {STAR_CHIP_VALUES.map((value) => (
                      <div
                        key={value}
                        className="cards-ante-chip cards-star-chip"
                        role="img"
                        aria-label={`Фишка ${value}`}
                      >
                        <span>{value}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {runtime.activePokerGame === "russianPoker" && runtime.roundState !== "HIDDEN" && (
                <CardsHand
                  cardCodes={currentRound?.cards ?? []}
                  roundState={runtime.roundState}
                  cardAnimationState={runtime.cardAnimationState}
                  onNext={handleNext}
                  onFlipAnimationEnd={handleCardFlipAnimationEnd}
                  currentRoundNumber={runtime.currentRoundIndex + 1}
                  totalRounds={runtime.seriesPlan.length}
                  seriesComplete={seriesComplete}
                />
              )}
            </div>

            <aside className="table-info-sidebar cards-help-sidebar" aria-labelledby="cards-help-title">
              <div id="cards-help-title" className="info-sidebar-title">
                Справка
              </div>
              <div className="cards-help-empty" aria-hidden="true" />
            </aside>
          </div>
        </main>
      )}
    </>
  );
}