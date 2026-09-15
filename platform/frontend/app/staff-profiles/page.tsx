"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState, type CSSProperties } from "react";

import {
  AcademicDivision,
  CurrentUser,
  Institution,
  StaffProfile,
  apiRequest,
} from "../../lib/api";

type StaffType = "TEACHING" | "NON_TEACHING";
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

export default function StaffProfilesPage() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [selectedInstitutionId, setSelectedInstitutionId] = useState("");
  const [divisions, setDivisions] = useState<AcademicDivision[]>([]);
  const [profiles, setProfiles] = useState<StaffProfile[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadingDirectory, setLoadingDirectory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [staffType, setStaffType] = useState<StaffType>("TEACHING");
  const [academicDivisionIds, setAcademicDivisionIds] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);

  const selectedInstitution = useMemo(
    () => institutions.find((item) => item.id === selectedInstitutionId) ?? null,
    [institutions, selectedInstitutionId],
  );

  const canManageStaff = useMemo(() => {
    if (!currentUser || !selectedInstitutionId) return false;
    if (currentUser.is_platform_admin) return true;
    return currentUser.assignments.some(
      (assignment) =>
        assignment.scope_type === "institution" &&
        assignment.institution_id === selectedInstitutionId &&
        (assignment.role_code === "PRINCIPAL" || assignment.role_code === "SCHOOL_ADMIN"),
    );
  }, [currentUser, selectedInstitutionId]);

  const isCompartmentHead = useMemo(
    () => Boolean(currentUser?.assignments.some(
      (assignment) =>
        assignment.role_code === "COMPARTMENT_HEAD" &&
        assignment.scope_type === "academic_compartment" &&
        assignment.institution_id === selectedInstitutionId,
    )),
    [currentUser, selectedInstitutionId],
  );

  const institutionWideSingle = Boolean(
    currentUser && !currentUser.is_platform_admin && institutions.length === 1,
  );

  const teachingCount = profiles.filter((item) => item.staff_type === "TEACHING").length;
  const nonTeachingCount = profiles.filter((item) => item.staff_type === "NON_TEACHING").length;
  const activeCount = profiles.filter((item) => item.is_active).length;

  function resetForm() {
    setEditingId(null);
    setFullName("");
    setEmployeeCode("");
    setStaffType("TEACHING");
    setAcademicDivisionIds([]);
    setIsActive(true);
  }

  function divisionNames(ids: string[]) {
    const visibleNames = ids
      .map((id) => divisions.find((division) => division.id === id)?.name)
      .filter((name): name is string => Boolean(name));
    return visibleNames.length ? visibleNames.join(", ") : "—";
  }

  function toggleDivision(id: string) {
    setAcademicDivisionIds((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id]);
  }

  async function loadDirectory(institutionId: string, allowInactive: boolean) {
    if (!institutionId) {
      setDivisions([]);
      setProfiles([]);
      return;
    }
    setLoadingDirectory(true);
    try {
      const [divisionData, profileData] = await Promise.all([
        apiRequest<AcademicDivision[]>(`/api/v1/academic-divisions?institution_id=${institutionId}`),
        apiRequest<StaffProfile[]>(
          `/api/v1/staff-profiles?institution_id=${institutionId}&include_inactive=${allowInactive ? "true" : "false"}`,
        ),
      ]);
      setDivisions(divisionData);
      setProfiles(profileData);
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Unable to load staff directory" });
    } finally {
      setLoadingDirectory(false);
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
    resetForm();
    loadDirectory(selectedInstitutionId, canManageStaff).catch(() => undefined);
  }, [currentUser, selectedInstitutionId, canManageStaff]);

  function startEdit(profile: StaffProfile) {
    if (!canManageStaff) return;
    setEditingId(profile.id);
    setFullName(profile.full_name);
    setEmployeeCode(profile.employee_code ?? "");
    setStaffType(profile.staff_type);
    setAcademicDivisionIds(profile.academic_division_ids);
    setIsActive(profile.is_active);
    setNotice(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedInstitutionId || !canManageStaff) return;
    setSaving(true);
    setNotice(null);
    try {
      const divisionIds = staffType === "TEACHING" ? academicDivisionIds : [];
      if (editingId) {
        const updated = await apiRequest<StaffProfile>(`/api/v1/staff-profiles/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify({
            full_name: fullName.trim(),
            employee_code: employeeCode.trim() || null,
            staff_type: staffType,
            academic_division_ids: divisionIds,
            is_active: isActive,
          }),
        });
        setNotice({ type: "success", text: `${updated.full_name}'s Staff Profile has been updated.` });
      } else {
        const created = await apiRequest<StaffProfile>("/api/v1/staff-profiles", {
          method: "POST",
          body: JSON.stringify({
            institution_id: selectedInstitutionId,
            full_name: fullName.trim(),
            employee_code: employeeCode.trim() || null,
            staff_type: staffType,
            academic_division_ids: divisionIds,
            user_id: null,
          }),
        });
        setNotice({ type: "success", text: `${created.full_name} has been added to the Staff Directory.` });
      }
      resetForm();
      await loadDirectory(selectedInstitutionId, true);
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Unable to save Staff Profile" });
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return <main style={{ maxWidth: 1100, margin: "48px auto", padding: 24 }}><p>Loading Staff &amp; Teacher Profiles…</p></main>;
  }

  if (!currentUser) {
    return (
      <main style={{ maxWidth: 800, margin: "48px auto", padding: 24 }}>
        <h1>Staff directory unavailable</h1>
        <p>{notice?.text || "Please sign in to AcadPulse before opening the Staff Directory."}</p>
        <Link href="/">Return to AcadPulse</Link>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 1180, margin: "32px auto 64px", padding: "0 22px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20, flexWrap: "wrap", marginBottom: 24 }}>
        <div>
          <p style={{ margin: "0 0 6px", color: "#52617a", fontWeight: 700 }}>AcadPulse — Academic Intelligence &amp; Management Platform</p>
          <h1 style={{ margin: 0, fontSize: "clamp(1.75rem, 4vw, 2.5rem)", color: "#172033" }}>Staff &amp; Teacher Profiles</h1>
          <p style={{ maxWidth: 760, color: "#5d687b", lineHeight: 1.6 }}>
            Maintain institution staff records and place teaching staff into the Academic Compartments where they work.
          </p>
        </div>
        <Link className="secondary-button" href="/">Back to School Foundation</Link>
      </header>

      {notice ? <div className={`notice ${notice.type}`} style={{ marginBottom: 18 }}>{notice.text}</div> : null}

      <section style={{ ...cardStyle, padding: 20, marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 16, alignItems: "end" }}>
          <div>
            <p style={{ margin: "0 0 4px", fontSize: ".78rem", fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: ".05em" }}>Current institution</p>
            {institutionWideSingle && selectedInstitution ? (
              <strong style={{ color: "#172033" }}>{selectedInstitution.display_name || selectedInstitution.official_name}</strong>
            ) : (
              <select value={selectedInstitutionId} onChange={(event) => setSelectedInstitutionId(event.target.value)} style={inputStyle}>
                <option value="">Select institution</option>
                {institutions.map((institution) => (
                  <option key={institution.id} value={institution.id}>
                    {institution.display_name || institution.official_name} ({institution.institution_code})
                  </option>
                ))}
              </select>
            )}
          </div>
          <div>
            <p style={{ margin: "0 0 4px", fontSize: ".78rem", fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: ".05em" }}>Your access</p>
            <strong style={{ color: "#172033" }}>
              {canManageStaff ? "Institution-wide Staff Profile management" : isCompartmentHead ? "Academic Compartment-scoped staff view" : "Staff directory view"}
            </strong>
          </div>
        </div>
      </section>

      {isCompartmentHead && !canManageStaff ? (
        <section style={{ ...cardStyle, padding: 18, marginBottom: 20, background: "#f8faff" }}>
          <strong>Scoped view</strong>
          <p style={{ marginBottom: 0, color: "#52617a" }}>
            You can see only teaching staff placed in your assigned Academic Compartment(s). Staff creation and placement are managed by the Principal / School Admin.
          </p>
        </section>
      ) : null}

      {canManageStaff ? (
        <section style={{ ...cardStyle, padding: 22, marginBottom: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <h2 style={{ margin: 0 }}>{editingId ? "Edit Staff Profile" : "Add Staff Profile"}</h2>
              <p style={{ margin: "6px 0 0", color: "#64748b" }}>
                Teaching staff may be placed in one or multiple Academic Compartments. Non-teaching staff remain institution-level records.
              </p>
            </div>
            {editingId ? <button type="button" className="secondary-button" onClick={resetForm}>Cancel edit</button> : null}
          </div>

          <form onSubmit={submit} style={{ marginTop: 22, display: "grid", gap: 18 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
              <label style={{ fontWeight: 700, color: "#354157" }}>
                Full name
                <input value={fullName} onChange={(event) => setFullName(event.target.value)} required maxLength={255} style={inputStyle} placeholder="e.g. Ahmed Khan" />
              </label>
              <label style={{ fontWeight: 700, color: "#354157" }}>
                Employee ID / Code <span style={{ fontWeight: 500, color: "#7b8798" }}>(optional)</span>
                <input value={employeeCode} onChange={(event) => setEmployeeCode(event.target.value)} maxLength={80} style={inputStyle} placeholder="e.g. UPS-1042" />
              </label>
              <label style={{ fontWeight: 700, color: "#354157" }}>
                Staff classification
                <select
                  value={staffType}
                  onChange={(event) => {
                    const next = event.target.value as StaffType;
                    setStaffType(next);
                    if (next === "NON_TEACHING") setAcademicDivisionIds([]);
                  }}
                  style={inputStyle}
                >
                  <option value="TEACHING">Teaching Staff</option>
                  <option value="NON_TEACHING">Non-Teaching Staff</option>
                </select>
              </label>
              {editingId ? (
                <label style={{ fontWeight: 700, color: "#354157" }}>
                  Profile status
                  <select value={isActive ? "active" : "inactive"} onChange={(event) => setIsActive(event.target.value === "active")} style={inputStyle}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </label>
              ) : null}
            </div>

            {staffType === "TEACHING" ? (
              <fieldset style={{ border: "1px solid #d8deea", borderRadius: 12, padding: 16 }}>
                <legend style={{ fontWeight: 800, padding: "0 6px", color: "#354157" }}>Academic Compartment placement</legend>
                <p style={{ marginTop: 2, color: "#64748b" }}>Select every Academic Compartment in which this teacher works. A teacher can belong to more than one.</p>
                {divisions.length ? (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                    {divisions.map((division) => (
                      <label key={division.id} style={{ display: "flex", gap: 9, alignItems: "center", padding: "10px 12px", border: "1px solid #e3e7ef", borderRadius: 9, cursor: "pointer" }}>
                        <input type="checkbox" checked={academicDivisionIds.includes(division.id)} onChange={() => toggleDivision(division.id)} />
                        <span><strong>{division.name}</strong> <span style={{ color: "#7b8798" }}>({division.code})</span></span>
                      </label>
                    ))}
                  </div>
                ) : <p style={{ color: "#8a5b16" }}>No Academic Compartments are available yet. The profile can be saved and assigned later.</p>}
              </fieldset>
            ) : (
              <div style={{ padding: "12px 14px", borderRadius: 10, background: "#f7f8fb", color: "#64748b" }}>
                Non-teaching staff are kept at institution level. Finance, Transport, Library, PRO and other optional modules will be connected separately in future phases rather than hard-coded here.
              </div>
            )}

            <div>
              <button className="primary-button" disabled={saving || !fullName.trim()}>
                {saving ? "Saving…" : editingId ? "Update Staff Profile" : "Add Staff Profile"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section style={{ ...cardStyle, padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 18, flexWrap: "wrap", marginBottom: 18 }}>
          <div>
            <h2 style={{ margin: 0 }}>Staff Directory</h2>
            <p style={{ margin: "6px 0 0", color: "#64748b" }}>
              {isCompartmentHead && !canManageStaff ? "Teachers visible within your Academic Compartment scope." : "Institution staff and current Academic Compartment placement."}
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <span style={{ padding: "7px 10px", borderRadius: 999, background: "#eef2ff", fontWeight: 700 }}>Active {activeCount}</span>
            <span style={{ padding: "7px 10px", borderRadius: 999, background: "#eef8f2", fontWeight: 700 }}>Teaching {teachingCount}</span>
            {canManageStaff ? <span style={{ padding: "7px 10px", borderRadius: 999, background: "#f7f3ee", fontWeight: 700 }}>Non-Teaching {nonTeachingCount}</span> : null}
          </div>
        </div>

        {loadingDirectory ? <p>Loading Staff Directory…</p> : profiles.length ? (
          <div style={{ overflowX: "auto" }}>
            <table className="records-table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Employee ID</th>
                  <th>Name</th>
                  <th>Classification</th>
                  <th>Academic Compartment(s)</th>
                  <th>Status</th>
                  {canManageStaff ? <th>Action</th> : null}
                </tr>
              </thead>
              <tbody>
                {profiles.map((profile) => (
                  <tr key={profile.id}>
                    <td>{profile.employee_code || "—"}</td>
                    <td><strong>{profile.full_name}</strong></td>
                    <td>{profile.staff_type === "TEACHING" ? "Teaching Staff" : "Non-Teaching Staff"}</td>
                    <td>{profile.staff_type === "TEACHING" ? divisionNames(profile.academic_division_ids) : "Institution level"}</td>
                    <td>{profile.is_active ? "Active" : "Inactive"}</td>
                    {canManageStaff ? <td><button type="button" className="table-edit-button" onClick={() => startEdit(profile)}>Edit</button></td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ color: "#64748b" }}>
            {selectedInstitutionId ? "No Staff Profiles are available in your current scope." : "Select an institution to view Staff Profiles."}
          </p>
        )}
      </section>
    </main>
  );
}
