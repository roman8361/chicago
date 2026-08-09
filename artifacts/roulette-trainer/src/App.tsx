import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RulesProvider } from "@/lib/rulesContext";
import NotFound from "@/pages/not-found";
import HomePage from "@/pages/HomePage";
import PracticeRoulettePage from "@/pages/PracticeRoulettePage";
import LoginPage from "@/pages/LoginPage";
import ManagerPage from "@/pages/manager/ManagerPage";
import DealersPage from "@/pages/manager/DealersPage";
import DealerDetailsPage from "@/pages/manager/DealerDetailsPage";
import CreateTrainingPage from "@/pages/manager/CreateTrainingPage";
import SelectGamePage from "@/pages/manager/SelectGamePage";
import GameSettingsPlaceholderPage from "@/pages/manager/GameSettingsPlaceholderPage";
import SelectDealersPlaceholderPage from "@/pages/manager/SelectDealersPlaceholderPage";
import TrainingReviewPage from "@/pages/manager/TrainingReviewPage";
import AttestationPage from "@/pages/manager/AttestationPage";
import AttestationDealersPage from "@/pages/manager/AttestationDealersPage";
import AttestationSettingsPage from "@/pages/manager/AttestationSettingsPage";
import RouletteExercisePreparationPage from "@/pages/manager/RouletteExercisePreparationPage";
import AttestationsPage from "@/pages/manager/AttestationsPage";
import ManagerDealerResultPage from "@/pages/manager/ManagerDealerResultPage";
import DealerPage from "@/pages/dealer/DealerPage";
import DealerAssignmentPage from "@/pages/dealer/DealerAssignmentPage";
import DealerAttestationPlayPage from "@/pages/dealer/DealerAttestationPlayPage";
import DealerAttestationResultPage from "@/pages/dealer/DealerAttestationResultPage";
import { TrainingWizardProvider } from "@/lib/trainingWizardContext";

const queryClient = new QueryClient();

function AppContent() {
  return (
    <TrainingWizardProvider>
      <Switch>
      <Route path="/roulette" component={PracticeRoulettePage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/manager/training/new/game" component={SelectGamePage} />
      <Route path="/manager/training/new/settings" component={GameSettingsPlaceholderPage} />
      <Route path="/manager/training/new/dealers" component={SelectDealersPlaceholderPage} />
      <Route path="/manager/training/new/review" component={TrainingReviewPage} />
      <Route path="/manager/dealers/:dealerId/training/new" component={CreateTrainingPage} />
      <Route path="/manager/dealers" component={DealersPage} />
      <Route path="/manager/attestations/:templateId/dealers" component={AttestationDealersPage} />
      <Route path="/manager/attestations/:templateId/settings" component={AttestationSettingsPage} />
      <Route path="/manager/attestations/:templateId/prepare" component={RouletteExercisePreparationPage} />
      <Route path="/manager/attestations/:templateId/results/:assignmentId" component={ManagerDealerResultPage} />
      <Route path="/manager/attestations/:templateId" component={AttestationPage} />
      <Route path="/manager/attestations" component={AttestationsPage} />
      <Route path="/manager/dealers/:dealerId" component={DealerDetailsPage} />
      <Route path="/manager" component={ManagerPage} />
      <Route path="/dealer/attestations/:assignmentId/play" component={DealerAttestationPlayPage} />
      <Route path="/dealer/attestations/:assignmentId/result" component={DealerAttestationResultPage} />
      <Route path="/dealer/attestations/:assignmentId" component={DealerAssignmentPage} />
      <Route path="/dealer" component={DealerPage} />
      <Route path="/" component={HomePage} />
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
