const assert = require('assert');
const page3 = require('./page3-analytics.js');

const subjects = [{name:'Science'},{name:'Maths'},{name:'Arabic'}];
const configuration = { maximumMarks: 100, passMark: 33 };
const students = [
  { sourceIndex:0, admission:'1', roll:1, name:'A', className:'X BA', gender:'BOY', marks:[80,40,0], totalMarks:120, percentage:40, result:'ABSENT' },
  { sourceIndex:1, admission:'2', roll:2, name:'B', className:'X BA', gender:'BOY', marks:[60,20,90], totalMarks:170, percentage:56.67, result:'FAIL' },
  { sourceIndex:2, admission:'3', roll:3, name:'C', className:'X BB', gender:'GIRL', marks:[70,50,90], totalMarks:210, percentage:70, result:'PASS' },
  { sourceIndex:3, admission:'4', roll:4, name:'D', className:'All', gender:'All', marks:[90,90,90], totalMarks:270, percentage:90, result:'PASS' }
];

assert.strictEqual(page3.filterPopulation(students, { className:'X BA', gender:'BOY' }).length, 2);
assert.strictEqual(page3.filterPopulation(students, { className:'All' }).length, 1, 'literal All class must remain filterable');
assert.strictEqual(page3.filterPopulation(students, {}).length, 4);

const analysis = page3.analyze(students, subjects, configuration, { className:'X BA' }, '2');
assert.strictEqual(analysis.profile.name, 'B');
assert.strictEqual(analysis.profile.rank, 1);
assert.strictEqual(analysis.profile.populationSize, 2);
assert.strictEqual(analysis.profile.passedSubjects, 2);
assert.strictEqual(analysis.profile.failedSubjects, 1);
assert.strictEqual(analysis.profile.absentSubjects, 0);
assert.strictEqual(analysis.profile.strongest.subject, 'Arabic');
assert.strictEqual(analysis.profile.lowest.subject, 'Maths');
assert.strictEqual(analysis.profile.subjectRows[0].populationAverage, 70);
assert.strictEqual(analysis.profile.subjectRows[0].difference, -10);

const absentProfile = page3.analyze(students, subjects, configuration, { className:'X BA' }, '1').profile;
assert.strictEqual(absentProfile.subjectRows[2].status, 'ABSENT');
assert.strictEqual(absentProfile.subjectRows[2].difference, null, 'absent marks should not compare to population average');

const filtered = page3.detailedRows(students, subjects, configuration, { subject:'Maths', markRange:'0-30' });
assert.deepStrictEqual(filtered.map(row => row.admission), ['2']);
assert.strictEqual(page3.detailedRows(students, subjects, configuration, { result:'PASS' }).length, 2);
assert.strictEqual(page3.detailedRows(students, subjects, configuration, { query:'3' })[0].name, 'C');

console.log('page3-analytics tests passed');
