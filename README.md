# AcadPulse — Scoreboard Generator V1

AcadPulse is an **Academic Intelligence Platform**. This first, deliberately focused module converts a class consolidation workbook into a clear, house-wise academic scoreboard. Attendance, authentication, databases, LMS features, analytics, portals and other future modules are outside V1.

## What V1 does

- Reads an `.xlsx` consolidation workbook in the browser and uses its first worksheet.
- Detects identity/metadata fields and dynamically identifies numeric marks columns as subjects.
- Collects Exam Name, Class, Section and a separate maximum mark for every subject.
- Converts obtained marks to percentages and points, groups students by normalized House values, and displays student and house totals/averages.
- Downloads a multi-sheet Excel workbook (one sheet per house plus an overall summary).
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

## Current limitations

- Only `.xlsx` and the first worksheet are read.
- The header row must contain recognizable Student Name and House labels.
- Subject detection expects at least one numeric value in each marks column.
- House normalization handles whitespace/case and common `House of …` / `… House` forms, but does not merge unrelated aliases.
- Downloaded workbooks prioritize portable structure, widths and readable sheets; advanced cell styling is outside the local XLSX compatibility layer's intentionally small API.
- Formula-only cells without cached numeric values may not be recognized as marks.

## Planned improvements

Future Scoreboard versions may add configurable points bands, explicit subject inclusion/exclusion, workbook sheet selection, richer Excel styling, absent-status reporting and saved templates. Broader AcadPulse modules will be considered separately after this generator is validated.
