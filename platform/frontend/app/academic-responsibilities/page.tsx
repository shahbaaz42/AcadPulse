"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState, type CSSProperties } from "react";

import {
  AcademicDivision,
  AcademicDivisionGradeLevel,
  AcademicResponsibilityType,
  AcademicYear,
  ClassGroup,
  CurrentUser,
  GradeLevel,
  Institution,
  StaffAcademicResponsibility,
  StaffProfile,
  Subject,
  apiRequest,
} from "../../lib/api";

type Notice = { type: "success" | "error"; text: string } | null;

const inputStyle: CSSProperties = {
  width: "100%",
  marginTop: 6,
  padding: "10px 12px",
  border: "1px solid #d8deea",
  borderRadius: 9,
  background: "#fff",
  color: "#172033",
};

const cardStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e1e6ef",
  borderRadius: 14,
  boxShadow: "0 8px 24px rgba(27, 42, 78, 0.06)",
};

const responsibilityLabels: Record<AcademicResponsibilityType, string> = {
  SUBJECT_TEACHER: "Subject Teacher",
  CLASS_TEACHER: "Class Teacher",
  HOD: "HOD",
  OVERALL_CLASS_INCHARGE: "Overall Class Incharge",
};

export default function AcademicResponsibilitiesPage() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [divisions, setDivisions] = useState<AcademicDivision[]>([]);
  const [grades, setGrades] = useState<GradeLevel[]>([]);
  const [mappings, setMappings] = useState<AcademicDivisionGradeLevel[]>([]);
  const [classes, setClasses] = useState<ClassGroup[]>([]);
  const [profiles, setProfiles] = useState<StaffProfile[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [responsibilities, setResponsibilities] = useState<StaffAcademicResponsibility[]>([]);

  const [selectedInstitutionId, setSelectedInstitutionId] = useState("");
  const [selectedYearId, setSelectedYearId] = useState("");
  const [selectedDivisionId, setSelectedDivisionId] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [loadingContext, setLoadingContext] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const [subjectCode, setSubjectCode] = useState("");
  const [subjectName, setSubjectName] = useState("");

  const [staffProfileId, setStaffProfileId] = useState("");
  const [responsibilityType, setResponsibilityType] = useState<AcademicResponsibilityType>("SUBJECT_TEACHER");
  const [displayTitle, setDisplayTitle] = useState("");
  const [subjectIds, setSubjectIds] = useState<string[]>([]);
  const [gradeIds, setGradeIds] = useState<string[]>([]);
  const [classGroupIds, setClassGroupIds] = useState<string[]>([]);

  const selectedInstitution = useMemo(
    () => institutions.find((item) => item.id === selectedInstitutionId) ?? null,
    [institutions, selectedInstitutionId],
  );

  const selectedDivision = useMemo(
    () => divisions.find((item) => item.id === selectedDivisionId) ?? null,
    [divisions, selectedDivisionId],
  );

  const institutionWideSingle = Boolean(currentUser && !currentUser.is_platform_admin && institutions.length === 1);

  const canManageSubjects = useMemo(() => {
    if (!currentUser || !selectedInstitutionId || !selectedDivisionId) return false;
    if (currentUser.is_platform_admin) return true;
    return currentUser.assignments.some((assignment) => {
      if (assignment.institution_id !== selectedInstitutionId) return false;
      if (
        assignment.scope_type === "institution" &&
        ["PRINCIPAL", "SCHOOL_ADMIN"].includes(assignment.role_code)
      ) return true;
      return (
        assignment.role_code === "COMPARTMENT_HEAD" &&
        assignment.scope_type === "academic_compartment" &&
        assignment.academic_division_id === selectedDivisionId
      );
    });
  }, [currentUser, selectedInstitutionId, selectedDivisionId]);

  const canManageResponsibilities = useMemo(() => {
    if (!currentUser || !selectedInstitutionId || !selectedDivisionId) return false;
    if (currentUser.is_platform_admin) return true;
    return currentUser.assignments.some((assignment) => {
      if (assignment.institution_id !== selectedInstitutionId) return false;
      if (
        assignment.scope_type === "institution" &&
        ["PRINCIPAL", "SCHOOL_ADMIN"].includes(assignment.role_code)
      ) return true;
      return (
        assignment.role_code === "COMPARTMENT_HEAD" &&
        assignment.scope_type === "academic_compartment" &&
        assignment.academic_division_id === selectedDivisionId
      );
    });
  }, [currentUser, selectedInstitutionId, selectedDivisionId]);

  const isCompartmentHead = useMemo(
    () => Boolean(currentUser?.assignments.some(
      (assignment) =>
        assignment.role_code === "COMPARTMENT_HEAD" &&
        assignment.scope_type === "academic_compartment" &&
        assignment.institution_id === selectedInstitutionId,
    )),
    [currentUser, selectedInstitutionId],
  );

  const divisionGradeMappings = useMemo(
    () => mappings
      .filter(
        (item) =>
          item.academic_year_id === selectedYearId &&
          item.academic_division_id === selectedDivisionId,
      )
      .sort((a, b) => (a.sequence_no ?? 999) - (b.sequence_no ?? 999)),
    [mappings, selectedYearId, selectedDivisionId],
  );

  const visibleGrades = useMemo(() => {
    const gradeIdsInDivision = new Set(divisionGradeMappings.map((item) => item.grade_level_id));
    return grades
      .filter((item) => gradeIdsInDivision.has(item.id))
      .sort((a, b) => a.level_order - b.level_order);
  }, [divisionGradeMappings, grades]);

  const visibleClasses = useMemo(() => {
    const gradeIdsInDivision = new Set(visibleGrades.map((item) => item.id));
    return classes
      .filter(
        (item) =>
          item.academic_year_id === selectedYearId &&
          gradeIdsInDivision.has(item.grade_level_id),
      )
      .sort((a, b) => {
        const gradeA = grades.find((grade) => grade.id === a.grade_level_id)?.level_order ?? 999;
        const gradeB = grades.find((grade) => grade.id === b.grade_level_id)?.level_order ?? 999;
        return gradeA - gradeB || a.section_code.localeCompare(b.section_code, undefined, { numeric: true });
      });
  }, [classes, grades, selectedYearId, visibleGrades]);

  const visibleProfiles = useMemo(
    () => profiles
      .filter(
        (item) =>
          item.is_active &&
          item.staff_type === "TEACHING" &&
          item.academic_division_ids.includes(selectedDivisionId),
      )
      .sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [profiles, selectedDivisionId],
  );

  const visibleSubjects = useMemo(
    () => subjects
      .filter((item) => item.academic_division_ids.includes(selectedDivisionId))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [subjects, selectedDivisionId],
  );

  const gradeName = (id: string) => grades.find((item) => item.id === id)?.display_name ?? "Unknown grade";
  const className = (id: string) => classes.find((item) => item.id === id)?.display_name ?? "Unknown section";
  const subjectLabel = (id: string) => {
    const item = subjects.find((subject) => subject.id === id);
    return item ? `${item.name} (${item.code})` : "Unknown subject";
  };

  function toggleValue(value: string, values: string[], setter: (next: string[]) => void) {
    setter(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  }

  function resetResponsibilityForm(type: AcademicResponsibilityType = responsibilityType) {
    setStaffProfileId("");
    setResponsibilityType(type);
    setDisplayTitle("");
    setSubjectIds([]);
    setGradeIds([]);
    setClassGroupIds([]);
  }

  async function loadInstitutionContext(institutionId: string) {
    if (!institutionId) return;
    setLoadingContext(true);
    setNotice(null);
    try {
      const [yearData, divisionData, gradeData, mappingData, classData, staffData, subjectData] = await Promise.all([
        apiRequest<AcademicYear[]>(`/api/v1/academic-years?institution_id=${institutionId}`),
        apiRequest<AcademicDivision[]>(`/api/v1/academic-divisions?institution_id=${institutionId}`),
        apiRequest<GradeLevel[]>(`/api/v1/grade-levels?institution_id=${institutionId}`),
        apiRequest<AcademicDivisionGradeLevel[]>(`/api/v1/academic-division-grade-levels?institution_id=${institutionId}`),
        apiRequest<ClassGroup[]>(`/api/v1/class-groups?institution_id=${institutionId}`),
        apiRequest<StaffProfile[]>(`/api/v1/staff-profiles?institution_id=${institutionId}&include_inactive=false`),
        apiRequest<Subject[]>(`/api/v1/subjects?institution_id=${institutionId}`),
      ]);
      setYears(yearData);
      setDivisions(divisionData);
      setGrades(gradeData);
      setMappings(mappingData);
      setClasses(classData);
      setProfiles(staffData);
      setSubjects(subjectData);
      setSelectedYearId((current) => {
        if (yearData.some((item) => item.id === current)) return current;
        return yearData.find((item) => item.is_current)?.id ?? yearData[0]?.id ?? "";
      });
      setSelectedDivisionId((current) => divisionData.some((item) => item.id === current) ? current : divisionData[0]?.id ?? "");
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Unable to load academic responsibility context" });
    } finally {
      setLoadingContext(false);
    }
  }

  async function loadResponsibilities(institutionId: string, yearId: string, divisionId: string) {
    if (!institutionId || !yearId || !divisionId) {
      setResponsibilities([]);
      return;
    }
    try {
      const data = await apiRequest<StaffAcademicResponsibility[]>(
        `/api/v1/staff-responsibilities?institution_id=${institutionId}&academic_year_id=${yearId}&academic_division_id=${divisionId}`,
      );
      setResponsibilities(data);
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Unable to load academic responsibilities" });
    }
  }

  useEffect(() => {
    Promise.all([
      apiRequest<CurrentUser>("/api/v1/auth/me"),
      apiRequest<Institution[]>("/api/v1/institutions"),
    ])
      .then(([user, schools]) => {
        setCurrentUser(user);
        setInstitutions(schools);
        setSelectedInstitutionId(schools[0]?.id ?? "");
      })
      .catch((error: Error) => setNotice({ type: "error", text: error.message }))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!currentUser || !selectedInstitutionId) return;
    resetResponsibilityForm();
    loadInstitutionContext(selectedInstitutionId).catch(() => undefined);
  }, [currentUser, selectedInstitutionId]);

  useEffect(() => {
    resetResponsibilityForm();
    loadResponsibilities(selectedInstitutionId, selectedYearId, selectedDivisionId).catch(() => undefined);
  }, [selectedInstitutionId, selectedYearId, selectedDivisionId]);

  async function createSubject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedInstitutionId || !selectedDivisionId || !canManageSubjects) return;
    setSaving(true);
    setNotice(null);
    try {
      const created = await apiRequest<Subject>("/api/v1/subjects", {
        method: "POST",
        body: JSON.stringify({
          institution_id: selectedInstitutionId,
          academic_division_id: selectedDivisionId,
          code: subjectCode.trim(),
          name: subjectName.trim(),
        }),
      });
      setSubjects((current) => {
        const withoutCurrent = current.filter((item) => item.id !== created.id);
        return [...withoutCurrent, created].sort((a, b) => a.name.localeCompare(b.name));
      });
      setSubjectCode("");
      setSubjectName("");
      setNotice({
        type: "success",
        text: `${created.name} is now available in ${selectedDivision?.name ?? "the selected Academic Compartment"}.`,
      });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Unable to create subject" });
    } finally {
      setSaving(false);
    }
  }

  async function createResponsibility(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManageResponsibilities || !staffProfileId || !selectedInstitutionId || !selectedYearId || !selectedDivisionId) return;

    let finalSubjectIds = subjectIds;
    let finalGradeIds = gradeIds;
    let finalClassIds = classGroupIds;
    if (responsibilityType === "SUBJECT_TEACHER") {
      finalSubjectIds = subjectIds.slice(0, 1);
      finalGradeIds = [];
    } else if (responsibilityType === "CLASS_TEACHER") {
      finalSubjectIds = [];
      finalGradeIds = [];
      finalClassIds = classGroupIds.slice(0, 1);
    } else if (responsibilityType === "HOD") {
      finalGradeIds = [];
      finalClassIds = [];
    } else {
      finalSubjectIds = [];
      finalClassIds = [];
    }

    setSaving(true);
    setNotice(null);
    try {
      const created = await apiRequest<StaffAcademicResponsibility>("/api/v1/staff-responsibilities", {
        method: "POST",
        body: JSON.stringify({
          staff_profile_id: staffProfileId,
          institution_id: selectedInstitutionId,
          academic_year_id: selectedYearId,
          academic_division_id: selectedDivisionId,
          responsibility_type: responsibilityType,
          display_title: displayTitle.trim() || null,
          subject_ids: finalSubjectIds,
          grade_level_ids: finalGradeIds,
          class_group_ids: finalClassIds,
        }),
      });
      setResponsibilities((current) => [...current, created]);
      resetResponsibilityForm(responsibilityType);
      setNotice({ type: "success", text: `${created.staff_display_name}'s ${responsibilityLabels[created.responsibility_type]} responsibility has been saved.` });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Unable to create academic responsibility" });
    } finally {
      setSaving(false);
    }
  }

  async function removeResponsibility(item: StaffAcademicResponsibility) {
    if (!canManageResponsibilities) return;
    setSaving(true);
    setNotice(null);
    try {
      await apiRequest<void>(`/api/v1/staff-responsibilities/${item.id}`, { method: "DELETE" });
      setResponsibilities((current) => current.filter((row) => row.id !== item.id));
      setNotice({ type: "success", text: `${item.staff_display_name}'s responsibility has been removed.` });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Unable to remove academic responsibility" });
    } finally {
      setSaving(false);
    }
  }

  function targetSummary(item: StaffAcademicResponsibility) {
    if (item.responsibility_type === "HOD") return item.subject_ids.map(subjectLabel).join(", ");
    if (item.responsibility_type === "OVERALL_CLASS_INCHARGE") return item.grade_level_ids.map(gradeName).join(", ");
    if (item.responsibility_type === "CLASS_TEACHER") return item.class_group_ids.map(className).join(", ");
    return `${item.subject_ids.map(subjectLabel).join(", ")} → ${item.class_group_ids.map(className).join(", ")}`;
  }

  if (!loaded) {
    return <main style={{ maxWidth: 1100, margin: "48px auto", padding: 24 }}><p>Loading Subjects &amp; Academic Responsibilities…</p></main>;
  }

  if (!currentUser) {
    return (
      <main style={{ maxWidth: 800, margin: "48px auto", padding: 24 }}>
        <h1>Academic responsibilities unavailable</h1>
        <p>{notice?.text || "Please sign in to AcadPulse first."}</p>
        <Link href="/">Return to AcadPulse</Link>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 1240, margin: "32px auto 64px", padding: "0 22px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20, flexWrap: "wrap", marginBottom: 24 }}>
        <div>
          <p style={{ margin: "0 0 6px", color: "#52617a", fontWeight: 700 }}>AcadPulse — Academic Intelligence &amp; Management Platform</p>
          <h1 style={{ margin: 0, fontSize: "clamp(1.75rem, 4vw, 2.5rem)", color: "#172033" }}>Subjects &amp; Academic Responsibilities</h1>
          <p style={{ maxWidth: 820, color: "#5d687b", lineHeight: 1.6 }}>
            Compartment Heads maintain the subjects and staff responsibilities for their assigned Academic Compartment. Principal / School Admin retain institution-wide oversight and override access.
          </p>
        </div>
        <Link className="secondary-button" href="/">Back to School Foundation</Link>
      </header>

      {notice ? <div className={`notice ${notice.type}`} style={{ marginBottom: 18 }}>{notice.text}</div> : null}

      <section style={{ ...cardStyle, padding: 20, marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 16, alignItems: "end" }}>
          <div>
            <p style={{ margin: "0 0 4px", fontSize: ".78rem", fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: ".05em" }}>Institution</p>
            {institutionWideSingle && selectedInstitution ? (
              <strong>{selectedInstitution.display_name || selectedInstitution.official_name}</strong>
            ) : (
              <select value={selectedInstitutionId} onChange={(event) => setSelectedInstitutionId(event.target.value)} style={inputStyle}>
                <option value="">Select institution</option>
                {institutions.map((item) => <option key={item.id} value={item.id}>{item.display_name || item.official_name}</option>)}
              </select>
            )}
          </div>
          <label style={{ fontWeight: 700, color: "#354157" }}>
            Academic Year
            <select value={selectedYearId} onChange={(event) => setSelectedYearId(event.target.value)} style={inputStyle} disabled={!selectedInstitutionId}>
              <option value="">Select academic year</option>
              {years.map((item) => <option key={item.id} value={item.id}>{item.name}{item.is_current ? " — Current" : ""}</option>)}
            </select>
          </label>
          <label style={{ fontWeight: 700, color: "#354157" }}>
            Academic Compartment
            <select value={selectedDivisionId} onChange={(event) => setSelectedDivisionId(event.target.value)} style={inputStyle} disabled={!selectedInstitutionId}>
              <option value="">Select Academic Compartment</option>
              {divisions.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.code})</option>)}
            </select>
          </label>
          <div>
            <p style={{ margin: "0 0 4px", fontSize: ".78rem", fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: ".05em" }}>Your access</p>
            <strong>
              {canManageSubjects && canManageResponsibilities
                ? isCompartmentHead
                  ? "Compartment Subject Master + responsibility management"
                  : "Institution oversight + compartment management"
                : "Academic responsibility view"}
            </strong>
          </div>
        </div>
      </section>

      <section style={{ ...cardStyle, padding: 18, marginBottom: 20, background: "#f8faff" }}>
        <strong>Canonical subjects stay separate from timetable synchronization blocks.</strong>
        <p style={{ marginBottom: 0, color: "#52617a", lineHeight: 1.6 }}>
          Create Mathematics and IP as separate subjects. Labels such as MATHS / IP, MATHS / H.S / IP, BIO / C.S and LANG II are handled later as instructional groups / parallel timetable blocks — not as Subject Master entries.
        </p>
      </section>

      <section style={{ ...cardStyle, padding: 22, marginBottom: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0 }}>Canonical Subject Master</h2>
            <p style={{ margin: "6px 0 0", color: "#64748b" }}>
              {selectedDivision
                ? `${visibleSubjects.length} active subjects available in ${selectedDivision.name}.`
                : "Select an Academic Compartment to manage its subjects."}
            </p>
          </div>
          {isCompartmentHead && canManageSubjects ? (
            <span style={{ color: "#64748b", fontWeight: 700 }}>You manage subjects only for your assigned Academic Compartment.</span>
          ) : null}
        </div>

        {canManageSubjects ? (
          <form onSubmit={createSubject} style={{ display: "grid", gridTemplateColumns: "minmax(150px, .5fr) minmax(240px, 1fr) auto", gap: 14, alignItems: "end", marginTop: 18 }}>
            <label style={{ fontWeight: 700, color: "#354157" }}>Subject Code<input value={subjectCode} onChange={(event) => setSubjectCode(event.target.value)} required maxLength={50} placeholder="MATH" style={inputStyle} /></label>
            <label style={{ fontWeight: 700, color: "#354157" }}>Subject Name<input value={subjectName} onChange={(event) => setSubjectName(event.target.value)} required maxLength={120} placeholder="Mathematics" style={inputStyle} /></label>
            <button className="primary-button" disabled={saving || !selectedDivisionId}>Add Subject</button>
          </form>
        ) : null}

        <div style={{ marginTop: 18, display: "flex", flexWrap: "wrap", gap: 8 }}>
          {visibleSubjects.length ? visibleSubjects.map((subject) => (
            <span key={subject.id} style={{ border: "1px solid #dfe5ef", borderRadius: 999, padding: "7px 10px", background: "#fff", color: "#354157" }}>
              <strong>{subject.code}</strong> · {subject.name}
            </span>
          )) : <p style={{ color: "#64748b" }}>No canonical subjects have been added to this Academic Compartment yet.</p>}
        </div>
      </section>

      <section style={{ ...cardStyle, padding: 22, marginBottom: 22 }}>
        <div>
          <h2 style={{ margin: 0 }}>Assign Academic Responsibility</h2>
          <p style={{ margin: "6px 0 0", color: "#64748b", lineHeight: 1.6 }}>
            {selectedDivision ? `Assignments created here are scoped to ${selectedDivision.name}.` : "Select an Academic Compartment first."} Teachers do not need AcadPulse login accounts; responsibilities are attached to their Staff Profiles.
          </p>
        </div>

        {canManageResponsibilities ? (
          <form onSubmit={createResponsibility} style={{ marginTop: 20, display: "grid", gap: 18 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
              <label style={{ fontWeight: 700, color: "#354157" }}>
                Staff Profile
                <select value={staffProfileId} onChange={(event) => setStaffProfileId(event.target.value)} required style={inputStyle}>
                  <option value="">Select teacher</option>
                  {visibleProfiles.map((item) => <option key={item.id} value={item.id}>{item.full_name}{item.employee_code ? ` — ${item.employee_code}` : ""}</option>)}
                </select>
              </label>
              <label style={{ fontWeight: 700, color: "#354157" }}>
                Responsibility
                <select
                  value={responsibilityType}
                  onChange={(event) => resetResponsibilityForm(event.target.value as AcademicResponsibilityType)}
                  style={inputStyle}
                >
                  {Object.entries(responsibilityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label style={{ fontWeight: 700, color: "#354157" }}>
                Display Title <span style={{ fontWeight: 500, color: "#7b8798" }}>(optional)</span>
                <input value={displayTitle} onChange={(event) => setDisplayTitle(event.target.value)} maxLength={120} placeholder="e.g. HOD of Languages" style={inputStyle} />
              </label>
            </div>

            {responsibilityType === "SUBJECT_TEACHER" ? (
              <>
                <label style={{ fontWeight: 700, color: "#354157", maxWidth: 420 }}>
                  Subject
                  <select value={subjectIds[0] ?? ""} onChange={(event) => setSubjectIds(event.target.value ? [event.target.value] : [])} required style={inputStyle}>
                    <option value="">Select canonical subject</option>
                    {visibleSubjects.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.code})</option>)}
                  </select>
                </label>
                <TargetChecks title="Teaching Sections" emptyText="No sections are available in this Academic Compartment for the selected year." items={visibleClasses.map((item) => ({ id: item.id, label: item.display_name }))} selected={classGroupIds} onToggle={(id) => toggleValue(id, classGroupIds, setClassGroupIds)} />
              </>
            ) : null}

            {responsibilityType === "CLASS_TEACHER" ? (
              <label style={{ fontWeight: 700, color: "#354157", maxWidth: 420 }}>
                Class / Section
                <select value={classGroupIds[0] ?? ""} onChange={(event) => setClassGroupIds(event.target.value ? [event.target.value] : [])} required style={inputStyle}>
                  <option value="">Select one section</option>
                  {visibleClasses.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}
                </select>
              </label>
            ) : null}

            {responsibilityType === "HOD" ? (
              <TargetChecks title="HOD Subject(s)" emptyText="Create canonical subjects in this Academic Compartment before assigning an HOD." items={visibleSubjects.map((item) => ({ id: item.id, label: `${item.name} (${item.code})` }))} selected={subjectIds} onToggle={(id) => toggleValue(id, subjectIds, setSubjectIds)} />
            ) : null}

            {responsibilityType === "OVERALL_CLASS_INCHARGE" ? (
              <TargetChecks title="Grade(s)" emptyText="No grades are mapped to this Academic Compartment for the selected year." items={visibleGrades.map((item) => ({ id: item.id, label: item.display_name }))} selected={gradeIds} onToggle={(id) => toggleValue(id, gradeIds, setGradeIds)} />
            ) : null}

            <div><button className="primary-button" disabled={saving || loadingContext}>{saving ? "Saving…" : "Save Responsibility"}</button></div>
          </form>
        ) : (
          <p style={{ color: "#64748b", marginTop: 18 }}>You do not have responsibility-management access for the selected Academic Compartment.</p>
        )}
      </section>

      <section style={{ ...cardStyle, padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div><h2 style={{ margin: 0 }}>Current Responsibilities</h2><p style={{ margin: "6px 0 0", color: "#64748b" }}>{responsibilities.length} active assignments in this year and Academic Compartment.</p></div>
        </div>
        {responsibilities.length ? (
          <div className="table-scroll" style={{ marginTop: 16 }}>
            <table className="records-table">
              <thead><tr><th>Staff</th><th>Responsibility</th><th>Target</th><th>Title</th>{canManageResponsibilities ? <th>Action</th> : null}</tr></thead>
              <tbody>
                {responsibilities.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.staff_display_name}</strong></td>
                    <td>{responsibilityLabels[item.responsibility_type]}</td>
                    <td>{targetSummary(item) || "—"}</td>
                    <td>{item.display_title || "—"}</td>
                    {canManageResponsibilities ? <td><button type="button" className="table-edit-button" disabled={saving} onClick={() => removeResponsibility(item)}>Remove</button></td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p style={{ color: "#64748b", marginTop: 18 }}>No responsibilities have been assigned in this context yet.</p>}
      </section>
    </main>
  );
}

function TargetChecks({
  title,
  items,
  selected,
  onToggle,
  emptyText,
}: {
  title: string;
  items: Array<{ id: string; label: string }>;
  selected: string[];
  onToggle: (id: string) => void;
  emptyText: string;
}) {
  return (
    <fieldset style={{ border: "1px solid #d8deea", borderRadius: 12, padding: 16 }}>
      <legend style={{ fontWeight: 800, padding: "0 6px", color: "#354157" }}>{title}</legend>
      {items.length ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 9 }}>
          {items.map((item) => (
            <label key={item.id} style={{ display: "flex", gap: 9, alignItems: "center", padding: "9px 11px", border: "1px solid #e3e7ef", borderRadius: 9, cursor: "pointer" }}>
              <input type="checkbox" checked={selected.includes(item.id)} onChange={() => onToggle(item.id)} />
              <span>{item.label}</span>
            </label>
          ))}
        </div>
      ) : <p style={{ margin: 0, color: "#64748b" }}>{emptyText}</p>}
    </fieldset>
  );
}