const assert = require("assert");
const fs = require("fs");
const core = require("./result-analytics-core");
require("./vendor/acadpulse-xlsx.js");

let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log(`✓ ${name}`); } catch (error) { console.error(`✗ ${name}`); throw error; } }
const rows = [["Roll Number","Admission No","Student Name","Physics","Art","Class","Sex"],[1,"A1","Pass",80,70,"X A","BOY"],[2,"A2","Fail",20,60,"X A","GIRL"],[3,"A3","Absent",0,70,"X B","BOY"]];
const structure = core.detectResultStructure(rows);
const students = core.deriveStudents(structure,{maximumMarks:100,passMark:33});

test("metadata aliases are detected",()=>assert.deepStrictEqual(structure.columns,{roll:0,admission:1,name:2,className:5,section:-1,gender:6,house:-1}));
test("subjects are detected dynamically by excluding metadata",()=>assert.deepStrictEqual(structure.subjects.map(s=>s.name),["Physics","Art"]));
test("House uses Scoreboard-compatible metadata recognition and is never treated as a subject",()=>{
  const houseRows=[["Roll Number","Admission Number","Student Name","HOUSE","Science","Social","Class","Gender"],[1,"A1","Student","Red House",75,68,"X A","BOY"]];
  const houseStructure=core.detectResultStructure(houseRows);
  assert.strictEqual(houseStructure.columns.house,3);
  assert.deepStrictEqual(houseStructure.subjects.map(subject=>subject.name),["Science","Social"]);
  const [houseStudent]=core.deriveStudents(houseStructure,{maximumMarks:100,passMark:33});
  assert.deepStrictEqual(houseStudent.marks,[75,68]);
  assert.strictEqual(houseStudent.totalMarks,143);
});
test("the structural subject region excludes trailing ancillary columns",()=>{
  const rows=[["ADMNO","STUDENT NAME","Science","Social","Class","Gender","Remarks"],["A1","Student",75,68,"X A","BOY","Improving"]];
  const detected=core.detectResultStructure(rows);
  assert.deepStrictEqual(detected.subjects.map(subject=>subject.name),["Science","Social"]);
  assert.deepStrictEqual(core.deriveStudents(detected,{maximumMarks:100,passMark:33})[0].marks,[75,68]);
});
test("known remarks, comments, and notes are always ancillary rather than subjects",()=>{
  for(const ancillary of ["Remarks","Comment","Comments","Note","Notes","Teacher Remark","Teacher Remarks"]){
    const rows=[["ADMNO","STUDENT NAME","Science",ancillary,"Social","Class","Gender"],["A1","Student",75,"free text",68,"X A","BOY"]];
    const detected=core.detectResultStructure(rows);
    assert.deepStrictEqual(detected.subjects.map(subject=>subject.name),["Science","Social"],ancillary);
    assert.doesNotThrow(()=>core.deriveStudents(detected,{maximumMarks:100,passMark:33}));
  }
});
test("total and percentage use every detected subject",()=>{assert.strictEqual(students[0].totalMarks,150);assert.strictEqual(students[0].percentage,75)});
test("failed-subject count includes zero per Power Query",()=>{assert.strictEqual(students[1].failedSubjects,1);assert.strictEqual(students[2].failedSubjects,1)});
test("absent-subject count counts zero",()=>assert.strictEqual(students[2].absentSubjects,1));
test("PASS requires every mark at or above pass mark",()=>assert.strictEqual(students[0].result,"PASS"));
test("FAIL takes precedence when a non-zero failing mark exists",()=>assert.strictEqual(students[1].result,"FAIL"));
test("ABSENT requires zero without a non-zero failure",()=>assert.strictEqual(students[2].result,"ABSENT"));
test("present calculation requires zero absent subjects",()=>assert.strictEqual(core.summarize(students,structure.subjects).present,2));
test("subject averages exclude zero",()=>assert.strictEqual(core.summarize(students,structure.subjects).subjectAverages[0].value,50));
test("percentage ranges are numeric and include 100 in 90-100",()=>{assert.strictEqual(core.percentageBand(20),"20-30");assert.strictEqual(core.percentageBand(100),"90-100")});
test("top ranking sorts descending",()=>assert.deepStrictEqual(core.rankStudents(students,"desc").map(s=>s.name),["Pass","Fail","Absent"]));
test("bottom ranking sorts ascending",()=>assert.deepStrictEqual(core.rankStudents(students,"asc").map(s=>s.name),["Absent","Fail","Pass"]));
test("class filter works",()=>assert.strictEqual(core.filterStudents(students,{className:"X A"}).length,2));
test("gender filter works",()=>assert.strictEqual(core.filterStudents(students,{gender:"BOY"}).length,2));
test("combined Class and Gender filters use AND logic",()=>assert.deepStrictEqual(core.filterStudents(students,{className:"X B",gender:"BOY"}).map(s=>s.name),["Absent"]));
test("missing required metadata and empty data report clear errors",()=>{
  assert.throws(()=>core.detectResultStructure([["Admission Number","Name","Math","Gender"],["A1","A",2,"GIRL"]]),/Missing Class/);
  assert.throws(()=>core.detectResultStructure([["Admission Number","Name","Math","Class"]]),/no student rows/i);
});
const rowError = (rows, maximumMarks=100) => assert.throws(
  ()=>core.deriveStudents(core.detectResultStructure(rows),{maximumMarks,passMark:33}),
  error=>error.code==="WORKBOOK_ROW_VALIDATION" && /^Please check the details in Excel row \d+\.$/.test(error.message)
);
test("missing and whitespace-only required student values produce generic row errors",()=>{
  const header=["Student Name","Admission Number","Math","Class","Gender"];
  for(const [column,value] of [[0,""],[3,""],[0," \t "],[3," \t "]]) {
    const student=["Student","A1",45,"X A","BOY"]; student[column]=value;
    rowError([header,student]);
  }
});
test("Admission Number column and per-student values remain required",()=>{
  const missingColumn=[["Student Name","Math","Class","Gender"],["Student",45,"X A","BOY"]];
  assert.throws(()=>core.detectResultStructure(missingColumn),/Missing Admission Number/);
  for(const admission of [""," \t "]){
    const rows=[["Admission Number","Student Name","Math","Class","Gender"],["A1","Valid",45,"X A","BOY"],[admission,"Not a student",45,"X A","BOY"]];
    assert.strictEqual(core.detectResultStructure(rows).dataRows.length,1);
  }
});
test("metadata is validated before subject marks",()=>{
  const rows=[["Student Name","Admission Number","Math","Class","Gender"],["Valid","A1",45,"X A","BOY"],["","A2","not numeric","X A","BOY"]];
  assert.throws(()=>core.deriveStudents(core.detectResultStructure(rows),{maximumMarks:100,passMark:33}),error=>error.message==="Please check the details in Excel row 3.");
  const source=fs.readFileSync("result-analytics-core.js","utf8");
  assert.ok(source.indexOf("invalidMetadataIndex") < source.indexOf("if (!subjects.length)"));
});
test("intended subject headers are never dropped because their data is invalid",()=>{
  const header=["Student Name","Admission Number","Valid Subject","Blank Subject","Text Subject","Class","Gender"];
  const rows=[header,["Student","A1",45,"","not numeric","X A","BOY"]];
  const intended=core.detectResultStructure(rows);
  assert.deepStrictEqual(intended.subjects.map(subject=>subject.name),["Valid Subject","Blank Subject","Text Subject"]);
  assert.throws(()=>core.deriveStudents(intended,{maximumMarks:100,passMark:33}),error=>error.message==="Please check the details in Excel row 2.");
});
test("all-blank intended subjects fail row validation rather than subject detection",()=>{
  const rows=[["Student Name","Admission Number","Math","Science","Class","Gender"],["Student","A1",""," \t ","X A","BOY"]];
  const intended=core.detectResultStructure(rows);
  assert.strictEqual(intended.subjects.length,2);
  assert.throws(()=>core.deriveStudents(intended,{maximumMarks:100,passMark:33}),error=>error.message==="Please check the details in Excel row 2.");
});
test("missing metadata wins over invalid subject data during structure detection",()=>{
  const rows=[["Student Name","Admission Number","Math","Class","Gender"],["","A1","not numeric","X A","BOY"]];
  assert.throws(()=>core.detectResultStructure(rows),error=>error.code==="WORKBOOK_ROW_VALIDATION" && error.message==="Please check the details in Excel row 2.");
});
test("a workbook with genuinely no subject headers reports a structural error",()=>{
  const rows=[["Student Name","Admission Number","Class","Gender"],["Student","A1","X A","BOY"]];
  assert.throws(()=>core.detectResultStructure(rows),/No subject columns were detected\./);
});
test("footer notes, signatures, summaries, and blank rows are not student rows",()=>{
  const rows=[
    ["ROLLNO","ADMNO","STUDENT NAME","Science","Class","Gender","Remarks"],
    [1,"A1","Student",75,"X A","BOY",""],
    [],
    ["Prepared by Class Teacher"],
    ["Signature"],
    ["Total Students: 1"],
    ["","","","","","","Checked and approved"]
  ];
  const detected=core.detectResultStructure(rows);
  assert.strictEqual(detected.dataRows.length,1);
  assert.deepStrictEqual(detected.dataRowNumbers,[2]);
  assert.doesNotThrow(()=>core.deriveStudents(detected,{maximumMarks:100,passMark:33}));
});
test("subject-only averages, totals, and footer values are not student rows",()=>{
  const rows=[
    ["ROLLNO","ADMNO","STUDENT NAME","Science","Social","Maths","Class","Gender","Remarks"],
    [1,"A1","Student",75,68,80,"X A","BOY",""],
    ["","","",56.2,61.5,48.7,"","",""],
    ["","","",75,68,80,"","",""],
    ["Footer label","","",10,20,30,"","",""],
    ["","","","",42,"","","",""],
    []
  ];
  const detected=core.detectResultStructure(rows);
  assert.strictEqual(detected.dataRows.length,1);
  assert.deepStrictEqual(detected.dataRowNumbers,[2]);
  assert.doesNotThrow(()=>core.deriveStudents(detected,{maximumMarks:100,passMark:33}));
});
test("Admission Number alone identifies malformed student records",()=>{
  const header=["ROLLNO","ADMNO","STUDENT NAME","Science","Class","Gender"];
  const missingName=[header,[1,"A1","",55,"X A","BOY"]];
  assert.throws(()=>core.detectResultStructure(missingName),error=>error.message==="Please check the details in Excel row 2.");
  const ignored=core.detectResultStructure([header,[1,"A1","Valid",70,"X A","BOY"],[2,"","Student",60,"X A","GIRL"],["R-3","","",65,"X A","BOY"]]);
  assert.strictEqual(ignored.dataRows.length,1);
});
test("partially malformed student records remain included and keep their true Excel rows",()=>{
  const rows=[
    ["Report"],
    ["ROLLNO","ADMNO","STUDENT NAME","Science","Class","Gender","Remarks"],
    [1,"A1","Valid",75,"X A","BOY",""],
    [],
    ["Prepared by Class Teacher"],
    [2,"A2","",60,"X A","GIRL",""],
    [3,"","Missing admission",55,"X A","BOY",""]
  ];
  assert.throws(()=>core.detectResultStructure(rows),error=>error.message==="Please check the details in Excel row 6.");
});
test("combined and separate Class & Section formats normalize for filtering",()=>{
  const combinedWithoutSection=[["ADMNO","STUDENT NAME","Math","Class"],["A1","Combined",45,"X BA"]];
  assert.strictEqual(core.deriveStudents(core.detectResultStructure(combinedWithoutSection),{maximumMarks:100,passMark:33})[0].className,"X BA");
  const combinedBlankSection=[["ADMNO","STUDENT NAME","Math","Class","Section"],["A1","Combined",45,"X BA",""]];
  assert.strictEqual(core.deriveStudents(core.detectResultStructure(combinedBlankSection),{maximumMarks:100,passMark:33})[0].className,"X BA");
  const rows=[["ADMNO","STUDENT NAME","Math","Class","Section","Gender"],["A1","Student",45,"X","BA",""]];
  const detected=core.detectResultStructure(rows), [student]=core.deriveStudents(detected,{maximumMarks:100,passMark:33});
  assert.strictEqual(student.className,"X BA");
  assert.strictEqual(core.filterStudents([student],{className:"X BA"}).length,1);
  assert.throws(()=>core.detectResultStructure([rows[0],["A2","Missing section",50,"X","",""]]),error=>error.message==="Please check the details in Excel row 2.");
  assert.throws(()=>core.detectResultStructure([rows[0],["A3","Missing class",50,"","BA",""]]),error=>error.message==="Please check the details in Excel row 2.");
});
test("optional metadata warnings use true Excel rows and never remove students",()=>{
  const rows=[["ADMNO","STUDENT NAME","Math","Class","Gender","ROLLNO"],...Array.from({length:62},(_,index)=>[`A${index+1}`,`Student ${index+1}`,50,"X A","BOY",index+1])];
  for(const excelRow of [25,37,63]) rows[excelRow-1][4]="";
  for(const excelRow of [14,43]) rows[excelRow-1][5]="";
  const detected=core.detectResultStructure(rows), derived=core.deriveStudents(detected,{maximumMarks:100,passMark:33});
  assert.strictEqual(derived.length,62);
  assert.deepStrictEqual(core.optionalMetadataWarnings(detected),["Gender is missing in Excel rows 25, 37 & 63.","Roll No is missing in Excel rows 14 & 43."]);
});
test("absent Gender and Roll Number columns are informational only",()=>{
  const rows=[["ADMNO","STUDENT NAME","Math","Class"],["A1","Student",50,"X A"]];
  const detected=core.detectResultStructure(rows);
  assert.strictEqual(core.deriveStudents(detected,{maximumMarks:100,passMark:33}).length,1);
  assert.deepStrictEqual(core.optionalMetadataWarnings(detected),["Gender column is not available in this file.","Roll No column is not available in this file."]);
});
test("fully populated Class and Gender values are accepted and trimmed during derivation",()=>{
  const completeRows=[["Student Name","Admission Number","Math","Class","Gender"],["Complete"," A1 ",45," X A "," BOY "]];
  const completeStructure=core.detectResultStructure(completeRows), [completeStudent]=core.deriveStudents(completeStructure,{maximumMarks:100,passMark:33});
  assert.strictEqual(completeStudent.className,"X A"); assert.strictEqual(completeStudent.gender,"BOY");
});
test("configuration rejects nonnumeric, nonpositive, and excessive values",()=>{
  for(const maximum of ["", "abc", 0, -1]) assert.throws(()=>core.validateRules(maximum,1),/Maximum Marks/);
  for(const pass of ["", "abc", 0, -1, 51]) assert.throws(()=>core.validateRules(50,pass),/Pass Mark/);
});
test("mobile stacked topbar can grow beyond the desktop fixed height",()=>{
  const responsiveCss=fs.readFileSync("result-analytics.css","utf8");
  assert.match(responsiveCss,/@media\(max-width:750px\)\{\.topbar\{[^}]*height:auto[^}]*flex-direction:column/);
});
test("numeric zero and string zero remain valid absent marks",()=>{
  const zeroRows=[["Student Name","Admission Number","Math","Class","Gender"],["Numeric zero","A1",0,"X A","BOY"],["String zero","A2","0","X A","GIRL"]];
  const zeroStructure=core.detectResultStructure(zeroRows), zeroStudents=core.deriveStudents(zeroStructure,{maximumMarks:100,passMark:33});
  assert.deepStrictEqual(zeroStudents.map(student=>student.marks[0]),[0,0]);
  assert.deepStrictEqual(zeroStudents.map(student=>student.result),["ABSENT","ABSENT"]);
});
test("blank, whitespace-only, and nonnumeric subject marks are rejected",()=>{
  for(const mark of ["","   \t ","not numeric"])
    rowError([["Student Name","Admission Number","Math","Class","Gender"],["Valid","A1",45,"X A","BOY"],["Invalid","A2",mark,"X A","GIRL"]]);
});
test("whitespace around a valid mark is trimmed before conversion",()=>{
  const paddedRows=[["Student Name","Admission Number","Math","Class","Gender"],["Padded","A1"," 45 ","X A","BOY"]];
  const paddedStructure=core.detectResultStructure(paddedRows), [paddedStudent]=core.deriveStudents(paddedStructure,{maximumMarks:100,passMark:33});
  assert.strictEqual(paddedStudent.marks[0],45); assert.strictEqual(paddedStudent.totalMarks,45);
});
test("negative numeric and numeric-string marks are rejected before calculations",()=>{
  for(const mark of [-1,"-2.5"]){
    rowError([["Student Name","Admission Number","Math","Class","Gender"],["Negative","A1",mark,"X A","BOY"]]);
  }
});
test("marks at the configured maximum remain valid after string normalization",()=>{
  const maximumRows=[["Student Name","Admission Number","Math","Class","Gender"],["Numeric maximum","A1",50,"X A","BOY"],["String maximum","A2","50","X A","GIRL"],["Padded maximum","A3"," 50 ","X B","BOY"]];
  const maximumStructure=core.detectResultStructure(maximumRows), maximumStudents=core.deriveStudents(maximumStructure,{maximumMarks:50,passMark:20});
  assert.deepStrictEqual(maximumStudents.map(student=>student.marks[0]),[50,50,50]);
  assert.deepStrictEqual(maximumStudents.map(student=>student.percentage),[100,100,100]);
});
test("decimal marks are valid within range and excessive marks are rejected",()=>{
  const decimalRows=[["Student Name","Admission Number","Math","Class","Gender"],["Decimal","A1",18.75,"X A","BOY"]];
  assert.strictEqual(core.deriveStudents(core.detectResultStructure(decimalRows),{maximumMarks:50,passMark:10})[0].marks[0],18.75);
  for(const mark of [50.01,"51"]){
    rowError([["Student Name","Admission Number","Math","Class","Gender"],["Excessive","A1",mark,"X A","BOY"]],50);
  }
});
test("generic errors preserve the true Excel row including pre-header and blank rows",()=>{
  const offsetRows=[["Result report"],["Generated locally"],["Student Name","Admission Number","Social","Class","Gender"],["Valid","A1",40,"X A","BOY"],[],["Iqbal Ahmed","A2",101,"X A","BOY"]];
  const offsetStructure=core.detectResultStructure(offsetRows);
  assert.throws(()=>core.deriveStudents(offsetStructure,{maximumMarks:100,passMark:33}),error=>error.message==="Please check the details in Excel row 6.");
});
test("generation invalidates stale dashboard output without clearing the loaded workbook",()=>{
  const controllerSource=fs.readFileSync("result-analytics.js","utf8");
  assert.match(controllerSource,/uploadMessage\s*=.*showMessage\("analyticsUploadMessage", text, success, "upload-message"\)/);
  assert.match(controllerSource,/message\s*=.*showMessage\("analyticsMessage", text, success, "generate-message"\)/);
  assert.match(controllerSource,/uploadMessage\("Workbook read locally[^;]+true\)/);
  assert.match(controllerSource,/uploadMessage\(error\.message\); if \(error\.code === "WORKBOOK_ROW_VALIDATION"\) showRequirementsAfter\("analyticsUploadMessage"\);/);
  assert.match(controllerSource,/catch \(error\) \{ message\(error\.message\); if \(error\.code === "WORKBOOK_ROW_VALIDATION"\) showRequirementsAfter\("analyticsMessage"\);/);
  const invalidator=controllerSource.match(/function invalidateGeneratedDashboard\(\)\s*\{([^}]*)\}/);
  assert.ok(invalidator); assert.match(invalidator[1],/state\.students\s*=\s*\[\]/); assert.match(invalidator[1],/\$\("analyticsDashboard"\)\.hidden\s*=\s*true/);
  assert.doesNotMatch(invalidator[1],/state\.structure\s*=/);
  assert.match(controllerSource,/function generate\(\)\s*\{\s*invalidateGeneratedDashboard\(\);\s*hideRequirements\(\);\s*try\s*\{/);
});
test("requirements table is complete, responsive, and cleared after successful processing",()=>{
  const html=fs.readFileSync("index.html","utf8"), css=fs.readFileSync("result-analytics.css","utf8"), controller=fs.readFileSync("result-analytics.js","utf8");
  for(const text of ["Student Name","Admission Number","Class","Gender","Subject Mark","Blank / whitespace-only mark","Negative mark","Mark above Maximum Marks","Zero mark","Decimal mark","Mark equal to Maximum Marks","Maximum Marks","Pass Mark","Required; must not be blank","Required; must be numeric","Allowed; handled by the existing ABSENT rule","Must be numeric, greater than 0, and not exceed Maximum Marks"]) assert.ok(html.includes(text),text);
  assert.match(html,/id="analyticsRequirements"[^>]*hidden/);
  assert.match(css,/\.requirements-scroll\{[^}]*overflow-x:auto/);
  assert.match(controller,/hideRequirements\(\);\s*try/);
  assert.match(controller,/showRequirementsAfter\("analyticsUploadMessage"\)/);
  assert.match(controller,/showRequirementsAfter\("analyticsMessage"\)/);
  assert.match(controller,/insertAdjacentElement\("afterend", requirements\)/);
});
test("optional-data warnings are distinct, persist through generation, and reset on upload",()=>{
  const html=fs.readFileSync("index.html","utf8"), css=fs.readFileSync("result-analytics.css","utf8"), controller=fs.readFileSync("result-analytics.js","utf8");
  assert.match(html,/id="analyticsWarnings"[^>]*hidden><h3[^>]*>Data Warnings<\/h3>/);
  assert.match(css,/\.warnings-card\{[^}]*background:#fff9e8[^}]*border-left:4px solid #d79a16/);
  assert.match(controller,/clearWarnings\(\);\s*\$\("analyticsConfigCard"\)/);
  assert.match(controller,/showWarnings\(core\.optionalMetadataWarnings\(structure\)\)/);
  assert.doesNotMatch(controller.match(/function generate\(\)[\s\S]*?function barChart/)[0],/clearWarnings/);
  assert.match(controller,/analyticsGenderFilterField"\)\.hidden = !state\.students\.some\(student => student\.gender\)/);
});
test("dropping a workbook clears the picker so its previous file can be reselected",()=>{
  const controllerSource=fs.readFileSync("result-analytics.js","utf8");
  assert.match(controllerSource,/if\(name==="drop"\)\{\$\("analyticsFileInput"\)\.value="";loadWorkbook\(event\.dataTransfer\.files\[0\]\);\}/);
  assert.match(controllerSource,/\$\("analyticsFileInput"\)\.addEventListener\("change", event => loadWorkbook\(event\.target\.files\[0\]\)\)/);
});

(async function integration() {
  function deferred() { let resolve, reject; const promise=new Promise((yes,no)=>{resolve=yes;reject=no}); return {promise,resolve,reject}; }
  function guardedLoader(guard, application, analyticsEvents, name, work) {
    const loadId=guard.begin();
    return work.then(value=>{
      if(!guard.isCurrent(loadId)) return;
      application.structure=value; application.summary=name; application.controlsEnabled=true; application.message=`${name} loaded`; analyticsEvents.push("result_workbook_uploaded");
    }).catch(()=>{
      if(!guard.isCurrent(loadId)) return;
      application.message=`${name} failed`; analyticsEvents.push("result_analytics_error");
    });
  }
  const guard=core.createLatestLoadGuard(), application={}, analyticsEvents=[], workbookA=deferred(), workbookB=deferred();
  const loadA=guardedLoader(guard,application,analyticsEvents,"A",workbookA.promise);
  const loadB=guardedLoader(guard,application,analyticsEvents,"B",workbookB.promise);
  workbookB.resolve({workbook:"B"}); await loadB; workbookA.resolve({workbook:"A"}); await loadA;
  test("a stale workbook completion cannot overwrite the newer selection",()=>{
    assert.deepStrictEqual(application,{structure:{workbook:"B"},summary:"B",controlsEnabled:true,message:"B loaded"});
    assert.deepStrictEqual(analyticsEvents,["result_workbook_uploaded"]);
  });
  const staleFailure=deferred(), newest=deferred(), failureApplication={}, failureEvents=[], staleLoad=guardedLoader(guard,failureApplication,failureEvents,"stale",staleFailure.promise), newestLoad=guardedLoader(guard,failureApplication,failureEvents,"newest",newest.promise);
  newest.resolve({workbook:"newest"}); await newestLoad; staleFailure.reject(new Error("stale error")); await staleLoad;
  test("a stale workbook failure cannot overwrite UI or emit error analytics",()=>{
    assert.deepStrictEqual(failureApplication,{structure:{workbook:"newest"},summary:"newest",controlsEnabled:true,message:"newest loaded"});
    assert.deepStrictEqual(failureEvents,["result_workbook_uploaded"]);
  });
  const bytes=fs.readFileSync("reference/X_Pre_Mid_Term_26_27.xlsx");
  const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
  const workbook=await global.XLSX.read(buffer,{type:"array"});
  const sheet=workbook.Sheets[workbook.SheetNames[0]];
  const source=core.detectResultStructure(global.XLSX.utils.sheet_to_json(sheet,{header:1,defval:"",raw:true}));
  const results=core.deriveStudents(source,{maximumMarks:100,passMark:33});
  const summary=core.summarize(results,source.subjects);
  test("reference workbook dynamically detects its six subjects",()=>assert.deepStrictEqual(source.subjects.map(s=>s.name),["Science","Social","Lang II","English","Maths","Arabic"]));
  test("reference workbook combined Class values remain unchanged",()=>assert.deepStrictEqual([...new Set(results.map(student=>student.className))],["X BA","X BB","X BC","X GA","X GB","X GC"]));
  test("reference workbook reproduces Page 1 KPIs",()=>{
    assert.strictEqual(summary.totalStudents,215); assert.strictEqual(summary.passed,114); assert.strictEqual(core.round2(summary.passPercentage),53.02);
    assert.strictEqual(summary.present,208); assert.strictEqual(core.round2(summary.presentPercentage),96.74);
    assert.ok(Math.abs(summary.averageMarks-341.11)<0.1,`Average Marks ${summary.averageMarks}`); assert.strictEqual(core.round2(summary.averagePercentage),56.85);
  });
  console.log(`\n${passed} Result Analytics tests passed.`);
})().catch(error=>{console.error(error);process.exitCode=1});
