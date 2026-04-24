# Document Repository — Reference Reports & Templates Upload

**Status:** Planned (2026-04-24). New ask; not yet built.

A place inside Align to upload example client-facing reports (from LMX,
MyITProcess, BrightGauge, custom PDFs/Word docs) so the vCIO can
reference them when preparing client deliverables — and later, use
them as templates when we build the full Deliverables / Scheduled
Reports module.

Ships **before** the full ENGAGE module build-out, so the vCIO can
keep using polished LMX/MyITP report formats while Align's native
MVP export (see `deliverables-spec.md`) matures.

---

## Scope

### MVP (ships first)

- Upload area at **tenant-level** (visible to all users) for reference
  reports: LMX QBR template, MyITProcess findings report, custom
  Word/PDF examples, client-approved branded templates.
- Upload area at **client-level** for client-specific documents:
  signed agreements, executed SOWs, prior-year reports, meeting notes.
- Simple list view: filename, size, uploaded-by, uploaded-at, tag,
  download button, delete button (role-gated).
- Tagging: free-text tags (e.g., `lmx`, `myitprocess`, `qbr`,
  `assessment`, `roadmap`, `budget-example`).
- File type whitelist: `.pdf`, `.docx`, `.xlsx`, `.pptx`, `.png`,
  `.jpg`. Max 50 MB per file, 500 MB per tenant quota for MVP
  (configurable).

### Phase 2 (after MVP validates format need)

- Use reference docs as **templates** for the Deliverables module
  (upload LMX QBR; Align extracts layout; generates branded PDF).
- OCR/parse reference docs to auto-suggest report sections.
- Co-branded template combinator (MSP logo + client logo).

## UI Surface

### Tenant-level: Global Sidebar > MANAGE > Documents

(New sidebar item under the global MANAGE group; fits between Clients
and Assets.)

### Client-level: Client Sidebar > MANAGE > Documents

(New sidebar item under the client MANAGE group; fits near Agreements
and Contacts.)

### Catalog UI

```
Documents                                           [ Upload + ]

Filter:  [ All tags v ] [ Search... ]               Quota: 127 MB / 500 MB

┌──────────────────────────────────────────────────────────────────┐
│ Name                 | Tag        | Size   | Uploaded       | ⋯  │
├──────────────────────┼────────────┼────────┼────────────────┼────┤
│ LMX-QBR-template.pdf | lmx,qbr    | 2.1 MB | Jason · 3d ago | ⋮  │
│ MyITP-findings.docx  | myitprocess| 640 KB | Jason · 1w ago | ⋮  │
│ Acme SOW 2026.pdf    | agreement  | 310 KB | User · 2w ago  | ⋮  │
└──────────────────────────────────────────────────────────────────┘
```

### Upload modal

```
┌── Upload Document ──────────────────────────────────┐
│                                                     │
│  [ Drag and drop here, or click to browse ]         │
│  Accepts PDF, Word, Excel, PowerPoint, images      │
│  Max 50 MB                                          │
│                                                     │
│  Tags (comma-separated)                             │
│  [ lmx, qbr, example                             ]  │
│                                                     │
│  Description (optional)                             │
│  [                                                ] │
│                                                     │
│                      [ Cancel ]  [ Upload ]         │
└─────────────────────────────────────────────────────┘
```

### Detail / preview

Click filename → slide-over with:
- File preview (PDFs inline via browser PDF renderer, images inline,
  Word/Excel show "Download to open")
- Metadata: filename, size, MIME type, uploaded by, uploaded at
- Tags (editable)
- Description (editable)
- Download button
- Delete button (role: `tenant_admin` or uploader can delete)

## Data Model

```sql
CREATE TABLE documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id        uuid REFERENCES clients(id) ON DELETE CASCADE,  -- NULL = tenant-level
  name             text NOT NULL,                                   -- original filename
  mime_type        text NOT NULL,
  size_bytes       bigint NOT NULL,
  storage_path     text NOT NULL,                                   -- filesystem path or S3 key
  tags             text[] DEFAULT '{}',
  description      text,
  uploaded_by      uuid REFERENCES users(id),
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);
CREATE INDEX ON documents (tenant_id, client_id);
CREATE INDEX ON documents USING GIN (tags);
```

## Storage

**MVP:** Local filesystem at `/opt/align/uploads/documents/<tenant_id>/<doc_id>`.
Already proven pattern — `uploads/` directory exists and is used for
the MyITProcess spreadsheet import.

**Phase 2:** Migrate to S3-compatible object storage (MinIO for
on-prem or actual S3) once multi-tenant / multi-user upload volume
warrants it. Adds signed URL for downloads; local storage uses an
authenticated proxy endpoint.

## Endpoints

```
POST   /api/documents                     Upload (multipart/form-data)
                                          Body: file + client_id? + tags? + description?
                                          Returns: document row

GET    /api/documents?client_id=&tag=     List (filters)
                                          If client_id omitted → tenant-level docs
                                          If client_id given → that client's docs
                                          (tenant_admin can see all; others scoped
                                           to assigned clients)

GET    /api/documents/:id                 Metadata (JSON)

GET    /api/documents/:id/download        Streams the file with
                                          Content-Disposition: attachment

PATCH  /api/documents/:id                 Update tags / description

DELETE /api/documents/:id                 Delete (role: tenant_admin OR uploader)
```

### Multipart handling

Use `multer` (already a project dependency for other uploads) with
disk storage:

```js
const multer = require('multer')
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const tenantDir = path.join(UPLOAD_ROOT, req.tenant.id)
      fs.mkdirSync(tenantDir, { recursive: true })
      cb(null, tenantDir)
    },
    filename: (req, file, cb) => cb(null, `${uuidv4()}-${file.originalname}`)
  }),
  limits: { fileSize: 50 * 1024 * 1024 },  // 50 MB
  fileFilter: (req, file, cb) => {
    const ok = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                'image/png', 'image/jpeg']
    cb(ok.includes(file.mimetype) ? null : new Error('Filetype not allowed'),
       ok.includes(file.mimetype))
  }
})
```

## Permissions

| Role | Can upload | Can view | Can delete |
|---|---|---|---|
| `global_admin` | tenant + any client | all | all |
| `tenant_admin` | tenant + any client | all in tenant | all in tenant |
| `vcio` | tenant-level + assigned clients | tenant-level + assigned | own uploads only |
| `tam` | assigned clients only | assigned | own uploads only |

Tenant quota enforced on upload — reject with 413 if `size_bytes` sum
across tenant would exceed the quota.

## Use Case: MVP Client Reports

Primary workflow the vCIO will use while Align's native exports
(`deliverables-spec.md`) are maturing:

1. Upload `LMX-QBR-template.pdf` to tenant-level Documents
2. During client prep, download the template, customize externally
   (edit in Word or Acrobat), and hand-deliver to the client
3. Re-upload the final customized version to the client's Documents
   tab as a record of what was delivered
4. Eventually — once Align's native export has feature parity — this
   manual workflow deprecates in favor of one-click exports

This gives the vCIO a **polished client deliverable** today without
waiting for the full Deliverables / Scheduled Reports module.

## Implementation Notes

**Files to create:**
- `src/routes/documents.js` — CRUD endpoints + multer upload handler
- `client/src/pages/Documents.jsx` — global catalog (when accessed
  from global sidebar)
- `client/src/pages/ClientDocuments.jsx` OR new tab in ClientDetail —
  client-scoped catalog
- `client/src/components/DocumentUploadModal.jsx`
- `client/src/components/DocumentPreviewSlideover.jsx`

**Files to edit:**
- `client/src/App.jsx` — routes for `/documents` and
  `/clients/:id/documents`
- `client/src/components/Sidebar.jsx` — add Documents entries under
  MANAGE groups
- `src/server.js` — register `/api/documents` router

**Migration:**
```sql
-- src/migrations/YYYYMMDD_documents_table.sql
CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  storage_path text NOT NULL,
  tags text[] DEFAULT '{}',
  description text,
  uploaded_by uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_documents_tenant_client ON documents (tenant_id, client_id);
CREATE INDEX IF NOT EXISTS idx_documents_tags ON documents USING GIN (tags);
```

## Related Docs

- [`deliverables-spec.md`](./deliverables-spec.md) — MVP native
  exports (Word/PDF/Excel) that eventually replace the manual
  upload/download workflow
- [`navigation-redesign.md`](./navigation-redesign.md) — Documents
  lives under MANAGE > Documents in both global and client sidebars
