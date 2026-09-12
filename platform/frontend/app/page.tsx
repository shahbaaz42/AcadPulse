"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  AcademicDivision,
  AcademicYear,
  apiRequest,
  ClassGroup,
  GradeLevel,
  Institution,
} from "../lib/api";

type Notice = { type: "success" | "error"; text: string } | null;

const setupSteps = [
  ["1", "Institution", "Create the school profile"],
  ["2", "Academic Year", "Set the working academic year"],
  ["3", "Divisions", "Add configurable academic divisions"],
  ["4", "Grades", "Create grade levels and map them to divisions"],
  ["5", "Classes", "Create sections / class groups"],
];

export default function HomePage() {
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
    [institutions, selectedInstitutionId]
  );

  async function loadInstitutions() {
    const data = await apiRequest<Institution[]>("/api/v1/institutions");
    setInstitutions(data);
    if (!selectedInstitutionId && data[0]) setSelectedInstitutionId(data[0].id);
  }

  async function loadInstitutionContext(institutionId: string) {
    if (!institutionId) {
      setYears([]);
      setDivisions([]);
      setGrades([]);
      setClasses([]);
      return;
    }
    const [yearData, divisionData, gradeData, classData] = await Promise.all([
      apiRequest<AcademicYear[]>(`/api/v1/academic-years?institution_id=${institutionId}`),
      apiRequest<AcademicDivision[]>(`/api/v1/academic-divisions?institution_id=${institutionId}`),
      apiRequest<GradeLevel[]>(`/api/v1/grade-levels?institution_id=${institutionId}`),
      apiRequest<ClassGroup[]>(`/api/v1/class-groups?institution_id=${institutionId}`),
    ]);
    setYears(yearData);
    setDivisions(divisionData);
    setGrades(gradeData);
    setClasses(classData);
    setSelectedYearId((current) =>
      yearData.some((item) => item.id === current) ? current : yearData[0]?.id ?? ""
    );
  }

  useEffect(() => {
    loadInstitutions().catch((error: Error) => setNotice({ type: "error", text: error.message }));
  }, []);

  useEffect(() => {
    loadInstitutionContext(selectedInstitutionId).catch((error: Error) =>
      setNotice({ type: "error", text: error.message })
    );
  }, [selectedInstitutionId]);

  async function runAction(action: () => Promise<void>, successText: string) {
    setBusy(true);
    setNotice(null);
    try {
      await action();
      setNotice({ type: "success", text: successText });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Something went wrong" });
    } finally {
      setBusy(false);
    }
  }

  function formData(event: FormEvent<HTMLFormElement>) {
    return new FormData(event.currentTarget);
  }

  function value(data: FormData, name: string) {
    return String(data.get(name) ?? "").trim();
  }

  return (
    <main className="page-shell">
      <section className="hero compact-hero">
        <div>
          <p className="eyebrow">AcadPulse Academic Management</p>
          <h1>School foundation setup</h1>
          <p className="hero-copy">
            Configure the academic structure in a guided order. Scoreboard Generator and Result Analytics remain separate and unchanged.
          </p>
        </div>
        <div className="status-card">
          <span>Current milestone</span>
          <strong>Institution → Year → Division → Grade → Class</strong>
          <small>{selectedInstitution ? `Working on: ${selectedInstitution.display_name || selectedInstitution.official_name}` : "Create or select an institution to begin"}</small>
        </div>
      </section>

      {notice && <div className={`notice ${notice.type}`}>{notice.text}</div>}

      <section className="panel context-panel">
        <div>
          <p className="eyebrow">Current context</p>
          <h2>Choose institution and academic year</h2>
        </div>
        <div className="context-controls">
          <label>
            Institution
            <select value={selectedInstitutionId} onChange={(event) => setSelectedInstitutionId(event.target.value)}>
              <option value="">Select institution</option>
              {institutions.map((item) => (
                <option value={item.id} key={item.id}>{item.display_name || item.official_name}</option>
              ))}
            </select>
          </label>
          <label>
            Academic Year
            <select value={selectedYearId} onChange={(event) => setSelectedYearId(event.target.value)} disabled={!selectedInstitutionId}>
              <option value="">Select academic year</option>
              {years.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="setup-layout">
        <aside className="panel steps-panel">
          <p className="eyebrow">Guided setup</p>
          <div className="steps">
            {setupSteps.map(([number, title, text], index) => (
              <article className="step" key={title}>
                <div className="step-number">{number}</div>
                <div className="step-copy"><h3>{title}</h3><p>{text}</p></div>
                <span className={index === 0 ? "step-state active" : "step-state"}>{index === 0 ? "Start" : "Next"}</span>
              </article>
            ))}
          </div>
        </aside>

        <div className="forms-stack">
          <section className="panel setup-card">
            <div className="card-heading"><div><span className="card-step">1</span><h2>Institution</h2></div><span>{institutions.length} created</span></div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const data = formData(event);
                runAction(async () => {
                  const created = await apiRequest<Institution>("/api/v1/institutions", {
                    method: "POST",
                    body: JSON.stringify({
                      institution_code: value(data, "institution_code"),
                      official_name: value(data, "official_name"),
                      display_name: value(data, "display_name") || null,
                      timezone: "Asia/Kolkata",
                      status: "active",
                    }),
                  });
                  await loadInstitutions();
                  setSelectedInstitutionId(created.id);
                  form.reset();
                }, "Institution created successfully");
              }}
              className="form-grid"
            >
              <label>Institution Code<input name="institution_code" placeholder="e.g. APS01" required /></label>
              <label>Official Name<input name="official_name" placeholder="School official name" required /></label>
              <label className="full-width">Display Name<input name="display_name" placeholder="Optional shorter name" /></label>
              <button disabled={busy} className="primary-button">Create Institution</button>
            </form>
          </section>

          <section className="panel setup-card muted-when-disabled" data-disabled={!selectedInstitutionId}>
            <div className="card-heading"><div><span className="card-step">2</span><h2>Academic Year</h2></div><span>{years.length} created</span></div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!selectedInstitutionId) return;
                const form = event.currentTarget;
                const data = formData(event);
                runAction(async () => {
                  await apiRequest<AcademicYear>("/api/v1/academic-years", {
                    method: "POST",
                    body: JSON.stringify({
                      institution_id: selectedInstitutionId,
                      name: value(data, "name"),
                      start_date: value(data, "start_date"),
                      end_date: value(data, "end_date"),
                      status: "active",
                      is_current: Boolean(data.get("is_current")),
                    }),
                  });
                  await loadInstitutionContext(selectedInstitutionId);
                  form.reset();
                }, "Academic year created successfully");
              }}
              className="form-grid"
            >
              <label>Year Name<input name="name" placeholder="2026-2027" required disabled={!selectedInstitutionId} /></label>
              <label>Start Date<input name="start_date" type="date" required disabled={!selectedInstitutionId} /></label>
              <label>End Date<input name="end_date" type="date" required disabled={!selectedInstitutionId} /></label>
              <label className="checkbox-label"><input name="is_current" type="checkbox" disabled={!selectedInstitutionId} /> Current academic year</label>
              <button disabled={busy || !selectedInstitutionId} className="primary-button">Add Academic Year</button>
            </form>
          </section>

          <section className="panel setup-card muted-when-disabled" data-disabled={!selectedInstitutionId}>
            <div className="card-heading"><div><span className="card-step">3</span><h2>Academic Division</h2></div><span>{divisions.length} created</span></div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const data = formData(event);
                runAction(async () => {
                  await apiRequest<AcademicDivision>("/api/v1/academic-divisions", {
                    method: "POST",
                    body: JSON.stringify({
                      institution_id: selectedInstitutionId,
                      code: value(data, "code"),
                      name: value(data, "division_name"),
                      display_order: Number(value(data, "display_order")),
                      is_active: true,
                    }),
                  });
                  await loadInstitutionContext(selectedInstitutionId);
                  form.reset();
                }, "Academic division created successfully");
              }}
              className="form-grid"
            >
              <label>Division Code<input name="code" placeholder="SEC" required disabled={!selectedInstitutionId} /></label>
              <label>Division Name<input name="division_name" placeholder="Secondary" required disabled={!selectedInstitutionId} /></label>
              <label>Display Order<input name="display_order" type="number" min="1" defaultValue="1" required disabled={!selectedInstitutionId} /></label>
              <button disabled={busy || !selectedInstitutionId} className="primary-button">Add Division</button>
            </form>
          </section>

          <section className="panel setup-card muted-when-disabled" data-disabled={!selectedInstitutionId || !selectedYearId || divisions.length === 0}>
            <div className="card-heading"><div><span className="card-step">4</span><h2>Grade & Division Mapping</h2></div><span>{grades.length} grades</span></div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const data = formData(event);
                runAction(async () => {
                  const grade = await apiRequest<GradeLevel>("/api/v1/grade-levels", {
                    method: "POST",
                    body: JSON.stringify({
                      institution_id: selectedInstitutionId,
                      code: value(data, "grade_code"),
                      display_name: value(data, "grade_name"),
                      level_order: Number(value(data, "level_order")),
                      is_active: true,
                    }),
                  });
                  await apiRequest("/api/v1/academic-division-grade-levels", {
                    method: "POST",
                    body: JSON.stringify({
                      institution_id: selectedInstitutionId,
                      academic_year_id: selectedYearId,
                      academic_division_id: value(data, "division_id"),
                      grade_level_id: grade.id,
                      sequence_no: Number(value(data, "sequence_no")) || null,
                    }),
                  });
                  await loadInstitutionContext(selectedInstitutionId);
                  form.reset();
                }, "Grade created and mapped successfully");
              }}
              className="form-grid"
            >
              <label>Grade Code<input name="grade_code" placeholder="X" required disabled={!selectedYearId} /></label>
              <label>Grade Name<input name="grade_name" placeholder="Grade 10" required disabled={!selectedYearId} /></label>
              <label>Level Order<input name="level_order" type="number" min="1" defaultValue="1" required disabled={!selectedYearId} /></label>
              <label>Academic Division<select name="division_id" required disabled={!selectedYearId || divisions.length === 0}><option value="">Select division</option>{divisions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label>Sequence in Division<input name="sequence_no" type="number" min="1" defaultValue="1" disabled={!selectedYearId} /></label>
              <button disabled={busy || !selectedYearId || divisions.length === 0} className="primary-button">Add Grade</button>
            </form>
          </section>

          <section className="panel setup-card muted-when-disabled" data-disabled={!selectedInstitutionId || !selectedYearId || grades.length === 0}>
            <div className="card-heading"><div><span className="card-step">5</span><h2>Class Group / Section</h2></div><span>{classes.length} created</span></div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const data = formData(event);
                runAction(async () => {
                  await apiRequest<ClassGroup>("/api/v1/class-groups", {
                    method: "POST",
                    body: JSON.stringify({
                      institution_id: selectedInstitutionId,
                      academic_year_id: selectedYearId,
                      grade_level_id: value(data, "grade_level_id"),
                      section_code: value(data, "section_code"),
                      display_name: value(data, "class_name"),
                      capacity: Number(value(data, "capacity")) || null,
                      status: "active",
                    }),
                  });
                  await loadInstitutionContext(selectedInstitutionId);
                  form.reset();
                }, "Class group created successfully");
              }}
              className="form-grid"
            >
              <label>Grade<select name="grade_level_id" required disabled={!selectedYearId || grades.length === 0}><option value="">Select grade</option>{grades.map((item) => <option value={item.id} key={item.id}>{item.display_name}</option>)}</select></label>
              <label>Section Code<input name="section_code" placeholder="A" required disabled={!selectedYearId} /></label>
              <label>Class Display Name<input name="class_name" placeholder="Grade 10 - A" required disabled={!selectedYearId} /></label>
              <label>Capacity<input name="capacity" type="number" min="1" placeholder="40" disabled={!selectedYearId} /></label>
              <button disabled={busy || !selectedYearId || grades.length === 0} className="primary-button">Create Class</button>
            </form>
          </section>
        </div>
      </section>

      <section className="summary-grid">
        <article><strong>{years.length}</strong><span>Academic Years</span></article>
        <article><strong>{divisions.length}</strong><span>Divisions</span></article>
        <article><strong>{grades.length}</strong><span>Grades</span></article>
        <article><strong>{classes.length}</strong><span>Classes</span></article>
      </section>
    </main>
  );
}
