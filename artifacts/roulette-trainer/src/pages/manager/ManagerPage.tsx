import { useState } from "react";
import { Link } from "wouter";
import { addDealer, getDealers } from "@/data/dealerStorage";

export default function ManagerPage() {
  const [dealers, setDealers] = useState(getDealers);
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");

  function openAddForm() {
    setError("");
    setFullName("");
    setIsAddFormOpen(true);
  }

  function closeAddForm() {
    setError("");
    setFullName("");
    setIsAddFormOpen(false);
  }

  function handleAddDealer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = fullName.trim();
    if (!trimmedName) {
      setError("Введите ФИО дилера");
      return;
    }

    addDealer(trimmedName);
    setDealers(getDealers());
    closeAddForm();
  }

  return (
    <main className="account-page">
      <section className="account-card" aria-labelledby="manager-title">
        <p className="account-eyebrow">Личный кабинет</p>
        <h1 id="manager-title">Личный кабинет руководителя</h1>

        <div className="dealer-section" aria-labelledby="dealer-list-title">
          <div className="dealer-section-header">
            <h2 id="dealer-list-title">Дилеры</h2>
            <button className="dealer-add-button" type="button" onClick={openAddForm}>
              + Добавить дилера
            </button>
          </div>

          {isAddFormOpen && (
            <form className="dealer-add-form" onSubmit={handleAddDealer}>
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
                  Добавить
                </button>
                <button className="account-link dealer-cancel-button" type="button" onClick={closeAddForm}>
                  Отмена
                </button>
              </div>
            </form>
          )}

          <div className="dealer-list">
            {dealers.map((dealer) => (
              <Link
                className="dealer-list-item"
                href={`/manager/dealers/${encodeURIComponent(dealer.id)}`}
                key={dealer.id}
              >
                <span className="dealer-list-item-name">{dealer.fullName}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="account-actions">
          <Link className="account-button" href="/">
            Открыть рулетку
          </Link>
          <Link className="account-link" href="/login">
            Вернуться к выбору режима
          </Link>
        </div>
      </section>
    </main>
  );
}