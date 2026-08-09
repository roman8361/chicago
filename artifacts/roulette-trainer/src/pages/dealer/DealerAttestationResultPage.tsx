import { Link, useRoute } from "wouter";
import { getDealers } from "@/data/dealerStorage";
import { getTrainingAssignments, getTrainingTemplateById } from "@/data/attestationStorage";
import { getTrainingResultByAssignmentId } from "@/data/trainingResultStorage";
import { getGameDefinition } from "@/data/gameRegistry";
import { getCurrentDealerId } from "@/lib/dealerSession";
import { formatDateTime } from "@/lib/dateFormatting";

function ReturnToDealerButton() {
  return (
    <Link className="account-button account-button--inline" href="/dealer">
      Вернуться в кабинет
    </Link>
  );
}

export default function DealerAttestationResultPage() {
  const [, params] = useRoute("/dealer/attestations/:assignmentId/result");
  const assignmentId = params?.assignmentId;
  const currentDealerId = getCurrentDealerId();
  const dealer = getDealers().find((candidate) => candidate.id === currentDealerId);
  const assignment = assignmentId
    ? getTrainingAssignments().find((candidate) => candidate.id === assignmentId)
    : undefined;

  if (!dealer) {
    return (
      <main className="account-page">
        <section className="account-card" aria-labelledby="result-dealer-not-found-title">
          <h1 id="result-dealer-not-found-title">Дилер не найден.</h1>
          <Link className="account-button account-button--inline" href="/login">
            Вернуться ко входу
          </Link>
        </section>
      </main>
    );
  }

  if (!assignment || assignment.dealerId !== currentDealerId) {
    return (
      <main className="account-page">
        <section className="account-card" aria-labelledby="result-not-available-title">
          <h1 id="result-not-available-title">Результат аттестации недоступен</h1>
          <ReturnToDealerButton />
        </section>
      </main>
    );
  }

  const result = getTrainingResultByAssignmentId(assignment.id);
  const template = getTrainingTemplateById(assignment.trainingTemplateId);
  const gameTitle = template ? getGameDefinition(template.gameType)?.title ?? "Игра" : "Игра";

  if (assignment.status !== "COMPLETED" || !result) {
    return (
      <main className="account-page">
        <section className="account-card account-card--wide dealer-result-page" aria-labelledby="result-unavailable-title">
          <p className="account-eyebrow">Личный кабинет дилера</p>
          <h1 id="result-unavailable-title">Результат аттестации недоступен.</h1>
          <p className="account-description">
            Сохранённый результат этого прохождения не найден.
          </p>
          <ReturnToDealerButton />
        </section>
      </main>
    );
  }

  const percentage = result.totalQuestions > 0
    ? Math.round((result.correctAnswers / result.totalQuestions) * 100)
    : 0;

  return (
    <main className="account-page">
      <section className="account-card account-card--wide dealer-result-page" aria-labelledby="result-title">
        <p className="account-eyebrow">Личный кабинет дилера</p>
        <h1 id="result-title">Аттестация завершена</h1>

        <div className="attestation-meta">
          <p><strong>Игра:</strong> {gameTitle}</p>
          <p><strong>Начало:</strong> {assignment.startedAt ? formatDateTime(assignment.startedAt) : "—"}</p>
          <p><strong>Завершение:</strong> {formatDateTime(result.completedAt)}</p>
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
              key={answer.questionId}
            >
              <h3>{index + 1}. {answer.question}</h3>
              <p>Ответ дилера: <strong>{answer.answer}</strong></p>
              <p>Правильный ответ: <strong>{answer.correctAnswer}</strong></p>
              <p className="dealer-result-answer__verdict">
                {answer.correct ? "✅ Верно" : "❌ Неверно"}
              </p>
            </article>
          ))}
        </div>

        <div className="account-actions">
          <ReturnToDealerButton />
        </div>
      </section>
    </main>
  );
}