# Navigation Redesign — LMX-style Workflow Consolidation

**Status:** Planned (2026-04-24). Not yet built. Visual reference is
LMX (ScalePad); screenshots in `uploads/nav-screenshots/` (client
sidebar, Overview tab bar).

Restructures the client sidebar around **workflows** (DISCOVER / PLAN
/ ENGAGE / PROCUREMENT / MANAGE) instead of flat data types. Adds a
horizontal tab bar on the client Dashboard matching LMX's info-density
layout. Collapses the Profile page into a pop-up modal that auto-opens
when a client has never configured their profile.

---

## Client Sidebar

Matches LMX layout (see screenshot). 14 items organized under 5 workflow
headings. All groups always expanded (no collapse affordance — simpler
for ~14 items).

```
Dashboard                (landing; has horizontal tab bar — see below)
DISCOVER
  Assessments            (sub-tabs: Assessments | Standards | Profile)
PLAN
  Goals
  Roadmap                (Kanban + List — see docs/roadmap-redesign.md)
  Budget
ENGAGE                   (Coming Soon for unbuilt items)
  Meetings
  Deliverables           (links to Word/PDF/Excel exports —
                          see docs/deliverables-spec.md)
  Scheduled Reports
PROCUREMENT
  Opportunities
  Quotes
  Orders
MANAGE
  Agreements             (Coming Soon)
  Contacts
  Documents              (uploaded reference/client docs — see
                          docs/document-repository-spec.md)
  Assets >               Hardware • SaaS Licenses • Software
```

**Rationale for group headings:**
- **DISCOVER** — fact-finding: what the client has, baseline standards, profile
- **PLAN** — forward-looking: goals, roadmap, budget
- **ENGAGE** — client-facing deliverables and touchpoints
- **PROCUREMENT** — buying cycle: opps → quotes → orders
- **MANAGE** — ongoing operational surfaces (contracts, people, assets)

## Global Sidebar (8 items — down from 11)

```
Dashboard
LIBRARY                  (renamed from DISCOVER — user pref: "library ideal")
  Standards              (MSP-level standards library management)
  Analytics
ENGAGE
  Reports
PROCUREMENT
  Opportunities
  Orders
MANAGE
  Clients
  Documents              (tenant-level reference reports / templates)
  Assets >               Hardware • SaaS Licenses • Software
```

Thinner intentionally — PLAN (Goals/Roadmap/Budget) is client-scoped
and collapses at the global level. ENGAGE collapses to just Reports
globally.

## Dashboard Tab Bar (per LMX screenshot)

Horizontal tab row at the top of the client Dashboard page:

```
Overview | Client IQ | Analytics | Action Items | Notes
```

- **Overview** — default; existing client dashboard with DMI score,
  Upcoming Meetings, Roadmap preview, Goals, People, Assessment Summary,
  Agreements (Expiring in 90 days), Insights, High-risk widgets
- **Client IQ** — LMX-style rolled-up intelligence snapshot. Shows
  standards maturity, trend lines, top risks, recent assessment
  deltas. (New module — placeholder initially, populate as data model
  supports it)
- **Analytics** — charts and trend views for the client (lifecycle,
  license utilization, ticket volume from AT, etc.)
- **Action Items** — chronological feed of all open tasks tied to this
  client: assessment findings requiring follow-up, recommendations in
  draft, goals off-track, initiatives overdue. (User preference: "Action
  Items" naming over "Activities.")
- **Notes** — free-form notes scoped to the client. TipTap rich text
  editor (see `ROADMAP.md`). User-level and team-level notes, pinned
  notes at top.

## Assessments Sub-Tab Bar

Horizontal tab row on the Assessments page (accessed from the sidebar's
DISCOVER > Assessments):

```
Assessments list | Standards | Profile
```

**Rationale:** Profile moves out of the sidebar because (a) it's
configured once per client at onboarding and rarely revisited, and
(b) its only downstream consumer is the standards auto-mapping engine —
so it belongs next to Standards in the UX.

## Profile Pop-Up (auto-open on unconfigured)

If a client's Profile has never been saved (all core fields blank),
the Assessments page — or ANY page that requires a configured profile
— auto-opens a modal prompting the vCIO to complete Profile before
proceeding. Once saved, the pop-up stops appearing and Profile remains
accessible via the Assessments sub-tab.

**Storage:**
- Add `clients.profile_completed_at timestamptz` — null means "never
  saved, show pop-up"
- Set the column when the vCIO saves Profile for the first time
- Never clear it (editing Profile later doesn't retrigger the pop-up)

## Header Search Bar Fix

**Bug:** The topbar search input **overlaps both the app logo and the
sidebar right edge** on certain viewport widths. On narrower viewports
(~768-1000px) the left-aligned search (`flex-1 max-w-sm`) starts too
close to the logo, covering it; on the same widths it also butts up
against the sidebar's right edge leaving no visual gutter.

**Fix in `Layout.jsx`:** Replace the left-aligned search with a
centered wrapper so the input sits in the middle of the topbar, with
clear space between it, the logo on the left, and the user menu on
the right:

```jsx
{/* Topbar layout: logo | centered search | user menu */}
<header className="flex items-center justify-between h-14 px-4 border-b">
  <div className="flex items-center gap-3">
    {/* hamburger (mobile) + logo */}
  </div>

  {/* Centered search — fixed max-width, flex-1 container centers it */}
  <div className="hidden md:flex flex-1 items-center justify-center px-6">
    <div className="w-full max-w-md">
      {/* existing search input */}
    </div>
  </div>

  <div className="flex items-center gap-2">
    {/* user menu, notifications */}
  </div>
</header>
```

Centering plus the smaller `max-w-md` (vs the old `max-w-sm` tethered
to `flex-1`) gives breathing room on both sides. The `px-6` on the
search wrapper adds a horizontal gutter so the input never touches the
logo or the user menu. Works at all viewport widths above mobile.

## Coming Soon Placeholders

User decision (2026-04-24): **YES, do both** — greyed sidebar entries
and placeholder pages.

**Treatment:**
- Render at normal opacity in the sidebar but text is greyed
  (`text-gray-400`) with a small "Coming Soon" pill after the label
- Clicking routes to a lightweight placeholder page:
  > "**[Module name]** — Coming Soon
  > [One-line description of what the module will do.]
  > Track progress in the product roadmap."
- Items starting in Coming Soon state:
  - **Meetings** (ENGAGE)
  - **Deliverables** (ENGAGE — partial: MVP Word/PDF/Excel export
    lives here; see `docs/deliverables-spec.md`)
  - **Scheduled Reports** (ENGAGE)
  - **Agreements** (MANAGE)
- Dashboard tabs placeholders:
  - **Client IQ** (Coming Soon tab — shows "Client IQ will surface
    rolled-up maturity and trend data once assessments accumulate")
  - Other tabs render their built content

## Implementation Notes

**Files that change:**

Backend (minor):
- `src/routes/clients.js` — expose `profile_completed_at` on GET

Database:
- `ALTER TABLE clients ADD COLUMN IF NOT EXISTS profile_completed_at timestamptz;`

Frontend:
- `client/src/layouts/Layout.jsx` (or wherever the topbar lives) —
  header search centering fix
- `client/src/components/Sidebar.jsx` (or the nav component) — new
  sidebar structure with group headings, greyed Coming Soon items
- `client/src/pages/ClientDetail.jsx` — Dashboard tab bar on Overview
  tab; Assessments sub-tab bar; Profile pop-up wiring
- `client/src/App.jsx` — route additions for Coming Soon pages
  (`/clients/:id/meetings`, `/deliverables`, `/scheduled-reports`,
  `/agreements` — each renders a `<ComingSoonPage />` stub)
- New component: `client/src/components/ComingSoonPage.jsx` — generic
  stub with module name + description prop

**Sidebar rules:**
- Always-expanded groups (no collapse) — simpler for ~14 items
- Group heading is plain-text caps (`DISCOVER`, `PLAN`, etc.), not a
  button. Clicking does nothing; just a visual label.
- Active route highlight is blue (existing pattern)
- Icons match LMX where possible (sticking with lucide-react equivalents)

## Open Questions (deferred until build)

1. Whether to use "Locations" as a Dashboard tab when a client has
   children, OR surface via a breadcrumb/header indicator. Current
   plan: Locations is covered in the parent/child rollup spec
   (see `docs/parent-child-rollup.md`) and doesn't need a Dashboard
   tab — child clients appear in the client list with a parent flag
   and the roll-up views live under the parent Dashboard.
2. TipTap rich text is already on the Roadmap (`ROADMAP.md` ›
   Other Planned Features) — Notes tab should share that component.
3. Where to put per-client settings (integrations, sync toggles) —
   currently lives on the Profile page. Proposal: add a Settings
   gear icon next to the client name at the top of the Dashboard,
   opens a settings modal. Parked.

## Related Docs

- [`roadmap-redesign.md`](./roadmap-redesign.md) — Kanban + List view
  refactor of the Roadmap page
- [`parent-child-rollup.md`](./parent-child-rollup.md) — enterprise
  rollup view for clients with child locations
- [`deliverables-spec.md`](./deliverables-spec.md) — print/Word/PDF
  exports for Assessments, Budget, Roadmap (lives under ENGAGE >
  Deliverables)
