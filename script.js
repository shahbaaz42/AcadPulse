(function (root) {
  "use strict";
  const ADMISSION_ALIASES = ["admno","admnno","admissionno","admissionnumber","admissionnum","admnnumber"];
  const METADATA_ALIASES = new Set(["rollno","rollnumber","roll","sno","serialnumber",...ADMISSION_ALIASES,"studentname","nameofthestudent","name","house","class","section","gender","sex"]);
  const normalizeHeader = value => String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const findColumn = (headers, aliases) => headers.findIndex(h => aliases.includes(normalizeHeader(h)));
  function pointsForPercentage(percentage) {
    if (percentage === null || percentage === undefined || percentage === "" || !Number.isFinite(Number(percentage))) return null;
    const value = Number(percentage);
    if (value >= 95) return 5;
    if (value >= 81) return 3;
    if (value >= 61) return 2;
    return 0;
  }
  function percentageForMark(mark, maximum) {
    if (mark === null || mark === undefined || mark === "" || typeof mark === "boolean") return null;
    if (!Number.isFinite(Number(mark)) || !Number.isFinite(Number(maximum)) || Number(maximum) <= 0) return null;
    return Number(mark) / Number(maximum) * 100;
  }
  function normalizeHouse(value) {
    const clean = String(value ?? "").trim().replace(/\s+/g, " ");
    if (!clean) return "Unassigned";
    const core = clean.replace(/^house\s+of\s+/i, "").replace(/\s+house$/i, "").trim();
    return `House of ${core.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}`;
  }
  function detectStructure(rows) {
    if (!Array.isArray(rows) || rows.length < 2) throw new Error("The workbook does not contain a header and student rows.");
    const headerIndex = rows.findIndex(row => Array.isArray(row) && row.some(cell => ["studentname","nameofthestudent","name"].includes(normalizeHeader(cell))));
    if (headerIndex < 0) throw new Error("Could not find a Student Name column. Check the workbook headers.");
    const headers = rows[headerIndex].map(v => String(v ?? "").trim());
    const nameIndex = findColumn(headers, ["studentname","nameofthestudent","name"]);
    const houseIndex = findColumn(headers, ["house"]);
    if (houseIndex < 0) throw new Error("Could not find a House column.");
    const dataRows = rows.slice(headerIndex + 1).filter(row => String(row[nameIndex] ?? "").trim());
    const subjects = headers.map((name, index) => ({ name, index })).filter(({name,index}) => name && !METADATA_ALIASES.has(normalizeHeader(name)) && dataRows.some(row => row[index] === 0 || (row[index] !== "" && row[index] != null && Number.isFinite(Number(row[index])))));
    if (!subjects.length) throw new Error("No numeric subject columns were detected.");
    return { headers, headerIndex, dataRows, subjects, columns: { name:nameIndex, house:houseIndex, roll:findColumn(headers,["rollno","rollnumber","roll","sno","serialnumber"]), admission:findColumn(headers,ADMISSION_ALIASES) } };
  }
  function buildScoreboard(structure, maximums) {
    const houses = {};
    structure.dataRows.forEach((row, rowIndex) => {
      const house = normalizeHouse(row[structure.columns.house]);
      const results = structure.subjects.map(subject => {
        const raw = row[subject.index]; const percentage = percentageForMark(raw, maximums[subject.name]);
        return { subject:subject.name, raw, percentage, points:pointsForPercentage(percentage), invalid:raw !== "" && raw != null && percentage === null };
      });
      const validPoints = results.filter(r => r.points !== null).map(r => r.points);
      const student = { roll:structure.columns.roll < 0 ? rowIndex+1 : row[structure.columns.roll], admission:structure.columns.admission < 0 ? "" : row[structure.columns.admission], name:row[structure.columns.name], results, total:validPoints.reduce((a,b)=>a+b,0), average:validPoints.length ? validPoints.reduce((a,b)=>a+b,0)/validPoints.length : null };
      (houses[house] ||= []).push(student);
    });
    return houses;
  }
  function resetScoreboardState(state) {
    state.houses = null;
    state.maximums = null;
    state.generatedFor = null;
    return state;
  }
  const round2 = value => value == null ? null : Math.round((Number(value)+Number.EPSILON)*100)/100;
  function buildReportTitle(details, houseWise=false) {
    return [details.className,details.section,details.exam,houseWise?"House":null,"Scoreboard"].filter(Boolean).join("_").replace(/[^a-z0-9]+/gi,"_").replace(/^_|_$/g,"");
  }
  const DEVELOPER_CREDIT = "Developed by Shahbaaz Ahmed | shahbaaz.education@gmail.com";
  function houseStats(students) { const total=students.reduce((sum,student)=>sum+student.total,0); return {students:students.length,total,average:students.length?round2(total/students.length):0}; }
  function buildConsolidatedWorkbook(structure, houses, details, xlsx) {
    const wb=xlsx.utils.book_new(), rows=[], merges=[], styles={}, rowHeights=[], subjectCount=structure.subjects.length, lastColumn=subjectCount*2+4;
    const ref=(row,column)=>{let name="";for(let n=column+1;n;n=Math.floor((n-1)/26))name=String.fromCharCode((n-1)%26+65)+name;return `${name}${row+1}`;};
    const styleRow=(row,style,from=0,to=lastColumn)=>{for(let c=from;c<=to;c++)styles[ref(row,c)]=style;};
    const addMerged=(text,style,height=22)=>{const row=rows.length;rows.push([text]);merges.push({s:{r:row,c:0},e:{r:row,c:lastColumn}});styleRow(row,style);rowHeights[row]={hpt:height};};
    addMerged("AcadPulse","reportTitle",28); addMerged("Academic Intelligence Platform","subtitle",18); addMerged(`${details.exam} – Scoreboard`,"reportHeading",24); addMerged(`Class ${details.className} – Section ${details.section}`,"subtitle",20); rows.push([]);
    for(const [house,students] of Object.entries(houses)) {
      const titleRow=rows.length; addMerged(house,"houseHeading",24);
      const headerRow=rows.length, top=["Roll No","Admission No","Student Name"], sub=["","",""];
      structure.subjects.forEach(subject=>{top.push(subject.name,"");sub.push("Percentage","Points");}); top.push("Total Points","Average Points");sub.push("","");rows.push(top,sub);
      [0,1,2,lastColumn-1,lastColumn].forEach(c=>merges.push({s:{r:headerRow,c},e:{r:headerRow+1,c}})); structure.subjects.forEach((_,i)=>merges.push({s:{r:headerRow,c:3+i*2},e:{r:headerRow,c:4+i*2}})); styleRow(headerRow,"tableHeader");styleRow(headerRow+1,"tableSubheader");rowHeights[headerRow]={hpt:28};rowHeights[headerRow+1]={hpt:22};
      students.forEach(student=>{const row=rows.length,values=[student.roll,student.admission,student.name];student.results.forEach(result=>values.push(round2(result.percentage)??"",result.points??""));values.push(student.total,round2(student.average)??"");rows.push(values);styles[ref(row,2)]="studentName";for(let c=0;c<=lastColumn;c++)if(c!==2)styles[ref(row,c)]=(c>=3&&c<lastColumn-1&&c%2===1)||c===lastColumn?"decimal":"number";});
      const totals=houseStats(students), subjectTotals=structure.subjects.map((_,i)=>students.reduce((sum,s)=>sum+(s.results[i].points??0),0)), validCounts=structure.subjects.map((_,i)=>students.filter(s=>s.results[i].points!==null).length);
      let row=rows.length,values=["Subject Total Points","","Student count",...structure.subjects.flatMap((_,i)=>["",subjectTotals[i]]),totals.total,""];rows.push(values);merges.push({s:{r:row,c:0},e:{r:row,c:1}});styleRow(row,"totalRow");
      row=rows.length;values=["Subject Average Points","",students.length,...structure.subjects.flatMap((_,i)=>["",validCounts[i]?round2(subjectTotals[i]/validCounts[i]):""]),"",totals.average];rows.push(values);merges.push({s:{r:row,c:0},e:{r:row,c:1}});styleRow(row,"averageRow");
      rows.push([],[]);
    }
    addMerged("HOUSE SUMMARY","summaryTitle",26); const summaryHeader=rows.length;rows.push(["House","Students","Total Points","Average Points per Student"]);merges.push({s:{r:summaryHeader,c:3},e:{r:summaryHeader,c:lastColumn}});styleRow(summaryHeader,"summaryHeader");
    Object.entries(houses).forEach(([house,students])=>{const row=rows.length,s=houseStats(students);rows.push([house,s.students,s.total,s.average]);merges.push({s:{r:row,c:3},e:{r:row,c:lastColumn}});styleRow(row,"summaryData");});
    rows.push([]); addMerged(DEVELOPER_CREDIT,"developerCredit",18);
    const ws=xlsx.utils.aoa_to_sheet(rows);ws["!merges"]=merges;ws["!styles"]=styles;ws["!rows"]=rowHeights;ws["!cols"]=[{wch:12},{wch:16},{wch:28},...structure.subjects.flatMap(()=>[{wch:14},{wch:10}]),{wch:14},{wch:16}];ws["!freeze"]={xSplit:3,ySplit:5};ws["!printArea"]=`A1:${ref(rows.length-1,lastColumn)}`;ws["!pageSetup"]={orientation:"landscape",fitToWidth:1,fitToHeight:0};xlsx.utils.book_append_sheet(wb,ws,"Scoreboard");return wb;
  }
  const api = { pointsForPercentage, percentageForMark, normalizeHouse, detectStructure, buildScoreboard, normalizeHeader, resetScoreboardState, round2, buildReportTitle, buildConsolidatedWorkbook };
  if (typeof module !== "undefined") module.exports = api;
  if (typeof document === "undefined") return;

  let state = { structure:null, houses:null, filename:"" };
  const $ = id => document.getElementById(id); const message = (text,success=false) => { $("message").textContent=text; $("message").className=`message${success?" success":""}`; $("message").hidden=false; };
  const trackAnalytics = eventName => {
    try { root.AcadPulseAnalytics?.trackEvent(eventName); } catch (_) { /* Analytics must never interrupt workbook processing. */ }
  };
  function invalidateGeneratedScoreboard() {
    resetScoreboardState(state);
    $("preview").hidden=true;
    $("previewMeta").innerHTML=""; $("houseSummary").innerHTML=""; $("houseTables").innerHTML="";
    $("downloadBtn").disabled=true; $("pdfBtn").disabled=true;
  }
  async function loadFile(file) {
    try {
      invalidateGeneratedScoreboard();
      if (!file || !file.name.toLowerCase().endsWith(".xlsx")) throw new Error("Please choose an .xlsx workbook.");
      if (file.size > 10*1024*1024) throw new Error("The workbook is larger than the 10 MB limit.");
      if (typeof XLSX === "undefined" || typeof XLSX.read !== "function" || !XLSX.utils) throw new Error("The local Excel component failed to initialize. Verify that vendor/acadpulse-xlsx.js is present, then reload the application.");
      const workbook=await XLSX.read(await file.arrayBuffer(),{type:"array"}); const sheet=workbook.Sheets[workbook.SheetNames[0]];
      state.structure=detectStructure(XLSX.utils.sheet_to_json(sheet,{header:1,defval:"",raw:true})); state.filename=file.name;
      const houses=[...new Set(state.structure.dataRows.map(r=>normalizeHouse(r[state.structure.columns.house])))];
      $("fileSummary").innerHTML=`<div class="file-row"><div><strong>✓ ${escapeHtml(file.name)}</strong><small>${state.structure.dataRows.length} students · ${state.structure.subjects.length} subjects · ${houses.length} houses</small></div></div><div class="detected">${state.structure.subjects.map(s=>`<span class="tag">${escapeHtml(s.name)}</span>`).join("")}${houses.map(h=>`<span class="tag">${escapeHtml(h)}</span>`).join("")}</div>`;
      $("fileSummary").hidden=false; [$("examCard"),$("marksCard")].forEach(el=>el.classList.remove("locked")); $("generateBtn").disabled=false;
      $("subjectMarks").innerHTML=state.structure.subjects.map((s,i)=>`<label>${escapeHtml(s.name)}<input class="max-mark" data-subject="${escapeHtml(s.name)}" type="number" min="0.01" step="0.01" placeholder="Maximum marks" aria-label="Maximum marks for ${escapeHtml(s.name)}"></label>`).join("");
      message("Workbook read successfully. Review the detected subjects and complete the details.",true);
      trackAnalytics("workbook_uploaded");
    } catch(error){ state.structure=null; trackAnalytics("generation_error"); message(error.message); }
  }
  const escapeHtml = value => String(value??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const fmt = value => value == null ? '<span class="blank">—</span>' : Number(value.toFixed(2)).toString();
  function generate() {
    try {
      if (!state.structure) throw new Error("Upload a consolidation workbook first.");
      const details={exam:$("examName").value.trim(),className:$("className").value.trim(),section:$("sectionName").value.trim()}; if(Object.values(details).some(v=>!v)) throw new Error("Complete Exam Name, Class and Section.");
      const maximums={}; document.querySelectorAll(".max-mark").forEach(input=>maximums[input.dataset.subject]=Number(input.value)); if(Object.values(maximums).some(v=>!Number.isFinite(v)||v<=0)) throw new Error("Enter a valid maximum mark greater than zero for every subject.");
      state.details=details; state.maximums=maximums; state.houses=buildScoreboard(state.structure,maximums); state.generatedFor=state.filename; renderPreview(); $("downloadBtn").disabled=false; $("pdfBtn").disabled=false; $("preview").hidden=false; $("preview").scrollIntoView({behavior:"smooth"});
      trackAnalytics("scoreboard_generated");
    } catch(error){trackAnalytics("generation_error");message(error.message);}
  }
  function stats(students){return houseStats(students);}
  function renderPreview(){
    $("previewMeta").innerHTML=`<strong>${escapeHtml(state.details.exam)}</strong><span>Class ${escapeHtml(state.details.className)}</span><span>Section ${escapeHtml(state.details.section)}</span><span>${state.structure.dataRows.length} students</span>`;
    $("houseSummary").innerHTML=`<div class="summary-grid">${Object.entries(state.houses).map(([h,s])=>{const x=stats(s);return `<div class="summary-card"><small>${escapeHtml(h)}</small><strong>${s.length} students</strong><span>${x.total} total · ${fmt(x.average)} avg/student</span></div>`}).join("")}</div>`;
    $("houseTables").innerHTML=Object.entries(state.houses).map(([house,students],index)=>{const x=stats(students);return `<article class="house-block"><div class="house-title-row"><h3>${escapeHtml(house)}</h3><button class="house-pdf" data-house-index="${index}">▤ Download House PDF</button></div><div class="table-scroll"><table><thead><tr><th rowspan="2">Roll No</th><th rowspan="2">Admission No</th><th rowspan="2">Student Name</th>${state.structure.subjects.map(s=>`<th colspan="2">${escapeHtml(s.name)}</th>`).join("")}<th rowspan="2">Total Points</th><th rowspan="2">Average Points</th></tr><tr>${state.structure.subjects.map(()=>`<th>Percentage</th><th>Points</th>`).join("")}</tr></thead><tbody>${students.map(s=>`<tr><td>${escapeHtml(s.roll)}</td><td>${escapeHtml(s.admission)}</td><td class="name">${escapeHtml(s.name)}</td>${s.results.map(r=>`<td>${fmt(r.percentage)}</td><td>${fmt(r.points)}</td>`).join("")}<td>${s.total}</td><td>${fmt(s.average)}</td></tr>`).join("")}<tr class="totals"><td colspan="3">House totals / averages</td>${state.structure.subjects.map((_,i)=>{const pts=students.reduce((a,s)=>a+(s.results[i].points??0),0);const valid=students.filter(s=>s.results[i].points!==null);return `<td>—</td><td>${pts} / ${valid.length?fmt(pts/valid.length):"—"}</td>`}).join("")}<td>${x.total}</td><td>${fmt(x.average)}</td></tr></tbody></table></div></article>`}).join("");
  }
  async function downloadExcel(){
    if (!state.houses || state.generatedFor !== state.filename) { message("Generate the scoreboard for the current workbook before downloading."); return; }
    const wb=buildConsolidatedWorkbook(state.structure,state.houses,state.details,XLSX);
    const slug=buildReportTitle(state.details); await XLSX.writeFile(wb,`${slug}.xlsx`);
    trackAnalytics("excel_download");
  }
  function printableReport(selectedHouse) {
    const entries=selectedHouse?[selectedHouse]:Object.entries(state.houses), table=(house,students)=>{const totals=houseStats(students),subjectTotals=state.structure.subjects.map((_,i)=>students.reduce((sum,s)=>sum+(s.results[i].points??0),0));return `<section class="pdf-house"><h2>${escapeHtml(house)}</h2><p class="section-meta">AcadPulse · ${escapeHtml(state.details.exam)} · Class ${escapeHtml(state.details.className)} · Section ${escapeHtml(state.details.section)}</p><table><thead><tr><th rowspan="2">Roll No</th><th rowspan="2">Admission No</th><th rowspan="2">Student Name</th>${state.structure.subjects.map(s=>`<th colspan="2">${escapeHtml(s.name)}</th>`).join("")}<th rowspan="2">Total Points</th><th rowspan="2">Average Points</th></tr><tr>${state.structure.subjects.map(()=>"<th>Percentage</th><th>Points</th>").join("")}</tr></thead><tbody>${students.map(s=>`<tr><td>${escapeHtml(s.roll)}</td><td>${escapeHtml(s.admission)}</td><td class="left">${escapeHtml(s.name)}</td>${s.results.map(r=>`<td>${r.percentage==null?"—":round2(r.percentage)}</td><td>${r.points??"—"}</td>`).join("")}<td>${s.total}</td><td>${round2(s.average)??"—"}</td></tr>`).join("")}<tr class="total"><td colspan="3">Subject Total Points</td>${subjectTotals.map(v=>`<td></td><td>${v}</td>`).join("")}<td>${totals.total}</td><td></td></tr><tr class="total"><td colspan="3">Subject Average Points · ${students.length} students</td>${subjectTotals.map((v,i)=>{const n=students.filter(s=>s.results[i].points!==null).length;return `<td></td><td>${n?round2(v/n):"—"}</td>`}).join("")}<td></td><td>${totals.average}</td></tr></tbody></table></section>`;};
    const summary=!selectedHouse?`<section class="pdf-house summary"><h2>HOUSE SUMMARY</h2><table><thead><tr><th>House</th><th>Students</th><th>Total Points</th><th>Average Points per Student</th></tr></thead><tbody>${Object.entries(state.houses).map(([h,s])=>{const x=houseStats(s);return `<tr><td class="left">${escapeHtml(h)}</td><td>${x.students}</td><td>${x.total}</td><td>${x.average}</td></tr>`}).join("")}</tbody></table></section>`:"";
    return `<!doctype html><html><head><meta charset="utf-8"><title>${buildReportTitle(state.details,Boolean(selectedHouse))}</title><style>@page{size:landscape;margin:0}*{box-sizing:border-box}body{margin:0;padding:10mm 10mm 14mm;font:10px Arial,sans-serif;color:#142b25}header{text-align:center;margin-bottom:16px}h1{margin:0;font-size:22px}header p{margin:3px}.pdf-house{break-before:page;page-break-before:always}.pdf-house:first-of-type{break-before:auto;page-break-before:auto}h2{padding:7px;margin-bottom:3px;background:#d9eee5;text-align:center;font-size:14px}.section-meta{text-align:center;margin:0 0 7px;color:#52645d}table{width:100%;border-collapse:collapse;page-break-inside:auto}thead{display:table-header-group}tr{page-break-inside:avoid}th,td{border:1px solid #71817b;padding:4px;text-align:center}th{background:#142b25;color:white}.left{text-align:left}.total td{background:#edf4f1;font-weight:bold}.summary{font-size:11px}.print-footer{position:fixed;right:10mm;bottom:4mm;left:10mm;text-align:center;color:#60706a;font-size:8px}</style></head><body><header><h1>AcadPulse</h1><p>Academic Intelligence Platform</p><strong>${escapeHtml(state.details.exam)} – Scoreboard</strong><p>Class ${escapeHtml(state.details.className)} – Section ${escapeHtml(state.details.section)}</p></header><footer class="print-footer">${DEVELOPER_CREDIT}</footer>${entries.map(([h,s])=>table(h,s)).join("")}${summary}<script>window.onload=()=>window.print()<\/script></body></html>`;
  }
  function downloadPdf(selectedHouse){if(!state.houses||state.generatedFor!==state.filename){message("Generate the scoreboard for the current workbook before downloading.");return;}const popup=window.open("","_blank");if(!popup){message("The PDF print window was blocked. Allow pop-ups for this local application and try again.");return;}popup.document.open();popup.document.write(printableReport(selectedHouse));popup.document.close();trackAnalytics(selectedHouse?"house_pdf_export":"full_pdf_export");}
  $("fileInput").addEventListener("change",e=>loadFile(e.target.files[0])); const dz=$("dropzone"); ["dragenter","dragover"].forEach(n=>dz.addEventListener(n,e=>{e.preventDefault();dz.classList.add("drag")})); ["dragleave","drop"].forEach(n=>dz.addEventListener(n,e=>{e.preventDefault();dz.classList.remove("drag")})); dz.addEventListener("drop",e=>loadFile(e.dataTransfer.files[0]));
  $("applyMarks").addEventListener("click",()=>{const v=$("sameMarks").value;if(Number(v)>0)document.querySelectorAll(".max-mark").forEach(i=>i.value=v);else message("Enter a valid common maximum mark first.")}); $("generateBtn").addEventListener("click",generate); $("downloadBtn").addEventListener("click",downloadExcel); $("pdfBtn").addEventListener("click",()=>downloadPdf()); $("houseTables").addEventListener("click",event=>{const button=event.target.closest(".house-pdf");if(button)downloadPdf(Object.entries(state.houses)[Number(button.dataset.houseIndex)]);});
})(typeof globalThis !== "undefined" ? globalThis : this);
