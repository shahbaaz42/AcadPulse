export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

export type ApiErrorBody = {
  detail?: string | Array<{ msg?: string }>;
};

function errorMessage(body: ApiErrorBody | null, fallback: string) {
  if (!body?.detail) return fallback;
  if (typeof body.detail === "string") return body.detail;
  const messages = body.detail.map((item) => item.msg).filter(Boolean);
  return messages.length ? messages.join(", ") : fallback;
}

export async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });

  if (!response.ok) {
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

export type Institution = {
  id: string;
  institution_code: string;
  official_name: string;
  display_name: string | null;
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

export type ClassGroup = {
  id: string;
  institution_id: string;
  academic_year_id: string;
  grade_level_id: string;
  section_code: string;
  display_name: string;
  capacity: number | null;
};
