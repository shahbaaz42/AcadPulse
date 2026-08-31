# AcadPulse — Academic Intelligence Platform

AcadPulse contains focused, browser-local academic tools. Use the module selector to move between:

- **Scoreboard Generator V1** — converts a class consolidation workbook into a house-wise points scoreboard with Excel and PDF output.
- **Result Analytics Dashboard — Phase 1** — turns a result workbook into a filterable Page 1 overall-summary dashboard.

Attendance, authentication, databases, LMS features and portals remain outside the platform's current scope.

## What V1 does

- Reads an `.xlsx` consolidation workbook in the browser and uses its first worksheet.
- Detects identity/metadata fields and dynamically identifies subject headers in the standard consolidation subject region.
- Collects Exam Name, Class, Section and a separate maximum mark for every subject.
- Converts obtained marks to percentages and points, groups students by normalized House values, and displays student and house totals/averages.
- Downloads a professionally formatted, single-sheet Excel report with every House followed by an overall summary.
- Produces a printable full-report PDF or an individual House PDF through the browser's native, offline print-to-PDF workflow.
- Leaves blank and non-numeric marks blank rather than treating them as zero.

## Run locally

The repository includes its Excel reader/writer at `vendor/acadpulse-xlsx.js`. No installation or internet connection is required.

```bash
npm run serve
```

Open <http://localhost:8000>. To run the dependency-free logic tests:

```bash
npm test
```

## Expected source structure

The first worksheet should have a header row containing a student-name field and `HOUSE`. Supported metadata aliases include common forms of Roll Number, Admission Number, Student Name, House, Class, Section and Gender. These are excluded from subjects. Remaining columns that contain at least one numeric mark are potential subjects, so names and subject counts are not fixed.

The included `X BC Pre Mid Term Consolidation.xlsx` informed the source handling: its actual columns are `ROLLNO`, `ADMNO`, `STUDENT NAME`, six subject columns and `HOUSE`; house text also contains inconsistent leading spaces. `X_BC_SCORE_BOARD_Pre_Mid_Term_Exam.xlsx` informed the two-level Percentage/Points headings and house totals/averages in the output.

## Calculations

`Percentage = (Obtained Marks / Maximum Marks) × 100`

Points rules are isolated in `pointsForPercentage`:

| Percentage | Points |
|---|---:|
| 95 or above | 5 |
| 81 to below 95 | 3 |
| 61 to below 81 | 2 |
| Below 61 | 0 |

Blank or non-numeric results receive neither a percentage nor points. A literal numeric zero remains a valid mark.

## Privacy

Parsing, calculations, preview generation and Excel creation happen in the user's browser. The application has no backend, does not transmit workbook content, and loads its Excel component from the local repository.

## Result Analytics Dashboard — Phase 1

### Workflow and source workbook

Open **Result Analytics** in the module selector, upload an `.xlsx` workbook, review the Exam Configuration and generate the dashboard. Only the first worksheet is read. The header may appear after introductory rows, but must contain recognizable aliases for **Admission Number**, **Student Name**, **Class** and **Gender**; every student row must provide all four values. Roll Number, Section, House, Remarks, Comments, Notes and Teacher Remarks are optional metadata and are not treated as subjects. Non-empty, non-metadata headers between Student Name and Class are detected dynamically as subjects, regardless of their cell contents, so invalid or blank marks are reported rather than silently dropping a subject.

Phase 1 uses one configurable **Maximum Marks** and **Pass Mark** for every detected subject. Exam Name and Academic Year identify the dashboard. The included reference workbook uses Maximum Marks `100` and Pass Mark `33`; teachers can change both for other exams.

### Calculations

- **Total Marks** is the sum of every detected subject mark.
- **Percentage** is `Total Marks / (Maximum Marks × number of subjects) × 100`, rounded to two decimals per student.
- **No. of Subjects Failed** counts marks below the Pass Mark, including zero, exactly as documented in the Power Query process.
- **No. of Subjects Absent** counts marks equal to zero.
- **PASS** means every subject mark is at least the Pass Mark.
- **FAIL** means at least one non-zero mark is below the Pass Mark. This takes precedence when the same student also has a zero.
- **ABSENT** means at least one mark is zero and there is no non-zero failing mark.
- **Present** means the student has zero absent subjects.
- Subject averages include only marks greater than zero. Percentage bands use numeric 10-point ranges, with `100` in `90-100`.

The dashboard provides Total Students, Passed, Pass %, Present, Present %, Average Marks and Average % cards; dynamic subject averages; result and percentage-range distributions; and top/bottom ten tables. Top/bottom ranking uses Power BI-compatible skipped ranks for ties.

### Filters and privacy

Class and Gender values come from the workbook. Either filter—or both together—updates every card, chart and table immediately; **Reset filters** restores the complete dataset. Workbook bytes, student identifiers, names and results remain in browser memory and are never sent to a backend. New telemetry is event-name-only and contains no workbook filename, filter, student or result data.

### Current Result Analytics limitations

- Phase 1 supports `.xlsx`, reads the first worksheet, and applies a common maximum/pass mark to all subjects.
- Every detected subject cell for a student must be numeric; malformed or blank result cells are reported rather than silently reclassified.
- Charts are responsive inline SVG rendered by a small repository-local renderer. They require no runtime chart CDN and provide native hover titles, but Phase 1 does not implement chart-click cross-filtering.
- Page 2 Subject Analysis, Page 3 Student Explorer and Topper Summary are intentionally not included. Page 2 and Page 3 are planned as separately validated follow-up phases.

## Current limitations

- Only `.xlsx` and the first worksheet are read.
- The header row must contain recognizable Student Name and House labels.
- Subject detection expects at least one numeric value in each marks column.
- House normalization handles whitespace/case and common `House of …` / `… House` forms, but does not merge unrelated aliases.
- Downloaded workbooks prioritize portable structure, widths and readable sheets; advanced cell styling is outside the local XLSX compatibility layer's intentionally small API.
- Formula-only cells without cached numeric values may not be recognized as marks.
- PDF export opens the browser print dialog so the teacher can choose **Save as PDF**; browsers intentionally require this user confirmation and may block the report window until pop-ups are allowed for localhost.

## Planned improvements

Future Scoreboard versions may add configurable points bands, explicit subject inclusion/exclusion, workbook sheet selection, richer Excel styling, absent-status reporting and saved templates. Broader AcadPulse modules will be considered separately after this generator is validated.
