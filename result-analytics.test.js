const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
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
  const houseRows=[["Roll Number","Admission Number","Student Name","Science","Social","Class","Gender","HOUSE"],[1,"A1","Student",75,68,"X A","BOY","Red House"]];
  const houseStructure=core.detectResultStructure(houseRows);
  assert.strictEqual(houseStructure.columns.house,7);
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
test("unrelated trailing columns are ignored without special interpretation",()=>{
  for(const ancillary of ["Remarks","Comment","Comments","Note","Notes","Teacher Remark","Teacher Remarks"]){
    const rows=[["ADMNO","STUDENT NAME","Science","Social","Class","Gender",ancillary],["A1","Student",75,68,"X A","BOY","free text"]];
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
  assert.throws(()=>core.detectResultStructure([["Admission Number","Name","Math","Gender"],["A1","A",2,"GIRL"]]),/Missing Class & Section/);
  assert.throws(()=>core.detectResultStructure([["Admission Number","Name","Math","Class"]]),/no student rows/i);
});
const rowError = (rows, maximumMarks=100) => assert.throws(
  ()=>core.deriveStudents(core.detectResultStructure(rows),{maximumMarks,passMark:33}),
  error=>error.code==="WORKBOOK_ROW_VALIDATION" && /^Please check the details in Excel row \d+\.$/.test(error.message)
);
test("missing and whitespace-only required student names produce generic row errors",()=>{
  const header=["Admission Number","Student Name","Math","Class","Gender"];
  for(const [column,value] of [[1,""],[1," \t "]]) {
    const student=["A1","Student",45,"X A","BOY"]; student[column]=value;
    rowError([header,student]);
  }
});
test("blank Class & Section reports its true Excel row and blocks processing without misreporting Gender",()=>{
  const header=["Admission Number","Student Name","Math","Class","Gender"];
  for(const value of [""," \t "]){
    const rows=[["Report"],header,["A1","Valid",45,"X A","GIRL"],["A2","Missing class",45,value,"BOY"]];
    assert.throws(()=>core.detectResultStructure(rows),error=>error.code==="WORKBOOK_ROW_VALIDATION" && error.message==="Class & Section is missing in Excel row 4.");
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
  const rows=[["Admission Number","Student Name","Math","Class","Gender"],["A1","Valid",45,"X A","BOY"],["A2","","not numeric","X A","BOY"]];
  assert.throws(()=>core.deriveStudents(core.detectResultStructure(rows),{maximumMarks:100,passMark:33}),error=>error.message==="Please check the details in Excel row 3.");
  const source=fs.readFileSync("result-analytics-core.js","utf8");
  assert.ok(source.indexOf("invalidMetadataIndex") < source.indexOf("if (!subjects.length)"));
});
test("intended subject headers are never dropped because their data is invalid",()=>{
  const header=["Admission Number","Student Name","Valid Subject","Blank Subject","Text Subject","Class","Gender"];
  const rows=[header,["A1","Student",45,"","not numeric","X A","BOY"]];
  const intended=core.detectResultStructure(rows);
  assert.deepStrictEqual(intended.subjects.map(subject=>subject.name),["Valid Subject","Blank Subject","Text Subject"]);
  assert.throws(()=>core.deriveStudents(intended,{maximumMarks:100,passMark:33}),error=>error.message==="Please check the details in Excel row 2.");
});
test("all-blank intended subjects fail row validation rather than subject detection",()=>{
  const rows=[["Admission Number","Student Name","Math","Science","Class","Gender"],["A1","Student",""," \t ","X A","BOY"]];
  const intended=core.detectResultStructure(rows);
  assert.strictEqual(intended.subjects.length,2);
  assert.throws(()=>core.deriveStudents(intended,{maximumMarks:100,passMark:33}),error=>error.message==="Please check the details in Excel row 2.");
});
test("missing metadata wins over invalid subject data during structure detection",()=>{
  const rows=[["Admission Number","Student Name","Math","Class","Gender"],["A1","","not numeric","X A","BOY"]];
  assert.throws(()=>core.detectResultStructure(rows),error=>error.code==="WORKBOOK_ROW_VALIDATION" && error.message==="Please check the details in Excel row 2.");
});
test("a workbook with genuinely no subject headers reports a structural error",()=>{
  const rows=[["Admission Number","Student Name","Class","Gender"],["A1","Student","X A","BOY"]];
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
test("Class & Section accepts any non-blank trimmed value and keeps distinct classes",()=>{
  const rows=[["ADMNO","STUDENT NAME","Math","Class"],["A1","One",45,"Grade X"],["A2","Two",45,"Grade 10"],["A3","Three",45,"X BA"]];
  const detected=core.detectResultStructure(rows);
  assert.deepStrictEqual(detected.classes,["Grade X","Grade 10","X BA"]);
  const derived=core.deriveStudents(detected,{maximumMarks:100,passMark:33});
  assert.deepStrictEqual(derived.map(student=>student.className),["Grade X","Grade 10","X BA"]);
  assert.strictEqual(core.filterStudents(derived,{className:"Grade X"}).length,1);
  assert.strictEqual(core.filterStudents(derived,{className:"Grade 10"}).length,1);
  for(const value of [""," \t "]){
    assert.throws(()=>core.detectResultStructure([["ADMNO","STUDENT NAME","Math","Class"],["A4","Blank",45,value]]),error=>error.message==="Class & Section is missing in Excel row 2.");
  }
});
test("workbook summary reports distinct trimmed Class & Section values",()=>{
  const detected=core.detectResultStructure([["ADMNO","STUDENT NAME","Math","Class"],["A1","One",45," Grade X "],["A2","Two",45,"Grade 10"],["A3","Three",45,"Grade X"]]);
  assert.deepStrictEqual(detected.classes,["Grade X","Grade 10"]);
  const controller=fs.readFileSync("result-analytics.js","utf8");
  assert.match(controller,/structure\.classes\.length.*Classes.*detected:/);
  assert.match(controller,/structure\.classes\.map\(escapeHtml\)\.join\(", "\)/);
});
test("adjacent duplicate ADMNO values report both true Excel rows without exposing the value",()=>{
  const rows=[["Report"],["ADMNO","STUDENT NAME","Math","Class"],["PRIVATE-123","First",45,"X BA"],["PRIVATE-123","Duplicate",50,"X BA"]];
  assert.throws(()=>core.detectResultStructure(rows),error=>error.code==="WORKBOOK_ROW_VALIDATION" && error.message==="Duplicate ADMNO found in Excel rows 3 and 4." && !error.message.includes("PRIVATE-123"));
});
test("non-adjacent duplicate ADMNO values report both true Excel rows",()=>{
  const rows=[["Report"],["ADMNO","STUDENT NAME","Math","Class"],["A1","First",45,"X BA"],[],["A2","Other",50,"Grade 10"],["A1","Duplicate",50,"X BA"]];
  assert.throws(()=>core.detectResultStructure(rows),error=>error.message==="Duplicate ADMNO found in Excel rows 3 and 6." && error.conflictingExcelRows.join(",")==="3,6");
});
test("unique ADMNO values continue through structure detection and derivation",()=>{
  const rows=[["ADMNO","STUDENT NAME","Math","Class"],["A1","First",45,"X BA"],["A2","Second",50,"Grade X"]];
  const detected=core.detectResultStructure(rows);
  assert.strictEqual(core.deriveStudents(detected,{maximumMarks:100,passMark:33}).length,2);
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
test("blank Gender remains optional and produces a singular Data Warning",()=>{
  const rows=[["ADMNO","STUDENT NAME","Math","Class","Gender"],["A1","Student",50,"X A",""]];
  const detected=core.detectResultStructure(rows);
  assert.strictEqual(core.deriveStudents(detected,{maximumMarks:100,passMark:33}).length,1);
  assert.ok(!detected.dataRows[0][4]);
  assert.deepStrictEqual(core.optionalMetadataWarnings(detected),["Gender is missing in Excel row 2.","Roll No column is not available in this file."]);
});
test("fully populated Class and Gender values are accepted and trimmed during derivation",()=>{
  const completeRows=[["Admission Number","Student Name","Math","Class","Gender"],[" A1 ","Complete",45," X A "," BOY "]];
  const completeStructure=core.detectResultStructure(completeRows), [completeStudent]=core.deriveStudents(completeStructure,{maximumMarks:100,passMark:33});
  assert.strictEqual(completeStudent.className,"X A"); assert.strictEqual(completeStudent.gender,"BOY");
});
test("configuration requires positive whole-number Maximum Marks and Pass Mark",()=>{
  assert.deepStrictEqual(core.validateRules(50,20),{maximumMarks:50,passMark:20});
  for(const maximum of ["", "abc", 0, -1, 50.6]) assert.throws(()=>core.validateRules(maximum,1),/Maximum Marks/);
  for(const pass of ["", "abc", 0, -1, 20.5, 51]) assert.throws(()=>core.validateRules(50,pass),/Pass Mark/);
});
test("mobile stacked topbar can grow beyond the desktop fixed height",()=>{
  const responsiveCss=fs.readFileSync("result-analytics.css","utf8");
  assert.match(responsiveCss,/@media\(max-width:750px\)\{\.topbar\{[^}]*height:auto[^}]*flex-direction:column/);
});
test("numeric zero and string zero remain valid absent marks",()=>{
  const zeroRows=[["Admission Number","Student Name","Math","Class","Gender"],["A1","Numeric zero",0,"X A","BOY"],["A2","String zero","0","X A","GIRL"]];
  const zeroStructure=core.detectResultStructure(zeroRows), zeroStudents=core.deriveStudents(zeroStructure,{maximumMarks:100,passMark:33});
  assert.deepStrictEqual(zeroStudents.map(student=>student.marks[0]),[0,0]);
  assert.deepStrictEqual(zeroStudents.map(student=>student.result),["ABSENT","ABSENT"]);
});
test("blank, whitespace-only, and nonnumeric subject marks are rejected",()=>{
  for(const mark of ["","   \t ","not numeric"])
    rowError([["Admission Number","Student Name","Math","Class","Gender"],["A1","Valid",45,"X A","BOY"],["A2","Invalid",mark,"X A","GIRL"]]);
});
test("whitespace around a valid mark is trimmed before conversion",()=>{
  const paddedRows=[["Admission Number","Student Name","Math","Class","Gender"],["A1","Padded"," 45 ","X A","BOY"]];
  const paddedStructure=core.detectResultStructure(paddedRows), [paddedStudent]=core.deriveStudents(paddedStructure,{maximumMarks:100,passMark:33});
  assert.strictEqual(paddedStudent.marks[0],45); assert.strictEqual(paddedStudent.totalMarks,45);
});
test("negative numeric and numeric-string marks are rejected before calculations",()=>{
  for(const mark of [-1,"-2.5"]){
    rowError([["Admission Number","Student Name","Math","Class","Gender"],["A1","Negative",mark,"X A","BOY"]]);
  }
});
test("marks at the configured maximum remain valid after string normalization",()=>{
  const maximumRows=[["Admission Number","Student Name","Math","Class","Gender"],["A1","Numeric maximum",50,"X A","BOY"],["A2","String maximum","50","X A","GIRL"],["A3","Padded maximum"," 50 ","X B","BOY"]];
  const maximumStructure=core.detectResultStructure(maximumRows), maximumStudents=core.deriveStudents(maximumStructure,{maximumMarks:50,passMark:20});
  assert.deepStrictEqual(maximumStudents.map(student=>student.marks[0]),[50,50,50]);
  assert.deepStrictEqual(maximumStudents.map(student=>student.percentage),[100,100,100]);
});
test("decimal marks are valid within range and excessive marks are rejected",()=>{
  const decimalRows=[["Admission Number","Student Name","Math","Class","Gender"],["A1","Decimal",18.75,"X A","BOY"]];
  assert.strictEqual(core.deriveStudents(core.detectResultStructure(decimalRows),{maximumMarks:50,passMark:10})[0].marks[0],19);
  for(const mark of [50.01,"51"]){
    rowError([["Admission Number","Student Name","Math","Class","Gender"],["A1","Excessive",mark,"X A","BOY"]],50);
  }
});
test("marks are validated before rounding and rounded marks drive all calculations",()=>{
  const rows=[["ADMNO","STUDENT NAME","Science","Social","English","Class"],["A1","Rounded",45.25,67.75,71.50,"X BA"]];
  const [student]=core.deriveStudents(core.detectResultStructure(rows),{maximumMarks:100,passMark:46});
  assert.deepStrictEqual(student.marks,[45,68,72]);
  assert.strictEqual(student.totalMarks,185);
  assert.strictEqual(student.percentage,61.67);
  assert.strictEqual(student.result,"FAIL");
  const boundary=[["ADMNO","STUDENT NAME","Math","Class"],["A1","Below half",45.49,"X BA"],["A2","At half",45.50,"X BA"]];
  const rounded=core.deriveStudents(core.detectResultStructure(boundary),{maximumMarks:80,passMark:46});
  assert.deepStrictEqual(rounded.map(student=>student.marks[0]),[45,46]);
  assert.deepStrictEqual(rounded.map(student=>student.result),["FAIL","PASS"]);
  assert.deepStrictEqual(core.rankStudents(rounded).map(student=>student.name),["At half","Below half"]);
  assert.throws(()=>core.deriveStudents(core.detectResultStructure([["ADMNO","STUDENT NAME","Math","Class"],["A1","Over",80.4,"X BA"]]),{maximumMarks:80,passMark:40}),error=>error.message==="Please check the details in Excel row 2.");
});
test("generic errors preserve the true Excel row including pre-header and blank rows",()=>{
  const offsetRows=[["Result report"],["Generated locally"],["Admission Number","Student Name","Social","Class","Gender"],["A1","Valid",40,"X A","BOY"],[],["A2","Iqbal Ahmed",101,"X A","BOY"]];
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
  for(const text of ["ADMNO","Student Name","Class &amp; Section","Gender","House","Other columns","Subject Mark","Blank / whitespace-only mark","Negative mark","Mark above Maximum Marks","Zero mark","Decimal mark","Mark equal to Maximum Marks","Maximum Marks","Pass Mark","Required; must not be blank","Required; must be numeric","Allowed; handled by the existing ABSENT rule","Required; every student must have a non-blank value. Distinct values are treated as separate classes.","Required; must be a positive whole number","Required; must be a positive whole number and not exceed Maximum Marks"]) assert.ok(html.includes(text),text);
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
  assert.match(controller,/minimumFractionDigits: 2, maximumFractionDigits: 2/);
  assert.match(controller,/formatPercentage\(student\.percentage\)/);
});
test("dropping a workbook clears the picker so its previous file can be reselected",()=>{
  const controllerSource=fs.readFileSync("result-analytics.js","utf8");
  assert.match(controllerSource,/if\(name==="drop"\)\{\$\("analyticsFileInput"\)\.value="";loadWorkbook\(event\.dataTransfer\.files\[0\]\);\}/);
  assert.match(controllerSource,/\$\("analyticsFileInput"\)\.addEventListener\("change", event => loadWorkbook\(event\.target\.files\[0\]\)\)/);
});

(async function integration() {
  function browserUpload(rows, workbookBytes) {
    const elements=new Map();
    const element=id=>{
      if(elements.has(id)) return elements.get(id);
      const listeners={};
      const value={id,hidden:true,disabled:false,value:"",textContent:"",innerHTML:"",className:"",listeners,
        classList:{add(){},remove(){},toggle(){return false;}},
        addEventListener(name,handler){listeners[name]=handler;},insertAdjacentElement(){},scrollIntoView(){}};
      elements.set(id,value); return value;
    };
    const document={getElementById:element,querySelectorAll:()=>[],title:""};
    const sandbox={document,console,setTimeout,clearTimeout,globalThis:null};
    sandbox.window=sandbox; sandbox.globalThis=sandbox;
    sandbox.AcadPulseResultCore=core;
    sandbox.XLSX=workbookBytes ? global.XLSX : {read:async()=>({SheetNames:["Results"],Sheets:{Results:{}}}),utils:{sheet_to_json:()=>rows}};
    vm.runInNewContext(fs.readFileSync("result-analytics.js","utf8"),sandbox,{filename:"result-analytics.js"});
    const upload=element("analyticsFileInput").listeners.change({target:{files:[{name:"live-test.xlsx",size:workbookBytes?.byteLength||100,arrayBuffer:async()=>workbookBytes||new ArrayBuffer(0)}]}});
    return Promise.resolve(upload).then(()=>({elements,element}));
  }

  test("deployed page cache-busts the Result Analytics browser bundle",()=>{
    const html=fs.readFileSync("index.html","utf8");
    assert.match(html,/vendor\/acadpulse-xlsx\.js\?v=20260909-3/);
    assert.match(html,/result-analytics-core\.js\?v=20260909-3/);
    assert.match(html,/result-analytics\.js\?v=20260909-3/);
  });

  async function realWorkbook(classValue, genderValue) {
    const workbook=global.XLSX.utils.book_new();
    const rows=[["ADMNO","STUDENT NAME","Science","Maths","Class","Gender"],["A1","Live case",45,50,classValue,genderValue]];
    global.XLSX.utils.book_append_sheet(workbook,global.XLSX.utils.aoa_to_sheet(rows),"Results");
    return global.XLSX.write(workbook,{type:"array",bookType:"xlsx"});
  }

  for(const classValue of [""," \t "]){
    const bytes=await realWorkbook(classValue,"BOY");
    const workbook=await global.XLSX.read(bytes,{type:"array"});
    const sheet=workbook.Sheets[workbook.SheetNames[0]];
    const parsedRows=global.XLSX.utils.sheet_to_json(sheet,{header:1,defval:"",raw:true});
    const header=parsedRows[0], parsedRow=parsedRows[1];
    const className=header.indexOf("Class"), gender=header.indexOf("Gender");
    test(`real XLSX preserves column alignment for ${classValue ? "whitespace-only" : "blank"} Class`,()=>{
      assert.strictEqual(className,4); assert.strictEqual(gender,5);
      assert.strictEqual(parsedRow[className],classValue); assert.strictEqual(parsedRow[gender],"BOY");
      assert.strictEqual(parsedRow.length,header.length);
    });
    test("real XLSX structure detection uses the aligned Class column before Gender",()=>{
      assert.throws(()=>core.detectResultStructure(parsedRows),error=>
        error.code==="WORKBOOK_ROW_VALIDATION" && error.message==="Class & Section is missing in Excel row 2."
      );
    });
    const {element}=await browserUpload(null,bytes);
    test("real XLSX browser route blocks missing Class before showing optional Gender warnings",()=>{
      assert.strictEqual(element("analyticsUploadMessage").textContent,"Class & Section is missing in Excel row 2.");
      assert.strictEqual(element("analyticsGenerate").disabled,true);
      assert.strictEqual(element("analyticsWarnings").hidden,true);
    });
  }

  const realMissingGender=await browserUpload(null,await realWorkbook("X BA",""));
  test("real XLSX browser route allows blank Gender and shows its warning",()=>{
    assert.strictEqual(realMissingGender.element("analyticsGenerate").disabled,false);
    assert.match(realMissingGender.element("analyticsWarningLines").innerHTML,/Gender is missing in Excel row 2\./);
  });

  const completeBytes=await realWorkbook("X BA","BOY");
  const completeWorkbook=await global.XLSX.read(completeBytes,{type:"array"});
  const completeRows=global.XLSX.utils.sheet_to_json(completeWorkbook.Sheets.Results,{header:1,defval:"",raw:true});
  const completeStructure=core.detectResultStructure(completeRows);
  test("real XLSX detected structure points Class and Gender at the parsed values",()=>{
    assert.strictEqual(completeStructure.columns.className,4);
    assert.strictEqual(completeStructure.columns.gender,5);
    assert.strictEqual(completeStructure.dataRows[0][completeStructure.columns.className],"X BA");
    assert.strictEqual(completeStructure.dataRows[0][completeStructure.columns.gender],"BOY");
  });
  const realComplete=await browserUpload(null,completeBytes);
  test("real XLSX browser route accepts populated Class and Gender",()=>{
    assert.strictEqual(realComplete.element("analyticsGenerate").disabled,false);
    assert.doesNotMatch(realComplete.element("analyticsWarningLines").innerHTML,/Class|Gender/);
  });

  for(const classValue of [""," \t "]){
    const {element}=await browserUpload([["ADMNO","STUDENT NAME","Math","Class & Section","Gender"],["A1","Valid",45,"X A","GIRL"],["A2","Live case",50,classValue,"BOY"]]);
    test(`browser upload blocks ${classValue ? "whitespace-only" : "blank"} Class & Section and shows the class error`,()=>{
      assert.strictEqual(element("analyticsUploadMessage").textContent,"Class & Section is missing in Excel row 3.");
      assert.strictEqual(element("analyticsGenerate").disabled,true);
      assert.strictEqual(element("analyticsWarnings").hidden,true);
    });
  }

  const missingGender=await browserUpload([["ADMNO","STUDENT NAME","Math","Class & Section","Gender"],["A1","Optional gender",45,"X BA",""]]);
  test("browser upload keeps blank Gender optional and displays its Data Warning",()=>{
    assert.strictEqual(missingGender.element("analyticsGenerate").disabled,false);
    assert.match(missingGender.element("analyticsWarningLines").innerHTML,/Gender is missing in Excel row 2\./);
    assert.strictEqual(missingGender.element("analyticsWarnings").hidden,false);
    assert.strictEqual(missingGender.element("analyticsUploadMessage").className,"message upload-message success");
  });

  const completeMetadata=await browserUpload([["ADMNO","STUDENT NAME","Math","Class & Section","Gender"],["A1","Complete",45,"X BA","BOY"]]);
  test("browser upload emits no Class or Gender message when both values are present",()=>{
    assert.strictEqual(completeMetadata.element("analyticsGenerate").disabled,false);
    assert.doesNotMatch(completeMetadata.element("analyticsWarningLines").innerHTML,/Class|Gender/);
    assert.doesNotMatch(completeMetadata.element("analyticsUploadMessage").textContent,/Class|Gender/);
  });

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
    assert.strictEqual(core.round2(summary.averageMarks),341.75); assert.strictEqual(core.round2(summary.averagePercentage),56.96);
  });
  console.log(`\n${passed} Result Analytics tests passed.`);
})().catch(error=>{console.error(error);process.exitCode=1});
