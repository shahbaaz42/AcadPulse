"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AcademicDivision, CurrentUser, Institution, Subject, apiRequest } from "../../../lib/api";

export default function SubjectManagementPage() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [divisions, setDivisions] = useState<AcademicDivision[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [institutionId, setInstitutionId] = useState("");
  const [divisionId, setDivisionId] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    Promise.all([
      apiRequest<CurrentUser>("/api/v1/auth/me"),
      apiRequest<Institution[]>("/api/v1/institutions"),
    ]).then(([me, schools]) => {
      setUser(me);
      setInstitutions(schools);
      setInstitutionId(schools[0]?.id ?? "");
    }).catch((error: Error) => setNotice(error.message));
  }, []);

  useEffect(() => {
    if (!institutionId) return;
    Promise.all([
      apiRequest<AcademicDivision[]>(`/api/v1/academic-divisions?institution_id=${institutionId}`),
      apiRequest<Subject[]>(`/api/v1/subjects?institution_id=${institutionId}`),
    ]).then(([divisionData, subjectData]) => {
      setDivisions(divisionData);
      setSubjects(subjectData);
      setDivisionId((current) => divisionData.some((item) => item.id === current) ? current : divisionData[0]?.id ?? "");
    }).catch((error: Error) => setNotice(error.message));
  }, [institutionId]);

  const allowedDivisions = useMemo(() => {
    if (!user) return [];
    const institutionWide = user.is_platform_admin || user.assignments.some(
      (a) => a.institution_id === institutionId && a.scope_type === "institution" && ["PRINCIPAL", "SCHOOL_ADMIN"].includes(a.role_code),
    );
    if (institutionWide) return divisions;
    const ids = new Set(user.assignments
      .filter((a) => a.institution_id === institutionId && a.role_code === "COMPARTMENT_HEAD" && a.scope_type === "academic_compartment")
      .map((a) => a.academic_division_id));
    return divisions.filter((d) => ids.has(d.id));
  }, [user, divisions, institutionId]);

  useEffect(() => {
    if (allowedDivisions.length && !allowedDivisions.some((d) => d.id === divisionId)) {
      setDivisionId(allowedDivisions[0].id);
    }
  }, [allowedDivisions, divisionId]);

  const visibleSubjects = subjects
    .filter((subject) => subject.academic_division_ids.includes(divisionId))
    .sort((a, b) => a.name.localeCompare(b.name));

  async function removeSubject(subject: Subject) {
    if (!divisionId || busy) return;
    const division = divisions.find((item) => item.id === divisionId);
    if (!window.confirm(`Remove ${subject.name} from ${division?.name ?? "this Academic Compartment"}?`)) return;

    setBusy(true);
    setNotice("");
    try {
      await apiRequest<void>(`/api/v1/subjects/${subject.id}/academic-divisions/${divisionId}`, { method: "DELETE" });
      setSubjects((current) => current.map((item) => item.id === subject.id
        ? { ...item, academic_division_ids: item.academic_division_ids.filter((id) => id !== divisionId) }
        : item));
      setNotice(`${subject.name} was removed from ${division?.name ?? "the Academic Compartment"}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to remove subject");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 980, margin: "36px auto", padding: "0 22px", color: "#172033" }}>
      <p style={{ color: "#52617a", fontWeight: 700 }}>AcadPulse — Academic Intelligence &amp; Management Platform</p>
      <h1>Manage Canonical Subjects</h1>
      <p style={{ color: "#64748b", lineHeight: 1.6 }}>
        Remove a subject only from the selected Academic Compartment. The canonical subject is not deleted institution-wide. Subjects with active academic responsibilities cannot be removed until those responsibilities are removed.
      </p>
      <p><Link href="/academic-responsibilities">← Back to Subjects &amp; Academic Responsibilities</Link></p>

      {notice ? <div className="notice" style={{ margin: "18px 0" }}>{notice}</div> : null}

      {institutions.length > 1 ? (
        <label style={{ display: "block", marginBottom: 14, fontWeight: 700 }}>
          Institution
          <select value={institutionId} onChange={(e) => setInstitutionId(e.target.value)} style={{ display: "block", width: "100%", marginTop: 6, padding: 10 }}>
            {institutions.map((item) => <option key={item.id} value={item.id}>{item.display_name || item.official_name}</option>)}
          </select>
        </label>
      ) : null}

      <label style={{ display: "block", marginBottom: 20, fontWeight: 700 }}>
        Academic Compartment
        <select value={divisionId} onChange={(e) => setDivisionId(e.target.value)} style={{ display: "block", width: "100%", marginTop: 6, padding: 10 }}>
          {allowedDivisions.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.code})</option>)}
        </select>
      </label>

      <section style={{ background: "#fff", border: "1px solid #e1e6ef", borderRadius: 14, padding: 22 }}>
        <h2 style={{ marginTop: 0 }}>Subjects in this Academic Compartment</h2>
        {visibleSubjects.length ? (
          <div style={{ display: "grid", gap: 10 }}>
            {visibleSubjects.map((subject) => (
              <div key={subject.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, border: "1px solid #e3e7ef", borderRadius: 10, padding: "12px 14px" }}>
                <span><strong>{subject.code}</strong> · {subject.name}</span>
                <button type="button" className="table-edit-button" disabled={busy} onClick={() => removeSubject(subject)}>Remove</button>
              </div>
            ))}
          </div>
        ) : <p style={{ color: "#64748b" }}>No canonical subjects are available in this Academic Compartment.</p>}
      </section>
    </main>
  );
}
