(() => {
  "use strict";

  const STORAGE_KEY = "acadpulse-academic-management-preview-v1";
  const $ = (id) => document.getElementById(id);
  const state = loadState();

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      return parsed && typeof parsed === "object"
        ? parsed
        : { institutions: [], years: [], divisions: [], grades: [], classes: [], selectedInstitutionId: "", selectedYearId: "" };
    } catch {
      return { institutions: [], years: [], divisions: [], grades: [], classes: [], selectedInstitutionId: "", selectedYearId: "" };
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function id() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function notice(text, error = false) {
    const box = $("notice");
    box.textContent = text;
    box.className = `notice${error ? " error" : ""}`;
    box.hidden = false;
    clearTimeout(notice.timer);
    notice.timer = setTimeout(() => { box.hidden = true; }, 2600);
  }

  function currentInstitution() {
    return state.institutions.find((item) => item.id === state.selectedInstitutionId) || null;
  }

  function currentYears() {
    return state.years.filter((item) => item.institutionId === state.selectedInstitutionId);
  }

  function currentDivisions() {
    return state.divisions.filter((item) => item.institutionId === state.selectedInstitutionId);
  }

  function currentGrades() {
    return state.grades.filter((item) => item.institutionId === state.selectedInstitutionId && item.yearId === state.selectedYearId);
  }

  function currentClasses() {
    return state.classes.filter((item) => item.institutionId === state.selectedInstitutionId && item.yearId === state.selectedYearId);
  }

  function renderSelect(select, items, placeholder, labelFn) {
    const current = select.value;
    select.innerHTML = `<option value="">${placeholder}</option>` + items.map((item) => `<option value="${item.id}">${labelFn(item)}</option>`).join("");
    if (items.some((item) => item.id === current)) select.value = current;
  }

  function render() {
    renderSelect($("institutionSelect"), state.institutions, "Select institution", (item) => item.displayName || item.name);
    $("institutionSelect").value = state.selectedInstitutionId;

    const years = currentYears();
    renderSelect($("yearSelect"), years, "Select academic year", (item) => item.name);
    $("yearSelect").disabled = !state.selectedInstitutionId;
    if (!years.some((item) => item.id === state.selectedYearId)) state.selectedYearId = years[0]?.id || "";
    $("yearSelect").value = state.selectedYearId;

    const institution = currentInstitution();
    $("contextTitle").textContent = institution ? (institution.displayName || institution.name) : "No institution selected";

    const divisions = currentDivisions();
    const grades = currentGrades();
    const classes = currentClasses();

    renderSelect(document.querySelector('#gradeForm select[name="divisionId"]'), divisions, "Select division", (item) => item.name);
    renderSelect(document.querySelector('#classForm select[name="gradeId"]'), grades, "Select grade", (item) => item.name);

    $("institutionCount").textContent = `${state.institutions.length} created`;
    $("yearCount").textContent = `${years.length} created`;
    $("divisionCount").textContent = `${divisions.length} created`;
    $("gradeCount").textContent = `${grades.length} grades`;
    $("classCount").textContent = `${classes.length} created`;

    $("summaryYears").textContent = years.length;
    $("summaryDivisions").textContent = divisions.length;
    $("summaryGrades").textContent = grades.length;
    $("summaryClasses").textContent = classes.length;

    $("yearCard").classList.toggle("locked", !state.selectedInstitutionId);
    $("divisionCard").classList.toggle("locked", !state.selectedInstitutionId);
    $("gradeCard").classList.toggle("locked", !state.selectedInstitutionId || !state.selectedYearId || divisions.length === 0);
    $("classCard").classList.toggle("locked", !state.selectedInstitutionId || !state.selectedYearId || grades.length === 0);

    save();
  }

  $("institutionForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const code = String(data.get("code") || "").trim();
    const name = String(data.get("name") || "").trim();
    if (state.institutions.some((item) => item.code.toLowerCase() === code.toLowerCase())) return notice("Institution code already exists in this preview.", true);
    const item = { id: id(), code, name, displayName: String(data.get("displayName") || "").trim() };
    state.institutions.push(item);
    state.selectedInstitutionId = item.id;
    state.selectedYearId = "";
    event.currentTarget.reset();
    render();
    notice("Institution created in browser preview.");
  });

  $("yearForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") || "").trim();
    const startDate = String(data.get("startDate") || "");
    const endDate = String(data.get("endDate") || "");
    if (!state.selectedInstitutionId) return;
    if (!startDate || !endDate || endDate <= startDate) return notice("End date must be after start date.", true);
    if (currentYears().some((item) => item.name.toLowerCase() === name.toLowerCase())) return notice("Academic year already exists.", true);
    const item = { id: id(), institutionId: state.selectedInstitutionId, name, startDate, endDate };
    state.years.push(item);
    state.selectedYearId = item.id;
    event.currentTarget.reset();
    render();
    notice("Academic year added.");
  });

  $("divisionForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const code = String(data.get("code") || "").trim();
    if (currentDivisions().some((item) => item.code.toLowerCase() === code.toLowerCase())) return notice("Division code already exists.", true);
    state.divisions.push({ id: id(), institutionId: state.selectedInstitutionId, code, name: String(data.get("name") || "").trim(), order: Number(data.get("order")) || 1 });
    event.currentTarget.reset();
    event.currentTarget.elements.order.value = 1;
    render();
    notice("Academic division added.");
  });

  $("gradeForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const code = String(data.get("code") || "").trim();
    if (currentGrades().some((item) => item.code.toLowerCase() === code.toLowerCase())) return notice("Grade code already exists for this year.", true);
    state.grades.push({ id: id(), institutionId: state.selectedInstitutionId, yearId: state.selectedYearId, divisionId: String(data.get("divisionId") || ""), code, name: String(data.get("name") || "").trim(), order: Number(data.get("order")) || 1 });
    event.currentTarget.reset();
    render();
    notice("Grade created and mapped to its division.");
  });

  $("classForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const gradeId = String(data.get("gradeId") || "");
    const section = String(data.get("section") || "").trim();
    if (currentClasses().some((item) => item.gradeId === gradeId && item.section.toLowerCase() === section.toLowerCase())) return notice("This class section already exists.", true);
    state.classes.push({ id: id(), institutionId: state.selectedInstitutionId, yearId: state.selectedYearId, gradeId, section, displayName: String(data.get("displayName") || "").trim(), capacity: Number(data.get("capacity")) || null });
    event.currentTarget.reset();
    render();
    notice("Class created in browser preview.");
  });

  $("institutionSelect").addEventListener("change", (event) => {
    state.selectedInstitutionId = event.target.value;
    state.selectedYearId = "";
    render();
  });

  $("yearSelect").addEventListener("change", (event) => {
    state.selectedYearId = event.target.value;
    render();
  });

  $("resetPreview").addEventListener("click", () => {
    if (!confirm("Reset all Academic Management preview data stored in this browser?")) return;
    localStorage.removeItem(STORAGE_KEY);
    Object.assign(state, { institutions: [], years: [], divisions: [], grades: [], classes: [], selectedInstitutionId: "", selectedYearId: "" });
    render();
    notice("Preview data reset.");
  });

  render();
})();
