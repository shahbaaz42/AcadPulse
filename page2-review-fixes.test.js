const assert = require("assert");
const core = require("./result-analytics-core");
const page2 = require("./page2-analytics");

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}

test("duplicate subject headers are rejected after trimming whitespace", () => {
  const rows = [
    ["ADMNO", "STUDENT NAME", "Maths", "  Maths  ", "Class", "Gender"],
    ["A1", "Student", 80, 75, "X A", "BOY"]
  ];
  assert.throws(
    () => core.detectResultStructure(rows),
    error => error.code === "WORKBOOK_STRUCTURE_VALIDATION" && error.message.includes('Duplicate subject header found: "Maths"')
  );
});

test("subject topper ties are alphabetical regardless of workbook order", () => {
  const students = [
    { name: "Zara", className: "X B", marks: [90] },
    { name: "Ayaan", className: "X A", marks: [90] }
  ];
  const summary = page2.subjectPerformance(students, [{ name: "Maths" }], 33)[0];
  assert.deepStrictEqual(summary.toppers, [
    { name: "Ayaan", className: "X A" },
    { name: "Zara", className: "X B" }
  ]);
});

test("overall topper ties are alphabetical regardless of workbook order", () => {
  const students = [
    { name: "Zara", className: "X B", marks: [90], totalMarks: 90, percentage: 90 },
    { name: "Ayaan", className: "X A", marks: [90], totalMarks: 90, percentage: 90 }
  ];
  const toppers = page2.overallToppers(students, [{ name: "Maths" }]);
  assert.deepStrictEqual(toppers.map(student => student.name), ["Ayaan", "Zara"]);
});

console.log(`${passed} Page 2 review-fix tests passed.`);
