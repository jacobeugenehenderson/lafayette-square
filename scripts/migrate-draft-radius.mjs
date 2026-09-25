#!/usr/bin/env node
/**
 * scripts/migrate-draft-radius.mjs — ONE-TIME: neighborhood.json `radius` → `draftRadius`.
 *
 * The radius has one home, the boundary's disc record (`neighborhood_boundary.json`). The
 * `radius` in neighborhood.json was Extent's unapplied DRAFT under the same name, and two
 * readers took it for the applied value (2026-09-25; provincetown drew 7,065 m while Extent
 * showed 5,290 m as applied). The value is carried over unchanged, only renamed.
 *
 *   node scripts/migrate-draft-radius.mjs [--dry] [--skip=<scene>,<scene>]
 * Idempotent. ⛔ A file with BOTH keys is reported and left alone: two drafts disagree.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const dry = process.argv.includes('--dry')
const skip = new Set((process.argv.find(a => a.startsWith('--skip='))?.slice(7) || '').split(',').filter(Boolean))
const DATA = join(ROOT, 'cartograph', 'data')
let bad = 0
for (const s of readdirSync(DATA)) {
  const p = join(DATA, s, 'neighborhood.json')
  if (!existsSync(p)) continue
  if (skip.has(s)) { console.log(`  ${s.padEnd(26)} SKIPPED (asked)`); continue }
  const nb = JSON.parse(readFileSync(p, 'utf8'))
  const has = 'radius' in nb, hasD = 'draftRadius' in nb
  if (has && hasD) { console.log(`  ${s.padEnd(26)} ⛔ has BOTH radius (${nb.radius}) and draftRadius (${nb.draftRadius}) — left alone`); bad++; continue }
  if (!has) { console.log(`  ${s.padEnd(26)} ok (${hasD ? `draftRadius ${nb.draftRadius}` : 'no draft radius'})`); continue }
  // Rename in place, keeping the key's position so the diff is one line.
  const out = {}
  for (const [k, v] of Object.entries(nb)) out[k === 'radius' ? 'draftRadius' : k] = v
  console.log(`  ${s.padEnd(26)} radius ${nb.radius} → draftRadius${dry ? '   (dry)' : ''}`)
  if (!dry) writeFileSync(p, JSON.stringify(out, null, 2) + (readFileSync(p, 'utf8').endsWith('\n') ? '\n' : ''))
}
process.exit(bad ? 1 : 0)
