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
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [roleCode, setRoleCode] = useState<RoleCode>("MANAGEMENT_ADMIN");
  const [displayName, setDisplayName] = useState("Unity Group Management Admin");
  const [email, setEmail] = useState("management@acadpulse.test");
  const [password, setPassword] = useState("Manage123456!");
  const [organizationId, setOrganizationId] = useState("");
  const [institutionId, setInstitutionId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

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
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  const targetLabel = useMemo(
    () => (roleCode === "MANAGEMENT_ADMIN" ? "Organization" : "Institution"),
    [roleCode],
  );

  function changeRole(next: RoleCode) {
    setRoleCode(next);
    setMessage("");
    setError("");
    if (next === "MANAGEMENT_ADMIN") {
      setDisplayName("Unity Group Management Admin");
      setEmail("management@acadpulse.test");
      setPassword("Manage123456!");
    } else if (next === "PRINCIPAL") {
      setDisplayName("Unity Public School Principal");
      setEmail("principal@acadpulse.test");
      setPassword("Principal123!");
    } else {
      setDisplayName("Unity Kids School Admin");
      setEmail("schooladmin@acadpulse.test");
      setPassword("SchoolAdmin123!");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");
    setSaving(true);
    try {
      const created = await apiRequest<AdminUserProvisioned>("/api/v1/auth/admin/users", {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create user");
    } finally {
      setSaving(false);
    }
  }

  if (currentUser && !currentUser.is_platform_admin) {
    return (
      <main style={{ maxWidth: 760, margin: "48px auto", padding: 24 }}>
        <h1>Platform administration only</h1>
        <p>This page is available only to the AcadPulse Platform Admin.</p>
        <Link href="/">Return to AcadPulse</Link>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 760, margin: "40px auto", padding: 24 }}>
      <p style={{ marginBottom: 8 }}>AcadPulse — Academic Intelligence &amp; Management Platform</p>
      <h1 style={{ marginTop: 0 }}>User &amp; role provisioning</h1>
      <p>
        Create controlled test/admin accounts and assign exactly one organization or institution scope.
        Tenant visibility is still enforced by the backend.
      </p>

      <form onSubmit={submit} style={{ display: "grid", gap: 16, marginTop: 28 }}>
        <label>
          Role
          <select
            value={roleCode}
            onChange={(event) => changeRole(event.target.value as RoleCode)}
            style={{ display: "block", width: "100%", padding: 10, marginTop: 6 }}
          >
            <option value="MANAGEMENT_ADMIN">Management / Group Admin</option>
            <option value="PRINCIPAL">Principal</option>
            <option value="SCHOOL_ADMIN">School Admin</option>
          </select>
        </label>

        <label>
          Display name
          <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required style={{ display: "block", width: "100%", padding: 10, marginTop: 6 }} />
        </label>

        <label>
          Login email
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required style={{ display: "block", width: "100%", padding: 10, marginTop: 6 }} />
        </label>

        <label>
          Test password
          <input type="password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} required style={{ display: "block", width: "100%", padding: 10, marginTop: 6 }} />
          <small>Minimum 12 characters. Replace test credentials before real production use.</small>
        </label>

        {roleCode === "MANAGEMENT_ADMIN" ? (
          <label>
            {targetLabel}
            <select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} required style={{ display: "block", width: "100%", padding: 10, marginTop: 6 }}>
              <option value="">Select organization</option>
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.display_name || organization.name} ({organization.organization_code})
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label>
            {targetLabel}
            <select value={institutionId} onChange={(event) => setInstitutionId(event.target.value)} required style={{ display: "block", width: "100%", padding: 10, marginTop: 6 }}>
              <option value="">Select institution</option>
              {institutions.map((institution) => (
                <option key={institution.id} value={institution.id}>
                  {institution.display_name || institution.official_name} ({institution.institution_code})
                </option>
              ))}
            </select>
          </label>
        )}

        <button type="submit" disabled={saving || !currentUser?.is_platform_admin} style={{ padding: "11px 16px", fontWeight: 700 }}>
          {saving ? "Creating…" : "Create / reset user"}
        </button>
      </form>

      {message ? <p style={{ marginTop: 18, fontWeight: 700 }}>{message}</p> : null}
      {error ? <p style={{ marginTop: 18, color: "crimson", fontWeight: 700 }}>{error}</p> : null}

      <p style={{ marginTop: 28 }}>
        <Link href="/">← Back to School foundation setup</Link>
      </p>
    </main>
  );
}
