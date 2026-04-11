export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero-card">
        <p className="eyebrow">Phase 1</p>
        <h1>Home Dashboard</h1>
        <p className="lede">
          Scaffold ready. Fronius is configured for LAN polling, Luxtronic storage is scoped to 9 heatpump
          temperature fields, and Shelly devices are pinned by IP.
        </p>
        <dl className="status-grid">
          <div>
            <dt>Fronius</dt>
            <dd>Configured via runtime env</dd>
          </div>
          <div>
            <dt>Luxtronic</dt>
            <dd>Configured via runtime env</dd>
          </div>
          <div>
            <dt>Shelly H&amp;T</dt>
            <dd>3 sensors configured</dd>
          </div>
          <div>
            <dt>Heatpump Storage</dt>
            <dd>SQLite, 30 days</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}