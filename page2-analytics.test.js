const assert = require("assert");
const core = require("./result-analytics-core");
const page2 = require("./page2-analytics");

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}

const rows = [
  ["ADMNO", "STUDENT NAME", "Math", "Science", "Music", "Class", "Gender"],
  ["A1", "Alex", 100, 33, 0, "X A", "BOY"],
  ["A2", "Blair", 90, 32, 10, "X A", "GIRL"],
  ["A3", "Casey", 90, 0, 20, "X B", "BOY"],
  ["A4", "Drew", 10, 65, 78, "X B", "GIRL"],
  ["A5", "Evan", 0, 100, 100, "X C", "BOY"]
];
const structure = core.detectResultStructure(rows);
const students = core.deriveStudents(structure, { maximumMarks: 100, passMark: 33 });
const analysis = page2.analyze(students, structure.subjects, { maximumMarks: 100, passMark: 33 });
const bySubject = name => analysis.subjectSummary.find(item => item.subject === name);

test("every dynamically detected subject receives a summary", () => assert.deepStrictEqual(analysis.subjectSummary.map(x => x.subject), ["Math", "Science", "Music"]));
test("subject counts distinguish absence, failure, and passing presence", () => assert.deepStrictEqual(
  (({ studentCount, presentCount, absentCount, passCount, failCount }) => ({ studentCount, presentCount, absentCount, passCount, failCount }))(bySubject("Math")),
  { studentCount: 5, presentCount: 4, absentCount: 1, passCount: 3, failCount: 1 }
));
test("subject percentages and averages use present students only", () => { assert.strictEqual(bySubject("Math").passPercentage, 75); assert.strictEqual(bySubject("Math").averageMark, 72.5); });
test("half-cent averages round upward consistently", () => {
  const marks = Array(39).fill(10).concat(13);
  const halfTieStudents = marks.map((mark, index) => ({
    name: `Student ${index + 1}`,
    className: "X A",
    gender: "BOY",
    marks: [mark],
    totalMarks: mark,
    percentage: mark,
    result: "FAIL"
  }));
  const halfTieSubjects = [{ name: "Math" }];
  const result = page2.analyze(halfTieStudents, halfTieSubjects, { maximumMarks: 100, passMark: 33 });
  assert.strictEqual(result.subjectSummary[0].averageMark, 10.08);
  assert.strictEqual(result.classPerformance[0].averageMarks, 10.08);
  assert.strictEqual(result.classPerformance[0].averagePercentage, 10.08);
  assert.strictEqual(result.matrices.averages[0].values.Math, 10.08);
});
test("half-cent pass percentages round upward consistently", () => {
  const passRateStudents = Array.from({ length: 32 }, (_, index) => ({
    name: `Student ${index + 1}`,
    className: "X A",
    gender: "BOY",
    marks: [index === 0 ? 33 : 1],
    totalMarks: index === 0 ? 33 : 1,
    percentage: index === 0 ? 33 : 1,
    result: index === 0 ? "PASS" : "FAIL"
  }));
  const result = page2.analyze(passRateStudents, [{ name: "Math" }], { maximumMarks: 100, passMark: 33 });
  assert.strictEqual(result.subjectSummary[0].passPercentage, 3.13);
  assert.strictEqual(result.matrices.passPercentages[0].values.Math, 3.13);
});
test("highest and lowest marks exclude absence zero", () => { assert.strictEqual(bySubject("Music").highestMark, 100); assert.strictEqual(bySubject("Music").lowestMark, 10); });
test("distribution excludes zero and applies lower-inclusive boundaries", () => assert.deepStrictEqual(bySubject("Music").distribution, {
  "0-10": 0, "10-20": 1, "20-30": 1, "30-40": 0, "40-50": 0, "50-60": 0, "60-70": 0, "70-80": 1, "80-90": 0, "90-100": 1
}));
test("distribution assigns 1, 9, 10, 19, 90, 99 and 100 safely", () => assert.deepStrictEqual(page2.distributionFor([0, 1, 9, 10, 19, 90, 99, 100]), {
  "0-10": 2, "10-20": 2, "20-30": 0, "30-40": 0, "40-50": 0, "50-60": 0, "60-70": 0, "70-80": 0, "80-90": 0, "90-100": 3
}));
test("distribution normalizes marks using configured Maximum Marks", () => assert.deepStrictEqual(page2.distributionFor([0, 15, 30, 149, 150], 150), {
  "0-10": 0, "10-20": 1, "20-30": 1, "30-40": 0, "40-50": 0, "50-60": 0, "60-70": 0, "70-80": 0, "80-90": 0, "90-100": 2
}));
test("analysis normalizes only distribution values and preserves raw-mark metrics", () => {
  const highRows = [
    ["ADMNO", "STUDENT NAME", "Math", "Class", "Gender"],
    ["H1", "High", 150, "X A", "BOY"],
    ["H2", "Middle", 75, "X A", "GIRL"]
  ];
  const highStructure = core.detectResultStructure(highRows);
  const highStudents = core.deriveStudents(highStructure, { maximumMarks: 150, passMark: 50 });
  const summary = page2.analyze(highStudents, highStructure.subjects, { maximumMarks: 150, passMark: 50 }).subjectSummary[0];
  assert.deepStrictEqual(
    { averageMark: summary.averageMark, highestMark: summary.highestMark, lowestMark: summary.lowestMark, passCount: summary.passCount },
    { averageMark: 112.5, highestMark: 150, lowestMark: 75, passCount: 2 }
  );
  assert.strictEqual(summary.distribution["50-60"], 1);
  assert.strictEqual(summary.distribution["90-100"], 1);
});
test("all tied subject toppers include name and Class & Section", () => assert.deepStrictEqual(bySubject("Math").toppers, [{ name: "Alex", className: "X A" }]));
test("subject topper ties are preserved", () => {
  const tied = page2.subjectPerformance([students[1], students[2]], structure.subjects, 33)[0];
  assert.strictEqual(tied.highestMark, 90);
  assert.deepStrictEqual(tied.toppers, [{ name: "Blair", className: "X A" }, { name: "Casey", className: "X B" }]);
});
test("overall topper details include every subject mark", () => assert.deepStrictEqual(analysis.overallToppers, [{ name: "Evan", className: "X C", totalMarks: 200, percentage: 66.67, subjectMarks: { Math: 0, Science: 100, Music: 100 } }]));
test("overall ties are preserved", () => {
  const tied = page2.overallToppers([{ ...students[0], totalMarks: 200 }, students[4]], structure.subjects);
  assert.deepStrictEqual(tied.map(x => x.name), ["Alex", "Evan"]);
});
test("support counts only present failing students", () => assert.deepStrictEqual(analysis.supportBySubject, [{ subject: "Math", count: 1 }, { subject: "Science", count: 1 }, { subject: "Music", count: 2 }]));
test("class overall performance includes result and average measures", () => assert.deepStrictEqual(analysis.classPerformance[0], { className: "X A", studentCount: 2, passed: 0, failed: 1, absentResult: 1, averageMarks: 132.5, averagePercentage: 44.17 }));
test("class by subject matrices calculate present-only averages and pass rates", () => {
  assert.deepStrictEqual(analysis.matrices.averages[0], { className: "X A", values: { Math: 95, Science: 32.5, Music: 10 } });
  assert.deepStrictEqual(analysis.matrices.passPercentages[0], { className: "X A", values: { Math: 100, Science: 50, Music: 0 } });
  assert.deepStrictEqual(analysis.matrices.failureCounts[0], { className: "X A", values: { Math: 0, Science: 1, Music: 1 } });
});
test("class matrices preserve a valid __proto__ subject key", () => {
  const protoSubjects = [{ name: "__proto__" }];
  const protoStudents = [{ name: "Alex", className: "X A", gender: "BOY", marks: [75], totalMarks: 75, percentage: 75, result: "PASS" }];
  const matrices = page2.classSubjectMatrices(protoStudents, protoSubjects, 33);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(matrices.averages[0].values, "__proto__"), true);
  assert.strictEqual(matrices.averages[0].values.__proto__, 75);
  assert.strictEqual(matrices.passPercentages[0].values.__proto__, 100);
  assert.strictEqual(matrices.failureCounts[0].values.__proto__, 0);
});
test("Class & Section and Gender filters combine and recalculate", () => {
  const filtered = page2.analyze(students, structure.subjects, { maximumMarks: 100, passMark: 33 }, { className: "X B", gender: "GIRL" });
  assert.deepStrictEqual(filtered.population.map(x => x.name), ["Drew"]);
  assert.strictEqual(filtered.subjectSummary[0].studentCount, 1);
  assert.strictEqual(filtered.subjectSummary[0].averageMark, 10);
  assert.deepStrictEqual(filtered.classPerformance.map(x => x.className), ["X B"]);
});
test("empty-string and omitted filters impose no restriction", () => {
  assert.strictEqual(page2.filterPopulation(students, { className: "", gender: "" }).length, 5);
  assert.strictEqual(page2.filterPopulation(students).length, 5);
});
test("literal All remains filterable as a real Class & Section value", () => {
  const literalAllStudents = [
    { name: "Class All", className: "All", gender: "BOY", marks: [80], totalMarks: 80, percentage: 80, result: "PASS" },
    { name: "Other Class", className: "X A", gender: "BOY", marks: [70], totalMarks: 70, percentage: 70, result: "PASS" }
  ];
  const filtered = page2.filterPopulation(literalAllStudents, { className: "All" });
  assert.deepStrictEqual(filtered.map(student => student.name), ["Class All"]);
});
test("literal All remains filterable as a real Gender value", () => {
  const literalAllStudents = [
    { name: "Gender All", className: "X A", gender: "All", marks: [80], totalMarks: 80, percentage: 80, result: "PASS" },
    { name: "Other Gender", className: "X A", gender: "BOY", marks: [70], totalMarks: 70, percentage: 70, result: "PASS" }
  ];
  const filtered = page2.filterPopulation(literalAllStudents, { gender: "All" });
  assert.deepStrictEqual(filtered.map(student => student.name), ["Gender All"]);
});
test("empty filtered populations retain subjects with null safe metrics", () => {
  const empty = page2.analyze(students, structure.subjects, { maximumMarks: 100, passMark: 33 }, { className: "Not present" });
  assert.strictEqual(empty.population.length, 0);
  assert.deepStrictEqual(empty.subjectSummary.map(x => [x.studentCount, x.presentCount, x.passPercentage, x.averageMark, x.highestMark, x.lowestMark]), [[0, 0, null, null, null, null], [0, 0, null, null, null, null], [0, 0, null, null, null, null]]);
  assert.deepStrictEqual(empty.overallToppers, []); assert.deepStrictEqual(empty.classPerformance, []); assert.deepStrictEqual(empty.matrices.averages, []);
});
test("a class with no present subject marks gets null average/pass rate and zero failures", () => {
  const one = page2.classSubjectMatrices([students[0]], structure.subjects, 33);
  assert.strictEqual(one.averages[0].values.Music, null); assert.strictEqual(one.passPercentages[0].values.Music, null); assert.strictEqual(one.failureCounts[0].values.Music, 0);
});
test("an all-absent subject has null summary measures rather than zero marks", () => {
  const music = page2.subjectPerformance([students[0]], structure.subjects, 33)[2];
  assert.deepStrictEqual([music.presentCount, music.absentCount, music.passPercentage, music.averageMark, music.highestMark, music.lowestMark], [0, 1, null, null, null, null]);
  assert.deepStrictEqual(music.toppers, []);
});
test("analysis rejects invalid configuration", () => {
  assert.throws(() => page2.analyze(students, structure.subjects, { maximumMarks: 100, passMark: 0 }), /positive whole number/);
  assert.throws(() => page2.analyze(students, structure.subjects, { maximumMarks: 0, passMark: 33 }), /positive whole number/);
  assert.throws(() => page2.analyze(students, structure.subjects, { maximumMarks: 100.5, passMark: 33 }), /Maximum Marks must be a positive whole number/);
  assert.throws(() => page2.analyze(students, structure.subjects, { maximumMarks: 100, passMark: 33.5 }), /Pass Mark must be a positive whole number/);
  assert.throws(() => page2.analyze(students, structure.subjects, { maximumMarks: 30, passMark: 33 }), /Pass Mark cannot exceed Maximum Marks/);
});

console.log(`${passed} Page 2 analytics tests passed.`);
