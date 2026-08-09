import type { Dispatch, SetStateAction } from "react";
import type { RouletteExercise, RouletteReportSnapshot } from "@/types/attestation";
import type { GameSettings } from "@/types/gameSettings";
import RouletteTable from "@/pages/RouletteTable";

type SpinReportProps = {
  exercise: RouletteExercise;
  reportSnapshot: RouletteReportSnapshot;
  settings: GameSettings;
  onBack: () => void;
};

/**
 * The single read-only renderer for a completed Roulette spin report.
 *
 * It receives the immutable exercise and saved report records. It never
 * generates a round, spins, or exposes game editing controls.
 */
export default function SpinReport({
  exercise,
  reportSnapshot,
  settings,
  onBack,
}: SpinReportProps) {
  const noBooleanStateChange: Dispatch<SetStateAction<boolean>> = () => undefined;

  return (
    <RouletteTable
      mode="ATTESTATION"
      attestationExercise={exercise}
      readOnlyReport
      savedReport={reportSnapshot}
      settings={settings}
      onOpenSettings={() => undefined}
      onOpenDebug={() => undefined}
      onBackToAttestation={onBack}
      showGrid={false}
      setShowGrid={noBooleanStateChange}
      showTrack={false}
      setShowTrack={noBooleanStateChange}
      showDozens={false}
      setShowDozens={noBooleanStateChange}
      editMode={false}
      setEditMode={noBooleanStateChange}
    />
  );
}