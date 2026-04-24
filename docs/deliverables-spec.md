# Deliverables — Print/Word/PDF/Excel Export Spec

**Status:** Planned (2026-04-24). MVP scope only — generate downloadable
client-facing artifacts for Assessment, Budget, and Roadmap today, so
the vCIO has something to bring to client meetings while the full
Scheduled Reports module is still being built.

Lives under the client sidebar at **ENGAGE > Deliverables**. The full
template-driven Scheduled Reports module (cron-triggered QBR/monthly
PDFs, custom templates, automated branding) is planned later as a
separate build; see `ROADMAP.md`.

---

## MVP (Right Now)

Three one-click exports. No templates, no builder UI, no scheduling.
Just: vCIO clicks "Export as Word" or "Export as PDF" or "Export as
Excel" on any of three pages, gets a file.

### Export targets

| Source | Word | PDF | Excel |
|---|---|---|---|
| **Assessment detail** | ✓ | ✓ | — |
| **Budget** | ✓ | ✓ | ✓ |
| **Roadmap** | ✓ | ✓ | ✓ |

**Why these three:**
- **Assessment** — client review deliverable (strongest need; replaces
  ScalePad MyITProcess report printout)
- **Budget** — client budget presentation with line items, totals by
  year, per-month rollup
- **Roadmap** — year-over-year initiative plan for exec review

**Not in MVP:**
- Client Profile print (low value — internal artifact)
- Standards Library print (huge, of limited value)
- Recommendations print (exported as part of Assessment already)

### Where the button lives

On each source page (`AssessmentDetail.jsx`, `Budget.jsx`,
`Roadmap.jsx`), add a button to the top-right action area:

```
[ Share with client ... ]  [ Export v ]
                                 │
                                 ├── Export as Word (.docx)
                                 ├── Export as PDF
                                 └── Export as Excel (.xlsx)    [Budget & Roadmap only]
```

On **ENGAGE > Deliverables** page, render a catalog of exportable
artifacts so the vCIO can grab everything from one place:

```
Deliverables — client-ready exports

Assessment Reports
  • [Assessment Name]   Completed 2026-04-20   [Word] [PDF]
  • [Assessment Name]   Completed 2026-03-15   [Word] [PDF]

Budget
  • 2026 Budget (current)                       [Word] [PDF] [Excel]
  • 2025 Budget (archived)                      [Word] [PDF] [Excel]

Roadmap
  • 2026 Roadmap (current)                      [Word] [PDF] [Excel]
  • 2027 Planning                                [Word] [PDF] [Excel]
```

## Technology Choices

| Output | Node library | Why |
|---|---|---|
| **Word (.docx)** | `docx` (dolanmiu/docx) | Pure JS, no external binary; templated via code |
| **PDF** | `puppeteer` headless Chrome → render a print-styled HTML page to PDF | Same styling as web version; no layout divergence |
| **Excel (.xlsx)** | `exceljs` | Supports formulas, cell formatting, sheet-per-year |

Puppeteer is already available in the Linux environment. `docx` and
`exceljs` are lightweight npm installs.

## Rendering Pipeline

Shared pattern for all three:

```
1. Backend endpoint: GET /api/exports/:type/:id?format=pdf|word|excel
   - :type = assessment | budget | roadmap
   - :id   = source ID
   - format query determines output

2. Hydrate data:
   - Assessment: load assessment + items + responses + standards + answer state
   - Budget: load budget lines + rollup + year-over-year
   - Roadmap: load initiatives + quarterly bucketing + fees

3. Generate:
   - PDF: Puppeteer loads /clients/:id/assessment/:id?print=1 as an auth'd
     internal URL; CSS has @media print rules; saves PDF
   - Word: build a DocX document programmatically with the docx library
     (paragraphs, tables, headings, page breaks)
   - Excel: exceljs — one sheet per year for budget, one sheet per
     quarter or one flat for roadmap

4. Stream the file back with appropriate Content-Type + Content-Disposition
```

## Print-Friendly Web Page (for PDF via Puppeteer)

Each source page gets a `?print=1` mode that hides chrome (sidebar,
top bar, buttons) and applies print-specific CSS:

```css
@media print {
  .no-print, aside, .page-topbar, button { display: none; }
  body { font-size: 11pt; color: #000; }
  table { page-break-inside: avoid; }
  h1, h2 { page-break-after: avoid; }
  .page-break { page-break-before: always; }
}
```

When `?print=1` is set, the React page renders:
- Logo + client name header
- Generated-on date
- Source content as a print-friendly document
- Page footer with page numbers (via CSS counter)

Puppeteer then:
```js
const browser = await puppeteer.launch({ headless: 'new' })
const page = await browser.newPage()
await page.setCookie(authCookie)
await page.goto(`${FRONTEND_URL}/clients/${clientId}/assessment/${assessmentId}?print=1`)
await page.waitForSelector('[data-ready]', { timeout: 10_000 })
const pdf = await page.pdf({ format: 'Letter', printBackground: true, margin: { top: '0.5in', bottom: '0.75in', left: '0.5in', right: '0.5in' } })
await browser.close()
return pdf
```

## Word Document Structure (per source)

### Assessment Report (.docx)

```
[Logo / Header]
Assessment Report
[Client Name]
Assessment: [Assessment Name]
Date: [Completed Date]
Conducted by: [User]

Executive Summary
  [overall_score graphic]
  [alignment_score_by_domain table]

Findings
  (one section per domain)
    (one row per misaligned item — standard name, response, internal notes,
     business_impact, technical_rationale, evidence examples)

Recommendations
  (linked from assessment_items.recommendations)

Appendix
  All items (aligned and misaligned) — compact table
```

### Budget Report (.docx / .xlsx)

```
2026 Budget — [Client Name]

By Year
  2024 actual | 2025 actual | 2026 forecast | 2027 forecast

By Category
  Hardware lifecycle     $XX,XXX
  Software & licenses    $XX,XXX
  Labor & consulting     $XX,XXX
  Managed services (MRR) $XX,XXX / month

By Month
  [table: 12 months × categories]

Line items
  [table: date | category | description | one-time | recurring | notes]
```

### Roadmap Report (.docx / .xlsx)

```
2026 Technology Roadmap — [Client Name]

By Quarter (Kanban to table translation)
  Q1 2026
    • [Initiative] — POC, Status, Priority, $ one-time, $/mo recurring
  Q2 2026
    ...
  Q3 2026
  Q4 2026
  Not Scheduled

Financial rollup
  Per-quarter totals (1-time, monthly recurring, annualized)
  Year total

Initiative details
  [one page per initiative with description, POC, dependencies,
   linked PSA ticket/opp, fee breakdown]
```

## Endpoints (new)

```
GET /api/exports/assessment/:id?format=pdf|word
GET /api/exports/budget/:clientId/:year?format=pdf|word|excel
GET /api/exports/roadmap/:clientId/:year?format=pdf|word|excel
GET /api/exports/catalog/:clientId     # list available exports for
                                       # the Deliverables page
```

All require `requireAuth` + scoped to tenant.

## Future (after MVP)

Full Deliverables / Scheduled Reports module:
- Template designer (drag-drop sections, edit copy, upload logos)
- Scheduled generation (monthly QBR, quarterly business review)
- Email delivery with secure download links
- Archive of all past-generated reports per client
- Co-branded templates (MSP + client logos)

All parked until MVP usage validates the format.

## Related Docs

- [`navigation-redesign.md`](./navigation-redesign.md) — Deliverables
  lives under ENGAGE > Deliverables in the client sidebar
- [`roadmap-redesign.md`](./roadmap-redesign.md) — Roadmap data that
  feeds the Roadmap export
