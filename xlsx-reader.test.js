const assert = require("assert");
const core = require("./result-analytics-core");
require("./vendor/acadpulse-xlsx.js");

const encoder = new TextEncoder();
const sharedValues = [
  "unused0", "unused1", "unused2", "unused3", "unused4", "unused5", "unused6", "unused7", "BOY",
  "ROLLNO", "ADMNO", "STUDENT NAME", "Science", "Social", "Lang II", "English", "Maths", "Arabic", "Class", "Gender",
  "A1", "Student", "X BA", "BEFORE", "Middle", "AFTER"
];
const sharedIndex = new Map(sharedValues.map((value, index) => [value, index]));

function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ -1) >>> 0;
}

function storedZip(files) {
  const localParts = [], centralParts = [];
  let offset = 0;
  for (const [name, source] of Object.entries(files)) {
    const nameBytes = encoder.encode(name), bytes = encoder.encode(source), crc = crc32(bytes);
    const local = new Uint8Array(30 + nameBytes.length), localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x800, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, bytes.length, true);
    localView.setUint32(22, bytes.length, true);
    localView.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    localParts.push(local, bytes);

    const central = new Uint8Array(46 + nameBytes.length), centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x800, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, bytes.length, true);
    centralView.setUint32(24, bytes.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralParts.push(central);
    offset += local.length + bytes.length;
  }
  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  const end = new Uint8Array(22), endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, centralParts.length, true);
  endView.setUint16(10, centralParts.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  const output = new Uint8Array(offset + centralSize + end.length);
  let position = 0;
  for (const part of [...localParts, ...centralParts, end]) { output.set(part, position); position += part.length; }
  return output.buffer;
}

function cell(ref, value) {
  if (value === null) return `<c r="${ref}" s="1"/>`;
  if (typeof value === "number") return `<c r="${ref}" s="1"><v>${value}</v></c>`;
  return `<c r="${ref}" t="s" s="1"><v>${sharedIndex.get(value)}</v></c>`;
}
function worksheet(dimension, rows) {
  return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="${dimension}"/><sheetData>${rows.map((row, index) => `<row r="${index + 1}">${row}</row>`).join("")}</sheetData></worksheet>`;
}
function resultSheet(className, gender) {
  const columns = "ABCDEFGHIJK";
  const headers = sharedValues.slice(9, 20);
  const student = [1, "A1", "Student", 70, 71, 72, 73, 74, 75, className, gender];
  return worksheet("A1:K2", [headers, student].map(row => row.map((value, index) => cell(`${columns[index]}${row === headers ? 1 : 2}`, value)).join("")));
}
function gapSheet(values) {
  const columns = "ABCDE";
  const headers = ["BEFORE", "Middle", "Middle", "Middle", "AFTER"];
  return worksheet(`A1:${columns[values.length - 1]}2`, [headers.slice(0, values.length), values].map((row, rowIndex) => row.map((value, index) => cell(`${columns[index]}${rowIndex + 1}`, value)).join("")));
}

function fixtureWorkbook() {
  const names = ["Missing Class", "Missing Gender", "Complete", "Single Gap", "Multiple Gaps"];
  const sheets = [resultSheet(null, "BOY"), resultSheet("X BA", null), resultSheet("X BA", "BOY"), gapSheet(["BEFORE", null, "AFTER"]), gapSheet(["BEFORE", null, null, null, "AFTER"])];
  const overrides = sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("");
  const files = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>${overrides}</Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((name, index) => `<sheet name="${name}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}<Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
    "xl/sharedStrings.xml": `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sharedValues.length}" uniqueCount="${sharedValues.length}">${sharedValues.map(value => `<si><t>${value}</t></si>`).join("")}</sst>`
  };
  sheets.forEach((sheet, index) => { files[`xl/worksheets/sheet${index + 1}.xml`] = sheet; });
  assert.match(sheets[0], /<c r="J2" s="1"\/><c r="K2" t="s" s="1"><v>8<\/v><\/c>/);
  return storedZip(files);
}

async function rowsFor(workbook, sheetName) {
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {header: 1, defval: "", raw: true});
}

(async () => {
  const workbook = await XLSX.read(fixtureWorkbook());
  const missingClass = await rowsFor(workbook, "Missing Class");
  assert.strictEqual(missingClass[1][9], "");
  assert.strictEqual(missingClass[1][10], "BOY");
  assert.ok(missingClass[1].length >= 11);
  assert.throws(
    () => core.detectResultStructure(missingClass),
    error => error.code === "WORKBOOK_ROW_VALIDATION" && error.message === "Class & Section is missing in Excel row 2."
  );

  const missingGender = await rowsFor(workbook, "Missing Gender");
  assert.strictEqual(missingGender[1][9], "X BA");
  assert.strictEqual(missingGender[1][10], "");
  const missingGenderStructure = core.detectResultStructure(missingGender);
  assert.deepStrictEqual(core.optionalMetadataWarnings(missingGenderStructure), ["Gender is missing in Excel row 2."]);

  const complete = await rowsFor(workbook, "Complete");
  assert.strictEqual(complete[1][9], "X BA");
  assert.strictEqual(complete[1][10], "BOY");
  assert.deepStrictEqual(core.optionalMetadataWarnings(core.detectResultStructure(complete)), []);

  const singleGap = await rowsFor(workbook, "Single Gap");
  assert.deepStrictEqual(singleGap[1].slice(0, 3), ["BEFORE", "", "AFTER"]);

  const multipleGaps = await rowsFor(workbook, "Multiple Gaps");
  assert.deepStrictEqual(multipleGaps[1].slice(0, 5), ["BEFORE", "", "", "", "AFTER"]);

  for (const [sheet, row, columns] of [
    ["Missing Class", missingClass[1], [10]],
    ["Missing Gender", missingGender[1], [9]],
    ["Complete", complete[1], [9, 10]],
    ["Single Gap", singleGap[1], [0, 2]],
    ["Multiple Gaps", multipleGaps[1], [0, 4]]
  ]) {
    for (const column of columns) assert.strictEqual(typeof row[column], "string", `${sheet} column ${column} exposed a shared-string index`);
  }

  console.log("✓ custom XLSX reader preserves blank cells and decodes adjacent shared strings");
})().catch(error => { console.error(error); process.exitCode = 1; });
