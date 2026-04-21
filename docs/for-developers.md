# For Developers — Porting Prototype to Production

## Context

Align is prototyped here at `/opt/align` on `pitai-app01` by Jason working
with Claude Code. The prototype is a **reference implementation**, not the
final production codebase. Your job when porting is to re-implement each
module in production using the specs in this folder as the authoritative
design — not the prototype code.

## Read Order

1. **`CLAUDE.md` (repo root)** — current focus, what's active, what's parked
2. **`docs/product-spec.md`** — strategic overview
3. **`docs/CHANGELOG.md`** — what changed recently (skim top 50 entries)
4. **`docs/adr/`** — architectural decisions (read all, quick — they're short)
5. **Module spec you're porting** — `docs/<module>-spec.md`
6. **Prototype code for that module** — `src/routes/<module>.js`,
   `src/services/<module>*.js`, `client/src/pages/<Module>.jsx` — as reference

## Philosophy: Spec Is Truth, Code Is Reference

The prototype undergoes hundreds of iterative micro-changes as Jason and
Claude refine behavior. **The module spec is updated with each meaningful
change** — it reflects final intent. The prototype code reflects the current
implementation but may have scaffolding, commented-out experiments, or
iteration artifacts.

**When spec and code disagree:**
1. Check `CHANGELOG.md` for recent entries on that module — code may be ahead
   of spec, spec may be ahead of code, or the change may be mid-flight
2. If unclear, ask Jason — don't assume

## What's Stable vs Iterating

Look at the module table in `docs/README.md`:
- **Implemented** status = behavior is stable, port it as-specified
- **In Progress** = actively changing, wait or sync with Jason first
- **Draft** / **Approved** = not yet built, don't port yet

## Port-Over Checklist (per module)

When you port a module to production:

- [ ] Read the module spec front-to-back
- [ ] Scan CHANGELOG for all entries tagged with that module
- [ ] Read any ADRs the spec references
- [ ] Re-implement in production using YOUR patterns (don't copy prototype
      code wholesale — the prototype uses Node/Express/React/Tailwind/PG;
      your production stack may differ)
- [ ] Match the spec's API contracts exactly (routes, request/response shapes,
      enum values) so downstream clients don't break
- [ ] Match the spec's DB schema exactly (column names, types, constraints)
      unless your production DB differs — in which case note it in an ADR
- [ ] Update `docs/README.md` Ported column: ☐ → ✅
- [ ] Let Jason know so the prototype version can be retired or frozen

## Common Gotchas

### Auth
Prototype uses JWT in `align_token` httpOnly cookie + local/SSO via MSAL.
Production auth may differ — match the spec's AUTHZ model (role-based, see
product-spec.md) but use your auth infrastructure.

### Multi-tenancy
Every table has `tenant_id uuid NOT NULL`. All queries filter by tenant.
This is non-negotiable — see ADR-002 if/when it exists.

### Autotask Company ID as canonical key
Every client/company cross-references via Autotask Company ID. See
ADR-001 and `docs/api-integrations.md`.

### Env vars
Prototype `/opt/align/.env` has all third-party credentials. Production
should use a secrets manager; match the variable names so the service
code ports cleanly. See the `.env.example` (if present) or the .env file
itself for the variable list.

### Frontend
Prototype uses React + Vite + Tailwind. If production is a different
stack (Next.js, Svelte, etc.), re-implement the UI based on the spec's
UX description + screenshots/prototype as visual reference. Don't copy
Tailwind classes verbatim into a framework that doesn't use Tailwind.

## Data Migration

Some modules (like Phase 4 Assessments) have significant seed data —
1,387 imported standards with 5,000+ response rows. When porting:

1. Export prototype DB data via `pg_dump` (snapshots live in
   `~/backups/align/` on pitai-app01)
2. Transform for production schema if different
3. Load into production DB

Jason's auto-generated content (e.g., standards from spreadsheet imports)
should be treated as data not code — migrate the data rather than re-running
the import pipeline in production.

## Communication with Jason

- For iterative behavior changes: he'll update the spec, you re-read
- For questions on intent: slack/email Jason, he'll clarify + update spec
  if it was ambiguous
- For porting estimates: check the "Build phases" section in each module
  spec — it's Claude's estimate for prototype effort, not production, but
  gives a rough sense of module complexity
