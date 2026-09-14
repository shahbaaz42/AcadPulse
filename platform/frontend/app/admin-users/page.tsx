"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  AdminUserProvisioned,
  CurrentUser,
  Institution,
  Organization,
  apiRequest,
} from "../../lib/api";

type RoleCode = "MANAGEMENT_ADMIN" | "PRINCIPAL" | "SCHOOL_ADMIN";

export default function AdminUsersPage() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [roleCode, setRoleCode] = useState<RoleCode>("PRINCIPAL");
  const [displayName, setDisplayName] = useState("School Principal");
  const [email, setEmail] = useState("principal@acadpulse.test");
  const [password, setPassword] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [institutionId, setInstitutionId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const isManagementAdmin = useMemo(
    () => Boolean(currentUser?.assignments.some(
      (assignment) => assignment.role_code === "MANAGEMENT_ADMIN" && assignment.scope_type === "organization",
    )),
    [currentUser],
  );

  const isPrincipal = useMemo(
    () => Boolean(currentUser?.assignments.some(
      (assignment) => assignment.role_code === "PRINCIPAL" && assignment.scope_type === "institution",
    )),
    [currentUser],
  );

  const canProvisionUsers = Boolean(currentUser?.is_platform_admin || isManagementAdmin || isPrincipal);

  useEffect(() => {
    Promise.all([
      apiRequest<CurrentUser>("/api/v1/auth/me"),
      apiRequest<Organization[]>("/api/v1/organizations"),
      apiRequest<Institution[]>("/api/v1/institutions"),
    ])
      .then(([user, orgs, schools]) => {
        setCurrentUser(user);
        setOrganizations(orgs);
        setInstitutions(schools);
        if (orgs.length === 1) setOrganizationId(orgs[0].id);
        if (schools.length === 1) setInstitutionId(schools[0].id);

        const management = user.assignments.some(
          (assignment) => assignment.role_code === "MANAGEMENT_ADMIN" && assignment.scope_type === "organization",
        );
        const principal = user.assignments.some(
          (assignment) => assignment.role_code === "PRINCIPAL" && assignment.scope_type === "institution",
        );

        if (user.is_platform_admin) {
          setRoleCode("MANAGEMENT_ADMIN");
          setDisplayName("Group Management");
          setEmail("management@acadpulse.test");
        } else if (management) {
          setRoleCode("PRINCIPAL");
          setDisplayName("School Principal");
          setEmail("principal@acadpulse.test");
        } else if (principal) {
          setRoleCode("SCHOOL_ADMIN");
          setDisplayName("School Admin");
          setEmail("schooladmin@acadpulse.test");
        }
        setPassword("");
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoaded(true));
  }, []);

  const targetLabel = roleCode === "MANAGEMENT_ADMIN" ? "Organization" : "Institution";
  const principalSingleInstitution = isPrincipal && institutions.length === 1 ? institutions[0] : null;

  function changeRole(next: RoleCode) {
    setRoleCode(next);
    setMessage("");
    setError("");
    setPassword("");
    if (next === "MANAGEMENT_ADMIN") {
      setDisplayName("Group Management");
      setEmail("management@acadpulse.test");
    } else if (next === "PRINCIPAL") {
      setDisplayName("School Principal");
      setEmail("principal@acadpulse.test");
    } else {
      setDisplayName("School Admin");
      setEmail("schooladmin@acadpulse.test");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");
    setSaving(true);
    try {
      const endpoint = isPrincipal ? "/api/v1/principal/school-admins" : "/api/v1/auth/admin/users";
      const created = await apiRequest<AdminUserProvisioned>(endpoint, {
        method: "POST",
        body: JSON.stringify({
          email,
          display_name: displayName,
          password,
          role_code: roleCode,
          organization_id: roleCode === "MANAGEMENT_ADMIN" ? organizationId || null : null,
          institution_id: roleCode === "MANAGEMENT_ADMIN" ? null : institutionId || null,
        }),
      });
      setMessage(`${created.role_name} ready: ${created.email}`);
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create user");
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return <main style={{ maxWidth: 760, margin: "48px auto", padding: 24 }}><p>Checking your AcadPulse access…</p></main>;
  }

  if (!canProvisionUsers) {
    return (
      <main style={{ maxWidth: 760, margin: "48px auto", padding: 24 }}>
        <h1>User administration unavailable</h1>
        <p>This page is available to authorized AcadPulse Platform Admin, Management / Group Admin, and Principal accounts.</p>
        {error ? <p style={{ color: "crimson", fontWeight: 700 }}>{error}</p> : null}
        <Link href="/">Return to AcadPulse</Link>
      </main>
    );
  }

  const guidance = currentUser?.is_platform_admin
    ? "Create controlled organization or institution administrator accounts. Tenant visibility is enforced by the backend."
    : isManagementAdmin
      ? "Create/Manage Principal accounts for institutions of your organization."
      : "Create/Manage School Admin accounts for your assigned institution.";

  return (
    <main style={{ maxWidth: 760, margin: "40px auto", padding: 24 }}>
      <p style={{ marginBottom: 8 }}>AcadPulse — Academic Intelligence &amp; Management Platform</p>
      <h1 style={{ marginTop: 0 }}>User &amp; role provisioning</h1>
      <p>{guidance}</p>

      <form onSubmit={submit} style={{ display: "grid", gap: 16, marginTop: 28 }}>
        <label>
          Role
          {currentUser?.is_platform_admin ? (
            <select value={roleCode} onChange={(event) => changeRole(event.target.value as RoleCode)} style={{ display: "block", width: "100%", padding: 10, marginTop: 6 }}>
              <option value="MANAGEMENT_ADMIN">Management / Group Admin</option>
              <option value="PRINCIPAL">Principal</option>
              <option value="SCHOOL_ADMIN">School Admin</option>
            </select>
          ) : (
            <input value={isManagementAdmin ? "Principal" : "School Admin"} readOnly style={{ display: "block", width: "100%", padding: 10, marginTop: 6 }} />
          )}
        </label>

        <label>Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required style={{ display: "block", width: "100%", padding: 10, marginTop: 6 }} /></label>
        <label>Login email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required style={{ display: "block", width: "100%", padding: 10, marginTop: 6 }} /></label>
        <label>
          Test password
          <input type="password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="new-password" style={{ display: "block", width: "100%", padding: 10, marginTop: 6 }} />
          <small>Minimum 12 characters. Replace test credentials before real production use.</small>
        </label>

        {roleCode === "MANAGEMENT_ADMIN" ? (
          <label>
            {targetLabel}
            <select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} required style={{ display: "block", width: "100%", padding: 10, marginTop: 6 }}>
              <option value="">Select organization</option>
              {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.display_name || organization.name} ({organization.organization_code})</option>)}
            </select>
          </label>
        ) : principalSingleInstitution ? (
          <label>
            Institution
            <input value={principalSingleInstitution.display_name || principalSingleInstitution.official_name} readOnly style={{ display: "block", width: "100%", padding: 10, marginTop: 6 }} />
          </label>
        ) : (
          <label>
            {targetLabel}
            <select value={institutionId} onChange={(event) => setInstitutionId(event.target.value)} required style={{ display: "block", width: "100%", padding: 10, marginTop: 6 }}>
              <option value="">Select institution</option>
              {institutions.map((institution) => <option key={institution.id} value={institution.id}>{institution.display_name || institution.official_name} ({institution.institution_code})</option>)}
            </select>
          </label>
        )}

        <button type="submit" disabled={saving || !canProvisionUsers || (roleCode === "MANAGEMENT_ADMIN" ? !organizationId : !institutionId)} style={{ padding: "11px 16px", fontWeight: 700 }}>
          {saving ? "Creating…" : "Create / reset user"}
        </button>
      </form>

      {message ? <p style={{ marginTop: 18, fontWeight: 700 }}>{message}</p> : null}
      {error ? <p style={{ marginTop: 18, color: "crimson", fontWeight: 700 }}>{error}</p> : null}
      <p style={{ marginTop: 28 }}><Link href="/">← Back to School foundation</Link></p>
    </main>
  );
}
