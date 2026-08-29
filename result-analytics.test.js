const assert = require("assert");
const fs = require("fs");
const core = require("./result-analytics-core");
require("./vendor/acadpulse-xlsx.js");

let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log(`✓ ${name}`); } catch (error) { console.error(`✗ ${name}`); throw error; } }
const rows = [["Roll Number","Admission No","Student Name","Physics","Art","Class","Sex"],[1,"A1","Pass",80,70,"X A","BOY"],[2,"A2","Fail",20,60,"X A","GIRL"],[3,"A3","Absent",0,70,"X B","BOY"]];
const structure = core.detectResultStructure(rows);
const students = core.deriveStudents(structure,{maximumMarks:100,passMark:33});

test("metadata aliases are detected",()=>assert.deepStrictEqual(structure.columns,{roll:0,admission:1,name:2,className:5,section:-1,gender:6}));
test("subjects are detected dynamically by excluding metadata",()=>assert.deepStrictEqual(structure.subjects.map(s=>s.name),["Physics","Art"]));
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
  assert.throws(()=>core.detectResultStructure([["Name","Math","Gender"],["A",2,"GIRL"]]),/Missing Class/);
  assert.throws(()=>core.detectResultStructure([["Name","Class","Gender","Math"]]),/no student rows/i);
});
test("configuration rejects invalid maximum and pass marks",()=>{assert.throws(()=>core.validateRules(0,33),/Maximum/);assert.throws(()=>core.validateRules(50,60),/Pass Mark/)});
test("mobile stacked topbar can grow beyond the desktop fixed height",()=>{
  const responsiveCss=fs.readFileSync("result-analytics.css","utf8");
  assert.match(responsiveCss,/@media\(max-width:750px\)\{\.topbar\{[^}]*height:auto[^}]*flex-direction:column/);
});
test("numeric zero and string zero remain valid absent marks",()=>{
  const zeroRows=[["Student Name","Math","Class","Gender"],["Numeric zero",0,"X A","BOY"],["String zero","0","X A","GIRL"]];
  const zeroStructure=core.detectResultStructure(zeroRows), zeroStudents=core.deriveStudents(zeroStructure,{maximumMarks:100,passMark:33});
  assert.deepStrictEqual(zeroStudents.map(student=>student.marks[0]),[0,0]);
  assert.deepStrictEqual(zeroStudents.map(student=>student.result),["ABSENT","ABSENT"]);
});
test("whitespace-only marks are rejected instead of becoming zero",()=>{
  const whitespaceRows=[["Student Name","Math","Class","Gender"],["Valid",45,"X A","BOY"],["Blank","   \t ","X A","GIRL"]];
  const whitespaceStructure=core.detectResultStructure(whitespaceRows);
  assert.throws(()=>core.deriveStudents(whitespaceStructure,{maximumMarks:100,passMark:33}),/Invalid mark for Math.*Blank/);
});
test("whitespace around a valid mark is trimmed before conversion",()=>{
  const paddedRows=[["Student Name","Math","Class","Gender"],["Padded"," 45 ","X A","BOY"]];
  const paddedStructure=core.detectResultStructure(paddedRows), [paddedStudent]=core.deriveStudents(paddedStructure,{maximumMarks:100,passMark:33});
  assert.strictEqual(paddedStudent.marks[0],45); assert.strictEqual(paddedStudent.totalMarks,45);
});
test("negative numeric and numeric-string marks are rejected before calculations",()=>{
  for(const mark of [-1,"-2.5"]){
    const negativeRows=[["Student Name","Math","Class","Gender"],["Negative",mark,"X A","BOY"]];
    const negativeStructure=core.detectResultStructure(negativeRows);
    assert.throws(()=>core.deriveStudents(negativeStructure,{maximumMarks:100,passMark:33}),/Invalid mark for Math.*Negative/);
  }
});
test("marks at the configured maximum remain valid after string normalization",()=>{
  const maximumRows=[["Student Name","Math","Class","Gender"],["Numeric maximum",50,"X A","BOY"],["String maximum","50","X A","GIRL"],["Padded maximum"," 50 ","X B","BOY"]];
  const maximumStructure=core.detectResultStructure(maximumRows), maximumStudents=core.deriveStudents(maximumStructure,{maximumMarks:50,passMark:20});
  assert.deepStrictEqual(maximumStudents.map(student=>student.marks[0]),[50,50,50]);
  assert.deepStrictEqual(maximumStudents.map(student=>student.percentage),[100,100,100]);
});
test("numeric and string marks above the configured maximum are rejected",()=>{
  for(const mark of [50.01,"51"]){
    const excessiveRows=[["Student Name","Math","Class","Gender"],["Excessive",mark,"X A","BOY"]];
    const excessiveStructure=core.detectResultStructure(excessiveRows);
    assert.throws(()=>core.deriveStudents(excessiveStructure,{maximumMarks:50,passMark:20}),/Invalid mark for Math.*Excessive/);
  }
});
test("generation invalidates stale dashboard output without clearing the loaded workbook",()=>{
  const controllerSource=fs.readFileSync("result-analytics.js","utf8");
  const invalidator=controllerSource.match(/function invalidateGeneratedDashboard\(\)\s*\{([^}]*)\}/);
  assert.ok(invalidator); assert.match(invalidator[1],/state\.students\s*=\s*\[\]/); assert.match(invalidator[1],/\$\("analyticsDashboard"\)\.hidden\s*=\s*true/);
  assert.doesNotMatch(invalidator[1],/state\.structure\s*=/);
  assert.match(controllerSource,/function generate\(\)\s*\{\s*invalidateGeneratedDashboard\(\);\s*try\s*\{/);
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
  test("reference workbook reproduces Page 1 KPIs",()=>{
    assert.strictEqual(summary.totalStudents,215); assert.strictEqual(summary.passed,114); assert.strictEqual(core.round2(summary.passPercentage),53.02);
    assert.strictEqual(summary.present,208); assert.strictEqual(core.round2(summary.presentPercentage),96.74);
    assert.ok(Math.abs(summary.averageMarks-341.11)<0.1,`Average Marks ${summary.averageMarks}`); assert.strictEqual(core.round2(summary.averagePercentage),56.85);
  });
  console.log(`\n${passed} Result Analytics tests passed.`);
})().catch(error=>{console.error(error);process.exitCode=1});
