const setupSteps = [
  ["1", "Institution", "Create the school profile and basic settings"],
  ["2", "Academic Year", "Set the current academic year"],
  ["3", "Divisions & Grades", "Configure Pre-Primary, Primary, Secondary and other divisions"],
  ["4", "Classes", "Create class groups and sections"],
  ["5", "Students & Staff", "Import or add people when the foundation is ready"],
];

export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">AcadPulse Platform</p>
          <h1>Academic management without the ERP clutter.</h1>
          <p className="hero-copy">
            Release 1 starts with a guided setup and grows into the connected workflow:
            Plan → Teach → Attend → Practice → Assess → Analyze → Intervene.
          </p>
        </div>
        <div className="status-card">
          <span>Current milestone</span>
          <strong>Platform Foundation</strong>
          <small>Institution → Year → Division → Grade → Class</small>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Guided setup</p>
            <h2>Set up AcadPulse</h2>
          </div>
          <span className="progress-label">Milestone 1</span>
        </div>

        <div className="steps">
          {setupSteps.map(([number, title, text], index) => (
            <article className="step" key={title}>
              <div className="step-number">{number}</div>
              <div className="step-copy">
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
              <span className={index === 0 ? "step-state active" : "step-state"}>
                {index === 0 ? "Start" : "Upcoming"}
              </span>
            </article>
          ))}
        </div>
      </section>

      <section className="principle-grid">
        <article>
          <strong>Simple by default</strong>
          <p>Daily users see their work, not the underlying database structure.</p>
        </article>
        <article>
          <strong>Context-aware</strong>
          <p>AcadPulse should infer year, class, subject and assignments whenever possible.</p>
        </article>
        <article>
          <strong>Existing tools protected</strong>
          <p>The current Scoreboard Generator and Result Analytics remain untouched.</p>
        </article>
      </section>
    </main>
  );
}
