import { useState } from "react";
import { Link } from "wouter";
import { addDealer, deleteDealer, getDealers, updateDealer } from "@/data/dealerStorage";
import type { Dealer } from "@/data/mockDealers";

type DealerFormMode = "add" | "edit";

export default function DealersPage() {
  const [dealers, setDealers] = useState<Dealer[]>(getDealers);
  const [formMode, setFormMode] = useState<DealerFormMode | null>(null);
  const [editingDealerId, setEditingDealerId] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [dealerToDelete, setDealerToDelete] = useState<Dealer | null>(null);

  function openAddForm() {
    setFormMode("add");
    setEditingDealerId(null);
    setFullName("");
    setError("");
  }

  function openEditForm(dealer: Dealer) {
    setFormMode("edit");
    setEditingDealerId(dealer.id);
    setFullName(dealer.fullName);
    setError("");
  }

  function closeForm() {
    setFormMode(null);
    setEditingDealerId(null);
    setFullName("");
    setError("");
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = fullName.trim();
    if (!trimmedName) {
      setError("Введите ФИО дилера");
      return;
    }

    if (formMode === "add") {
      addDealer(trimmedName);
    } else if (formMode === "edit" && editingDealerId) {
      updateDealer(editingDealerId, trimmedName);
    }

    setDealers(getDealers());
    closeForm();
  }

  function confirmDelete() {
    if (!dealerToDelete) return;
    deleteDealer(dealerToDelete.id);
    setDealers(getDealers());
    setDealerToDelete(null);
  }

  return (
    <main className="account-page">
      <section className="account-card account-card--wide" aria-labelledby="dealers-title">
        <p className="account-eyebrow">Руководитель</p>
        <h1 id="dealers-title">Управление дилерами</h1>

        <div className="dealer-section">
          <div className="dealer-section-header">
            <h2>Список дилеров</h2>
            <button className="dealer-add-button" type="button" onClick={openAddForm}>
              + Добавить дилера
            </button>
          </div>

          {formMode && (
            <form className="dealer-add-form" onSubmit={handleSubmit}>
              <h3 className="dealer-form-title">
                {formMode === "add" ? "Добавить дилера" : "Редактировать дилера"}
              </h3>
              <label className="dealer-form-label" htmlFor="dealer-full-name">
                ФИО
              </label>
              <input
                id="dealer-full-name"
                className="dealer-form-input"
                type="text"
                value={fullName}
                onChange={(event) => {
                  setFullName(event.target.value);
                  if (error) setError("");
                }}
                autoFocus
              />
              {error && <p className="dealer-form-error">{error}</p>}
              <div className="dealer-form-actions">
                <button className="account-button" type="submit">
                  Сохранить
                </button>
                <button className="account-link dealer-cancel-button" type="button" onClick={closeForm}>
                  Отмена
                </button>
              </div>
            </form>
          )}

          <div className="dealer-list">
            {dealers.length === 0 && <p className="dealer-empty-state">Дилеры ещё не добавлены.</p>}
            {dealers.map((dealer) => (
              <div className="dealer-management-item" key={dealer.id}>
                <Link
                  className="dealer-list-item dealer-management-name"
                  href={`/manager/dealers/${encodeURIComponent(dealer.id)}`}
                >
                  <span className="dealer-list-item-name">{dealer.fullName}</span>
                </Link>
                <div className="dealer-management-actions">
                  <button className="dealer-row-button" type="button" onClick={() => openEditForm(dealer)}>
                    Редактировать
                  </button>
                  <button className="dealer-row-button dealer-row-button--danger" type="button" onClick={() => setDealerToDelete(dealer)}>
                    Удалить
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="account-actions">
          <Link className="account-link" href="/manager">
            Назад
          </Link>
        </div>
      </section>

      {dealerToDelete && (
        <div className="dealer-delete-overlay" role="presentation">
          <div className="dealer-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-dealer-title">
            <h2 id="delete-dealer-title">Удалить дилера?</h2>
            <p>{dealerToDelete.fullName}</p>
            <div className="dealer-form-actions">
              <button className="dealer-row-button dealer-row-button--danger" type="button" onClick={confirmDelete}>
                Удалить
              </button>
              <button className="account-link dealer-cancel-button" type="button" onClick={() => setDealerToDelete(null)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}