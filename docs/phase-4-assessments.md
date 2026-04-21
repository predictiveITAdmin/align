# Phase 4 — Standards-Based Assessment & Review Cycles

Assessment module design: onboarding phases (critical-first then remaining), recurring review cycles per frequency, per-client review cadence setting.

---

## Onboarding Assessment (New Client)

- **Phase 1 (Initial):** Critical-to-high risk/priority standards assessed first — these are the items to remediate immediately during onboarding
- **Phase 2 (Remaining):** All other applicable standards assessed after the critical items are addressed
- Goal: structured onboarding that prioritizes the most impactful gaps first

## Recurring Review Cycles

- Each standard has a review frequency (monthly, quarterly, semi-annual, annual)
- System tracks when each standard was last reviewed for a client
- Upcoming reviews are triggered based on: `frequency` + `last_review_date` for that client+standard
- This drives the regular review cycle — no manual scheduling needed, the system surfaces what's due

## Per-Client Review Cadence Setting

- Client-level setting for review cycle frequency (e.g., monthly vs quarterly)
- Smaller clients may not need monthly reviews — their cadence can be set to quarterly or semi-annual
- This setting controls which recurring reviews surface for that client

---

## Why This Design

Onboarding needs a phased approach so critical gaps are addressed first. Recurring reviews need to be automated based on frequency and last-review timestamps rather than manual scheduling. Smaller clients don't justify the same review cadence as larger ones.

## How to Apply

When building the assessment module, design the data model to support:
1. Onboarding assessment with priority-based phasing
2. Per-standard review frequency
3. Last-reviewed tracking per client+standard
4. Client-level cadence override setting

The review cycle engine should compute "what's due" dynamically.
