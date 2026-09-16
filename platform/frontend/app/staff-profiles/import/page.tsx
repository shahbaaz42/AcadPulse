"use client";

import ExcelJS from "exceljs";
import Link from "next/link";
import { ChangeEvent, useEffect, useMemo, useState, type CSSProperties } from "react";

import {
  AcademicDivision,
  CurrentUser,
  Institution,
  StaffProfile,
  apiRequest,
} from "../../../lib/api";

type StaffType = "TEACHING" | "NON_TEACHING";
type PreviewStatus = "READY" | "SKIP" | "ERROR";
type Notice = { type: "success" | "error"; text: string } | null;

type PreviewRow = {
  sourceRow: number;
  fullName: string;
  employeeCode: string;
  staffType: StaffType | null;
  compartmentLabel: string;
  academicDivisionIds: string[];
  status: PreviewStatus;
  message: string;
};

type BulkImportResult = {
  created_count: number;
  skipped_count: number;
  profiles: StaffProfile[];
  skipped: Array<{ row_number: number; full_name: string; reason: string }>;
};

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

const HEADER_ALIASES = {
  fullName: ["full name", "staff name", "name"],
  employeeCode: ["employee id / code", "employee id", "employee code", "staff code"],
  staffType: ["staff classification", "classification", "staff type"],
  compartment: ["academic compartment", "academic compartments", "compartment", "compartments"],
};

function normaliseHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.text === "string") return record.text.trim();
    if (record.result !== undefined) return cellText(record.result);
    if (Array.isArray(record.richText)) {
      return record.richText
        .map((part) => typeof part === "object" && part && "text" in part ? String((part as { text: unknown }).text ?? "") : "")
        .join("")
        .trim();
    }
  }
  return String(value).trim();
}

function staffTypeFromText(value: string): StaffType | null {
  const compact = value.trim().toUpperCase().replace(/[-_\s]+/g, "");
  if (compact === "TEACHING" || compact === "TEACHINGSTAFF") return "TEACHING";
  if (compact === "NONTEACHING" || compact === "NONTEACHINGSTAFF") return "NON_TEACHING";
  return null;
}

function identityKey(fullName: string, staffType: StaffType, employeeCode: string) {
  const code = employeeCode.trim().toUpperCase();
  if (code) return `code:${code}`;
  return `name:${fullName.trim().toLocaleLowerCase()}:${staffType}`;
}

function matchHeader(headers: string[], aliases: string[]) {
  return headers.findIndex((header) => aliases.includes(normaliseHeader(header)));
}

export default function StaffBulkImportPage() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [selectedInstitutionId, setSelectedInstitutionId] = useState("");
  const [divisions, setDivisions] = useState<AcademicDivision[]>([]);
  const [existingProfiles, setExistingProfiles] = useState<StaffProfile[]>([]);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [sourceFileName, setSourceFileName] = useState("");
  const [sourceSheetName, setSourceSheetName] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [readingFile, setReadingFile] = useState(false);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [fileInputKey, setFileInputKey] = useState(0);

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
        ["PRINCIPAL", "SCHOOL_ADMIN"].includes(assignment.role_code),
    );
  }, [currentUser, selectedInstitutionId]);

  const institutionWideSingle = Boolean(
    currentUser && !currentUser.is_platform_admin && institutions.length === 1,
  );

  const readyCount = previewRows.filter((row) => row.status === "READY").length;
  const skipCount = previewRows.filter((row) => row.status === "SKIP").length;
  const errorCount = previewRows.filter((row) => row.status === "ERROR").length;

  async function loadInstitutionData(institutionId: string) {
    if (!institutionId) {
      setDivisions([]);
      setExistingProfiles([]);
      return;
    }
    const [divisionData, profileData] = await Promise.all([
      apiRequest<AcademicDivision[]>(`/api/v1/academic-divisions?institution_id=${institutionId}`),
      apiRequest<StaffProfile[]>(`/api/v1/staff-profiles?institution_id=${institutionId}&include_inactive=true`),
    ]);
    setDivisions(divisionData);
    setExistingProfiles(profileData);
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
    setPreviewRows([]);
    setSourceFileName("");
    setSourceSheetName("");
    setFileInputKey((value) => value + 1);
    if (!selectedInstitutionId) return;
    loadInstitutionData(selectedInstitutionId).catch((error: Error) => {
      setNotice({ type: "error", text: error.message });
    });
  }, [selectedInstitutionId]);

  function divisionIdsFromText(value: string): { ids: string[]; unknown: string[] } {
    const tokens = value
      .split(/[;,|]/)
      .map((token) => token.trim())
      .filter(Boolean);
    const ids: string[] = [];
    const unknown: string[] = [];
    for (const token of tokens) {
      const normalised = token.toLocaleLowerCase();
      const match = divisions.find(
        (division) =>
          division.code.trim().toLocaleLowerCase() === normalised ||
          division.name.trim().toLocaleLowerCase() === normalised,
      );
      if (match) {
        if (!ids.includes(match.id)) ids.push(match.id);
      } else {
        unknown.push(token);
      }
    }
    return { ids, unknown };
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setNotice(null);
    setPreviewRows([]);
    setSourceFileName("");
    setSourceSheetName("");

    if (!canManageStaff) {
      setNotice({ type: "error", text: "Principal or School Admin access is required to import Staff Profiles." });
      return;
    }
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setNotice({ type: "error", text: "Please select an .xlsx workbook. Use the Staff Import Ready sheet from the AcadPulse workbook." });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setNotice({ type: "error", text: "The workbook is larger than 10 MB. Please use a staff-only import workbook." });
      return;
    }

    setReadingFile(true);
    try {
      const workbook = new ExcelJS.Workbook();
      const buffer = await file.arrayBuffer();
      await workbook.xlsx.load(buffer as never);
      const worksheet = workbook.getWorksheet("Staff Import Ready") ?? workbook.worksheets[0];
      if (!worksheet) throw new Error("No readable worksheet was found in the workbook.");

      let headerRowNumber = 0;
      let headerIndexes: { fullName: number; employeeCode: number; staffType: number; compartment: number } | null = null;

      for (let rowNumber = 1; rowNumber <= Math.min(worksheet.rowCount, 25); rowNumber += 1) {
        const row = worksheet.getRow(rowNumber);
        const headers = Array.from({ length: Math.max(worksheet.columnCount, row.cellCount) }, (_, index) =>
          cellText(row.getCell(index + 1).value),
        );
        const fullName = matchHeader(headers, HEADER_ALIASES.fullName);
        const staffType = matchHeader(headers, HEADER_ALIASES.staffType);
        if (fullName < 0 || staffType < 0) continue;
        headerRowNumber = rowNumber;
        headerIndexes = {
          fullName: fullName + 1,
          employeeCode: matchHeader(headers, HEADER_ALIASES.employeeCode) + 1,
          staffType: staffType + 1,
          compartment: matchHeader(headers, HEADER_ALIASES.compartment) + 1,
        };
        break;
      }

      if (!headerIndexes || !headerRowNumber) {
        throw new Error("Could not find the required Full Name and Staff Classification columns.");
      }
      if (headerIndexes.compartment <= 0) {
        throw new Error("Could not find the Academic Compartment column.");
      }

      const existingKeys = new Set(
        existingProfiles.map((profile) =>
          identityKey(profile.full_name, profile.staff_type, profile.employee_code ?? ""),
        ),
      );
      const seenFileKeys = new Set<string>();
      const rows: PreviewRow[] = [];

      for (let rowNumber = headerRowNumber + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
        const row = worksheet.getRow(rowNumber);
        const fullName = cellText(row.getCell(headerIndexes.fullName).value);
        const employeeCode = headerIndexes.employeeCode > 0
          ? cellText(row.getCell(headerIndexes.employeeCode).value).toUpperCase()
          : "";
        const staffTypeText = cellText(row.getCell(headerIndexes.staffType).value);
        const compartmentLabel = cellText(row.getCell(headerIndexes.compartment).value);

        if (!fullName && !employeeCode && !staffTypeText && !compartmentLabel) continue;
        const staffType = staffTypeFromText(staffTypeText);
        const { ids, unknown } = divisionIdsFromText(compartmentLabel);
        let status: PreviewStatus = "READY";
        let message = "Ready to import";

        if (!fullName) {
          status = "ERROR";
          message = "Full Name is required";
        } else if (!staffType) {
          status = "ERROR";
          message = `Unknown Staff Classification: ${staffTypeText || "blank"}`;
        } else if (unknown.length) {
          status = "ERROR";
          message = `Unknown Academic Compartment: ${unknown.join(", ")}`;
        } else if (staffType === "TEACHING" && !ids.length) {
          status = "ERROR";
          message = "Teaching Staff must have at least one Academic Compartment in this bulk import";
        } else if (staffType === "NON_TEACHING" && ids.length) {
          status = "ERROR";
          message = "Non-Teaching Staff cannot receive Academic Compartment placement";
        } else {
          const key = identityKey(fullName, staffType, employeeCode);
          if (existingKeys.has(key)) {
            status = "SKIP";
            message = "Already exists in this institution";
          } else if (seenFileKeys.has(key)) {
            status = "SKIP";
            message = "Duplicate row in this workbook";
          } else {
            seenFileKeys.add(key);
          }
        }

        rows.push({
          sourceRow: rowNumber,
          fullName,
          employeeCode,
          staffType,
          compartmentLabel,
          academicDivisionIds: staffType === "NON_TEACHING" ? [] : ids,
          status,
          message,
        });
      }

      if (!rows.length) throw new Error("No staff rows were found below the workbook headers.");
      if (rows.length > 500) throw new Error("A maximum of 500 Staff Profiles can be imported at one time.");

      setSourceFileName(file.name);
      setSourceSheetName(worksheet.name);
      setPreviewRows(rows);
      setNotice({
        type: errorCount ? "error" : "success",
        text: `Workbook parsed locally. Review the preview before importing.`,
      });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Unable to read workbook" });
    } finally {
      setReadingFile(false);
    }
  }

  async function importReadyRows() {
    if (!selectedInstitutionId || !canManageStaff || !readyCount) return;
    const ready = previewRows.filter(
      (row): row is PreviewRow & { staffType: StaffType } => row.status === "READY" && row.staffType !== null,
    );
    setImporting(true);
    setNotice(null);
    try {
      const result = await apiRequest<BulkImportResult>("/api/v1/staff-profiles/bulk", {
        method: "POST",
        body: JSON.stringify({
          institution_id: selectedInstitutionId,
          items: ready.map((row) => ({
            full_name: row.fullName,
            employee_code: row.employeeCode || null,
            staff_type: row.staffType,
            academic_division_ids: row.academicDivisionIds,
          })),
        }),
      });
      await loadInstitutionData(selectedInstitutionId);
      setPreviewRows([]);
      setSourceFileName("");
      setSourceSheetName("");
      setFileInputKey((value) => value + 1);
      setNotice({
        type: "success",
        text: `Bulk import completed: ${result.created_count} Staff Profiles created${result.skipped_count ? `, ${result.skipped_count} skipped by the server` : ""}.`,
      });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Bulk import failed" });
    } finally {
      setImporting(false);
    }
  }

  if (!loaded) {
    return <main style={{ maxWidth: 1100, margin: "48px auto", padding: 24 }}><p>Loading Staff Bulk Import…</p></main>;
  }

  if (!currentUser) {
    return (
      <main style={{ maxWidth: 800, margin: "48px auto", padding: 24 }}>
        <h1>Staff Bulk Import unavailable</h1>
        <p>{notice?.text || "Please sign in to AcadPulse before opening this page."}</p>
        <Link href="/">Return to AcadPulse</Link>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 1220, margin: "32px auto 64px", padding: "0 22px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20, flexWrap: "wrap", marginBottom: 24 }}>
        <div>
          <p style={{ margin: "0 0 6px", color: "#52617a", fontWeight: 700 }}>AcadPulse — Academic Intelligence &amp; Management Platform</p>
          <h1 style={{ margin: 0, fontSize: "clamp(1.75rem, 4vw, 2.5rem)", color: "#172033" }}>Bulk Import Staff</h1>
          <p style={{ maxWidth: 780, color: "#5d687b", lineHeight: 1.6 }}>
            Validate an AcadPulse staff workbook in your browser, preview duplicates and errors, then create the approved Staff Profiles in one controlled import.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="secondary-button" href="/staff-profiles">Staff Directory</Link>
          <Link className="secondary-button" href="/">School Foundation</Link>
        </div>
      </header>

      {notice ? <div className={`notice ${notice.type}`} style={{ marginBottom: 18 }}>{notice.text}</div> : null}

      <section style={{ ...cardStyle, padding: 20, marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 16, alignItems: "end" }}>
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
            <p style={{ margin: "0 0 4px", fontSize: ".78rem", fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: ".05em" }}>Import access</p>
            <strong style={{ color: canManageStaff ? "#166534" : "#991b1b" }}>
              {canManageStaff ? "Principal / School Admin bulk import enabled" : "Bulk import not permitted for this role"}
            </strong>
          </div>
        </div>
      </section>

      {canManageStaff ? (
        <section style={{ ...cardStyle, padding: 22, marginBottom: 20 }}>
          <h2 style={{ marginTop: 0 }}>1. Select Staff Import workbook</h2>
          <p style={{ color: "#64748b", lineHeight: 1.6 }}>
            Use an <strong>.xlsx</strong> workbook containing the columns <strong>Full Name</strong>, <strong>Employee ID / Code</strong>, <strong>Staff Classification</strong> and <strong>Academic Compartment</strong>. AcadPulse prefers a sheet named <strong>Staff Import Ready</strong>. The file itself stays in your browser; only validated staff records are sent to the API when you confirm import.
          </p>
          <input
            key={fileInputKey}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={handleFile}
            disabled={readingFile || importing || !selectedInstitutionId}
            style={{ marginTop: 8 }}
          />
          {readingFile ? <p style={{ color: "#52617a" }}>Reading and validating workbook…</p> : null}
          {sourceFileName ? (
            <p style={{ marginBottom: 0, color: "#52617a" }}><strong>Loaded:</strong> {sourceFileName} · Sheet: {sourceSheetName}</p>
          ) : null}
        </section>
      ) : (
        <section style={{ ...cardStyle, padding: 22, marginBottom: 20, background: "#fff8f8" }}>
          <h2 style={{ marginTop: 0 }}>Bulk import is restricted</h2>
          <p style={{ marginBottom: 0, color: "#64748b" }}>Only the Principal, School Admin or Platform Admin can create Staff Profiles in bulk.</p>
        </section>
      )}

      {previewRows.length ? (
        <section style={{ ...cardStyle, padding: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 18 }}>
            <div>
              <h2 style={{ margin: 0 }}>2. Review import preview</h2>
              <p style={{ margin: "6px 0 0", color: "#64748b" }}>Nothing is written to AcadPulse until you click Import Ready Staff.</p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span style={{ padding: "7px 10px", borderRadius: 999, background: "#dcfce7", fontWeight: 800 }}>Ready {readyCount}</span>
              <span style={{ padding: "7px 10px", borderRadius: 999, background: "#fef3c7", fontWeight: 800 }}>Skip {skipCount}</span>
              <span style={{ padding: "7px 10px", borderRadius: 999, background: "#fee2e2", fontWeight: 800 }}>Errors {errorCount}</span>
            </div>
          </div>

          <div style={{ overflowX: "auto", maxHeight: 560, border: "1px solid #e5e7eb", borderRadius: 10 }}>
            <table className="records-table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Workbook Row</th>
                  <th>Full Name</th>
                  <th>Employee ID</th>
                  <th>Classification</th>
                  <th>Academic Compartment</th>
                  <th>Status</th>
                  <th>Validation</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row) => (
                  <tr key={`${row.sourceRow}-${row.fullName}`}>
                    <td>{row.sourceRow}</td>
                    <td><strong>{row.fullName || "—"}</strong></td>
                    <td>{row.employeeCode || "—"}</td>
                    <td>{row.staffType === "TEACHING" ? "Teaching Staff" : row.staffType === "NON_TEACHING" ? "Non-Teaching Staff" : "—"}</td>
                    <td>{row.compartmentLabel || "—"}</td>
                    <td><strong>{row.status}</strong></td>
                    <td>{row.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 18, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <button className="primary-button" type="button" onClick={importReadyRows} disabled={importing || readyCount === 0 || errorCount > 0}>
              {importing ? "Importing…" : `Import Ready Staff (${readyCount})`}
            </button>
            {errorCount > 0 ? <span style={{ color: "#991b1b", fontWeight: 700 }}>Correct all ERROR rows before import.</span> : null}
            {skipCount > 0 ? <span style={{ color: "#854d0e" }}>SKIP rows are not sent to the server.</span> : null}
          </div>
        </section>
      ) : null}
    </main>
  );
}
