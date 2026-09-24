#!/usr/bin/env node
// CLAIM — A HIGHWAY'S WIDTH IS ITS LANES, AND EVERY VALUE SAYS WHERE IT CAME FROM (H-3 check 2).
//
// `streetProfiles.js highwaySection` composes each carriageway side from its lanes and the cited
// values in `references/registry.json` (BRIEF-highway-build step 1):
//   one-way   left = n·w/2 + leftShoulder     right = n·w/2 + rightShoulder
//   two-way   both = n·w/2 + rightShoulder
// This check re-derives every side, per lane span, FROM THE REGISTRY (never a copy of its numbers)
// and compares it with what the pour wrote into `ribbons.json`. It also asserts:
//   · every highway side carries source ids, each one present in the registry;
//   · an untagged span is stamped ASSUMED and cites `d-motorway-untagged-two-lanes`;
//   · the Interstate values are cited bare only on a `ref`-identified Interstate — anything else
//     also cites `d-interstate-std-on-non-interstate` (the ref is read from `skeleton.json`);
//   · no motorway/trunk key survives in `TYPE_PAVEMENT_HW` (the class constant is retired).
// Ramps go by the town's state, re-voted here from its own OSM `addr:state`: CA → Caltrans ·
// MA → MassDOT · otherwise the smaller of the two (`r-manuals-disagree-take-smaller`). An untagged
// ramp draws as one lane under a `[U] q-ramp-section` stamp; a case the manual is silent on
// (MassDOT ≥ 3 lanes) draws n × the Caltrans lane under one. Each [U] must NAME the question.
//
//   node checks/claims-highway-width-from-lanes.mjs [scene…] [--ribbons=path --skeleton=path]
//
// MUTATIONS (each must go red): restore a `motorway:` key in TYPE_PAVEMENT_HW · null one span's
// `lanes` in a temp ribbons copy while it still says `osm` · strip
// `d-interstate-std-on-non-interstate` from a non-Interstate side in a temp ribbons copy.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, scenes } from './_scenes.mjs'

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3)
const ribOverride = arg('ribbons'), skelOverride = arg('skeleton')

// ── the registry: every id, and the four values the section reads ──
const reg = readJson(arg('registry') || join(ROOT, 'references/registry.json'))
const byId = new Map()
const walk = (o) => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') { if (typeof o.id === 'string') byId.set(o.id, o); for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v) } }
walk(reg)
const FT = 0.3048
const V = (id, k) => byId.get(id)?.value?.[k]
const W = V('f-interstate-lane-width', 'laneWidth_ft') * FT
const RS = V('f-interstate-right-shoulder', 'rightPavedShoulder_ft') * FT
const LS = V('f-interstate-left-shoulder', 'leftPavedShoulder_ft') * FT
const MIN = V('f-interstate-min-lanes', 'minLanesEachDirection')
if (![W, RS, LS, MIN].every(Number.isFinite)) { console.error('⛔ NOT CHECKED — the registry lacks a section value'); process.exit(2) }

let red = false
// ── the retired class constant ──
const prof = readFileSync(join(ROOT, 'src/cartograph/streetProfiles.js'), 'utf8')
const tph = prof.match(/const TYPE_PAVEMENT_HW = \{([\s\S]*?)\n\}/)
if (!tph) { console.error('⛔ NOT CHECKED — TYPE_PAVEMENT_HW not found in streetProfiles.js'); process.exit(2) }
const survivors = [...tph[1].matchAll(/^\s*(motorway|motorway_link|trunk|trunk_link)\s*:/gm)].map(m => m[1])
console.log(`TYPE_PAVEMENT_HW highway keys: ${survivors.length ? '⛔ ' + survivors.join(', ') : '✅ none'}`)
if (survivors.length) red = true

const DEFAULT_MAP = readFileSync(join(ROOT, 'cartograph/scene.js'), 'utf8').match(/export const DEFAULT_MAP = '([^']+)'/)?.[1]
const ribbonsOf = (scene) => scene === DEFAULT_MAP ? join(ROOT, 'src/data/ribbons.json') : join(ROOT, 'cartograph/data', scene, 'clean/ribbons.json')
const isInterstate = (ref) => typeof ref === 'string' && /(^|;)\s*I[\s-]?\d/.test(ref)
const MAIN = new Set(['motorway', 'trunk']), RAMP = new Set(['motorway_link', 'trunk_link'])
const stateOf = (osm) => {
  const v = new Map()
  const walk = (o) => { if (Array.isArray(o)) { o.forEach(walk); return } if (!o || typeof o !== 'object') return
    const t = o.tags || o.properties, x = t && typeof t === 'object' ? t['addr:state'] : null
    if (typeof x === 'string' && x.trim()) v.set(x.trim(), (v.get(x.trim()) || 0) + 1)
    for (const y of Object.values(o)) if (y && typeof y === 'object' && y !== t) walk(y) }
  walk(osm)
  const r = [...v].sort((a, b) => b[1] - a[1]); if (!r.length || (r[1] && r[1][1] === r[0][1])) return null
  return /^(CA|california)$/i.test(r[0][0]) ? 'CA' : /^(MA|massachusetts)$/i.test(r[0][0]) ? 'MA' : r[0][0]
}
const ramp = (state, n) => {   // → { travel, l, r } in metres, from the registry
  const caLane = V('f-caltrans-ramp-lane-width', 'minRampLane_ft') * FT
  if (state === 'CA') { const sh = byId.get('f-caltrans-ramp-shoulders').value[n === 1 ? 'singleLaneRamp' : 'multilaneRamp']; return { travel: n * caLane, l: sh.left_ft * FT, r: sh.right_ft * FT } }
  if (state === 'MA') { const m = byId.get('f-massdot-ramp-width').value, l = m.leftLateralClearance_ft * FT, r = m.rightLateralClearance_ft.min * FT
    const tot = { 1: m.oneLaneRampWidth_ft, 2: m.twoLaneRampWidth_ft }[n]; return { travel: tot ? tot * FT - l - r : n * caLane, l, r } }
  const one = byId.get('d-ramp-section-no-state-manual').value.oneLaneRamp, multi = byId.get('d-ramp-two-lane-no-state-manual').value.multiLaneRamp
  if (n === 1) return { travel: one.lane_ft * FT, l: one.leftShoulder_ft * FT, r: one.rightShoulder_ft * FT }
  return { travel: n * multi.lane_ft * FT, l: multi.leftShoulder_ft * FT, r: multi.rightShoulder_ft * FT }
}
// ⛔ THE FLOOR (Boz, 2026-09-24): no DERIVED lane may fall below the cited minimum lane. Taking the
// smaller of two TOTALS once manufactured 10 ft lanes that no source states. Checked twice: on the
// registry's derived ramp entries, and on every drawn ramp span that cites a derived id.
const CA_MIN_LANE_FT = V('f-caltrans-ramp-lane-width', 'minRampLane_ft')
{
  const low = []
  for (const [id, e] of byId) {
    if (e.kind !== 'derived' || e.question !== 'q-ramp-section') continue
    for (const [k, c] of Object.entries(e.value || {})) {
      const lanes = /^oneLane/.test(k) ? 1 : /^twoLane/.test(k) ? 2 : null
      const perLane = Number.isFinite(c.lane_ft) ? c.lane_ft : (Number.isFinite(c.travel_ft) && lanes ? c.travel_ft / lanes : null)
      if (perLane != null && perLane < CA_MIN_LANE_FT) low.push(`${id}.${k}: ${perLane} ft lane < the cited ${CA_MIN_LANE_FT} ft minimum`)
    }
  }
  console.log(`Derived ramp lanes vs the cited minimum (${CA_MIN_LANE_FT} ft): ${low.length ? '⛔ ' + low.join(' · ') : '✅ none below'}`)
  if (low.length) red = true
}
const near = (a, b) => Math.abs(a - b) < 0.002

for (const scene of scenes('cartograph/data/<scene>/raw/osm.json')) {
  const ribPath = ribOverride || ribbonsOf(scene)
  const skelPath = skelOverride || join(ROOT, 'cartograph/data', scene, 'clean/skeleton.json')
  const missing = [ribPath, skelPath].filter(p => !existsSync(p))
  if (missing.length) { console.log(`\n── ${scene}   ⛔ NOT CHECKED — missing ${missing.join(', ')}`); red = true; continue }
  const skel = new Map((readJson(skelPath).streets || []).map(s => [s.id, s]))
  const hw = (readJson(ribPath).streets || []).filter(r => MAIN.has(r.highway) || RAMP.has(r.highway))
  const unposed = hw.filter(r => !r.measure?.left?.section || !r.measure?.right?.section)
  if (unposed.length) { console.log(`\n── ${scene}   ⛔ NOT CHECKED — ${unposed.length} highway ribbon(s) carry no section (poured before H-3 step 1). Re-pour.`); red = true; continue }
  const bad = []
  let ramps = 0, sides = 0
  const state = stateOf(readJson(join(ROOT, 'cartograph/data', scene, 'raw/osm.json')))
  for (const r of hw) {
    if (RAMP.has(r.highway)) {
      ramps++
      for (const side of ['left', 'right']) {
        sides++
        const sec = r.measure[side].section, src = sec.sources || []
        const loose = src.filter(id => id.startsWith('[U]') ? !/q-[a-z-]+/.test(id) || !byId.has(id.match(/q-[a-z-]+/)[0]) : !byId.has(id))
        if (!src.length || loose.length) bad.push(`${r.skelId}.${side}: ramp sources ${src.length ? 'unresolved: ' + loose.join(',') : 'missing'}`)
        if ((sec.state ?? null) !== state) bad.push(`${r.skelId}.${side}: ramp built for state ${sec.state}, town votes ${state}`)
        for (const sp of sec.spans || []) {
          if (sp.lanes == null && !src.some(x => x.includes('untagged ramp lanes'))) bad.push(`${r.skelId}.${side} span ${sp.s0}: untagged ramp without its [U]`)
          const n = sp.lanes ?? 1, v = ramp(state, n)
          const sh = r.oneway && side === 'left' ? v.l : v.r
          const want = v.travel / 2 + sh
          if (!near(sp.hw, want)) bad.push(`${r.skelId}.${side} span ${sp.s0}: ramp ${sp.hw} ≠ ${want.toFixed(3)} (lanes ${n}, ${state})`)
          const perLaneFt = 2 * (sp.hw - sh) / n / FT
          if (src.some(x => x.startsWith('d-')) && perLaneFt < CA_MIN_LANE_FT - 0.01) bad.push(`${r.skelId}.${side} span ${sp.s0}: drawn lane ${perLaneFt.toFixed(2)} ft < the cited ${CA_MIN_LANE_FT} ft minimum`)
        }
      }
      continue
    }
    const ref = skel.get(r.skelId)?.ref ?? null
    const oneway = !!r.oneway
    for (const side of ['left', 'right']) {
      sides++
      const sec = r.measure[side].section, src = sec.sources || []
      const unknownIds = src.filter(id => !byId.has(id))
      if (!src.length || unknownIds.length) bad.push(`${r.skelId}.${side}: sources ${src.length ? 'not in registry: ' + unknownIds.join(',') : 'missing'}`)
      if (!isInterstate(ref) && !src.includes('d-interstate-std-on-non-interstate')) bad.push(`${r.skelId}.${side}: Interstate values cited bare on ref "${ref}"`)
      const shoulder = oneway && side === 'left' ? LS : RS
      for (const sp of sec.spans || []) {
        if (sp.lanes == null && sp.lanesSource !== 'ASSUMED') bad.push(`${r.skelId}.${side} span ${sp.s0}: no lanes but not ASSUMED`)
        if (sp.lanesSource === 'ASSUMED' && !src.includes('d-motorway-untagged-two-lanes')) bad.push(`${r.skelId}.${side}: ASSUMED span without d-motorway-untagged-two-lanes`)
        const n = sp.lanes ?? (oneway ? MIN : 2 * MIN)
        const want = n * W / 2 + shoulder
        if (!near(sp.hw, want)) bad.push(`${r.skelId}.${side} span ${sp.s0}: ${sp.hw} ≠ ${want.toFixed(3)} (lanes ${n})`)
      }
      if (!(sec.spans || []).length) bad.push(`${r.skelId}.${side}: no spans`)
    }
  }
  console.log(`\n── ${scene} ── ${hw.length - ramps} carriageway(s), ${sides} side(s) re-derived from the registry + ${ramps} ramp(s) (state ${state ?? 'UNKNOWN'}) ${bad.length ? '⛔' : '✅'}`)
  if (bad.length) { red = true; for (const b of bad.slice(0, 12)) console.log(`   ⛔ ${b}`); if (bad.length > 12) console.log(`   … +${bad.length - 12}`) }
}
console.log(red
  ? '\n⛔ A highway side is not its lanes composed from cited values — or a scene was poured before H-3 step 1.'
  : '\n✅ Every highway side is its lanes, composed from cited values, and says which.')
process.exit(red ? 1 : 0)
