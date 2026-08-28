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

(async function integration() {
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
