(function () {
  "use strict";
  if (typeof document === "undefined") return;
  const core = window.AcadPulseResultCore;
  const state = { structure: null, students: [], filename: "", configuration: null, loadGuard: core.createLatestLoadGuard() };
  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[character]));
  const format = value => Number(Number(value).toFixed(2)).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const formatPercentage = value => Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const showMessage = (id, text, success = false, placement = "") => { const box = $(id); box.textContent = text; box.className = `message${placement ? ` ${placement}` : ""}${success ? " success" : ""}`; box.hidden = false; };
  const uploadMessage = (text, success = false) => showMessage("analyticsUploadMessage", text, success, "upload-message");
  const message = (text, success = false) => showMessage("analyticsMessage", text, success, "generate-message");
  const hideRequirements = () => { $("analyticsRequirements").hidden = true; };
  const showRequirementsAfter = messageId => { const requirements = $("analyticsRequirements"); $(messageId).insertAdjacentElement("afterend", requirements); requirements.hidden = false; };
  const clearWarnings = () => { $("analyticsWarnings").hidden = true; $("analyticsWarningLines").textContent = ""; };
  const showWarnings = warnings => { $("analyticsWarningLines").innerHTML = warnings.map(warning => `<p>${escapeHtml(warning)}</p>`).join(""); $("analyticsWarnings").hidden = !warnings.length; };
  const track = eventName => { try { window.AcadPulseAnalytics?.trackEvent(eventName); } catch (_) { /* Telemetry cannot interrupt local processing. */ } };

  document.querySelectorAll(".module-tab").forEach(button => button.addEventListener("click", () => {
    const analytics = button.dataset.module === "analytics";
    $("scoreboardModule").hidden = analytics; $("analyticsModule").hidden = !analytics;
    document.querySelectorAll(".module-tab").forEach(tab => tab.classList.toggle("active", tab === button));
    document.title = analytics ? "AcadPulse — Result Analytics Dashboard" : "AcadPulse — Scoreboard Generator";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }));

  async function loadWorkbook(file) {
    const loadId = state.loadGuard.begin();
    state.structure = null; state.students = []; state.filename = "";
    $("analyticsDashboard").hidden = true; $("analyticsFileSummary").hidden = true;
    $("analyticsMessage").hidden = true;
    $("analyticsUploadMessage").hidden = true;
    hideRequirements();
    clearWarnings();
    $("analyticsConfigCard").classList.add("locked"); $("analyticsGenerate").disabled = true;
    try {
      if (!file || !file.name.toLowerCase().endsWith(".xlsx")) throw new Error("Invalid workbook. Choose an .xlsx result workbook.");
      if (file.size > 10 * 1024 * 1024) throw new Error("The workbook exceeds the 10 MB limit.");
      if (!window.XLSX?.read) throw new Error("The local XLSX reader failed to initialize. Reload the page and try again.");
      const fileBytes = await file.arrayBuffer();
      if (!state.loadGuard.isCurrent(loadId)) return;
      const workbook = await XLSX.read(fileBytes, { type: "array" });
      if (!state.loadGuard.isCurrent(loadId)) return;
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const structure = core.detectResultStructure(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true }));
      if (!state.loadGuard.isCurrent(loadId)) return;
      state.structure = structure; state.filename = file.name;
      showWarnings(core.optionalMetadataWarnings(structure));
      $("analyticsFileSummary").innerHTML = `<div class="file-row"><div><strong>✓ ${escapeHtml(file.name)}</strong><small>${structure.dataRows.length} students · ${structure.subjects.length} dynamically detected subjects</small><small><b>${structure.classes.length} ${structure.classes.length === 1 ? "Class" : "Classes"} detected:</b> ${structure.classes.map(escapeHtml).join(", ")}</small></div></div><div class="detected">${structure.subjects.map(subject => `<span class="tag">${escapeHtml(subject.name)}</span>`).join("")}</div>`;
      $("analyticsFileSummary").hidden = false; $("analyticsConfigCard").classList.remove("locked"); $("analyticsGenerate").disabled = false;
      uploadMessage("Workbook read locally. Confirm the exam rules, then generate the dashboard.", true); track("result_workbook_uploaded");
    } catch (error) {
      if (!state.loadGuard.isCurrent(loadId)) return;
      state.structure = null; $("analyticsGenerate").disabled = true; uploadMessage(error.message); if (error.code === "WORKBOOK_ROW_VALIDATION") showRequirementsAfter("analyticsUploadMessage"); track("result_analytics_error");
    }
  }

  function optionList(values) { return `<option value="All">All</option>${[...new Set(values.filter(Boolean))].sort((a,b) => a.localeCompare(b)).map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`; }
  function invalidateGeneratedDashboard() {
    state.students = [];
    $("analyticsDashboard").hidden = true;
  }
  function generate() {
    invalidateGeneratedDashboard();
    hideRequirements();
    try {
      if (!state.structure) throw new Error("Upload a valid result workbook first.");
      const examName = $("analyticsExamName").value.trim(), academicYear = $("analyticsYear").value.trim();
      if (!examName || !academicYear) throw new Error("Enter the Exam Name and Academic Year.");
      state.configuration = { examName, academicYear, maximumMarks: $("analyticsMaximum").value, passMark: $("analyticsPassMark").value };
      state.students = core.deriveStudents(state.structure, state.configuration);
      $("analyticsClassFilter").innerHTML = optionList(state.students.map(student => student.className));
      $("analyticsGenderFilter").innerHTML = optionList(state.students.map(student => student.gender));
      $("analyticsGenderFilterField").hidden = !state.students.some(student => student.gender);
      $("dashboardTitle").textContent = examName; $("dashboardSubtitle").textContent = `${academicYear} · ${state.structure.subjects.length} subjects · Maximum ${format(state.configuration.maximumMarks)} · Pass mark ${format(state.configuration.passMark)}`;
      $("analyticsDashboard").hidden = false; render(); $("analyticsDashboard").scrollIntoView({ behavior: "smooth" });
      message("Dashboard generated. Class and Gender filters update every visual immediately.", true); track("result_dashboard_generated");
    } catch (error) { message(error.message); if (error.code === "WORKBOOK_ROW_VALIDATION") showRequirementsAfter("analyticsMessage"); track("result_analytics_error"); }
  }

  function barChart(items, labelKey, valueKey, color = "#197052") {
    const width = 760, height = 280, left = 46, bottom = 50, top = 18, chartHeight = height - bottom - top;
    const max = Math.max(1, ...items.map(item => item[valueKey])), slot = (width-left-12)/Math.max(1,items.length), barWidth = Math.min(56,slot*.62);
    const grid = [0,.25,.5,.75,1].map(part => { const y=top+chartHeight*(1-part); return `<line x1="${left}" y1="${y}" x2="${width-8}" y2="${y}" stroke="#e3ebe7"/><text x="${left-7}" y="${y+4}" text-anchor="end" font-size="9" fill="#6d7d77">${format(max*part)}</text>`; }).join("");
    const bars = items.map((item,index) => { const value=item[valueKey], h=value/max*chartHeight, x=left+slot*index+(slot-barWidth)/2, y=top+chartHeight-h; return `<g><title>${escapeHtml(item[labelKey])}: ${format(value)}</title><rect x="${x}" y="${y}" width="${barWidth}" height="${h}" rx="4" fill="${color}"/><text x="${x+barWidth/2}" y="${Math.max(12,y-5)}" text-anchor="middle" font-size="9" font-weight="700" fill="#263d36">${format(value)}</text><text x="${x+barWidth/2}" y="${height-27}" text-anchor="middle" font-size="9" fill="#52655e" transform="rotate(-18 ${x+barWidth/2} ${height-27})">${escapeHtml(item[labelKey])}</text></g>`; }).join("");
    return `<svg viewBox="0 0 ${width} ${height}" aria-hidden="true">${grid}${bars}</svg>`;
  }
  function donutChart(items, total) {
    const colors={PASS:"#239366",FAIL:"#d65745",ABSENT:"#e5a62f"}, radius=70, circumference=2*Math.PI*radius; let offset=0;
    const arcs=items.map(item => { const length=total ? item.count/total*circumference : 0, arc=`<circle cx="105" cy="105" r="${radius}" fill="none" stroke="${colors[item.result]}" stroke-width="32" stroke-dasharray="${length} ${circumference-length}" stroke-dashoffset="${-offset}" transform="rotate(-90 105 105)"><title>${item.result}: ${item.count} (${formatPercentage(total?item.count/total*100:0)}%)</title></circle>`; offset+=length; return arc; }).join("");
    const legend=items.map(item=>`<span><i style="background:${colors[item.result]}"></i><b>${item.result}</b> ${item.count} · ${formatPercentage(total?item.count/total*100:0)}%</span>`).join("");
    return `<div class="donut-layout"><svg viewBox="0 0 210 210" style="width:210px;min-height:210px">${arcs}<text x="105" y="100" text-anchor="middle" font-size="26" font-weight="800" fill="#142b25">${total}</text><text x="105" y="119" text-anchor="middle" font-size="10" fill="#6d7d77">STUDENTS</text></svg><div class="donut-legend">${legend}</div></div>`;
  }
  function renderChart(id, render) { try { $(id).innerHTML = render(); } catch (_) { $(id).innerHTML = '<div class="chart-error">This chart could not be rendered. Workbook calculations remain available.</div>'; } }
  function table(students, rankLabel) {
    return `<thead><tr><th>${rankLabel}</th><th>ADMNO</th><th>Student Name</th><th>Class</th><th>Total Marks</th><th>Percentage</th></tr></thead><tbody>${students.map(student=>`<tr><td>${student.rank}</td><td>${escapeHtml(student.admission)}</td><td class="name" title="${escapeHtml(student.name)}">${escapeHtml(student.name)}</td><td>${escapeHtml(student.className)}</td><td>${format(student.totalMarks)}</td><td>${formatPercentage(student.percentage)}%</td></tr>`).join("")}</tbody>`;
  }
  function render() {
    const filters={ className:$("analyticsClassFilter").value, gender:$("analyticsGenderFilter").value };
    const students=core.filterStudents(state.students,filters), summary=core.summarize(students,state.structure.subjects);
    $("analyticsEmpty").hidden=students.length>0; $("filterCount").textContent=`Showing ${students.length} of ${state.students.length} students`;
    const cards=[["Total Students",summary.totalStudents],["Passed",summary.passed],["Pass %",`${formatPercentage(summary.passPercentage)}%`],["Present",summary.present],["Present %",`${formatPercentage(summary.presentPercentage)}%`],["Average Marks",format(summary.averageMarks)],["Average %",`${formatPercentage(summary.averagePercentage)}%`]];
    $("kpiGrid").innerHTML=cards.map(([label,value])=>`<article class="kpi-card"><small>${label}</small><strong>${value}</strong></article>`).join("");
    renderChart("subjectChart",()=>barChart([...summary.subjectAverages].sort((a,b)=>b.value-a.value),"subject","value")); renderChart("resultChart",()=>donutChart(summary.resultDistribution,summary.totalStudents)); renderChart("rangeChart",()=>barChart(summary.ranges,"label","count","#74a51f"));
    $("topStudents").innerHTML=table(summary.top,"Rank"); $("supportStudents").innerHTML=table(summary.bottom,"Sr. No");
  }

  $("analyticsFileInput").addEventListener("change", event => loadWorkbook(event.target.files[0]));
  ["dragenter","dragover"].forEach(name=>$("analyticsDropzone").addEventListener(name,event=>{event.preventDefault();$("analyticsDropzone").classList.add("drag");}));
  ["dragleave","drop"].forEach(name=>$("analyticsDropzone").addEventListener(name,event=>{event.preventDefault();$("analyticsDropzone").classList.remove("drag");if(name==="drop"){$("analyticsFileInput").value="";loadWorkbook(event.dataTransfer.files[0]);}}));
  $("analyticsGenerate").addEventListener("click",generate); $("analyticsClassFilter").addEventListener("change",render); $("analyticsGenderFilter").addEventListener("change",render);
  $("analyticsResetFilters").addEventListener("click",()=>{$("analyticsClassFilter").value="All";$("analyticsGenderFilter").value="All";render();});
})();
