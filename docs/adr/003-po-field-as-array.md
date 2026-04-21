# ADR-003: PO field stored as array, not comma-separated string

**Status:** Accepted  •  **Date:** 2026-04-21

## Context

An Autotask Opportunity may have multiple POs when the order spans
multiple distributors (parts from Ingram + parts from Synnex, etc.).
The Autotask PO field is a single text field that the MSP team
currently fills with comma-separated values like
`"PO-1234, PO-5678, AMZN-ABC-789"`.

Options considered:
- **Store as text** — match Autotask's format. Simple but every query
  that filters by PO must do string splitting.
- **Store as `text[]`** — parse Autotask's text into a proper array
  on sync. Queries use `ANY()` or `@>` for efficient matching.

## Decision

**`opportunities.po_numbers text[]`** — parsed as an array on every
Autotask sync. The PO Mapper UI appends to the array and serializes
back to comma-separated text when writing to Autotask.

## Consequences

**Positive:**
- Queries like "find the opp for this PO" become clean:
  `WHERE po_numbers @> ARRAY['PO-1234']`
- GIN index on the array is trivial (`CREATE INDEX ON opportunities
  USING GIN (po_numbers)`)
- No string-splitting bugs (duplicate whitespace, missing commas, etc.)
- Easy to count multi-PO opportunities

**Negative:**
- Round-trip to Autotask needs consistent serialization (join with
  `", "` — matches MSP convention)
- Parse on every sync could drift if Autotask format changes (e.g.,
  someone uses semicolons) — sync service must handle gracefully
- Slightly more code than just storing text

## Parse Rules

On sync from Autotask:
- Split on `,` or `;` or newline
- Trim whitespace on each element
- Drop empty strings
- Dedupe (preserve original order)

On write to Autotask:
- Join with `", "` (space after comma, matches existing convention)

## Related

- `docs/order-management-spec.md` — Matcher service design depends on this
- ADR-001 — canonical client key (unrelated but sets precedent for
  parsing-on-sync approach)
