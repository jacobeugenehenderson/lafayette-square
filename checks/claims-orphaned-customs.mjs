#!/usr/bin/env node
// claims-orphaned-customs.mjs — DOES EVERY AUTHORED CUSTOM HAVE SOMETHING TO READ IT?
//
// The operator's override is the product. A custom written to a slot that nothing resolves is a gesture that was
// accepted, stored, and never read — silently. Layer 0 q2 applied to authoring: kit-general, fires on any town.
//
// ⭐ ONE SOURCE: the town's own frozen shape (`public/baked/<town>/shape.json`). The live painter reads a leg custom at
// `blockCustoms[run.skelId][run.side][run.segOrd]` for every run of `tile.runs` (`tileGround.js` `runCustom`), and a cap
// custom through `readCapCustom` for each frozen `tile.roundTips` entry. So a slot is PRESENT exactly when the shape
// carries a run (or round tip) with its key, and nothing else is asked. ⛔ A town with authored slots and no shape.json
// FAILS — never a skip. (Replaced 2026-10-07: the old version read LS's ribbons for every scene and modelled frontage
// with buildBlockGeometryV2, not the ① producer; its history is in `cartograph/_archive/orphaned-customs-retraction-2026-10-07.md`.)
//
//   node checks/claims-orphaned-customs.mjs [town ...]     (default: every Look with authored blockCustoms)
//   node checks/claims-orphaned-customs.mjs --selftest      (mutations: another town's shape · a dropped run — each must FAIL)
// Read-only.
import { readFileSync, existsSync, readdirSync } from 'fs'
import { capCustomKey, isCapSegOrd } from '../src/lib/feCustomKey.js'

const R0 = new URL('../', import.meta.url).pathname
const argv = process.argv.slice(2), selftest = argv.includes('--selftest')
const customsOf = (town) => {
  const p = `${R0}public/looks/${town}/design.json`
  if (!existsSync(p)) throw new Error(`⛔ ${town}: no Look at public/looks/${town}/design.json`)
  return JSON.parse(readFileSync(p, 'utf8')).blockCustoms || {}
}
const slotsOf = (bc) => Object.entries(bc).flatMap(([skel, sides]) => Object.entries(sides || {}).flatMap(([side, ords]) =>
  Object.keys(ords || {}).map(o => ({ key: `${skel}|${side}|${o}`, cap: isCapSegOrd(Number(o)) }))))
const shapeOf = (town) => {
  const p = `${R0}public/baked/${town}/shape.json`
  if (!existsSync(p)) return null
  const s = JSON.parse(readFileSync(p, 'utf8'))
  if (!Array.isArray(s.tiles)) throw new Error(`⛔ ${town}: public/baked/${town}/shape.json has no .tiles array`)
  return s
}
// every key the shape's readers resolve: one per run, one per round cap
const readKeys = (shape) => {
  const keys = new Set()
  for (const t of shape.tiles) {
    for (const r of t?.runs || []) keys.add(`${r.skelId}|${r.side}|${r.segOrd}`)
    for (const tip of t?.roundTips || []) { const k = capCustomKey(tip.skelId, tip.capEnd); if (k) keys.add(k.join('|')) }
  }
  return keys
}
const audit = (slots, keys) => ({ present: slots.filter(s => keys.has(s.key)), absent: slots.filter(s => !keys.has(s.key)) })

if (selftest) {
  // a town with authored slots, measured against its own shape (control), another town's, and its own less one run
  const towns = readdirSync(`${R0}public/looks`).filter(t => existsSync(`${R0}public/baked/${t}/shape.json`) && existsSync(`${R0}public/looks/${t}/design.json`))
  const subj = argv.find(a => !a.startsWith('--')) || towns.find(t => slotsOf(customsOf(t)).length)
  const other = towns.find(t => t !== subj && !t.startsWith(subj) && !subj.startsWith(t))
  const slots = slotsOf(customsOf(subj)), own = shapeOf(subj)
  const ctl = audit(slots, readKeys(own))
  const foreign = audit(slots, readKeys(shapeOf(other)))
  const victim = ctl.present[0]?.key
  const dropped = { tiles: own.tiles.map(t => t && { ...t, runs: (t.runs || []).filter(r => `${r.skelId}|${r.side}|${r.segOrd}` !== victim) }) }
  const drop = audit(slots, readKeys(dropped))
  const rows = [
    [`control: ${subj} against its own shape resolves at least one slot`, ctl.present.length > 0],
    [`another town's shape (${other}) leaves ${subj}'s slots absent`, foreign.absent.length > ctl.absent.length],
    [`dropping the run ${victim} makes exactly that slot absent`, drop.absent.length === ctl.absent.length + 1 && drop.absent.some(s => s.key === victim)],
  ]
  for (const [n, ok] of rows) console.log(`  ${ok ? '✅' : '⛔'} ${n}`)
  console.log(`  (${subj}: ${slots.length} slots · own ${ctl.present.length} present · foreign ${foreign.present.length} present · dropped ${drop.present.length} present)`)
  const bad = rows.filter(r => !r[1]).length
  console.log(bad ? `⛔ selftest: ${bad} wrong` : '✅ selftest: the check fails on a wrong shape and on a missing run')
  process.exit(bad ? 1 : 0)
}

const named = argv.filter(a => !a.startsWith('--'))
const towns = named.length ? named : readdirSync(`${R0}public/looks`).filter(t => existsSync(`${R0}public/looks/${t}/design.json`) && slotsOf(customsOf(t)).length)
let bad = 0
for (const town of towns) {
  const slots = slotsOf(customsOf(town)), shape = shapeOf(town)
  if (!shape) {
    if (slots.length) { bad++; console.log(`⛔ ${town}: ${slots.length} authored slot(s) and NO public/baked/${town}/shape.json — nothing to resolve them against (bake the town)`) }
    else console.log(`   ${town}: 0 authored slots, no shape`)
    continue
  }
  const { present, absent } = audit(slots, readKeys(shape))
  if (absent.length) bad++
  console.log(`${absent.length ? '⛔' : '✅'} ${town}: ${present.length}/${slots.length} authored slot(s) present in the shape${absent.length ? ` · ABSENT ${absent.length}:` : ''}`)
  for (const s of absent) console.log(`     ${s.cap ? 'CAP' : 'LEG'} ${s.key}`)
}
process.exit(bad ? 1 : 0)
