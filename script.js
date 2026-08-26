(function (root) {
  "use strict";
  const METADATA_ALIASES = new Set(["rollno","rollnumber","roll","sno","serialnumber","admno","admissionno","admissionnumber","studentname","nameofthestudent","name","house","class","section","gender","sex"]);
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
    return { headers, headerIndex, dataRows, subjects, columns: { name:nameIndex, house:houseIndex, roll:findColumn(headers,["rollno","rollnumber","roll","sno","serialnumber"]), admission:findColumn(headers,["admno","admissionno","admissionnumber"]) } };
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
  const api = { pointsForPercentage, percentageForMark, normalizeHouse, detectStructure, buildScoreboard, normalizeHeader };
  if (typeof module !== "undefined") module.exports = api;
  if (typeof document === "undefined") return;

  let state = { structure:null, houses:null, filename:"" };
  const $ = id => document.getElementById(id); const message = (text,success=false) => { $("message").textContent=text; $("message").className=`message${success?" success":""}`; $("message").hidden=false; };
  async function loadFile(file) {
    try {
      if (!file || !file.name.toLowerCase().endsWith(".xlsx")) throw new Error("Please choose an .xlsx workbook.");
      if (file.size > 10*1024*1024) throw new Error("The workbook is larger than the 10 MB limit.");
      if (typeof XLSX === "undefined") throw new Error("The Excel reader could not load. Check your internet connection and refresh.");
      const workbook=XLSX.read(await file.arrayBuffer(),{type:"array"}); const sheet=workbook.Sheets[workbook.SheetNames[0]];
      state.structure=detectStructure(XLSX.utils.sheet_to_json(sheet,{header:1,defval:"",raw:true})); state.filename=file.name;
      const houses=[...new Set(state.structure.dataRows.map(r=>normalizeHouse(r[state.structure.columns.house])))];
      $("fileSummary").innerHTML=`<div class="file-row"><div><strong>✓ ${escapeHtml(file.name)}</strong><small>${state.structure.dataRows.length} students · ${state.structure.subjects.length} subjects · ${houses.length} houses</small></div></div><div class="detected">${state.structure.subjects.map(s=>`<span class="tag">${escapeHtml(s.name)}</span>`).join("")}${houses.map(h=>`<span class="tag">${escapeHtml(h)}</span>`).join("")}</div>`;
      $("fileSummary").hidden=false; [$("examCard"),$("marksCard")].forEach(el=>el.classList.remove("locked")); $("generateBtn").disabled=false;
      $("subjectMarks").innerHTML=state.structure.subjects.map((s,i)=>`<label>${escapeHtml(s.name)}<input class="max-mark" data-subject="${escapeHtml(s.name)}" type="number" min="0.01" step="0.01" placeholder="Maximum marks" aria-label="Maximum marks for ${escapeHtml(s.name)}"></label>`).join("");
      message("Workbook read successfully. Review the detected subjects and complete the details.",true);
    } catch(error){ state.structure=null; message(error.message); }
  }
  const escapeHtml = value => String(value??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const fmt = value => value == null ? '<span class="blank">—</span>' : Number(value.toFixed(2)).toString();
  function generate() {
    try {
      if (!state.structure) throw new Error("Upload a consolidation workbook first.");
      const details={exam:$("examName").value.trim(),className:$("className").value.trim(),section:$("sectionName").value.trim()}; if(Object.values(details).some(v=>!v)) throw new Error("Complete Exam Name, Class and Section.");
      const maximums={}; document.querySelectorAll(".max-mark").forEach(input=>maximums[input.dataset.subject]=Number(input.value)); if(Object.values(maximums).some(v=>!Number.isFinite(v)||v<=0)) throw new Error("Enter a valid maximum mark greater than zero for every subject.");
      state.details=details; state.maximums=maximums; state.houses=buildScoreboard(state.structure,maximums); renderPreview(); $("preview").hidden=false; $("preview").scrollIntoView({behavior:"smooth"});
    } catch(error){message(error.message);}
  }
  function stats(students){const total=students.reduce((a,s)=>a+s.total,0); return {total,average:students.length?total/students.length:0};}
  function renderPreview(){
    $("previewMeta").innerHTML=`<strong>${escapeHtml(state.details.exam)}</strong><span>Class ${escapeHtml(state.details.className)}</span><span>Section ${escapeHtml(state.details.section)}</span><span>${state.structure.dataRows.length} students</span>`;
    $("houseSummary").innerHTML=`<div class="summary-grid">${Object.entries(state.houses).map(([h,s])=>{const x=stats(s);return `<div class="summary-card"><small>${escapeHtml(h)}</small><strong>${s.length} students</strong><span>${x.total} total · ${fmt(x.average)} avg/student</span></div>`}).join("")}</div>`;
    $("houseTables").innerHTML=Object.entries(state.houses).map(([house,students])=>{const x=stats(students);return `<article class="house-block"><h3>${escapeHtml(house)}</h3><div class="table-scroll"><table><thead><tr><th rowspan="2">Roll No</th><th rowspan="2">Admission No</th><th rowspan="2">Student Name</th>${state.structure.subjects.map(s=>`<th colspan="2">${escapeHtml(s.name)}</th>`).join("")}<th rowspan="2">Total Points</th><th rowspan="2">Average Points</th></tr><tr>${state.structure.subjects.map(()=>`<th>Percentage</th><th>Points</th>`).join("")}</tr></thead><tbody>${students.map(s=>`<tr><td>${escapeHtml(s.roll)}</td><td>${escapeHtml(s.admission)}</td><td class="name">${escapeHtml(s.name)}</td>${s.results.map(r=>`<td>${fmt(r.percentage)}</td><td>${fmt(r.points)}</td>`).join("")}<td>${s.total}</td><td>${fmt(s.average)}</td></tr>`).join("")}<tr class="totals"><td colspan="3">House totals / averages</td>${state.structure.subjects.map((_,i)=>{const pts=students.reduce((a,s)=>a+(s.results[i].points??0),0);const valid=students.filter(s=>s.results[i].points!==null);return `<td>—</td><td>${pts} / ${valid.length?fmt(pts/valid.length):"—"}</td>`}).join("")}<td>${x.total}</td><td>${fmt(x.average)}</td></tr></tbody></table></div></article>`}).join("");
  }
  function downloadExcel(){
    const wb=XLSX.utils.book_new(); const safeSheet=name=>name.replace(/[\\/?*\[\]:]/g," ").slice(0,31);
    Object.entries(state.houses).forEach(([house,students])=>{const rows=[["AcadPulse — Scoreboard Generator"],[`Exam: ${state.details.exam}`],[`Class: ${state.details.className}`,`Section: ${state.details.section}`],[`House: ${house}`],[],["Roll No","Admission No","Student Name",...state.structure.subjects.flatMap(s=>[`${s.name} Percentage`,`${s.name} Points`]),"Total Points","Average Points"]]; students.forEach(s=>rows.push([s.roll,s.admission,s.name,...s.results.flatMap(r=>[r.percentage==null?"":r.percentage,r.points==null?"":r.points]),s.total,s.average==null?"":s.average])); const x=stats(students); rows.push([], ["House Summary","Students",students.length,"Total Points",x.total,"Average Points",x.average]); const ws=XLSX.utils.aoa_to_sheet(rows); ws["!cols"]=[{wch:12},{wch:16},{wch:28},...state.structure.subjects.flatMap(()=>[{wch:16},{wch:12}]),{wch:14},{wch:16}]; ws["!freeze"]={xSplit:3,ySplit:6}; XLSX.utils.book_append_sheet(wb,ws,safeSheet(house));});
    const summary=[["AcadPulse — Overall House Summary"],[`Exam: ${state.details.exam}`,`Class: ${state.details.className}`,`Section: ${state.details.section}`],[],["House","Students","Total Points","Average Points per Student"],...Object.entries(state.houses).map(([h,s])=>{const x=stats(s);return[h,s.length,x.total,x.average]})]; const ws=XLSX.utils.aoa_to_sheet(summary); ws["!cols"]=[{wch:30},{wch:12},{wch:16},{wch:28}]; XLSX.utils.book_append_sheet(wb,ws,"House Summary");
    const slug=[state.details.className,state.details.section,state.details.exam,"Scoreboard"].join("_").replace(/[^a-z0-9]+/gi,"_").replace(/^_|_$/g,""); XLSX.writeFile(wb,`${slug}.xlsx`);
  }
  $("fileInput").addEventListener("change",e=>loadFile(e.target.files[0])); const dz=$("dropzone"); ["dragenter","dragover"].forEach(n=>dz.addEventListener(n,e=>{e.preventDefault();dz.classList.add("drag")})); ["dragleave","drop"].forEach(n=>dz.addEventListener(n,e=>{e.preventDefault();dz.classList.remove("drag")})); dz.addEventListener("drop",e=>loadFile(e.dataTransfer.files[0]));
  $("applyMarks").addEventListener("click",()=>{const v=$("sameMarks").value;if(Number(v)>0)document.querySelectorAll(".max-mark").forEach(i=>i.value=v);else message("Enter a valid common maximum mark first.")}); $("generateBtn").addEventListener("click",generate); $("downloadBtn").addEventListener("click",downloadExcel);
})(typeof globalThis !== "undefined" ? globalThis : this);
