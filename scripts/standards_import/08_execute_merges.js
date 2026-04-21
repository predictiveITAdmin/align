#!/usr/bin/env node
/**
 * Execute approved dedup merges.
 *
 * For each (import_id → existing_id) pair:
 *   1. Copy framework_tags from import to existing (ON CONFLICT DO NOTHING so we don't dup)
 *   2. If existing has no evidence_examples, copy from import
 *   3. Delete the import standard (cascades to its framework_tags, responses)
 *   4. Log the operation
 *
 * Runs in a single transaction — safe to re-run (ON CONFLICT handles dupes; already-deleted
 * imports just get skipped).
 */
process.env.PGHOST = '10.168.2.46'
process.env.PGPASSWORD = '7fa2b0cbec402d3d0c2aa05b858e84f3fb5aa8d7bd3d508e'

const db = require('/opt/align/src/db')

// Manually curated merge list. framework_reference can be overridden per pair.
const MERGES = [
  {
    existing_id: 'f13f9949-77f8-4ff9-b125-f83465d73490',  // "Incident response plan documented"
    import_id:   '6b0a3abc-afcc-43db-a05b-ee15c51dbf10',  // "Information security incident response procedure"
    framework_overrides: {
      // Override the framework_reference to use the proper ISO control code
      'ISO-27001-2022': 'A.5.24',
    },
    note: 'Merge ISO 27001 A.5.24 (Information security incident response procedure) into existing "Incident response plan documented"',
  },
]

async function main() {
  const client = await db.pool.connect()
  try {
    await client.query('BEGIN')

    for (const merge of MERGES) {
      console.log(`\n━━━ ${merge.note} ━━━`)

      // Sanity: both rows exist?
      const imp = await client.query(`SELECT id, name, evidence_examples FROM standards WHERE id=$1`, [merge.import_id])
      const ex  = await client.query(`SELECT id, name, evidence_examples FROM standards WHERE id=$1`, [merge.existing_id])
      if (!imp.rows.length) { console.log(`  SKIP: import ${merge.import_id} already gone`); continue }
      if (!ex.rows.length)  { console.log(`  ERROR: existing ${merge.existing_id} not found`); continue }

      console.log(`  existing: "${ex.rows[0].name}"`)
      console.log(`  import:   "${imp.rows[0].name}"`)

      // 1. Copy framework_tags from import to existing (with override if specified)
      const importTags = await client.query(
        `SELECT framework, framework_reference, framework_evidence FROM standard_framework_tags WHERE standard_id=$1`,
        [merge.import_id]
      )
      let tagsCopied = 0
      for (const tag of importTags.rows) {
        const ref = merge.framework_overrides?.[tag.framework] || tag.framework_reference
        const r = await client.query(
          `INSERT INTO standard_framework_tags (standard_id, framework, framework_reference, framework_evidence)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (standard_id, framework) DO NOTHING
           RETURNING id`,
          [merge.existing_id, tag.framework, ref, tag.framework_evidence]
        )
        if (r.rowCount) tagsCopied++
      }
      console.log(`  ✓ Framework tags copied: ${tagsCopied}`)

      // 2. Copy evidence_examples if existing has none
      if (!ex.rows[0].evidence_examples || ex.rows[0].evidence_examples.length === 0) {
        if (imp.rows[0].evidence_examples && imp.rows[0].evidence_examples.length > 0) {
          await client.query(
            `UPDATE standards SET evidence_examples = $2, updated_at = NOW() WHERE id = $1`,
            [merge.existing_id, imp.rows[0].evidence_examples]
          )
          console.log(`  ✓ Evidence examples copied from draft (${imp.rows[0].evidence_examples.length} items)`)
        }
      } else {
        console.log(`  · Evidence examples already present on existing — preserving`)
      }

      // 3. Delete the import draft (cascades to its framework_tags + responses)
      // Cascading deletes: framework_tags FK doesn't have CASCADE by default; explicit cleanup first.
      await client.query(`DELETE FROM standard_framework_tags WHERE standard_id = $1`, [merge.import_id])
      await client.query(`DELETE FROM standard_responses WHERE standard_id = $1`, [merge.import_id])
      // Check if any assessment_items reference it (they shouldn't since drafts aren't assessed)
      const refs = await client.query(`SELECT count(*) FROM assessment_items WHERE standard_id = $1`, [merge.import_id])
      if (parseInt(refs.rows[0].count) > 0) {
        console.log(`  ! ${refs.rows[0].count} assessment_items reference this draft — repointing to existing`)
        await client.query(`UPDATE assessment_items SET standard_id = $2 WHERE standard_id = $1`, [merge.import_id, merge.existing_id])
      }
      await client.query(`DELETE FROM standards WHERE id = $1`, [merge.import_id])
      console.log(`  ✓ Draft deleted`)
    }

    await client.query('COMMIT')
    console.log('\n═══════════ MERGE SUMMARY ═══════════')

    // Show updated existing standard
    const check = await db.query(`
      SELECT s.id, s.name, s.evidence_examples,
             (SELECT json_agg(json_build_object('framework', sft.framework, 'framework_reference', sft.framework_reference))
              FROM standard_framework_tags sft WHERE sft.standard_id = s.id) AS tags
      FROM standards s WHERE s.id = ANY($1)
    `, [MERGES.map(m => m.existing_id)])
    for (const row of check.rows) {
      console.log(`\n  ${row.name}`)
      console.log(`    framework_tags: ${JSON.stringify(row.tags)}`)
      console.log(`    evidence_examples: ${row.evidence_examples?.length || 0} items`)
    }

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
