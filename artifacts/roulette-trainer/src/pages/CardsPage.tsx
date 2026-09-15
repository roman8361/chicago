import { Link } from "wouter";

export default function CardsPage() {
  return (
    <main className="account-page">
      <section className="account-card" aria-labelledby="cards-title">
        <h1 id="cards-title">Карточный стол</h1>
        <p className="account-description">Раздел находится в разработке.</p>
        <Link className="account-button account-button--inline" href="/">
          На главную
        </Link>
      </section>
    </main>
  );
}