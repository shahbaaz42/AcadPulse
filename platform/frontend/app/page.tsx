"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  AcademicDivision,
  AcademicYear,
  apiRequest,
  AuthTokenResponse,
  ClassGroup,
  clearAccessToken,
  CurrentUser,
  getAccessToken,
  GradeLevel,
  Institution,
  setAccessToken,
} from "../lib/api";

type Notice = { type: "success" | "error"; text: string } | null;

const setupSteps = [
  ["1", "Institution", "Work within your assigned institution"],
  ["2", "Academic Year", "Set the working academic year"],
  ["3", "Academic Compartments", "Add broad academic groupings"],
  ["4", "Grades", "Map grades to academic compartments"],
  ["5", "Sections", "Create sections within each grade"],
];

function InfoTip({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <details className="info-tip">
      <summary aria-label={`About ${label}`} title={`About ${label}`}>i</summary>
      <div className="info-popover">{children}</div>
    </details>
  );
}

export default function HomePage() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [divisions, setDivisions] = useState<AcademicDivision[]>([]);
  const [grades, setGrades] = useState<GradeLevel[]>([]);
  const [classes, setClasses] = useState<ClassGroup[]>([]);
  const [selectedInstitutionId, setSelectedInstitutionId] = useState("");
  const [selectedYearId, setSelectedYearId] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);

  const selectedInstitution = useMemo(
    () => institutions.find((item) => item.id === selectedInstitutionId),
    [institutions, selectedInstitutionId],
  );

  const roleNames = useMemo(() => {
    if (!currentUser) return [];
    return Array.from(new Set(currentUser.assignments.map((assignment) => assignment.role_name)));
  }, [currentUser]);

  const isManagementAdmin = useMemo(
    () => Boolean(currentUser?.assignments.some((assignment) => assignment.role_code === "MANAGEMENT_ADMIN" && assignment.scope_type === "organization")),
    [currentUser],
  );

  const canWriteAcademicSetup = useMemo(() => {
    if (!currentUser) return false;
    if (currentUser.is_platform_admin) return true;
    return currentUser.assignments.some(
      (assignment) =>
        (assignment.role_code === "PRINCIPAL" || assignment.role_code === "SCHOOL_ADMIN") &&
        assignment.scope_type === "institution" &&
        assignment.institution_id === selectedInstitutionId,
    );
  }, [currentUser, selectedInstitutionId]);

  const scopeSummary = useMemo(() => {
    if (!currentUser) return "";
    if (currentUser.is_platform_admin) return "Platform-wide access";
    if (currentUser.assignments.some((assignment) => assignment.scope_type === "organization")) return "Organization-scoped access";
    return "Institution-scoped access";
  }, [currentUser]);

  function resetAcademicState() {
    setInstitutions([]); setYears([]); setDivisions([]); setGrades([]); setClasses([]);
    setSelectedInstitutionId(""); setSelectedYearId(""); setNotice(null);
  }

  function handleAuthenticatedError(error: unknown) {
    if (!getAccessToken()) {
      setCurrentUser(null); resetAcademicState(); return;
    }
    setNotice({ type: "error", text: error instanceof Error ? error.message : "Something went wrong" });
  }

  async function loadInstitutions() {
    const data = await apiRequest<Institution[]>("/api/v1/institutions");
    setInstitutions(data);
    setSelectedInstitutionId((current) => data.some((item) => item.id === current) ? current : data[0]?.id ?? "");
  }

  async function loadInstitutionContext(institutionId: string) {
    if (!institutionId) {
      setYears([]); setDivisions([]); setGrades([]); setClasses([]); setSelectedYearId(""); return;
    }
    const [yearData, divisionData, gradeData, classData] = await Promise.all([
      apiRequest<AcademicYear[]>(`/api/v1/academic-years?institution_id=${institutionId}`),
      apiRequest<AcademicDivision[]>(`/api/v1/academic-divisions?institution_id=${institutionId}`),
      apiRequest<GradeLevel[]>(`/api/v1/grade-levels?institution_id=${institutionId}`),
      apiRequest<ClassGroup[]>(`/api/v1/class-groups?institution_id=${institutionId}`),
    ]);
    setYears(yearData); setDivisions(divisionData); setGrades(gradeData); setClasses(classData);
    setSelectedYearId((current) => yearData.some((item) => item.id === current) ? current : yearData[0]?.id ?? "");
  }

  useEffect(() => {
    const token = getAccessToken();
    if (!token) { setAuthReady(true); return; }
    apiRequest<CurrentUser>("/api/v1/auth/me")
      .then(setCurrentUser)
      .catch(() => { clearAccessToken(); setCurrentUser(null); })
      .finally(() => setAuthReady(true));
  }, []);

  useEffect(() => { if (currentUser) loadInstitutions().catch(handleAuthenticatedError); }, [currentUser]);
  useEffect(() => { if (currentUser) loadInstitutionContext(selectedInstitutionId).catch(handleAuthenticatedError); }, [selectedInstitutionId, currentUser]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSigningIn(true); setAuthError("");
    try {
      const token = await apiRequest<AuthTokenResponse>("/api/v1/auth/login", {
        method: "POST", auth: false,
        body: JSON.stringify({ email: String(data.get("email") ?? "").trim(), password: String(data.get("password") ?? "") }),
      });
      setAccessToken(token.access_token);
      setCurrentUser(await apiRequest<CurrentUser>("/api/v1/auth/me"));
      setNotice(null);
    } catch (error) {
      clearAccessToken(); setAuthError(error instanceof Error ? error.message : "Unable to sign in");
    } finally { setSigningIn(false); }
  }

  function signOut() { clearAccessToken(); setCurrentUser(null); setAuthError(""); resetAcademicState(); }

  async function runAction(action: () => Promise<void>, successText: string) {
    setBusy(true); setNotice(null);
    try { await action(); setNotice({ type: "success", text: successText }); }
    catch (error) { handleAuthenticatedError(error); }
    finally { setBusy(false); }
  }

  const formData = (event: FormEvent<HTMLFormElement>) => new FormData(event.currentTarget);
  const value = (data: FormData, name: string) => String(data.get(name) ?? "").trim();

  if (!authReady) return <main className="auth-shell"><section className="auth-card auth-loading-card"><div className="brand-mark">AP</div><h1>AcadPulse</h1><p>Checking your secure session…</p></section></main>;

  if (!currentUser) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <div className="auth-brand"><div className="brand-mark">AP</div><div><p className="eyebrow">Academic Intelligence &amp;<br />Management Platform</p><h1>AcadPulse</h1></div></div>
          <p className="auth-copy">Sign in to access your assigned institutions, academic tools, and insights.</p>
          {authError && <div className="notice error">{authError}</div>}
          <form className="auth-form" onSubmit={signIn}>
            <label>Email<input name="email" type="email" autoComplete="username" placeholder="name@school.org" required /></label>
            <label>Password<input name="password" type="password" autoComplete="current-password" placeholder="Enter your password" minLength={8} required /></label>
            <button className="primary-button auth-button" disabled={signingIn}>{signingIn ? "Signing in…" : "Sign In"}</button>
          </form>
          <p className="auth-security-note">Your account gives you access to your assigned institutions and relevant features.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <section className="session-bar">
        <div><strong>{currentUser.display_name}</strong><span>{roleNames.length ? roleNames.join(" · ") : "AcadPulse User"} · {scopeSummary}</span></div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {(currentUser.is_platform_admin || isManagementAdmin) && <Link className="secondary-button" href="/admin-users">Manage users</Link>}
          <button className="secondary-button" type="button" onClick={signOut}>Sign Out</button>
        </div>
      </section>

      <section className="hero compact-hero">
        <div>
          <p className="eyebrow">AcadPulse — Academic Intelligence &amp; Management Platform</p>
          <h1>{isManagementAdmin ? "School foundation overview" : "School foundation setup"}</h1>
          <p className="hero-copy">{isManagementAdmin ? "Review the academic structure across institutions in your organization. School-level setup is managed by the assigned Principal or School Admin." : "Set up your institution's academic structure in a guided order."}</p>
        </div>
        <div className="status-card">
          <span>{isManagementAdmin ? "Access mode" : "Current milestone"}</span>
          <strong>{isManagementAdmin ? "View-only academic structure" : "Institution → Year → Compartment → Grade → Section"}</strong>
          <small>{selectedInstitution ? `Working on: ${selectedInstitution.display_name || selectedInstitution.official_name}` : "No institution is available for this account"}</small>
        </div>
      </section>

      {notice && <div className={`notice ${notice.type}`}>{notice.text}</div>}
      {isManagementAdmin && <div className="notice success">Academic structure is managed at institution level. You can create Principal accounts for schools in your organization from Manage users.</div>}

      <section className="panel context-panel">
        <div><p className="eyebrow">Current context</p><h2>Choose institution and academic year</h2></div>
        <div className="context-controls">
          <label>Institution<select value={selectedInstitutionId} onChange={(event) => setSelectedInstitutionId(event.target.value)}><option value="">Select institution</option>{institutions.map((item) => <option value={item.id} key={item.id}>{item.display_name || item.official_name}</option>)}</select></label>
          <label>Academic Year<select value={selectedYearId} onChange={(event) => setSelectedYearId(event.target.value)} disabled={!selectedInstitutionId}><option value="">Select academic year</option>{years.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        </div>
      </section>

      <section className="setup-layout">
        <aside className="panel steps-panel">
          <p className="eyebrow">{isManagementAdmin ? "Academic structure" : "Guided setup"}</p>
          <div className="steps">{setupSteps.map(([number, title, text], index) => <article className="step" key={title}><div className="step-number">{number}</div><div className="step-copy"><h3>{title}</h3><p>{isManagementAdmin ? `View ${title.toLowerCase()} information` : text}</p></div><span className={index === 0 ? "step-state active" : "step-state"}>{isManagementAdmin ? "View" : index === 0 ? "Start" : "Next"}</span></article>)}</div>
        </aside>

        <div className="forms-stack">
          {currentUser.is_platform_admin ? (
            <section className="panel setup-card">
              <div className="card-heading"><div><span className="card-step">1</span><h2>Institution</h2></div><span>{institutions.length} accessible</span></div>
              <form onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const data = formData(event); runAction(async () => { const created = await apiRequest<Institution>("/api/v1/institutions", { method: "POST", body: JSON.stringify({ institution_code: value(data, "institution_code"), official_name: value(data, "official_name"), display_name: value(data, "display_name") || null, timezone: "Asia/Kolkata", status: "active" }) }); await loadInstitutions(); setSelectedInstitutionId(created.id); form.reset(); }, "Institution created successfully"); }} className="form-grid">
                <label>Institution Code<input name="institution_code" placeholder="e.g. APS01" required /></label><label>Official Name<input name="official_name" placeholder="School official name" required /></label><label className="full-width">Display Name<input name="display_name" placeholder="Optional shorter name" /></label><button disabled={busy} className="primary-button">Create Institution</button>
              </form>
            </section>
          ) : (
            <section className="panel setup-card scope-card"><div className="card-heading"><div><span className="card-step">1</span><h2>Institution Access</h2></div><span>{institutions.length} accessible</span></div><p>Your assigned institution is ready for academic setup.</p></section>
          )}

          {isManagementAdmin ? (
            <>
              <section className="panel setup-card"><div className="card-heading"><div><span className="card-step">2</span><h2>Academic Years</h2></div><span>{years.length} created</span></div>{years.length ? <ul>{years.map((item) => <li key={item.id}><strong>{item.name}</strong> — {item.start_date} to {item.end_date}{item.is_current ? " · Current" : ""}</li>)}</ul> : <p>No academic years have been configured for this institution.</p>}</section>
              <section className="panel setup-card"><div className="card-heading"><div><span className="card-step">3</span><h2>Academic Compartments</h2><InfoTip label="Academic Compartments">Academic Compartment represents a broad academic grouping used by an institution, such as <strong>Pre-Primary, Primary, Middle, Secondary, Senior Secondary, Junior or Senior</strong>. Institutions may create compartments according to their own academic structure.</InfoTip></div><span>{divisions.length} created</span></div>{divisions.length ? <ul>{divisions.map((item) => <li key={item.id}><strong>{item.name}</strong> ({item.code})</li>)}</ul> : <p>No academic compartments have been configured for this institution.</p>}</section>
              <section className="panel setup-card"><div className="card-heading"><div><span className="card-step">4</span><h2>Grade &amp; Compartment Mapping</h2><InfoTip label="Grade and Compartment Mapping">A <strong>Grade</strong> is the student academic level. Schools may call it a <strong>Grade, Class or Standard</strong>. Map each grade to the appropriate Academic Compartment.</InfoTip></div><span>{grades.length} grades</span></div>{grades.length ? <ul>{grades.map((item) => <li key={item.id}><strong>{item.display_name}</strong> ({item.code})</li>)}</ul> : <p>No grades have been configured for this institution.</p>}</section>
              <section className="panel setup-card"><div className="card-heading"><div><span className="card-step">5</span><h2>Grade &amp; Section Mapping</h2><InfoTip label="Grade and Section Mapping">A <strong>Section</strong> is a student group within a Grade/Class/Standard. Schools may call it a <strong>Section or Division</strong>, such as X A, X B, X BA or X BB.</InfoTip></div><span>{classes.length} created</span></div>{classes.length ? <ul>{classes.map((item) => <li key={item.id}><strong>{item.display_name}</strong> · Section {item.section_code}</li>)}</ul> : <p>No sections have been configured for this institution.</p>}</section>
            </>
          ) : (
            <>
              <section className="panel setup-card muted-when-disabled" data-disabled={!selectedInstitutionId || !canWriteAcademicSetup}>
                <div className="card-heading"><div><span className="card-step">2</span><h2>Academic Year</h2></div><span>{years.length} created</span></div>
                <form onSubmit={(event) => { event.preventDefault(); if (!selectedInstitutionId || !canWriteAcademicSetup) return; const form = event.currentTarget; const data = formData(event); runAction(async () => { await apiRequest<AcademicYear>("/api/v1/academic-years", { method: "POST", body: JSON.stringify({ institution_id: selectedInstitutionId, name: value(data, "name"), start_date: value(data, "start_date"), end_date: value(data, "end_date"), status: "active", is_current: Boolean(data.get("is_current")) }) }); await loadInstitutionContext(selectedInstitutionId); form.reset(); }, "Academic year created successfully"); }} className="form-grid">
                  <label>Year Name<input name="name" placeholder="2026-2027" required disabled={!selectedInstitutionId || !canWriteAcademicSetup} /></label><label>Start Date<input name="start_date" type="date" required disabled={!selectedInstitutionId || !canWriteAcademicSetup} /></label><label>End Date<input name="end_date" type="date" required disabled={!selectedInstitutionId || !canWriteAcademicSetup} /></label><label className="checkbox-label"><input name="is_current" type="checkbox" disabled={!selectedInstitutionId || !canWriteAcademicSetup} /> Current academic year</label><button disabled={busy || !selectedInstitutionId || !canWriteAcademicSetup} className="primary-button">Add Academic Year</button>
                </form>
              </section>

              <section className="panel setup-card muted-when-disabled" data-disabled={!selectedInstitutionId || !canWriteAcademicSetup}>
                <div className="card-heading"><div><span className="card-step">3</span><h2>Academic Compartments</h2><InfoTip label="Academic Compartments">Academic Compartment represents a broad academic grouping used by an institution, such as <strong>Pre-Primary, Primary, Middle, Secondary, Senior Secondary, Junior or Senior</strong>. Institutions may create compartments according to their own academic structure.</InfoTip></div><span>{divisions.length} created</span></div>
                <form onSubmit={(event) => { event.preventDefault(); if (!canWriteAcademicSetup) return; const form = event.currentTarget; const data = formData(event); runAction(async () => { await apiRequest<AcademicDivision>("/api/v1/academic-divisions", { method: "POST", body: JSON.stringify({ institution_id: selectedInstitutionId, code: value(data, "code"), name: value(data, "compartment_name"), display_order: Number(value(data, "display_order")), is_active: true }) }); await loadInstitutionContext(selectedInstitutionId); form.reset(); }, "Academic compartment created successfully"); }} className="form-grid">
                  <label>Compartment Code<input name="code" placeholder="SEC" required disabled={!selectedInstitutionId || !canWriteAcademicSetup} /></label><label>Compartment Name<input name="compartment_name" placeholder="Secondary" required disabled={!selectedInstitutionId || !canWriteAcademicSetup} /></label><label>Compartment Display Order<input name="display_order" type="number" min="1" defaultValue="1" required disabled={!selectedInstitutionId || !canWriteAcademicSetup} /></label><button disabled={busy || !selectedInstitutionId || !canWriteAcademicSetup} className="primary-button">Add Compartment</button>
                </form>
              </section>

              <section className="panel setup-card muted-when-disabled" data-disabled={!selectedInstitutionId || !selectedYearId || divisions.length === 0 || !canWriteAcademicSetup}>
                <div className="card-heading"><div><span className="card-step">4</span><h2>Grade &amp; Compartment Mapping</h2><InfoTip label="Grade and Compartment Mapping">A <strong>Grade</strong> is the student academic level. Schools may use the terms <strong>Grade, Class or Standard</strong>. Map each grade to its Academic Compartment.</InfoTip></div><span>{grades.length} grades</span></div>
                <form onSubmit={(event) => { event.preventDefault(); if (!canWriteAcademicSetup) return; const form = event.currentTarget; const data = formData(event); runAction(async () => { const grade = await apiRequest<GradeLevel>("/api/v1/grade-levels", { method: "POST", body: JSON.stringify({ institution_id: selectedInstitutionId, code: value(data, "grade_code"), display_name: value(data, "grade_name"), level_order: Number(value(data, "level_order")), is_active: true }) }); await apiRequest("/api/v1/academic-division-grade-levels", { method: "POST", body: JSON.stringify({ institution_id: selectedInstitutionId, academic_year_id: selectedYearId, academic_division_id: value(data, "division_id"), grade_level_id: grade.id, sequence_no: Number(value(data, "sequence_no")) || null }) }); await loadInstitutionContext(selectedInstitutionId); form.reset(); }, "Grade created and mapped successfully"); }} className="form-grid">
                  <label>Grade Code<input name="grade_code" placeholder="X" required disabled={!selectedYearId || !canWriteAcademicSetup} /></label><label>Grade Name<input name="grade_name" placeholder="Class X" required disabled={!selectedYearId || !canWriteAcademicSetup} /></label><label>Display Order in the Entire Institution<input name="level_order" type="number" min="1" defaultValue="1" required disabled={!selectedYearId || !canWriteAcademicSetup} /></label><label>Academic Compartment<select name="division_id" required disabled={!selectedYearId || divisions.length === 0 || !canWriteAcademicSetup}><option value="">Select compartment</option>{divisions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Display Order in the Compartment<input name="sequence_no" type="number" min="1" defaultValue="1" disabled={!selectedYearId || !canWriteAcademicSetup} /></label><button disabled={busy || !selectedYearId || divisions.length === 0 || !canWriteAcademicSetup} className="primary-button">Add Grade</button>
                </form>
              </section>

              <section className="panel setup-card muted-when-disabled" data-disabled={!selectedInstitutionId || !selectedYearId || grades.length === 0 || !canWriteAcademicSetup}>
                <div className="card-heading"><div><span className="card-step">5</span><h2>Grade &amp; Section Mapping</h2><InfoTip label="Grade and Section Mapping">A <strong>Section</strong> is a student group within a Grade/Class/Standard. Schools may use the terms <strong>Section or Division</strong>. Examples include X A, X B, X BA or X BB.</InfoTip></div><span>{classes.length} created</span></div>
                <form onSubmit={(event) => { event.preventDefault(); if (!canWriteAcademicSetup) return; const form = event.currentTarget; const data = formData(event); runAction(async () => { await apiRequest<ClassGroup>("/api/v1/class-groups", { method: "POST", body: JSON.stringify({ institution_id: selectedInstitutionId, academic_year_id: selectedYearId, grade_level_id: value(data, "grade_level_id"), section_code: value(data, "section_code"), display_name: value(data, "section_name"), status: "active" }) }); await loadInstitutionContext(selectedInstitutionId); form.reset(); }, "Section created successfully"); }} className="form-grid">
                  <label>Grade<select name="grade_level_id" required disabled={!selectedYearId || grades.length === 0 || !canWriteAcademicSetup}><option value="">Select grade</option>{grades.map((item) => <option value={item.id} key={item.id}>{item.display_name}</option>)}</select></label><label>Section Code<input name="section_code" placeholder="A" required disabled={!selectedYearId || !canWriteAcademicSetup} /></label><label>Section Display Name<input name="section_name" placeholder="Class X - A" required disabled={!selectedYearId || !canWriteAcademicSetup} /></label><button disabled={busy || !selectedYearId || grades.length === 0 || !canWriteAcademicSetup} className="primary-button">Create Section</button>
                </form>
              </section>
            </>
          )}
        </div>
      </section>

      <section className="summary-grid"><article><strong>{years.length}</strong><span>Academic Years</span></article><article><strong>{divisions.length}</strong><span>Compartments</span></article><article><strong>{grades.length}</strong><span>Grades</span></article><article><strong>{classes.length}</strong><span>Sections</span></article></section>
    </main>
  );
}
