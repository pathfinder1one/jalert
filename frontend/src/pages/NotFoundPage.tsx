import { Link } from 'react-router-dom';

export const NotFoundPage = () => (
  <main className="auth-shell">
    <section className="auth-card">
      <div className="eyebrow">Page not found</div>
      <h1>This page is not available</h1>
      <p className="section-subtitle">
        The address may have changed, or the page may have been moved. You can return to the homepage below.
      </p>
      <Link className="primary-button" to="/">
        Go to homepage
      </Link>
    </section>
  </main>
);
