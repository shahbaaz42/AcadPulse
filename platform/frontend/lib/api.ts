export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

const ACCESS_TOKEN_KEY = "acadpulse_access_token";
export const AUTH_CHANGED_EVENT = "acadpulse:auth-changed";

export type ApiErrorBody = {
  detail?: string | Array<{ msg?: string }>;
};

export type ApiRequestOptions = RequestInit & {
  auth?: boolean;
};

export type AuthTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

export type AccessAssignment = {
  role_code: string;
  role_name: string;
  scope_type: "platform" | "organization" | "institution" | "academic_compartment";
  organization_id: string | null;
  institution_id: string | null;
  academic_division_id: string | null;
};

export type CurrentUser = {
  id: string;
  email: string;
  display_name: string;
  is_platform_admin: boolean;
  assignments: AccessAssignment[];
};

function errorMessage(body: ApiErrorBody | null, fallback: string) {
  if (!body?.detail) return fallback;
  if (typeof body.detail === "string") return body.detail;
  const messages = body.detail.map((item) => item.msg).filter(Boolean);
  return messages.length ? messages.join(", ") : fallback;
}

function notifyAuthChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export function getAccessToken() {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setAccessToken(token: string) {
  if (typeof window === "undefined") return;
  const currentToken = window.sessionStorage.getItem(ACCESS_TOKEN_KEY);
  if (currentToken === token) return;
  window.sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
  notifyAuthChanged();
}

export function clearAccessToken() {
  if (typeof window === "undefined") return;
  const hadToken = window.sessionStorage.getItem(ACCESS_TOKEN_KEY) !== null;
  if (!hadToken) return;
  window.sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  notifyAuthChanged();
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { auth = true, ...requestOptions } = options;
  const token = auth ? getAccessToken() : null;
  const headers = new Headers(requestOptions.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...requestOptions,
    headers,
  });

  if (!response.ok) {
    if (response.status === 401 && auth) clearAccessToken();
    let body: ApiErrorBody | null = null;
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      // Keep a useful fallback when the backend returns a non-JSON response.
    }
    throw new Error(errorMessage(body, `Request failed (${response.status})`));
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export type Organization = {
  id: string;
  organization_code: string;
  name: string;
  display_name: string | null;
  status: string;
};

export type Institution = {
  id: string;
  institution_code: string;
  official_name: string;
  display_name: string | null;
};

export type AdminUserProvisioned = {
  id: string;
  email: string;
  display_name: string;
  role_code: "MANAGEMENT_ADMIN" | "PRINCIPAL" | "SCHOOL_ADMIN" | "COMPARTMENT_HEAD";
  role_name: string;
  scope_type: "organization" | "institution" | "academic_compartment";
  organization_id: string | null;
  institution_id: string | null;
  academic_division_ids: string[];
};

export type PrincipalManagedUser = {
  id: string;
  email: string;
  display_name: string;
  status: "active" | "inactive";
  role_code: "SCHOOL_ADMIN" | "COMPARTMENT_HEAD";
  role_name: string;
  institution_id: string;
  academic_division_ids: string[];
};

export type AcademicYear = {
  id: string;
  institution_id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: string;
  is_current: boolean;
};

export type AcademicDivision = {
  id: string;
  institution_id: string;
  code: string;
  name: string;
  display_order: number;
};

export type GradeLevel = {
  id: string;
  institution_id: string;
  code: string;
  display_name: string;
  level_order: number;
};

export type AcademicDivisionGradeLevel = {
  id: string;
  institution_id: string;
  academic_year_id: string;
  academic_division_id: string;
  grade_level_id: string;
  sequence_no: number | null;
};

export type ClassGroup = {
  id: string;
  institution_id: string;
  academic_year_id: string;
  grade_level_id: string;
  section_code: string;
  display_name: string;
  capacity: number | null;
};

export type StaffProfile = {
  id: string;
  institution_id: string;
  user_id: string | null;
  employee_code: string | null;
  full_name: string;
  staff_type: "TEACHING" | "NON_TEACHING";
  is_active: boolean;
  academic_division_ids: string[];
  created_at: string;
  updated_at: string;
};