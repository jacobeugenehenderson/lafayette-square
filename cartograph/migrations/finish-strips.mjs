#!/usr/bin/env node
// One-shot migration: finish the strips model (HANDOFF-ribbon-corners.md C3.3).
// Rewrites every per-side measure object in design.json + ribbons.json from the
// legacy two-field shape {treelawn, sidewalk, terminal} into the strips shape
// {strips: [{width, fill}], terminal} that getStrips() already accepts. Widths
// transfer 1:1; no recalculation.
//
//   terminal=sidewalk → strips: [{tl,landuse}, {sw,concrete}]   (filter w=0)
//   terminal=lawn     → strips: [{sw,landuse}]                  (no concrete on lawn)
//   terminal=none     → strips: []                              (no ped zone)
//
// Writes IMMUTABLE backups (`*.pre-strips.json`) before mutating; refuses to
// run a second time on the same target (the backup is the canonical snapshot).
// Idempotent in spirit: a side that already carries `strips:` is passed through
// untouched even if the backup is missing.
//
// Run: node cartograph/migrations/finish-strips.mjs
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

function migrateSide(side) {
  if (!side || typeof side !== 'object') return side
  if (Array.isArray(side.strips)) return side  // already migrated; leave alone
  const out = { ...side }
  let strips = []
  if (side.terminal !== 'none') {
    if (Number.isFinite(side.treelawn) && side.treelawn > 0) {
      strips.push({ width: side.treelawn, fill: 'landuse' })
    }
    if (Number.isFinite(side.sidewalk) && side.sidewalk > 0) {
      strips.push({
        width: side.sidewalk,
        fill: side.terminal === 'lawn' ? 'landuse' : 'concrete',
      })
    }
  }
  out.strips = strips
  delete out.treelawn
  delete out.sidewalk
  return out
}

function migrateMeasure(m) {
  if (!m || typeof m !== 'object') return m
  const out = { ...m }
  if (out.left)  out.left  = migrateSide(out.left)
  if (out.right) out.right = migrateSide(out.right)
  return out
}

function migrateFile(path, walk) {
  if (!existsSync(path)) { console.log(`  skip (missing): ${path}`); return { changed: 0 } }
  const backup = path + '.pre-strips.json'
  const raw = readFileSync(path, 'utf-8')
  const data = JSON.parse(raw)
  const stats = { sides: 0, sidesAlready: 0 }
  walk(data, stats)
  if (stats.sides === 0 && stats.sidesAlready === 0) {
    console.log(`  ${path}: no per-side objects found, leaving as-is`)
    return { changed: 0 }
  }
  if (stats.sides === 0) {
    console.log(`  ${path}: already migrated (${stats.sidesAlready} sides already strips), nothing to do`)
    return { changed: 0 }
  }
  if (existsSync(backup)) {
    console.error(`  ABORT: ${backup} already exists — refusing to overwrite the canonical pre-strips snapshot.`)
    console.error(`         If you need to re-run, manually inspect/move the existing backup first.`)
    process.exit(2)
  }
  writeFileSync(backup, raw)   // immutable snapshot of pre-migration state
  writeFileSync(path, JSON.stringify(data, null, 2))
  console.log(`  ${path}: migrated ${stats.sides} sides (${stats.sidesAlready} already strips). Backup → ${backup}`)
  return { changed: stats.sides }
}

// ── design.json walker — blockCustoms[blockKey][edgeOrd].{left,right} ──
function walkDesign(d, stats) {
  const bc = d.blockCustoms || {}
  for (const blockKey of Object.keys(bc)) {
    const byEdge = bc[blockKey] || {}
    for (const edgeOrd of Object.keys(byEdge)) {
      const m = byEdge[edgeOrd]
      if (!m) continue
      for (const sideKey of ['left', 'right']) {
        if (m[sideKey] && typeof m[sideKey] === 'object') {
          if (Array.isArray(m[sideKey].strips)) stats.sidesAlready++
          else { m[sideKey] = migrateSide(m[sideKey]); stats.sides++ }
        }
      }
    }
  }
  // future-proof: streetMeasures/segmentMeasures if they ever populate
  for (const bag of [d.streetMeasures, d.segmentMeasures]) {
    if (!bag) continue
    for (const k of Object.keys(bag)) {
      const m = bag[k]
      if (m?.left || m?.right) {
        if (Array.isArray(m.left?.strips))  stats.sidesAlready++; else if (m.left)  { m.left  = migrateSide(m.left);  stats.sides++ }
        if (Array.isArray(m.right?.strips)) stats.sidesAlready++; else if (m.right) { m.right = migrateSide(m.right); stats.sides++ }
      }
    }
  }
}

// ── ribbons.json walker — streets[].measure + streets[].segmentMeasures ──
function walkRibbons(r, stats) {
  const streets = r.streets || []
  for (const s of streets) {
    if (s?.measure) {
      const before = stats.sides
      if (Array.isArray(s.measure.left?.strips))  stats.sidesAlready++; else if (s.measure.left)  { s.measure.left  = migrateSide(s.measure.left);  stats.sides++ }
      if (Array.isArray(s.measure.right?.strips)) stats.sidesAlready++; else if (s.measure.right) { s.measure.right = migrateSide(s.measure.right); stats.sides++ }
      // (silence unused 'before' lint by reading it)
      void before
    }
    if (s?.segmentMeasures && typeof s.segmentMeasures === 'object') {
      for (const ord of Object.keys(s.segmentMeasures)) {
        const m = s.segmentMeasures[ord]
        if (!m) continue
        if (Array.isArray(m.left?.strips))  stats.sidesAlready++; else if (m.left)  { m.left  = migrateSide(m.left);  stats.sides++ }
        if (Array.isArray(m.right?.strips)) stats.sidesAlready++; else if (m.right) { m.right = migrateSide(m.right); stats.sides++ }
      }
    }
  }
}

console.log('finish-strips migration (HANDOFF-ribbon-corners.md C3.3)')
console.log('  ROOT:', ROOT)

let total = 0
total += migrateFile(join(ROOT, 'public/looks/lafayette-square/design.json'), walkDesign).changed
total += migrateFile(join(ROOT, 'src/data/ribbons.json'),                       walkRibbons).changed
// Other looks: migrate any design.json discovered under public/looks/*
import { readdirSync, statSync } from 'fs'
const looksDir = join(ROOT, 'public/looks')
if (existsSync(looksDir)) {
  for (const entry of readdirSync(looksDir)) {
    if (entry === 'lafayette-square') continue
    const p = join(looksDir, entry, 'design.json')
    if (existsSync(p)) total += migrateFile(p, walkDesign).changed
  }
}
console.log(`\nDone. Sides migrated: ${total}.`)
