# AcadPulse — Academic Intelligence Platform

AcadPulse is a browser-first academic intelligence platform designed to turn school result workbooks into practical teacher-facing analytics while keeping student data local to the browser.

Current modules:

- **Scoreboard Generator V1** — converts a class consolidation workbook into a house-wise points scoreboard with Excel and PDF output.
- **Result Analytics Dashboard** — a three-page examination analytics module covering overall results, subject/class diagnostics and individual student exploration.

Attendance, authentication, databases, LMS features and portals remain outside the platform's current implemented scope.

## Scoreboard Generator V1

### What it does

- Reads an `.xlsx` consolidation workbook in the browser and uses its first worksheet.
- Detects identity/metadata fields and dynamically identifies subject headers in the standard consolidation subject region.
- Collects Exam Name, Class, Section and a separate maximum mark for every subject.
- Converts obtained marks to percentages and points, groups students by normalized House values, and displays student and house totals/averages.
- Downloads a professionally formatted, single-sheet Excel report with every House followed by an overall summary.
- Produces a printable full-report PDF or an individual House PDF through the browser's native, offline print-to-PDF workflow.
- Leaves blank and non-numeric marks blank rather than treating them as zero.

### Scoreboard calculations

`Percentage = (Obtained Marks / Maximum Marks) × 100`

Points rules are isolated in `pointsForPercentage`:

| Percentage | Points |
|---|---:|
| 95 or above | 5 |
| 81 to below 95 | 3 |
| 61 to below 81 | 2 |
| Below 61 | 0 |

Blank or non-numeric results receive neither a percentage nor points. A literal numeric zero remains a valid mark in the Scoreboard module.

## Result Analytics Dashboard

Open **Result Analytics** in the module selector, upload an `.xlsx` result workbook, review the Exam Configuration and generate the dashboard. Result Analytics is now implemented across three complementary pages:

- **Page 1 — Overall Result Analytics:** What happened in the examination?
- **Page 2 — Subject & Class Performance:** Where are the strengths, weaknesses and support requirements?
- **Page 3 — Student Explorer:** Who needs attention and why?

### Source workbook and validation

Only the first worksheet is read. The expected order is:

**Roll No | ADMNO | Student Name | Subjects | Class & Section | Gender | House**

A non-blank, unique **ADMNO** identifies a student row. Every identified student must provide **Student Name** and a non-blank value in the single **Class & Section** column. Result Analytics does not interpret or standardize the Class & Section value: each distinct trimmed value is treated as a separate class/category.

At least one subject header is required between Student Name and Class & Section. Duplicate subject headers after trimming whitespace are rejected rather than silently merged. Roll Number, Gender and House are optional metadata. Gender filtering is available when usable Gender data is present.

Result Analytics uses one configurable **Maximum Marks** and **Pass Mark** for every detected subject. Both must be positive whole numbers and Pass Mark must not exceed Maximum Marks.

Each source mark is validated before rounding. A mark below zero or above Maximum Marks is rejected. Valid marks are rounded to the nearest whole number using standard JavaScript rounding, and those rounded marks are authoritative for totals, percentages, results, averages, distributions and rankings. Displayed percentages and calculated averages use two-decimal precision where applicable.

### Core result rules

- **Total Marks** is the sum of all rounded subject marks.
- **Percentage** is `Total Marks / (Maximum Marks × number of subjects) × 100`.
- `0 = ABSENT` for Result Analytics.
- A **subject pass** is a present mark greater than or equal to the Pass Mark.
- A **subject fail** is a present mark below the Pass Mark.
- **PASS** means every subject is present and at or above the Pass Mark.
- **FAIL** means at least one non-zero subject mark is below the Pass Mark. FAIL takes precedence if the student also has an absent subject.
- **ABSENT** means at least one subject mark is zero and there is no non-zero failing mark.
- **Present** at overall-result level means the student has no absent subjects.
- Subject averages, highest marks and lowest marks use present students only; zero is never reported as a lowest mark.
- Subject Pass % is `Subject Pass Count / Subject Present Count × 100`.
- Subject score distributions exclude zero and normalize each present mark against Maximum Marks before placing it into the 10-point percentage bands.

## Page 1 — Overall Result Analytics

Page 1 provides the examination-level overview:

- Total Students
- Passed and Pass %
- Present and Present %
- Average Marks and Average %
- Average Subject Mark for present students
- Result Distribution
- Overall Percentage Distribution
- Top 10 Students
- Students Requiring Maximum Support

Class and Gender filters recalculate the complete Page 1 view. Ranking preserves genuine ties.

## Page 2 — Subject & Class Performance

Page 2 provides subject- and class-level diagnostic analysis:

- Highest Mark by Subject
- Subject Topper(s) with Class & Section, preserving ties
- Subject Performance Summary: Students, Present, Passed, Failed, Pass %, Average, Highest, Lowest and Absent
- Compact subject score-distribution mini histograms
- Students Requiring Support by Subject
- Overall Topper Summary
- Class Overall Performance Comparison
- Class × Subject Average Mark Matrix
- Class × Subject Pass % Matrix
- Class × Subject Failure Count Matrix
- Heatmap legends for low-to-high interpretation

Page 2 uses the same global Class and Gender filters as Page 1. Every metric and matrix is recalculated from the currently filtered student population rather than merely hiding rows.

## Page 3 — Student Explorer

Page 3 combines individual-student analysis with a detailed searchable result explorer.

### Student profile and comparison

Teachers can search/select a student by **Name or ADMNO** and view:

- ADMNO, Class & Section and Gender
- Overall Result
- Total Marks and Percentage
- Rank and percentile within the currently filtered population
- Subjects Passed, Failed and Absent
- Strongest subject and lowest present subject
- Measurable support areas
- Subject-wise Mark, Percentage and PASS/FAIL/ABSENT status
- Population subject average and the student's difference from that average
- Student-vs-population subject comparison

Class and Gender remain global filters, so Page 3 ranking, averages and comparisons respond to the same population selected for Pages 1 and 2.

### Detailed Student Results

The detailed table supports Page-3-only exploration using:

- Search by Name or ADMNO
- **Multi-select Result filter**
- **Multi-select Subject filter**
- **Multi-select Mark Range filter**

Selections use OR logic within a filter and AND logic across filter types. When multiple subjects and mark ranges are selected, a student matches when any selected subject falls within any selected range. A subject mark of zero remains ABSENT and is excluded from score-range matching.

The Subject-wise Performance table keeps the **Subject** column frozen while horizontally scrolling for easier comparison on narrower screens.

## Shared filtering behavior

**Class and Gender are global filters across all three Result Analytics pages.** Whatever population is selected at the top is the population represented throughout Pages 1, 2 and 3.

The no-filter state is stored separately from workbook values, so a genuine Class or Gender value literally named `All` remains filterable and is not confused with the UI's all-values state.

Page 3's Result, Subject and Mark Range filters are intentionally local to the Detailed Student Results explorer and do not change Page 1 or Page 2.

## Privacy

Workbook parsing, validation, calculations, filtering and dashboard rendering happen in the user's browser. The application has no backend and does not transmit workbook content or student data.

Analytics telemetry is event-name-only. Student names, ADMNOs, workbook filenames, marks, class/gender values, counts, filters and error details are not included in telemetry event parameters.

## Run locally

The repository includes its Excel reader/writer at `vendor/acadpulse-xlsx.js`. No installation or internet connection is required for workbook processing.

```bash
npm run serve
```

Open `http://localhost:8000`.

To run the dependency-free logic/regression tests:

```bash
npm test
```

## Current limitations

- Only `.xlsx` workbooks are supported and only the first worksheet is read.
- Result Analytics currently uses one common Maximum Marks and Pass Mark configuration across all detected subjects.
- Every detected subject cell for an identified student must contain a valid numeric mark; malformed or blank result cells are reported rather than silently reclassified.
- Formula-only cells without cached numeric values may not be recognized as marks.
- Page 1 charts are repository-local responsive SVG and do not currently provide chart-click cross-filtering.
- Scoreboard PDF export uses the browser print dialog, so the user must confirm **Save as PDF**.
- AcadPulse currently runs without user accounts, a backend database or persistent school-wide data storage.

## Development direction

The completed Result Analytics three-page dashboard establishes the examination-analysis foundation of AcadPulse. Future modules can build on this foundation separately, including academic planning, syllabus/topic tracking, attendance-linked learning-gap analysis, homework tracking and topic/chapter-linked internal assessment analytics.
