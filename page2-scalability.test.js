const assert = require("assert");
const page2 = require("./page2-analytics");

const subjects = [{ name: "Math" }];
const populationSize = 150000;
const students = Array.from({ length: populationSize }, (_, index) => {
  const mark = index === populationSize - 1 ? 100 : 50;
  return {
    name: index === populationSize - 1 ? "Top Student" : `Student ${index + 1}`,
    className: "X A",
    gender: "BOY",
    marks: [mark],
    totalMarks: mark,
    percentage: mark,
    result: "PASS"
  };
});

const subjectSummary = page2.subjectPerformance(students, subjects, 33, 100)[0];
assert.strictEqual(subjectSummary.highestMark, 100);
assert.deepStrictEqual(subjectSummary.toppers, [{ name: "Top Student", className: "X A" }]);

const overallToppers = page2.overallToppers(students, subjects);
assert.deepStrictEqual(overallToppers.map(student => student.name), ["Top Student"]);
assert.strictEqual(overallToppers[0].totalMarks, 100);

console.log("1 Page 2 scalability test passed.");
