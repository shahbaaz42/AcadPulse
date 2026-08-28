const assert = require("node:assert/strict");
const fs = require("node:fs");
const analytics = require("./analytics.js");
const {pointsForPercentage, percentageForMark, normalizeHouse, detectStructure, buildScoreboard, resetScoreboardState, buildReportTitle, buildConsolidatedWorkbook, round2} = require("./script.js");
assert.equal(percentageForMark(40,80),50); assert.equal(percentageForMark(40,50),80); assert.equal(percentageForMark("",80),null); assert.equal(percentageForMark("Absent",80),null);
[[95,5],[94.99,3],[81,3],[80.99,2],[61,2],[60.99,0],[null,null]].forEach(([p,v])=>assert.equal(pointsForPercentage(p),v));
assert.equal(normalizeHouse(" BLUE "),"House of Blue"); assert.equal(normalizeHouse("Blue House"),"House of Blue"); assert.equal(normalizeHouse(" HOUSE OF FAITH"),"House of Faith");
const reportDetails={className:"X",section:"BC",exam:"Annual Exam"};
assert.equal(buildReportTitle(reportDetails),"X_BC_Annual_Exam_Scoreboard");
assert.equal(buildReportTitle(reportDetails,true),"X_BC_Annual_Exam_House_Scoreboard");
assert.equal(analytics.MEASUREMENT_ID,"G-WNEYWX5WTY");
assert.deepEqual(analytics.EVENT_NAMES,["workbook_uploaded","scoreboard_generated","excel_download","full_pdf_export","house_pdf_export","generation_error","result_workbook_uploaded","result_dashboard_generated","result_analytics_error"]);
delete globalThis.gtag; assert.equal(analytics.trackEvent("workbook_uploaded"),false);
const analyticsCalls=[]; globalThis.gtag=(...args)=>analyticsCalls.push(args);
assert.equal(analytics.trackEvent("workbook_uploaded",{filename:"students.xlsx",studentName:"Asha"}),true);
assert.deepEqual(analyticsCalls,[["event","workbook_uploaded"]]);
for(const eventName of ["result_workbook_uploaded","result_dashboard_generated","result_analytics_error"]){
  assert.equal(analytics.EVENT_NAMES.includes(eventName),true);
  assert.equal(analytics.trackEvent(eventName,{filename:"results.xlsx",class:"X BC",gender:"BOY",count:215,error:"private"}),true);
}
assert.deepEqual(analyticsCalls,[
  ["event","workbook_uploaded"],
  ["event","result_workbook_uploaded"],
  ["event","result_dashboard_generated"],
  ["event","result_analytics_error"]
]);
assert.equal(analytics.trackEvent("not_allowed",{studentName:"Asha"}),false); assert.equal(analyticsCalls.length,4);
globalThis.gtag=()=>{throw new Error("blocked")}; assert.equal(analytics.trackEvent("generation_error"),false); delete globalThis.gtag;
const htmlSource=fs.readFileSync("index.html","utf8");
assert.match(htmlSource,/googletagmanager\.com\/gtag\/js\?id=G-WNEYWX5WTY/); assert.match(htmlSource,/gtag\('config', 'G-WNEYWX5WTY'/);
const rows=[["ROLLNO","ADMNO","STUDENT NAME","Science","Maths","Gender","HOUSE"],[1,100,"Asha",40,45,"F","BLUE"],[2,101,"Ben","Absent",50,"M","Blue House"]];
const structure=detectStructure(rows); assert.deepEqual(structure.subjects.map(s=>s.name),["Science","Maths"]); const result=buildScoreboard(structure,{Science:80,Maths:50}); assert.equal(Object.keys(result).length,1); assert.equal(result["House of Blue"][0].total,3); assert.equal(result["House of Blue"][1].results[0].points,null);
const admnRows=[["ROLLNO","ADMN NO","STUDENT NAME","Science","HOUSE"],[1,7654,"Asha",40,"Blue"]];
const admnStructure=detectStructure(admnRows); assert.equal(admnStructure.columns.admission,1); assert.deepEqual(admnStructure.subjects.map(s=>s.name),["Science"]); assert.equal(buildScoreboard(admnStructure,{Science:80})["House of Blue"][0].admission,7654);
const staleState={filename:"Workbook B.xlsx",houses:{"House of Blue":result["House of Blue"]},maximums:{Science:80},generatedFor:"Workbook A.xlsx"}; resetScoreboardState(staleState); assert.equal(staleState.houses,null); assert.equal(staleState.maximums,null); assert.equal(staleState.generatedFor,null);
require("./vendor/acadpulse-xlsx.js");
(async () => {
  const source = await globalThis.XLSX.read(fs.readFileSync("X BC Pre Mid Term Consolidation.xlsx"));
  const sourceRows = globalThis.XLSX.utils.sheet_to_json(source.Sheets[source.SheetNames[0]], {header:1, defval:"", raw:true});
  const reference = detectStructure(sourceRows);
  assert.deepEqual(reference.subjects.map(subject => subject.name), ["Science","Social","Lang II","English","Maths","Arabic"]);
  assert.equal(reference.dataRows.length, 33);
  const houses=buildScoreboard(reference,Object.fromEntries(reference.subjects.map(subject=>[subject.name,80])));
  const report=buildConsolidatedWorkbook(reference,houses,{exam:"Pre Mid Term Exam",className:"X",section:"BC"},globalThis.XLSX);
  assert.deepEqual(report.SheetNames,["Scoreboard"]);
  assert.ok(report.Sheets.Scoreboard["!merges"].length>reference.subjects.length); assert.equal(report.Sheets.Scoreboard["!pageSetup"].orientation,"landscape"); assert.equal(report.Sheets.Scoreboard["!pageSetup"].fitToWidth,1);
  const reportRows=report.Sheets.Scoreboard.__rows;
  const housePositions=Object.keys(houses).map(house=>reportRows.findIndex(row=>row[0]===house));
  assert.ok(housePositions.every((position,index)=>position>=0&&(index===0||position>housePositions[index-1])));
  const summaryPosition=reportRows.findIndex(row=>row[0]==="HOUSE SUMMARY"); assert.ok(summaryPosition>housePositions.at(-1));
  const developerCredit="Developed by Shahbaaz Ahmed | shahbaaz.education@gmail.com";
  assert.equal(reportRows.at(-1)[0],developerCredit);
  const lastColumn=reference.subjects.length*2+4, columnName=index=>{let name="";for(let n=index+1;n;n=Math.floor((n-1)/26))name=String.fromCharCode((n-1)%26+65)+name;return name;};
  const cellRef=(row,column)=>`${columnName(column)}${row+1}`;
  for(const housePosition of housePositions){
    const nextBlank=reportRows.findIndex((row,index)=>index>housePosition&&!row.length);
    for(let row=housePosition+1;row<nextBlank;row++)for(let column=0;column<=lastColumn;column++)assert.ok(report.Sheets.Scoreboard["!styles"][cellRef(row,column)],`Missing table style at ${cellRef(row,column)}`);
  }
  const creditPosition=reportRows.findIndex(row=>row[0]===developerCredit);
  for(let row=summaryPosition+1;row<creditPosition-1;row++)for(let column=0;column<=lastColumn;column++)assert.ok(report.Sheets.Scoreboard["!styles"][cellRef(row,column)],`Missing summary style at ${cellRef(row,column)}`);
  assert.equal(report.Sheets.Scoreboard["!styles"][cellRef(creditPosition-1,0)],undefined);
  const firstHeader=reportRows.find(row=>row[0]==="Roll No"); assert.equal(firstHeader[3],"Science"); assert.equal(firstHeader[4],"");
  const firstSubheader=reportRows[reportRows.indexOf(firstHeader)+1]; assert.deepEqual(firstSubheader.slice(3,5),["Percentage","Points"]);
  const faithStudent=houses["House of Faith"][0]; assert.equal(faithStudent.admission,8523); assert.equal(round2(faithStudent.results[3].percentage),51.25);
  const firstFaithRow=reportRows[housePositions[0]+3]; assert.equal(firstFaithRow[1],8523); assert.equal(firstFaithRow[9],51.25);
  assert.equal(Object.values(houses).reduce((count,students)=>count+students.length,0),33);
  const faithSummary=reportRows.slice(summaryPosition).find(row=>row[0]==="House of Faith"); assert.equal(faithSummary[1],houses["House of Faith"].length); assert.equal(faithSummary[2],houses["House of Faith"].reduce((sum,student)=>sum+student.total,0));
  const referenceOutput=await globalThis.XLSX.read(fs.readFileSync("X_BC_SCORE_BOARD_Pre_Mid_Term_Exam.xlsx"));
  const referenceOutputRows=globalThis.XLSX.utils.sheet_to_json(referenceOutput.Sheets[referenceOutput.SheetNames[0]],{header:1,defval:"",raw:true});
  assert.ok(referenceOutputRows.some(row=>row.includes("Percentage")&&row.includes("Points"))); assert.ok(referenceOutputRows.some(row=>String(row[0]).trim().startsWith("HOUSE OF")));
  const reportRoundTrip=await globalThis.XLSX.read(await globalThis.XLSX.write(report)); assert.deepEqual(reportRoundTrip.SheetNames,["Scoreboard"]); assert.ok(reportRoundTrip.Sheets.Scoreboard.__rows.some(row=>row[0]==="HOUSE SUMMARY"));
  const workbook = globalThis.XLSX.utils.book_new();
  globalThis.XLSX.utils.book_append_sheet(workbook, globalThis.XLSX.utils.aoa_to_sheet([["House","Total"],["House of Faith",42]]), "Summary");
  const roundTrip = await globalThis.XLSX.read(await globalThis.XLSX.write(workbook));
  assert.deepEqual(globalThis.XLSX.utils.sheet_to_json(roundTrip.Sheets.Summary,{header:1,defval:"",raw:true}), [["House","Total"],["House of Faith",42]]);
  const appSource=fs.readFileSync("script.js","utf8");
  assert.match(appSource,/@page\{size:landscape;margin:0\}/); assert.doesNotMatch(appSource,/counter\(page\)|AcadPulse · Page/);
  assert.match(appSource,/footer class="print-footer">\$\{DEVELOPER_CREDIT\}/);
  const vendorSource=fs.readFileSync("vendor/acadpulse-xlsx.js","utf8"); assert.match(vendorSource,/return s\?`<c r="\$\{ref\}"\$\{style\}\/>`/);
  console.log("All calculation and workbook-processing tests passed.");
})().catch(error => { console.error(error); process.exitCode=1; });
