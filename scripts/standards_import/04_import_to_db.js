#!/usr/bin/env node
/**
 * Phase C: Import generated master standards into the Align DB as drafts.
 *
 * - Creates missing sections
 * - Creates missing categories (section_id, name unique per tenant)
 * - Inserts standards with status='draft', evidence_examples array
 * - Inserts standard_framework_tags with framework_reference
 * - Inserts standard_responses (5 levels per standard)
 *
 * All in a single transaction. Safe to re-run (idempotent on section/category creation;
 * standards check import_row_id to avoid re-insert).
 */
process.env.PGHOST = '10.168.2.46'
process.env.PGPASSWORD = '7fa2b0cbec402d3d0c2aa05b858e84f3fb5aa8d7bd3d508e'

const fs = require('fs')
const db = require('/opt/align/src/db')

const NEW_SECTIONS = [
  ['Server Infrastructure',    'Servers, virtualization, and server-role-specific controls',  13],
  ['Hardware & Peripherals',   'Workstations, printers, IoT, and telephony hardware',          14],
  ['ISO 27001:2022',           'ISO 27001:2022 Annex A controls',                              20],
  ['NIST 800-171 R2',          'NIST SP 800-171 Revision 2 security requirements',             21],
  ['NIST CSF 2.0',             'NIST Cybersecurity Framework 2.0 subcategories',               22],
  ['PCI-DSS 4.0.1',            'PCI-DSS SAQ C 4.0.1 requirements',                             23],
  ['CMMC Level 1',             'CMMC Level 1 — FAR Clause 52.204-21',                          24],
  ['CMMC Level 2',             'CMMC Level 2 — NIST SP 800-171 Rev 2',                         25],
  ['HIPAA Cybersecurity',      'HIPAA Cybersecurity Practices for Healthcare',                 26],
]

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64)
}

async function main() {
  const raw = JSON.parse(fs.readFileSync('/tmp/standards_import/import_ready.json', 'utf8'))
  const masters = raw.masters
  console.log(`Loaded ${masters.length} master standards`)

  // Get tenant ID (assume first/primary tenant)
  const tenant = await db.query(`SELECT id FROM tenants ORDER BY created_at LIMIT 1`)
  if (!tenant.rows.length) { console.error('No tenant found'); process.exit(1) }
  const tenantId = tenant.rows[0].id
  console.log(`Tenant: ${tenantId}`)

  const client = await db.pool.connect()
  try {
    await client.query('BEGIN')

    // ─── 1. Ensure sections exist ───
    console.log('\n[1] Ensuring sections...')
    for (const [name, description, sort_order] of NEW_SECTIONS) {
      await client.query(
        `INSERT INTO standard_sections (tenant_id, name, description, slug, sort_order, is_active)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (tenant_id, name) DO NOTHING`,
        [tenantId, name, description, slugify(name), sort_order]
      )
    }
    const allSections = await client.query(
      `SELECT id, name FROM standard_sections WHERE tenant_id = $1`,
      [tenantId]
    )
    const sectionByName = {}
    allSections.rows.forEach(r => { sectionByName[r.name] = r.id })
    console.log(`    ${Object.keys(sectionByName).length} sections present`)

    // ─── 2. Ensure categories exist ───
    console.log('\n[2] Ensuring categories...')
    const neededCats = new Set()
    for (const m of masters) {
      neededCats.add(`${m.section_name}||${m.category_name}`)
    }

    const existingCats = await client.query(
      `SELECT id, name, section_id FROM standard_categories WHERE tenant_id = $1`,
      [tenantId]
    )
    const catKey = (sid, name) => `${sid}||${name}`
    const catByKey = {}
    existingCats.rows.forEach(r => { catByKey[catKey(r.section_id, r.name)] = r.id })

    let newCatsCreated = 0
    for (const key of neededCats) {
      const [sectionName, catName] = key.split('||')
      const sectionId = sectionByName[sectionName]
      if (!sectionId) { console.warn(`    Missing section: ${sectionName}`); continue }
      const k = catKey(sectionId, catName)
      if (catByKey[k]) continue
      const r = await client.query(
        `INSERT INTO standard_categories (tenant_id, name, section_id, is_active, sort_order)
         VALUES ($1, $2, $3, true, 0)
         ON CONFLICT (tenant_id, name, section_id) DO UPDATE SET is_active = true
         RETURNING id`,
        [tenantId, catName, sectionId]
      )
      catByKey[k] = r.rows[0].id
      newCatsCreated++
    }
    console.log(`    ${newCatsCreated} new categories created, ${Object.keys(catByKey).length} total`)

    // ─── 3. Insert standards ───
    console.log('\n[3] Inserting standards...')
    let inserted = 0
    let skipped = 0
    for (let i = 0; i < masters.length; i++) {
      const m = masters[i]
      const sectionId = sectionByName[m.section_name]
      if (!sectionId) { console.warn(`    SKIP: ${m.name} — section "${m.section_name}" not found`); skipped++; continue }
      const categoryId = catByKey[catKey(sectionId, m.category_name)]
      if (!categoryId) { console.warn(`    SKIP: ${m.name} — category "${m.category_name}" not found`); skipped++; continue }

      // Check if already imported (by import_source + import_row_id)
      const exists = await client.query(
        `SELECT id FROM standards WHERE tenant_id=$1 AND import_source=$2 AND import_row_id=$3 LIMIT 1`,
        [tenantId, m.import_source, m.import_row_id]
      )
      if (exists.rows.length) { skipped++; continue }

      const r = await client.query(
        `INSERT INTO standards (
            tenant_id, category_id, name, description, question_text,
            business_impact, technical_rationale,
            priority, review_frequency, delivery_method, level_tier,
            status, is_universal, is_active,
            evidence_examples, import_source, import_row_id,
            sort_order
         ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7,
            $8, $9, $10, $11,
            'draft', $12, true,
            $13, $14, $15,
            0
         ) RETURNING id`,
        [
          tenantId, categoryId, m.name, m.description || null, m.question_text || null,
          m.business_impact || null, m.technical_rationale || null,
          m.priority, m.review_frequency, m.delivery_method, m.level_tier,
          m.is_universal,
          m.evidence_examples && m.evidence_examples.length ? m.evidence_examples : null,
          m.import_source, m.import_row_id,
        ]
      )
      const standardId = r.rows[0].id

      // Framework tags
      for (const tag of m.framework_tags) {
        await client.query(
          `INSERT INTO standard_framework_tags (standard_id, framework, framework_reference, framework_evidence)
           VALUES ($1, $2, $3, $4)`,
          [standardId, tag.framework, tag.framework_reference, tag.framework_evidence]
        )
      }

      // Responses (5 per standard)
      for (const resp of m.responses) {
        await client.query(
          `INSERT INTO standard_responses (tenant_id, standard_id, level, label, description, is_aligned, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [tenantId, standardId, resp.level, resp.label, resp.description, resp.is_aligned, resp.sort_order]
        )
      }

      inserted++
      if (inserted % 100 === 0) console.log(`    ${inserted} standards inserted...`)
    }

    console.log(`\n    ${inserted} inserted, ${skipped} skipped (already existed or mapping error)`)

    await client.query('COMMIT')
    console.log('\n✓ Transaction committed.')
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('\n✗ Transaction rolled back:', err.message)
    throw err
  } finally {
    client.release()
  }

  // Final summary
  const summary = await db.query(`
    SELECT ss.name AS section, count(s.id) AS total,
           count(s.id) FILTER (WHERE s.status = 'draft') AS draft,
           count(s.id) FILTER (WHERE s.status = 'approved') AS approved
    FROM standard_sections ss
    LEFT JOIN standard_categories sc ON sc.section_id = ss.id
    LEFT JOIN standards s ON s.category_id = sc.id
    GROUP BY ss.id, ss.name
    ORDER BY total DESC
  `)
  console.log('\n═══ POST-IMPORT STANDARD COUNTS BY SECTION ═══')
  summary.rows.forEach(r => console.log(`  ${r.section.padEnd(30)} total: ${r.total.toString().padStart(4)}  (draft: ${r.draft}, approved: ${r.approved})`))

  const fwSummary = await db.query(`
    SELECT framework, count(*) FROM standard_framework_tags GROUP BY framework ORDER BY framework
  `)
  console.log('\n═══ FRAMEWORK TAG COUNTS ═══')
  fwSummary.rows.forEach(r => console.log(`  ${r.framework.padEnd(20)}: ${r.count}`))

  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
