#!/usr/bin/env node
/**
 * Batch-execute 7 curated merges from second-pass dedup (probable tier).
 *
 * Same logic as 08_execute_merges.js:
 *   1. Copy framework_tags from import → existing (with per-pair reference overrides)
 *   2. Copy evidence_examples to existing if existing has none
 *   3. Repoint any assessment_items from draft → existing
 *   4. Delete the draft's framework_tags + responses + the draft itself
 *
 * All in a single transaction.
 */
process.env.PGHOST = '10.168.2.46'
process.env.PGPASSWORD = '7fa2b0cbec402d3d0c2aa05b858e84f3fb5aa8d7bd3d508e'

const db = require('/opt/align/src/db')

const MERGES = [
  {
    label: 'Cyber liability insurance (operational → operational)',
    existing_id: '9605f3d8-f0a3-4ee9-aee2-ba97264815ca',
    import_id:   '315c4b87-83a0-4b6f-be72-fac29be5b29c',
    framework_overrides: {}, // import has no framework tags to copy
  },
  {
    label: 'Security awareness training → ISO 27001 A.6.3',
    existing_id: '6e2d8a95-3909-40a8-a038-4882d245900f',
    import_id:   '39430595-a88b-4206-95be-850a7b9525ff',
    framework_overrides: { 'ISO-27001-2022': 'A.6.3' },
  },
  {
    label: 'Data classification policy → ISO 27001 A.5.12',
    existing_id: 'e5a9d634-921b-4cc8-8bca-a22927cbd3e1',
    import_id:   '2aafbe73-cafa-439b-acaf-f1e5b1897520',
    framework_overrides: { 'ISO-27001-2022': 'A.5.12' },
  },
  {
    label: 'Incident response plan → HIPAA + NIST 800-171 3.6.1',
    existing_id: 'f13f9949-77f8-4ff9-b125-f83465d73490',
    import_id:   '2cadbdbb-3aea-4926-9760-3ff4418090a2',
    framework_overrides: {
      'HIPAA': 'HICP-5A',
      'NIST-800-171-R2': '3.6.1',
    },
  },
  {
    label: 'Incident response plan → PCI-DSS 12.10.1',
    existing_id: 'f13f9949-77f8-4ff9-b125-f83465d73490',
    import_id:   '647f7dc7-c47d-4582-9710-d47886e5aff1',
    framework_overrides: { 'PCI-DSS-4': '12.10.1' },
  },
  {
    label: 'Information security policy → PCI-DSS 12.1.2',
    existing_id: '69cf881f-c884-4e21-9a3a-4ee955d05678',
    import_id:   '901b77e1-e80f-46da-8c9c-8ba4fb65fc69',
    framework_overrides: { 'PCI-DSS-4': '12.1.2' },
  },
  {
    label: 'Inactive accounts 45-day → PCI-DSS 8.2.6 (90d, existing is stricter)',
    existing_id: '87242958-6d2b-4bf8-8bd6-8227d1b427d6',
    import_id:   'f62ec4a8-c525-44f6-9950-ebe050851ae2',
    framework_overrides: { 'PCI-DSS-4': '8.2.6' },
  },
]

async function main() {
  const client = await db.pool.connect()
  try {
    await client.query('BEGIN')

    for (const merge of MERGES) {
      console.log(`\n━━━ ${merge.label} ━━━`)

      const imp = await client.query(`SELECT id, name, evidence_examples FROM standards WHERE id=$1`, [merge.import_id])
      const ex  = await client.query(`SELECT id, name, evidence_examples FROM standards WHERE id=$1`, [merge.existing_id])
      if (!imp.rows.length) { console.log(`  SKIP: import already gone`); continue }
      if (!ex.rows.length)  { console.log(`  ERROR: existing not found`); continue }

      console.log(`  existing: "${ex.rows[0].name}"`)
      console.log(`  import:   "${imp.rows[0].name}"`)

      // 1. Copy framework tags (with override refs)
      const importTags = await client.query(
        `SELECT framework, framework_reference, framework_evidence FROM standard_framework_tags WHERE standard_id=$1`,
        [merge.import_id]
      )
      let copied = 0
      for (const tag of importTags.rows) {
        const ref = merge.framework_overrides[tag.framework] || tag.framework_reference
        const r = await client.query(
          `INSERT INTO standard_framework_tags (standard_id, framework, framework_reference, framework_evidence)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (standard_id, framework) DO NOTHING
           RETURNING id`,
          [merge.existing_id, tag.framework, ref, tag.framework_evidence]
        )
        if (r.rowCount) copied++
      }
      console.log(`  ✓ Framework tags copied: ${copied}${importTags.rows.length === 0 ? ' (draft had no tags)' : ''}`)

      // 2. Copy evidence examples if existing has none
      if (!ex.rows[0].evidence_examples || ex.rows[0].evidence_examples.length === 0) {
        if (imp.rows[0].evidence_examples && imp.rows[0].evidence_examples.length > 0) {
          await client.query(
            `UPDATE standards SET evidence_examples = $2, updated_at = NOW() WHERE id = $1`,
            [merge.existing_id, imp.rows[0].evidence_examples]
          )
          console.log(`  ✓ Evidence examples copied (${imp.rows[0].evidence_examples.length} items)`)
        }
      }

      // 3. Repoint any referencing assessment_items (drafts normally have none, but safe)
      const refs = await client.query(`SELECT count(*) FROM assessment_items WHERE standard_id = $1`, [merge.import_id])
      if (parseInt(refs.rows[0].count) > 0) {
        await client.query(`UPDATE assessment_items SET standard_id = $2 WHERE standard_id = $1`, [merge.import_id, merge.existing_id])
        console.log(`  ✓ Repointed ${refs.rows[0].count} assessment_items → existing`)
      }

      // 4. Delete draft's framework_tags + responses + the draft itself
      await client.query(`DELETE FROM standard_framework_tags WHERE standard_id = $1`, [merge.import_id])
      await client.query(`DELETE FROM standard_responses WHERE standard_id = $1`, [merge.import_id])
      await client.query(`DELETE FROM standards WHERE id = $1`, [merge.import_id])
      console.log(`  ✓ Draft deleted`)
    }

    await client.query('COMMIT')
    console.log('\n═══════════ MERGE RESULTS ═══════════')

    // Show all updated existing standards with their now-complete tag list
    const check = await db.query(`
      SELECT s.id, s.name, s.evidence_examples,
             (SELECT json_agg(json_build_object('f', sft.framework, 'ref', sft.framework_reference))
              FROM standard_framework_tags sft WHERE sft.standard_id = s.id) AS tags
      FROM standards s
      WHERE s.id = ANY($1)
    `, [[...new Set(MERGES.map(m => m.existing_id))]])
    for (const row of check.rows) {
      console.log(`\n  ${row.name}`)
      console.log(`    framework_tags: ${JSON.stringify(row.tags)}`)
      console.log(`    evidence_examples: ${row.evidence_examples?.length || 0} items`)
    }

    // Final counts
    const totals = await db.query(`
      SELECT
        (SELECT count(*) FROM standards WHERE is_active=true) AS total_standards,
        (SELECT count(*) FROM standards WHERE import_source = 'myitprocess_2026_04_17') AS remaining_drafts,
        (SELECT count(*) FROM standard_framework_tags) AS total_framework_tags
    `)
    console.log('\n  Totals:', totals.rows[0])

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
