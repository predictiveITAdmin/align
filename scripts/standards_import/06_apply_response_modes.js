#!/usr/bin/env node
/**
 * Apply classifications to imported drafts:
 *   1. Set response_mode on each standard
 *   2. Delete existing 5-level responses
 *   3. Generate appropriate responses per mode:
 *      - binary:        2 responses (Compliant / Non-Compliant) + NA  = 3 rows
 *      - ternary:       3 responses (Yes / Partial / No) + NA          = 4 rows
 *      - graded:        5 responses (current 5-level)                  = 5 rows (unchanged)
 *      - informational: 1 response (Documented) + NA                   = 2 rows
 */
process.env.PGHOST = '10.168.2.46'
process.env.PGPASSWORD = '7fa2b0cbec402d3d0c2aa05b858e84f3fb5aa8d7bd3d508e'

const fs = require('fs')
const db = require('/opt/align/src/db')

const classification = JSON.parse(fs.readFileSync('/tmp/standards_import/classification.json', 'utf8'))
const modeById = {}
for (const s of classification.standards) modeById[s.id] = s.mode

console.log(`Loaded classifications for ${Object.keys(modeById).length} standards`)

// Response definitions per mode — reusing existing enum values
function responsesFor(mode, priority) {
  if (mode === 'binary') {
    return [
      { level: 'satisfactory',   label: 'Compliant',       description: 'Control is implemented and operating as designed.',  is_aligned: true,  sort_order: 1 },
      { level: 'at_risk',        label: 'Non-Compliant',   description: 'Control is not implemented or not operating as designed.', is_aligned: false, sort_order: 2 },
      { level: 'not_applicable', label: 'Not Applicable',  description: 'This control does not apply to the client environment.', is_aligned: true, sort_order: 3 },
    ]
  }
  if (mode === 'ternary') {
    return [
      { level: 'satisfactory',    label: 'Yes',             description: 'Fully implemented.',                                   is_aligned: true,  sort_order: 1 },
      { level: 'needs_attention', label: 'Partial',         description: 'Implemented with identified gaps or exceptions.',      is_aligned: false, sort_order: 2 },
      { level: 'at_risk',         label: 'No',              description: 'Not implemented.',                                     is_aligned: false, sort_order: 3 },
      { level: 'not_applicable',  label: 'Not Applicable',  description: 'This control does not apply.',                         is_aligned: true,  sort_order: 4 },
    ]
  }
  if (mode === 'informational') {
    return [
      { level: 'satisfactory',   label: 'Documented',      description: 'Information has been captured and documented.',      is_aligned: true, sort_order: 1 },
      { level: 'not_applicable', label: 'Not Applicable',  description: 'Information not applicable to this environment.',    is_aligned: true, sort_order: 2 },
    ]
  }
  // graded — keep existing 5-level; the original responses may already be in place
  // We'll regenerate these consistently using the priority-scaled templates
  return [
    { level: 'satisfactory',    label: 'Satisfactory',    description: 'Control is fully implemented with documented evidence and consistent application.', is_aligned: true,  sort_order: 1 },
    { level: 'acceptable_risk', label: 'Acceptable Risk', description: 'Substantially in place with minor documented exceptions; remediation scheduled.',   is_aligned: true,  sort_order: 2 },
    { level: 'needs_attention', label: 'Needs Attention', description: 'Partial implementation; gaps identified and should be remediated.',                is_aligned: false, sort_order: 3 },
    { level: 'at_risk',         label: 'At Risk',         description: 'Missing or significantly non-compliant; immediate action required.',                is_aligned: false, sort_order: 4 },
    { level: 'not_applicable',  label: 'Not Applicable',  description: 'This control does not apply.',                                                      is_aligned: true,  sort_order: 5 },
  ]
}

async function main() {
  const client = await db.pool.connect()
  try {
    await client.query('BEGIN')

    console.log('[1] Setting response_mode on drafts...')
    let updated = 0
    for (const [stdId, mode] of Object.entries(modeById)) {
      await client.query(`UPDATE standards SET response_mode = $2 WHERE id = $1`, [stdId, mode])
      updated++
    }
    console.log(`    ${updated} standards tagged with response_mode`)

    console.log('[2] Deleting old 5-level responses for imported drafts...')
    const del = await client.query(`
      DELETE FROM standard_responses
      WHERE standard_id IN (
        SELECT id FROM standards WHERE import_source = 'myitprocess_2026_04_17'
      )
    `)
    console.log(`    ${del.rowCount} old responses deleted`)

    console.log('[3] Generating new responses per mode...')
    let inserted = 0
    // Load priorities for potential graded scaling
    const std = await client.query(`
      SELECT id, tenant_id, priority, response_mode FROM standards
      WHERE import_source = 'myitprocess_2026_04_17'
    `)
    for (const s of std.rows) {
      const responses = responsesFor(s.response_mode, s.priority)
      for (const r of responses) {
        await client.query(
          `INSERT INTO standard_responses (tenant_id, standard_id, level, label, description, is_aligned, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [s.tenant_id, s.id, r.level, r.label, r.description, r.is_aligned, r.sort_order]
        )
        inserted++
      }
    }
    console.log(`    ${inserted} responses inserted across ${std.rows.length} standards`)

    // Summary
    const summary = await client.query(`
      SELECT response_mode, count(*) FROM standards
      WHERE import_source = 'myitprocess_2026_04_17'
      GROUP BY response_mode ORDER BY response_mode
    `)
    console.log('\n─── Response mode distribution ───')
    summary.rows.forEach(r => console.log(`  ${r.response_mode}: ${r.count}`))

    await client.query('COMMIT')
    console.log('\n✓ Committed')
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('✗ Rolled back:', err.message)
    throw err
  } finally {
    client.release()
  }
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
