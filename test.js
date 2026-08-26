const assert = require("node:assert/strict");
const {pointsForPercentage, percentageForMark, normalizeHouse, detectStructure, buildScoreboard} = require("./script.js");
assert.equal(percentageForMark(40,80),50); assert.equal(percentageForMark(40,50),80); assert.equal(percentageForMark("",80),null); assert.equal(percentageForMark("Absent",80),null);
[[95,5],[94.99,3],[81,3],[80.99,2],[61,2],[60.99,0],[null,null]].forEach(([p,v])=>assert.equal(pointsForPercentage(p),v));
assert.equal(normalizeHouse(" BLUE "),"House of Blue"); assert.equal(normalizeHouse("Blue House"),"House of Blue"); assert.equal(normalizeHouse(" HOUSE OF FAITH"),"House of Faith");
const rows=[["ROLLNO","ADMNO","STUDENT NAME","Science","Maths","Gender","HOUSE"],[1,100,"Asha",40,45,"F","BLUE"],[2,101,"Ben","Absent",50,"M","Blue House"]];
const structure=detectStructure(rows); assert.deepEqual(structure.subjects.map(s=>s.name),["Science","Maths"]); const result=buildScoreboard(structure,{Science:80,Maths:50}); assert.equal(Object.keys(result).length,1); assert.equal(result["House of Blue"][0].total,3); assert.equal(result["House of Blue"][1].results[0].points,null);
console.log("All calculation and workbook-processing tests passed.");
