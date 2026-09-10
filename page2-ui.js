(function () {
  "use strict";
  if (typeof document === "undefined") return;

  const core = window.AcadPulseResultCore;
  const page2 = window.AcadPulsePage2Analytics;
  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[character]));
  const format = value => value == null ? "—" : Number(Number(value).toFixed(2)).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const formatPct = value => value == null ? "—" : `${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  const state = { students: [], subjects: [], configuration: null, structure: null };

  function mountPage2() {
    const dashboard = $("analyticsDashboard");
    if (!dashboard || $("analyticsPage2")) return dashboard;
    dashboard.insertAdjacentHTML("beforeend", `
      <section id="analyticsPage2" class="analytics-page2" hidden>
        <div class="dashboard-heading"><div><span class="eyebrow">PAGE 2 · SUBJECT &amp; CLASS PERFORMANCE</span><h2 id="page2Title">Result Analytics</h2><p id="page2Subtitle"></p></div><span class="local-badge">● Browser-local analysis</span></div>
        <div class="dashboard-filters">
          <label>Class<select id="page2ClassFilter"><option value="">All</option></select></label>
          <label id="page2GenderFilterField">Gender<select id="page2GenderFilter"><option value="">All</option></select></label>
          <button id="page2ResetFilters" class="filter-reset" type="button">Reset filters</button>
          <span id="page2FilterCount" aria-live="polite"></span>
        </div>
        <div id="page2Empty" class="message" hidden>No students match these filters.</div>
        <div class="page2-grid">
          <article class="dashboard-panel"><h3>Highest Mark by Subject <span>present students only</span></h3><div id="page2HighestChart"></div></article>
          <article class="dashboard-panel"><h3>Subject Topper(s) &amp; Class <span>ties preserved</span></h3><div class="page2-table-scroll"><table id="page2SubjectToppers"></table></div></article>
          <article class="dashboard-panel page2-wide"><h3>Subject Performance Summary <span>0 = ABSENT; distributions use % of Maximum Marks</span></h3><div class="page2-table-scroll"><table id="page2SubjectSummary"></table></div></article>
          <article class="dashboard-panel"><h3>Students Requiring Support by Subject <span>present students below Pass Mark</span></h3><div id="page2SupportChart"></div></article>
          <article class="dashboard-panel"><h3>Overall Topper Summary <span>responds to filters</span></h3><div id="page2OverallTopper"></div></article>
          <article class="dashboard-panel page2-wide"><h3>Class Overall Performance Comparison</h3><div class="page2-table-scroll"><table id="page2ClassPerformance"></table></div></article>
          <article class="dashboard-panel page2-wide"><h3>Class × Subject Analysis</h3><p class="page2-note">All matrices recalculate from the currently filtered population. Average and Pass % exclude absent marks.</p><div class="matrix-grid">
            <div><h3>Average Mark Matrix</h3><div class="page2-table-scroll"><table id="page2AverageMatrix"></table></div></div>
            <div><h3>Pass % Matrix</h3><div class="page2-table-scroll"><table id="page2PassMatrix"></table></div></div>
            <div><h3>Failure Count Matrix</h3><div class="page2-table-scroll"><table id="page2FailureMatrix"></table></div></div>
          </div></article>
        </div>
      </section>`);
    return dashboard;
  }

  function options(values) {
    return `<option value="">All</option>${[...new Set(values.filter(value => value !== undefined && value !== null && value !== ""))]
      .sort((a, b) => String(a).localeCompare(String(b)))
      .map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
  }

  function maxValue(items) {
    return items.reduce((maximum, item) => Math.max(maximum, Number(item.value) || 0), 1);
  }

  function barList(items, valueFormatter = format, maximum = null) {
    const max = maximum == null ? maxValue(items) : Math.max(1, maximum);
    return `<div class="page2-bars">${items.map(item => {
      const value = Number(item.value) || 0;
      const width = Math.max(value > 0 ? 2 : 0, Math.min(100, value / max * 100));
      return `<div class="page2-bar-row"><span class="page2-bar-label">${escapeHtml(item.label)}</span><div class="page2-bar-track"><i style="width:${width}%"></i></div><strong>${escapeHtml(valueFormatter(item.value))}</strong></div>`;
    }).join("")}</div>`;
  }

  function topperLines(toppers) {
    if (!toppers.length) return "—";
    return toppers.map(topper => `<div><strong>${escapeHtml(topper.name)}</strong><small>${escapeHtml(topper.className)}</small></div>`).join("");
  }

  function subjectSummaryTable(summary) {
    const bands = page2.DISTRIBUTION_BANDS.map(band => band.label);
    return `<thead><tr><th>Subject</th><th>Students</th><th>Present</th><th>Passed</th><th>Failed</th><th>Pass %</th><th>Average</th><th>Highest</th><th>Lowest</th><th>Absent</th>${bands.map(band => `<th>${band}</th>`).join("")}</tr></thead><tbody>${summary.map(item => `<tr><td class="name">${escapeHtml(item.subject)}</td><td>${item.studentCount}</td><td>${item.presentCount}</td><td>${item.passCount}</td><td>${item.failCount}</td><td>${formatPct(item.passPercentage)}</td><td>${format(item.averageMark)}</td><td>${format(item.highestMark)}</td><td>${format(item.lowestMark)}</td><td>${item.absentCount}</td>${bands.map(band => `<td>${item.distribution[band]}</td>`).join("")}</tr>`).join("")}</tbody>`;
  }

  function classPerformanceTable(rows) {
    return `<thead><tr><th>Class</th><th>Students</th><th>Pass</th><th>Fail</th><th>Absent Result</th><th>Average Marks</th><th>Average %</th></tr></thead><tbody>${rows.map(row => `<tr><td class="name">${escapeHtml(row.className)}</td><td>${row.studentCount}</td><td>${row.passed}</td><td>${row.failed}</td><td>${row.absentResult}</td><td>${format(row.averageMarks)}</td><td>${formatPct(row.averagePercentage)}</td></tr>`).join("")}</tbody>`;
  }

  function heatClass(value, type, maxFailure) {
    if (value == null) return "heat-empty";
    if (type === "failure") {
      if (value === 0) return "heat-good";
      const ratio = maxFailure ? value / maxFailure : 0;
      return ratio > .66 ? "heat-bad" : ratio > .33 ? "heat-mid" : "heat-light";
    }
    const ratio = type === "average" ? value / Number(state.configuration.maximumMarks) * 100 : value;
    return ratio >= 90 ? "heat-good" : ratio >= 75 ? "heat-light" : ratio >= 60 ? "heat-mid" : "heat-bad";
  }

  function matrixTable(rows, type) {
    const subjectNames = state.subjects.map(subject => subject.name);
    const failureValues = type === "failure" ? rows.flatMap(row => subjectNames.map(subject => Number(row.values[subject]) || 0)) : [];
    const maxFailure = failureValues.reduce((maximum, value) => Math.max(maximum, value), 0);
    return `<thead><tr><th>Class</th>${subjectNames.map(subject => `<th>${escapeHtml(subject)}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr><td class="name">${escapeHtml(row.className)}</td>${subjectNames.map(subject => {
      const value = row.values[subject];
      const rendered = type === "pass" ? formatPct(value) : format(value);
      return `<td class="${heatClass(value, type, maxFailure)}">${rendered}</td>`;
    }).join("")}</tr>`).join("")}</tbody>`;
  }

  function overallTopperCards(toppers) {
    if (!toppers.length) return `<div class="page2-empty-card">No topper is available for this filtered population.</div>`;
    return `<div class="topper-cards">${toppers.map(topper => `<article class="topper-card"><span>Overall Topper</span><h4>${escapeHtml(topper.name)}</h4><p>${escapeHtml(topper.className)}</p><div><b>${format(topper.totalMarks)}</b><small>Total Marks</small></div><div><b>${formatPct(topper.percentage)}</b><small>Percentage</small></div><ul>${state.subjects.map(subject => `<li><span>${escapeHtml(subject.name)}</span><strong>${format(topper.subjectMarks[subject.name])}</strong></li>`).join("")}</ul></article>`).join("")}</div>`;
  }

  function render() {
    if (!state.students.length || !state.structure) return;
    const filters = { className: $("page2ClassFilter").value, gender: $("page2GenderFilter").value };
    const analysis = page2.analyze(state.students, state.subjects, state.configuration, filters);
    $("page2FilterCount").textContent = `Showing ${analysis.population.length} of ${state.students.length} students`;
    $("page2Empty").hidden = analysis.population.length > 0;
    $("page2HighestChart").innerHTML = barList(analysis.subjectToppers.map(item => ({ label: item.subject, value: item.highestMark || 0 })), format, Number(state.configuration.maximumMarks));
    $("page2SupportChart").innerHTML = barList(analysis.supportBySubject.map(item => ({ label: item.subject, value: item.count })), format);
    $("page2SubjectToppers").innerHTML = `<thead><tr><th>Subject</th><th>Highest Mark</th><th>Topper(s) &amp; Class</th></tr></thead><tbody>${analysis.subjectToppers.map(item => `<tr><td class="name">${escapeHtml(item.subject)}</td><td>${format(item.highestMark)}</td><td class="topper-list">${topperLines(item.toppers)}</td></tr>`).join("")}</tbody>`;
    $("page2SubjectSummary").innerHTML = subjectSummaryTable(analysis.subjectSummary);
    $("page2OverallTopper").innerHTML = overallTopperCards(analysis.overallToppers);
    $("page2ClassPerformance").innerHTML = classPerformanceTable(analysis.classPerformance);
    $("page2AverageMatrix").innerHTML = matrixTable(analysis.matrices.averages, "average");
    $("page2PassMatrix").innerHTML = matrixTable(analysis.matrices.passPercentages, "pass");
    $("page2FailureMatrix").innerHTML = matrixTable(analysis.matrices.failureCounts, "failure");
  }

  async function preparePage2() {
    try {
      const file = $("analyticsFileInput").files[0];
      if (!file || !window.XLSX?.read || !core || !page2) return;
      const fileBytes = await file.arrayBuffer();
      const workbook = await XLSX.read(fileBytes, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      state.structure = core.detectResultStructure(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true }));
      state.configuration = { maximumMarks: $("analyticsMaximum").value, passMark: $("analyticsPassMark").value };
      state.students = core.deriveStudents(state.structure, state.configuration);
      state.subjects = state.structure.subjects;
      $("page2ClassFilter").innerHTML = options(state.students.map(student => student.className));
      $("page2GenderFilter").innerHTML = options(state.students.map(student => student.gender));
      $("page2GenderFilterField").hidden = !state.students.some(student => student.gender);
      $("page2Title").textContent = $("analyticsExamName").value.trim() || "Result Analytics";
      $("page2Subtitle").textContent = `${$("analyticsYear").value.trim()} · ${state.subjects.length} subjects · Subject & class diagnostics`;
      $("analyticsPage2").hidden = false;
      render();
    } catch (_) {
      $("analyticsPage2").hidden = true;
    }
  }

  const dashboard = mountPage2();
  if (!dashboard || !core || !page2) return;
  const initializePage2IfVisible = () => {
    if (!dashboard.hidden) preparePage2();
  };
  new MutationObserver(initializePage2IfVisible).observe(dashboard, { attributes: true, attributeFilter: ["hidden"] });
  initializePage2IfVisible();
  $("page2ClassFilter").addEventListener("change", render);
  $("page2GenderFilter").addEventListener("change", render);
  $("page2ResetFilters").addEventListener("click", () => { $("page2ClassFilter").value = ""; $("page2GenderFilter").value = ""; render(); });
})();
