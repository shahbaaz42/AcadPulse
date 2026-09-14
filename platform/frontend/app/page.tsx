"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  AcademicDivision,
  AcademicDivisionGradeLevel,
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
type EditTarget = { kind: "year" | "division" | "grade" | "class"; id: string } | null;
type SectionSortDirection = "asc" | "desc";

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

function EditButton({ onClick }: { onClick: () => void }) {
  return <button className="table-edit-button" type="button" onClick={onClick}>Edit</button>;
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
  const [mappings, setMappings] = useState<AcademicDivisionGradeLevel[]>([]);
  const [classes, setClasses] = useState<ClassGroup[]>([]);
  const [selectedInstitutionId, setSelectedInstitutionId] = useState("");
  const [selectedYearId, setSelectedYearId] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<EditTarget>(null);
  const [sectionSortDirection, setSectionSortDirection] = useState<SectionSortDirection>("asc");

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

  const hasSingleInstitutionScope = Boolean(
    currentUser && !currentUser.is_platform_admin && !isManagementAdmin && institutions.length === 1,
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
    if (currentUser.assignments.some((assignment) => assignment.scope_type === "academic_compartment")) return "Academic Compartment-scoped access";
    return "Institution-scoped access";
  }, [currentUser]);

  const currentMappings = useMemo(
    () => mappings.filter((item) => item.academic_year_id === selectedYearId),
    [mappings, selectedYearId],
  );

  const currentClasses = useMemo(
    () => classes.filter((item) => !selectedYearId || item.academic_year_id === selectedYearId),
    [classes, selectedYearId],
  );

  const sortedCurrentClasses = useMemo(() => {
    const gradeOrder = new Map(grades.map((grade) => [grade.id, grade.level_order]));
    const gradeDirection = sectionSortDirection === "asc" ? 1 : -1;

    return [...currentClasses].sort((a, b) => {
      const aGradeOrder = gradeOrder.get(a.grade_level_id) ?? Number.MAX_SAFE_INTEGER;
      const bGradeOrder = gradeOrder.get(b.grade_level_id) ?? Number.MAX_SAFE_INTEGER;
      const gradeComparison = (aGradeOrder - bGradeOrder) * gradeDirection;
      if (gradeComparison !== 0) return gradeComparison;

      const sectionComparison = a.section_code.localeCompare(b.section_code, undefined, {
        numeric: true,
        sensitivity: "base",
      });
      if (sectionComparison !== 0) return sectionComparison;

      return a.display_name.localeCompare(b.display_name, undefined, { numeric: true, sensitivity: "base" });
    });
  }, [currentClasses, grades, sectionSortDirection]);

  const divisionName = (id: string) => divisions.find((item) => item.id === id)?.name ?? "—";
  const gradeName = (id: string) => grades.find((item) => item.id === id)?.display_name ?? "—";
  const mappingForGrade = (gradeId: string) => currentMappings.find((item) => item.grade_level_id === gradeId);

  function resetAcademicState() {
    setInstitutions([]); setYears([]); setDivisions([]); setGrades([]); setMappings([]); setClasses([]);
    setSelectedInstitutionId(""); setSelectedYearId(""); setNotice(null); setEditing(null);
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
      setYears([]); setDivisions([]); setGrades([]); setMappings([]); setClasses([]); setSelectedYearId(""); return;
    }
    const [yearData, divisionData, gradeData, mappingData, classData] = await Promise.all([
      apiRequest<AcademicYear[]>(`/api/v1/academic-years?institution_id=${institutionId}`),
      apiRequest<AcademicDivision[]>(`/api/v1/academic-divisions?institution_id=${institutionId}`),
      apiRequest<GradeLevel[]>(`/api/v1/grade-levels?institution_id=${institutionId}`),
      apiRequest<AcademicDivisionGradeLevel[]>(`/api/v1/academic-division-grade-levels?institution_id=${institutionId}`),
      apiRequest<ClassGroup[]>(`/api/v1/class-groups?institution_id=${institutionId}`),
    ]);
    setYears(yearData); setDivisions(divisionData); setGrades(gradeData); setMappings(mappingData); setClasses(classData);
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
  useEffect(() => { if (currentUser) { setEditing(null); loadInstitutionContext(selectedInstitutionId).catch(handleAuthenticatedError); } }, [selectedInstitutionId, currentUser]);
  useEffect(() => { setEditing(null); }, [selectedYearId]);

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

  const yearRows = (
    <div className="record-list">
      <h3>Existing Academic Years</h3>
      {years.length ? <div className="table-scroll"><table className="records-table"><thead><tr><th>Academic Year</th><th>Start</th><th>End</th><th>Current</th>{canWriteAcademicSetup && <th>Action</th>}</tr></thead><tbody>{years.map((item) => (
        <tr key={item.id}><td><strong>{item.name}</strong></td><td>{item.start_date}</td><td>{item.end_date}</td><td>{item.is_current ? "Yes" : "No"}</td>{canWriteAcademicSetup && <td><EditButton onClick={() => setEditing({ kind: "year", id: item.id })} /></td>}</tr>
      ))}</tbody></table></div> : <p className="empty-records">No academic years have been configured.</p>}
    </div>
  );

  const divisionRows = (
    <div className="record-list">
      <h3>Existing Academic Compartments</h3>
      {divisions.length ? <div className="table-scroll"><table className="records-table"><thead><tr><th>Code</th><th>Academic Compartment</th><th>Display Order</th>{canWriteAcademicSetup && <th>Action</th>}</tr></thead><tbody>{divisions.map((item) => (
        <tr key={item.id}><td>{item.code}</td><td><strong>{item.name}</strong></td><td>{item.display_order}</td>{canWriteAcademicSetup && <td><EditButton onClick={() => setEditing({ kind: "division", id: item.id })} /></td>}</tr>
      ))}</tbody></table></div> : <p className="empty-records">No academic compartments have been configured.</p>}
    </div>
  );

  const gradeRows = (
    <div className="record-list">
      <h3>Existing Grades &amp; Compartment Mapping</h3>
      {grades.length ? <div className="table-scroll"><table className="records-table"><thead><tr><th>Code</th><th>Grade</th><th>Institution Order</th><th>Compartment</th><th>Compartment Order</th>{canWriteAcademicSetup && <th>Action</th>}</tr></thead><tbody>{grades.map((item) => { const mapping = mappingForGrade(item.id); return (
        <tr key={item.id}><td>{item.code}</td><td><strong>{item.display_name}</strong></td><td>{item.level_order}</td><td>{mapping ? divisionName(mapping.academic_division_id) : "—"}</td><td>{mapping?.sequence_no ?? "—"}</td>{canWriteAcademicSetup && <td><EditButton onClick={() => setEditing({ kind: "grade", id: item.id })} /></td>}</tr>
      ); })}</tbody></table></div> : <p className="empty-records">No grades have been configured.</p>}
    </div>
  );

  const classRows = (
    <div className="record-list">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Existing Sections</h3>
        <label style={{ display: "grid", gap: 5, color: "#475569", fontSize: ".78rem", fontWeight: 700 }}>
          Sort by Grade Order
          <select
            value={sectionSortDirection}
            onChange={(event) => setSectionSortDirection(event.target.value as SectionSortDirection)}
            aria-label="Sort existing sections by grade order"
            style={{ border: "1px solid #d8deea", borderRadius: 9, background: "#fff", padding: "7px 10px", color: "#172033" }}
          >
            <option value="asc">Ascending ↑</option>
            <option value="desc">Descending ↓</option>
          </select>
        </label>
      </div>
      {sortedCurrentClasses.length ? <div className="table-scroll"><table className="records-table"><thead><tr><th>Grade</th><th>Section Code</th><th>Section Display Name</th>{canWriteAcademicSetup && <th>Action</th>}</tr></thead><tbody>{sortedCurrentClasses.map((item) => (
        <tr key={item.id}><td>{gradeName(item.grade_level_id)}</td><td>{item.section_code}</td><td><strong>{item.display_name}</strong></td>{canWriteAcademicSetup && <td><EditButton onClick={() => setEditing({ kind: "class", id: item.id })} /></td>}</tr>
      ))}</tbody></table></div> : <p className="empty-records">No sections have been configured for the selected academic year.</p>}
    </div>
  );

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
        <div><p className="eyebrow">Current context</p><h2>{hasSingleInstitutionScope ? "Institution and academic year" : "Choose institution and academic year"}</h2></div>
        <div className="context-controls">
          {hasSingleInstitutionScope && selectedInstitution ? (
            <div className="context-static"><span>Institution</span><strong>{selectedInstitution.display_name || selectedInstitution.official_name}</strong></div>
          ) : (
            <label>Institution<select value={selectedInstitutionId} onChange={(event) => setSelectedInstitutionId(event.target.value)}><option value="">Select institution</option>{institutions.map((item) => <option value={item.id} key={item.id}>{item.display_name || item.official_name}</option>)}</select></label>
          )}
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
            <section className="panel setup-card scope-card"><div className="card-heading"><div><span className="card-step">1</span><h2>Institution Access</h2></div>{!hasSingleInstitutionScope && <span>{institutions.length} accessible</span>}</div><p>Your assigned institution is ready for academic setup.</p></section>
          )}

          <section className="panel setup-card muted-when-disabled" data-disabled={!selectedInstitutionId || (!isManagementAdmin && !canWriteAcademicSetup)}>
            <div className="card-heading"><div><span className="card-step">2</span><h2>Academic Year</h2></div><span>{years.length} created</span></div>
            {!isManagementAdmin && <form onSubmit={(event) => { event.preventDefault(); if (!selectedInstitutionId || !canWriteAcademicSetup) return; const form = event.currentTarget; const data = formData(event); runAction(async () => { await apiRequest<AcademicYear>("/api/v1/academic-years", { method: "POST", body: JSON.stringify({ institution_id: selectedInstitutionId, name: value(data, "name"), start_date: value(data, "start_date"), end_date: value(data, "end_date"), status: "active", is_current: Boolean(data.get("is_current")) }) }); await loadInstitutionContext(selectedInstitutionId); form.reset(); }, "Academic year created successfully"); }} className="form-grid">
              <label>Year Name<input name="name" placeholder="2026-2027" required disabled={!selectedInstitutionId || !canWriteAcademicSetup} /></label><label>Start Date<input name="start_date" type="date" required disabled={!selectedInstitutionId || !canWriteAcademicSetup} /></label><label>End Date<input name="end_date" type="date" required disabled={!selectedInstitutionId || !canWriteAcademicSetup} /></label><label className="checkbox-label"><input name="is_current" type="checkbox" disabled={!selectedInstitutionId || !canWriteAcademicSetup} /> Current academic year</label><button disabled={busy || !selectedInstitutionId || !canWriteAcademicSetup} className="primary-button">Add Academic Year</button>
            </form>}
            {editing?.kind === "year" && (() => { const item = years.find((row) => row.id === editing.id); if (!item) return null; return <form className="edit-form form-grid" onSubmit={(event) => { event.preventDefault(); const data = formData(event); runAction(async () => { await apiRequest(`/api/v1/academic-years/${item.id}`, { method: "PATCH", body: JSON.stringify({ name: value(data, "name"), start_date: value(data, "start_date"), end_date: value(data, "end_date"), is_current: Boolean(data.get("is_current")) }) }); await loadInstitutionContext(selectedInstitutionId); setEditing(null); }, "Academic year updated successfully"); }}><label>Year Name<input name="name" defaultValue={item.name} required /></label><label>Start Date<input name="start_date" type="date" defaultValue={item.start_date} required /></label><label>End Date<input name="end_date" type="date" defaultValue={item.end_date} required /></label><label className="checkbox-label"><input name="is_current" type="checkbox" defaultChecked={item.is_current} /> Current academic year</label><div className="edit-actions"><button className="primary-button" disabled={busy}>Save Changes</button><button className="secondary-button" type="button" onClick={() => setEditing(null)}>Cancel</button></div></form>; })()}
            {yearRows}
          </section>

          <section className="panel setup-card muted-when-disabled" data-disabled={!selectedInstitutionId || (!isManagementAdmin && !canWriteAcademicSetup)}>
            <div className="card-heading"><div><span className="card-step">3</span><h2>Academic Compartments</h2><InfoTip label="Academic Compartments">Academic Compartment represents a broad academic grouping used by an institution, such as <strong>Pre-Primary, Primary, Middle, Secondary, Senior Secondary, Junior or Senior</strong>. Institutions may create compartments according to their own academic structure.</InfoTip></div><span>{divisions.length} created</span></div>
            {!isManagementAdmin && <form onSubmit={(event) => { event.preventDefault(); if (!canWriteAcademicSetup) return; const form = event.currentTarget; const data = formData(event); runAction(async () => { await apiRequest<AcademicDivision>("/api/v1/academic-divisions", { method: "POST", body: JSON.stringify({ institution_id: selectedInstitutionId, code: value(data, "code"), name: value(data, "compartment_name"), display_order: Number(value(data, "display_order")), is_active: true }) }); await loadInstitutionContext(selectedInstitutionId); form.reset(); }, "Academic compartment created successfully"); }} className="form-grid">
              <label>Compartment Code<input name="code" placeholder="SEC" required disabled={!selectedInstitutionId || !canWriteAcademicSetup} /></label><label>Compartment Name<input name="compartment_name" placeholder="Secondary" required disabled={!selectedInstitutionId || !canWriteAcademicSetup} /></label><label>Compartment Display Order<input name="display_order" type="number" min="1" defaultValue="1" required disabled={!selectedInstitutionId || !canWriteAcademicSetup} /></label><button disabled={busy || !selectedInstitutionId || !canWriteAcademicSetup} className="primary-button">Add Compartment</button>
            </form>}
            {editing?.kind === "division" && (() => { const item = divisions.find((row) => row.id === editing.id); if (!item) return null; return <form className="edit-form form-grid" onSubmit={(event) => { event.preventDefault(); const data = formData(event); runAction(async () => { await apiRequest(`/api/v1/academic-divisions/${item.id}`, { method: "PATCH", body: JSON.stringify({ code: value(data, "code"), name: value(data, "name"), display_order: Number(value(data, "display_order")) }) }); await loadInstitutionContext(selectedInstitutionId); setEditing(null); }, "Academic compartment updated successfully"); }}><label>Compartment Code<input name="code" defaultValue={item.code} required /></label><label>Compartment Name<input name="name" defaultValue={item.name} required /></label><label>Compartment Display Order<input name="display_order" type="number" min="1" defaultValue={item.display_order} required /></label><div className="edit-actions"><button className="primary-button" disabled={busy}>Save Changes</button><button className="secondary-button" type="button" onClick={() => setEditing(null)}>Cancel</button></div></form>; })()}
            {divisionRows}
          </section>

          <section className="panel setup-card muted-when-disabled" data-disabled={!selectedInstitutionId || !selectedYearId || divisions.length === 0 || (!isManagementAdmin && !canWriteAcademicSetup)}>
            <div className="card-heading"><div><span className="card-step">4</span><h2>Grade &amp; Compartment Mapping</h2><InfoTip label="Grade and Compartment Mapping">A <strong>Grade</strong> is the student academic level. Schools may use the terms <strong>Grade, Class or Standard</strong>. Map each grade to its Academic Compartment.</InfoTip></div><span>{grades.length} grades</span></div>
            {!isManagementAdmin && <form onSubmit={(event) => { event.preventDefault(); if (!canWriteAcademicSetup) return; const form = event.currentTarget; const data = formData(event); runAction(async () => { const grade = await apiRequest<GradeLevel>("/api/v1/grade-levels", { method: "POST", body: JSON.stringify({ institution_id: selectedInstitutionId, code: value(data, "grade_code"), display_name: value(data, "grade_name"), level_order: Number(value(data, "level_order")), is_active: true }) }); await apiRequest("/api/v1/academic-division-grade-levels", { method: "POST", body: JSON.stringify({ institution_id: selectedInstitutionId, academic_year_id: selectedYearId, academic_division_id: value(data, "division_id"), grade_level_id: grade.id, sequence_no: Number(value(data, "sequence_no")) || null }) }); await loadInstitutionContext(selectedInstitutionId); form.reset(); }, "Grade created and mapped successfully"); }} className="form-grid">
              <label>Grade Code<input name="grade_code" placeholder="X" required disabled={!selectedYearId || !canWriteAcademicSetup} /></label><label>Grade Name<input name="grade_name" placeholder="Class X" required disabled={!selectedYearId || !canWriteAcademicSetup} /></label><label>Display Order in the Entire Institution<input name="level_order" type="number" min="1" defaultValue="1" required disabled={!selectedYearId || !canWriteAcademicSetup} /></label><label>Academic Compartment<select name="division_id" required disabled={!selectedYearId || divisions.length === 0 || !canWriteAcademicSetup}><option value="">Select compartment</option>{divisions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Display Order in the Compartment<input name="sequence_no" type="number" min="1" defaultValue="1" disabled={!selectedYearId || !canWriteAcademicSetup} /></label><button disabled={busy || !selectedYearId || divisions.length === 0 || !canWriteAcademicSetup} className="primary-button">Add Grade</button>
            </form>}
            {editing?.kind === "grade" && (() => { const item = grades.find((row) => row.id === editing.id); const mapping = item ? mappingForGrade(item.id) : undefined; if (!item) return null; return <form className="edit-form form-grid" onSubmit={(event) => { event.preventDefault(); const data = formData(event); runAction(async () => { await apiRequest(`/api/v1/grade-levels/${item.id}`, { method: "PATCH", body: JSON.stringify({ code: value(data, "code"), display_name: value(data, "name"), level_order: Number(value(data, "level_order")) }) }); const newDivisionId = value(data, "division_id"); const newSequence = Number(value(data, "sequence_no")) || null; if (mapping && (mapping.academic_division_id !== newDivisionId || mapping.sequence_no !== newSequence)) { await apiRequest(`/api/v1/academic-division-grade-levels/${mapping.id}`, { method: "DELETE" }); await apiRequest("/api/v1/academic-division-grade-levels", { method: "POST", body: JSON.stringify({ institution_id: selectedInstitutionId, academic_year_id: selectedYearId, academic_division_id: newDivisionId, grade_level_id: item.id, sequence_no: newSequence }) }); } else if (!mapping && newDivisionId) { await apiRequest("/api/v1/academic-division-grade-levels", { method: "POST", body: JSON.stringify({ institution_id: selectedInstitutionId, academic_year_id: selectedYearId, academic_division_id: newDivisionId, grade_level_id: item.id, sequence_no: newSequence }) }); } await loadInstitutionContext(selectedInstitutionId); setEditing(null); }, "Grade and compartment mapping updated successfully"); }}><label>Grade Code<input name="code" defaultValue={item.code} required /></label><label>Grade Name<input name="name" defaultValue={item.display_name} required /></label><label>Display Order in the Entire Institution<input name="level_order" type="number" min="1" defaultValue={item.level_order} required /></label><label>Academic Compartment<select name="division_id" defaultValue={mapping?.academic_division_id ?? ""} required><option value="">Select compartment</option>{divisions.map((division) => <option key={division.id} value={division.id}>{division.name}</option>)}</select></label><label>Display Order in the Compartment<input name="sequence_no" type="number" min="1" defaultValue={mapping?.sequence_no ?? 1} required /></label><div className="edit-actions"><button className="primary-button" disabled={busy}>Save Changes</button><button className="secondary-button" type="button" onClick={() => setEditing(null)}>Cancel</button></div></form>; })()}
            {gradeRows}
          </section>

          <section className="panel setup-card muted-when-disabled" data-disabled={!selectedInstitutionId || !selectedYearId || grades.length === 0 || (!isManagementAdmin && !canWriteAcademicSetup)}>
            <div className="card-heading"><div><span className="card-step">5</span><h2>Grade &amp; Section Mapping</h2><InfoTip label="Grade and Section Mapping">A <strong>Section</strong> is a student group within a Grade/Class/Standard. Schools may use the terms <strong>Section or Division</strong>. Examples include X A, X B, X BA or X BB.</InfoTip></div><span>{currentClasses.length} created</span></div>
            {!isManagementAdmin && <form onSubmit={(event) => { event.preventDefault(); if (!canWriteAcademicSetup) return; const form = event.currentTarget; const data = formData(event); runAction(async () => { await apiRequest<ClassGroup>("/api/v1/class-groups", { method: "POST", body: JSON.stringify({ institution_id: selectedInstitutionId, academic_year_id: selectedYearId, grade_level_id: value(data, "grade_level_id"), section_code: value(data, "section_code"), display_name: value(data, "section_name"), status: "active" }) }); await loadInstitutionContext(selectedInstitutionId); form.reset(); }, "Section created successfully"); }} className="form-grid">
              <label>Grade<select name="grade_level_id" required disabled={!selectedYearId || grades.length === 0 || !canWriteAcademicSetup}><option value="">Select grade</option>{grades.map((item) => <option value={item.id} key={item.id}>{item.display_name}</option>)}</select></label><label>Section Code<input name="section_code" placeholder="A" required disabled={!selectedYearId || !canWriteAcademicSetup} /></label><label>Section Display Name<input name="section_name" placeholder="Class X - A" required disabled={!selectedYearId || !canWriteAcademicSetup} /></label><button disabled={busy || !selectedYearId || grades.length === 0 || !canWriteAcademicSetup} className="primary-button">Create Section</button>
            </form>}
            {editing?.kind === "class" && (() => { const item = classes.find((row) => row.id === editing.id); if (!item) return null; return <form className="edit-form form-grid" onSubmit={(event) => { event.preventDefault(); const data = formData(event); runAction(async () => { await apiRequest(`/api/v1/class-groups/${item.id}`, { method: "PATCH", body: JSON.stringify({ section_code: value(data, "section_code"), display_name: value(data, "display_name") }) }); await loadInstitutionContext(selectedInstitutionId); setEditing(null); }, "Section updated successfully"); }}><label>Grade<input value={gradeName(item.grade_level_id)} disabled readOnly /></label><label>Section Code<input name="section_code" defaultValue={item.section_code} required /></label><label>Section Display Name<input name="display_name" defaultValue={item.display_name} required /></label><div className="edit-actions"><button className="primary-button" disabled={busy}>Save Changes</button><button className="secondary-button" type="button" onClick={() => setEditing(null)}>Cancel</button></div></form>; })()}
            {classRows}
          </section>
        </div>
      </section>

      <section className="summary-grid"><article><strong>{years.length}</strong><span>Academic Years</span></article><article><strong>{divisions.length}</strong><span>Compartments</span></article><article><strong>{grades.length}</strong><span>Grades</span></article><article><strong>{currentClasses.length}</strong><span>Sections</span></article></section>
    </main>
  );
}
