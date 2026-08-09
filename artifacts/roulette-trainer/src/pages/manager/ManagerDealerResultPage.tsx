import { Link, useRoute } from "wouter";
import { getDealers } from "@/data/dealerStorage";
import {
  getTrainingAssignments,
  getTrainingTemplateById,
} from "@/data/attestationStorage";
import { getTrainingResultByAssignmentId } from "@/data/trainingResultStorage";
import { getGameDefinition } from "@/data/gameRegistry";
import { formatDateTime } from "@/lib/dateFormatting";

function BackToAttestation({ templateId }: { templateId: string }) {
  return (
    <Link
      className="account-button account-button--inline"
      href={`/manager/attestations/${encodeURIComponent(templateId)}`}
    >
      Назад к аттестации
    </Link>
  );
}

export default function ManagerDealerResultPage() {
  const [, params] = useRoute("/manager/attestations/:templateId/results/:assignmentId");
  const templateId = params?.templateId;
  const assignmentId = params?.assignmentId;
  const template = templateId ? getTrainingTemplateById(templateId) : undefined;
  const assignment = assignmentId
    ? getTrainingAssignments().find(
        (candidate) =>
          candidate.id === assignmentId &&
          candidate.trainingTemplateId === templateId,
      )
    : undefined;
  const dealer = assignment
    ? getDealers().find((candidate) => candidate.id === assignment.dealerId)
    : undefined;
  const result = assignment
    ? getTrainingResultByAssignmentId(assignment.id)
    : undefined;

  if (!templateId || !assignment) {
    return (
      <main className="account-page">
        <section className="account-card" aria-labelledby="manager-result-not-found-title">
          <h1 id="manager-result-not-found-title">Результат не найден</h1>
          {templateId && <BackToAttestation templateId={templateId} />}
        </section>
      </main>
    );
  }

  if (!template || assignment.status !== "COMPLETED" || !result) {
    return (
      <main className="account-page">
        <section className="account-card account-card--wide dealer-result-page" aria-labelledby="manager-result-unavailable-title">
          <p className="account-eyebrow">Руководитель</p>
          <h1 id="manager-result-unavailable-title">Результат аттестации недоступен</h1>
          <p className="account-description">
            Сохранённый результат этого прохождения не найден.
          </p>
          <BackToAttestation templateId={templateId} />
        </section>
      </main>
    );
  }

  const gameTitle = getGameDefinition(template.gameType)?.title ?? "Игра";
  const percentage = result.totalQuestions > 0
    ? Math.round((result.correctAnswers / result.totalQuestions) * 100)
    : 0;

  return (
    <main className="account-page">
      <section className="account-card account-card--wide dealer-result-page" aria-labelledby="manager-result-title">
        <p className="account-eyebrow">Руководитель</p>
        <h1 id="manager-result-title">Результат аттестации</h1>

        <div className="attestation-meta">
          <p><strong>Дилер:</strong> {dealer?.fullName ?? "Дилер удалён"}</p>
          <p><strong>Игра:</strong> {gameTitle}</p>
          <p><strong>Начало:</strong> {assignment.startedAt ? formatDateTime(assignment.startedAt) : "—"}</p>
          <p><strong>Завершение:</strong> {formatDateTime(assignment.completedAt ?? result.completedAt)}</p>
        </div>

        <div className="dealer-result-summary" aria-label="Итог аттестации">
          <p><strong>Правильных ответов:</strong> {result.correctAnswers} из {result.totalQuestions}</p>
          <p><strong>Результат:</strong> {percentage}%</p>
        </div>

        <div className="dealer-result-answers">
          <h2>Ответы</h2>
          {result.answers.map((answer, index) => (
            <article
              className={`dealer-result-answer ${answer.correct ? "dealer-result-answer--correct" : "dealer-result-answer--incorrect"}`}
              key={`${answer.questionId}-${index}`}
            >
              <h3>{index + 1}. {answer.question}</h3>
              <p>Ответ дилера: <strong>{answer.answer}</strong></p>
              <p>Правильный ответ: <strong>{answer.correctAnswer}</strong></p>
              <p className="dealer-result-answer__verdict">
                {answer.correct ? "✅ Верно" : "❌ Ошибка"}
              </p>
            </article>
          ))}
        </div>

        <div className="account-actions">
          <BackToAttestation templateId={templateId} />
        </div>
      </section>
    </main>
  );
}