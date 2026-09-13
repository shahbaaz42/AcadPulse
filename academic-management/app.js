(() => {
  "use strict";

  const API_ROOT = "https://acadpulse-api.onrender.com";
  const API_BASE = `${API_ROOT}/api/v1`;
  const CONTEXT_KEY = "acadpulse-academic-management-context-v1";
  const $ = (id) => document.getElementById(id);

  const state = {
    institutions: [],
    years: [],
    divisions: [],
    grades: [],
    mappings: [],
    classes: [],
    selectedInstitutionId: "",
    selectedYearId: "",
  };

  function loadContext() {
    try {
      const saved = JSON.parse(localStorage.getItem(CONTEXT_KEY) || "null");
      if (saved && typeof saved === "object") {
        state.selectedInstitutionId = saved.selectedInstitutionId || "";
        state.selectedYearId = saved.selectedYearId || "";
      }
    } catch {
      // Current selection is optional; ignore malformed browser state.
    }
  }

  function saveContext() {
    localStorage.setItem(CONTEXT_KEY, JSON.stringify({
      selectedInstitutionId: state.selectedInstitutionId,
      selectedYearId: state.selectedYearId,
    }));
  }

  function notice(text, error = false) {
    const box = $("notice");
    box.textContent = text;
    box.className = `notice${error ? " error" : ""}`;
    box.hidden = false;
    clearTimeout(notice.timer);
    notice.timer = setTimeout(() => { box.hidden = true; }, 3600);
  }

  function setApiStatus(ok, message) {
    $("apiStatus").textContent = message;
    $("apiBadge").textContent = ok ? "Cloud Connected" : "API Unavailable";
    $("apiBadge").classList.toggle("connected", ok);
    $("apiBadge").classList.toggle("disconnected", !ok);
  }

  async function api(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });

    if (!response.ok) {
      let message = `Request failed (${response.status})`;
      try {
        const body = await response.json();
        if (typeof body.detail === "string") message = body.detail;
        else if (Array.isArray(body.detail) && body.detail[0]?.msg) message = body.detail[0].msg;
      } catch {
        // Keep fallback status message.
      }
      throw new Error(message);
    }

    if (response.status === 204) return null;
    return response.json();
  }

  function query(params) {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) search.set(key, value);
    });
    const text = search.toString();
    return text ? `?${text}` : "";
  }

  function currentInstitution() {
    return state.institutions.find((item) => item.id === state.selectedInstitutionId) || null;
  }

  function currentYear() {
    return state.years.find((item) => item.id === state.selectedYearId) || null;
  }

  function mappedGradeIds() {
    return new Set(state.mappings.map((item) => item.grade_level_id));
  }

  function mappedGrades() {
    const ids = mappedGradeIds();
    return state.grades.filter((item) => ids.has(item.id));
  }

  function renderSelect(select, items, placeholder, labelFn) {
    const current = select.value;
    select.innerHTML = `<option value="">${placeholder}</option>` + items
      .map((item) => `<option value="${item.id}">${labelFn(item)}</option>`)
      .join("");
    if (items.some((item) => item.id === current)) select.value = current;
  }

  function previousYear() {
    const current = currentYear();
    if (!current) return null;
    return state.years
      .filter((item) => item.id !== current.id && item.start_date < current.start_date)
      .sort((a, b) => b.start_date.localeCompare(a.start_date))[0] || null;
  }

  function render() {
    renderSelect($("institutionSelect"), state.institutions, "Select institution", (item) => item.display_name || item.official_name);
    $("institutionSelect").value = state.selectedInstitutionId;

    renderSelect($("yearSelect"), state.years, "Select academic year", (item) => item.name);
    $("yearSelect").disabled = !state.selectedInstitutionId;
    $("yearSelect").value = state.selectedYearId;

    const institution = currentInstitution();
    $("contextTitle").textContent = institution ? (institution.display_name || institution.official_name) : "No institution selected";

    renderSelect(document.querySelector('#mappingForm select[name="gradeId"]'), state.grades, "Select grade", (item) => item.display_name);
    renderSelect(document.querySelector('#mappingForm select[name="divisionId"]'), state.divisions, "Select division", (item) => item.name);
    renderSelect(document.querySelector('#classForm select[name="gradeId"]'), mappedGrades(), "Select mapped grade", (item) => item.display_name);

    $("institutionCount").textContent = `${state.institutions.length} created`;
    $("divisionCount").textContent = `${state.divisions.length} created`;
    $("gradeCount").textContent = `${state.grades.length} grades`;
    $("yearCount").textContent = `${state.years.length} created`;
    $("mappingCount").textContent = `${state.mappings.length} mapped`;
    $("classCount").textContent = `${state.classes.length} created`;

    $("summaryYears").textContent = state.years.length;
    $("summaryDivisions").textContent = state.divisions.length;
    $("summaryGrades").textContent = state.grades.length;
    $("summaryClasses").textContent = state.classes.length;

    const hasInstitution = Boolean(state.selectedInstitutionId);
    const hasYear = Boolean(state.selectedYearId);
    $("divisionCard").classList.toggle("locked", !hasInstitution);
    $("gradeCard").classList.toggle("locked", !hasInstitution);
    $("yearCard").classList.toggle("locked", !hasInstitution);
    $("mappingCard").classList.toggle("locked", !hasInstitution || !hasYear || !state.divisions.length || !state.grades.length);
    $("classCard").classList.toggle("locked", !hasInstitution || !hasYear || !state.mappings.length);

    const prior = previousYear();
    $("copyPreviousYear").disabled = !prior;
    $("copyPreviousYear").textContent = prior ? `Copy Structure from ${prior.name}` : "Copy Previous Year Structure";

    saveContext();
  }

  async function loadYearContext() {
    if (!state.selectedInstitutionId || !state.selectedYearId) {
      state.mappings = [];
      state.classes = [];
      render();
      return;
    }

    [state.mappings, state.classes] = await Promise.all([
      api(`/academic-division-grade-levels${query({ institution_id: state.selectedInstitutionId, academic_year_id: state.selectedYearId })}`),
      api(`/class-groups${query({ institution_id: state.selectedInstitutionId, academic_year_id: state.selectedYearId })}`),
    ]);
    render();
  }

  async function loadInstitutionContext({ preserveYear = true } = {}) {
    if (!state.selectedInstitutionId) {
      state.years = [];
      state.divisions = [];
      state.grades = [];
      state.mappings = [];
      state.classes = [];
      state.selectedYearId = "";
      render();
      return;
    }

    [state.years, state.divisions, state.grades] = await Promise.all([
      api(`/academic-years${query({ institution_id: state.selectedInstitutionId })}`),
      api(`/academic-divisions${query({ institution_id: state.selectedInstitutionId })}`),
      api(`/grade-levels${query({ institution_id: state.selectedInstitutionId })}`),
    ]);

    if (!preserveYear || !state.years.some((item) => item.id === state.selectedYearId)) {
      state.selectedYearId = state.years.find((item) => item.is_current)?.id || state.years[0]?.id || "";
    }
    await loadYearContext();
  }

  async function initialize() {
    loadContext();
    try {
      const health = await fetch(`${API_ROOT}/health/db`);
      if (!health.ok) throw new Error("Database health check failed");
      setApiStatus(true, "Connected to the AcadPulse PostgreSQL platform database.");

      state.institutions = await api("/institutions");
      if (!state.institutions.some((item) => item.id === state.selectedInstitutionId)) {
        state.selectedInstitutionId = state.institutions[0]?.id || "";
        state.selectedYearId = "";
      }
      await loadInstitutionContext();
    } catch (error) {
      setApiStatus(false, "Could not reach the AcadPulse platform API. The free backend may still be waking up; retry shortly.");
      notice(error.message || "Could not connect to AcadPulse API.", true);
      render();
    }
  }

  $("institutionForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const item = await api("/institutions", {
        method: "POST",
        body: JSON.stringify({
          institution_code: String(data.get("code") || "").trim(),
          official_name: String(data.get("name") || "").trim(),
          display_name: String(data.get("displayName") || "").trim() || null,
          timezone: "Asia/Kolkata",
          status: "active",
        }),
      });
      state.institutions.push(item);
      state.institutions.sort((a, b) => a.official_name.localeCompare(b.official_name));
      state.selectedInstitutionId = item.id;
      state.selectedYearId = "";
      form.reset();
      await loadInstitutionContext({ preserveYear: false });
      notice("Institution saved to PostgreSQL.");
    } catch (error) {
      notice(error.message, true);
    }
  });

  $("divisionForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await api("/academic-divisions", {
        method: "POST",
        body: JSON.stringify({
          institution_id: state.selectedInstitutionId,
          code: String(data.get("code") || "").trim(),
          name: String(data.get("name") || "").trim(),
          display_order: Number(data.get("order")) || 1,
          is_active: true,
        }),
      });
      form.reset();
      form.elements.order.value = 1;
      state.divisions = await api(`/academic-divisions${query({ institution_id: state.selectedInstitutionId })}`);
      render();
      notice("Academic division saved permanently.");
    } catch (error) {
      notice(error.message, true);
    }
  });

  $("gradeForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await api("/grade-levels", {
        method: "POST",
        body: JSON.stringify({
          institution_id: state.selectedInstitutionId,
          code: String(data.get("code") || "").trim(),
          display_name: String(data.get("name") || "").trim(),
          level_order: Number(data.get("order")) || 1,
          is_active: true,
        }),
      });
      form.reset();
      state.grades = await api(`/grade-levels${query({ institution_id: state.selectedInstitutionId })}`);
      render();
      notice("Grade saved permanently. Map it to an academic year when needed.");
    } catch (error) {
      notice(error.message, true);
    }
  });

  $("yearForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const startDate = String(data.get("startDate") || "");
    const endDate = String(data.get("endDate") || "");
    if (!startDate || !endDate || endDate <= startDate) return notice("End date must be after start date.", true);

    try {
      const item = await api("/academic-years", {
        method: "POST",
        body: JSON.stringify({
          institution_id: state.selectedInstitutionId,
          name: String(data.get("name") || "").trim(),
          start_date: startDate,
          end_date: endDate,
          status: "draft",
          is_current: false,
        }),
      });
      form.reset();
      state.years = await api(`/academic-years${query({ institution_id: state.selectedInstitutionId })}`);
      state.selectedYearId = item.id;
      await loadYearContext();
      notice("Academic year created. You can now map grades or copy the previous year's structure.");
    } catch (error) {
      notice(error.message, true);
    }
  });

  $("mappingForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await api("/academic-division-grade-levels", {
        method: "POST",
        body: JSON.stringify({
          institution_id: state.selectedInstitutionId,
          academic_year_id: state.selectedYearId,
          academic_division_id: String(data.get("divisionId") || ""),
          grade_level_id: String(data.get("gradeId") || ""),
          sequence_no: Number(data.get("sequence")) || null,
        }),
      });
      form.reset();
      state.mappings = await api(`/academic-division-grade-levels${query({ institution_id: state.selectedInstitutionId, academic_year_id: state.selectedYearId })}`);
      render();
      notice("Grade mapped for the selected academic year.");
    } catch (error) {
      notice(error.message, true);
    }
  });

  $("classForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await api("/class-groups", {
        method: "POST",
        body: JSON.stringify({
          institution_id: state.selectedInstitutionId,
          academic_year_id: state.selectedYearId,
          grade_level_id: String(data.get("gradeId") || ""),
          section_code: String(data.get("section") || "").trim(),
          display_name: String(data.get("displayName") || "").trim(),
          capacity: Number(data.get("capacity")) || null,
          status: "active",
        }),
      });
      form.reset();
      state.classes = await api(`/class-groups${query({ institution_id: state.selectedInstitutionId, academic_year_id: state.selectedYearId })}`);
      render();
      notice("Class section saved for the selected academic year.");
    } catch (error) {
      notice(error.message, true);
    }
  });

  $("copyPreviousYear").addEventListener("click", async () => {
    const source = previousYear();
    const target = currentYear();
    if (!source || !target) return;
    if (!confirm(`Copy grade mappings and class sections from ${source.name} into ${target.name}? Existing items will be kept.`)) return;

    const button = $("copyPreviousYear");
    button.disabled = true;
    button.textContent = "Copying…";

    try {
      const [sourceMappings, sourceClasses] = await Promise.all([
        api(`/academic-division-grade-levels${query({ institution_id: state.selectedInstitutionId, academic_year_id: source.id })}`),
        api(`/class-groups${query({ institution_id: state.selectedInstitutionId, academic_year_id: source.id })}`),
      ]);

      const existingMappings = new Set(state.mappings.map((item) => item.grade_level_id));
      let copiedMappings = 0;
      for (const mapping of sourceMappings) {
        if (existingMappings.has(mapping.grade_level_id)) continue;
        await api("/academic-division-grade-levels", {
          method: "POST",
          body: JSON.stringify({
            institution_id: state.selectedInstitutionId,
            academic_year_id: target.id,
            academic_division_id: mapping.academic_division_id,
            grade_level_id: mapping.grade_level_id,
            sequence_no: mapping.sequence_no,
          }),
        });
        existingMappings.add(mapping.grade_level_id);
        copiedMappings += 1;
      }

      const existingClasses = new Set(state.classes.map((item) => `${item.grade_level_id}::${item.section_code.toLowerCase()}`));
      let copiedClasses = 0;
      for (const classGroup of sourceClasses) {
        const key = `${classGroup.grade_level_id}::${classGroup.section_code.toLowerCase()}`;
        if (existingClasses.has(key)) continue;
        await api("/class-groups", {
          method: "POST",
          body: JSON.stringify({
            institution_id: state.selectedInstitutionId,
            academic_year_id: target.id,
            grade_level_id: classGroup.grade_level_id,
            section_code: classGroup.section_code,
            display_name: classGroup.display_name,
            capacity: classGroup.capacity,
            status: "active",
          }),
        });
        existingClasses.add(key);
        copiedClasses += 1;
      }

      await loadYearContext();
      notice(`Copied ${copiedMappings} grade mappings and ${copiedClasses} class sections from ${source.name}.`);
    } catch (error) {
      notice(error.message, true);
      render();
    }
  });

  $("institutionSelect").addEventListener("change", async (event) => {
    state.selectedInstitutionId = event.target.value;
    state.selectedYearId = "";
    try {
      await loadInstitutionContext({ preserveYear: false });
    } catch (error) {
      notice(error.message, true);
    }
  });

  $("yearSelect").addEventListener("change", async (event) => {
    state.selectedYearId = event.target.value;
    try {
      await loadYearContext();
    } catch (error) {
      notice(error.message, true);
    }
  });

  initialize();
})();
