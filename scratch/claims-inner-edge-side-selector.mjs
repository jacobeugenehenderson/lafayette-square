#!/usr/bin/env node
// claims-inner-edge-side-selector — WHAT actually selects the ped-zeroed side on
// divided carriageways, measured per scene. Reads the source; restates nothing.
//
// Three questions, one per BRIEF-A premise:
//   P1  is `innerSign` constant across a scene's inner-edge chains?  (⇒ it carries
//       no side information, and buildBlockGeometryV2:1496's `&& s.innerSign` gate
//       is constant-truthy)
//   P2  are the pairs really MATES?  (pairId reciprocity + the geometric toMate
//       oracle agreeing that they face each other + separation)
//   P3  which side is ACTUALLY ped-zeroed in the persisted measure, and does it
//       agree with the geometric oracle (derive.js inboardKeyGeom == tileGround
//       inboardSideOf == the detector's toMate)?
//
// Usage: node scratch/claims-inner-edge-side-selector.mjs [--scene=<id>|--all]
//        --customs   also apply the look's blockCustoms over the measure first
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(new URL('..', import.meta.url).pathname)
const argv = process.argv.slice(2)
const WANT = (argv.find(a => /^--scene=/.test(a)) || '').split('=')[1]
const ALL = argv.includes('--all')
const CUSTOMS = argv.includes('--customs')

// LS's ribbons artifact is PROMOTED to src/data/ribbons.json (cartograph/serve.js
// slabPathspecs); every other scene keeps it in its own clean/ dir.
function ribbonsPathFor(scene) {
  const own = path.join(ROOT, 'cartograph/data', scene, 'clean/ribbons.json')
  if (fs.existsSync(own)) return own
  const promoted = path.join(ROOT, 'src/data/ribbons.json')
  return scene === 'lafayette-square' && fs.existsSync(promoted) ? promoted : null
}

function scenes() {
  if (WANT) return [WANT]
  const dir = path.join(ROOT, 'cartograph/data')
  const all = fs.readdirSync(dir).filter(d => fs.statSync(path.join(dir, d)).isDirectory())
  return ALL ? all : ['lafayette-square']
}

// ── THE ONE ORACLE, copied by SHAPE from derive.js:3733 inboardKeyGeom ==
// tileGround.js:1129 inboardSideOf. It is duplicated in src already; this probe
// is a third reader, so it prints a CONSISTENCY column rather than claiming it.
function inboardKeyGeom(s, mate) {
  const pa = s?.points, pb = mate?.points
  if (!pa || pa.length < 2 || !pb || pb.length < 2) return null   // ⛔ no silent fallback here
  const i = Math.max(1, Math.floor(pa.length / 2))
  const ca = pa[i], cb = pb[Math.floor(pb.length / 2)]
  const dx = pa[i][0] - pa[i - 1][0], dz = pa[i][1] - pa[i - 1][1], L = Math.hypot(dx, dz) || 1
  const toMate = [cb[0] - ca[0], cb[1] - ca[1]]
  return ((-dz / L) * toMate[0] + (dx / L) * toMate[1] > 0) ? 'left' : 'right'
}

const pedZero = side => !(side?.treelawn > 0) && !(side?.sidewalk > 0)

function midDist(a, b) {
  const ca = a.points[Math.floor(a.points.length / 2)]
  const cb = b.points[Math.floor(b.points.length / 2)]
  return Math.hypot(cb[0] - ca[0], cb[1] - ca[1])
}

// blockCustoms[skelId][side][segOrd] — the operator's overrides. Layer 0 q3:
// a measurement without them is measuring the wrong thing. We fold every
// authored segOrd slot in as its own row so an authored ped depth counts.
function customsFor(scene) {
  const p = path.join(ROOT, 'public/looks', scene, 'design.json')
  if (!fs.existsSync(p)) return null
  return JSON.parse(fs.readFileSync(p)).blockCustoms || {}
}

function applyCustoms(m, bc, skelId) {
  const slots = bc?.[skelId]
  if (!slots) return { m, authored: false }
  const out = { ...m, left: { ...m.left }, right: { ...m.right } }
  let authored = false
  for (const side of ['left', 'right']) {
    const bySeg = slots[side]
    if (!bySeg) continue
    // ANY authored slot on this side counts: a single authored segOrd with a
    // positive sidewalk means the operator wants ped on that side somewhere.
    for (const k of Object.keys(bySeg)) {
      const v = bySeg[k] || {}
      for (const f of ['pavementHW', 'treelawn', 'sidewalk', 'terminal']) {
        if (v[f] !== undefined) { out[side][f] = Math.max(out[side][f] ?? 0, v[f] ?? 0); authored = true }
      }
    }
  }
  return { m: out, authored }
}

let grand = { chains: 0, zRight: 0, zLeft: 0, zBoth: 0, zNone: 0, disagree: 0, oracleNull: 0 }

for (const scene of scenes()) {
  const rp = ribbonsPathFor(scene)
  if (!rp) { console.log(`\n### ${scene}\n  NOT MEASURED — no ribbons.json`); continue }
  const R = JSON.parse(fs.readFileSync(rp))
  const streets = R.streets || []
  const inner = streets.filter(s => s?.anchor === 'inner-edge')
  const bc = CUSTOMS ? customsFor(scene) : null
  console.log(`\n### ${scene}   (${path.relative(ROOT, rp)})`)
  console.log(`  inner-edge chains: ${inner.length} / ${streets.length} streets`
    + (CUSTOMS ? `   blockCustoms: ${bc ? Object.keys(bc).length + ' streets' : 'NONE'}` : '   [customs NOT applied]'))
  if (!inner.length) { console.log('  NOT MEASURED — no anchor=inner-edge chains in this scene'); continue }

  // ── P1: does innerSign vary?
  const signs = {}
  for (const s of inner) signs[String(s.innerSign)] = (signs[String(s.innerSign)] || 0) + 1
  const signVals = Object.keys(signs)
  console.log(`  P1 innerSign histogram: ${signVals.map(k => `${k}×${signs[k]}`).join(' ')}`
    + `  ⇒ ${signVals.length === 1 ? '⛔ CONSTANT — carries NO side information' : 'varies'}`)

  const rows = []
  for (const s of inner) {
    const mate = streets.find(x => x.skelId === s.pairId)
    let m = s.measure || { left: {}, right: {} }
    let authored = false
    if (bc) ({ m, authored } = applyCustoms(m, bc, s.skelId))
    const zl = pedZero(m.left), zr = pedZero(m.right)
    const zeroed = zl && zr ? 'BOTH' : zl ? 'left' : zr ? 'right' : 'NONE'
    const oracle = mate ? inboardKeyGeom(s, mate) : null
    const signKey = s.innerSign === +1 ? 'right' : 'left'     // innerEdgeMeasure's mapping
    rows.push({
      id: s.skelId, name: s.name, mate: s.pairId,
      reciprocal: !!(mate && mate.pairId === s.skelId),
      mateOracle: mate ? inboardKeyGeom(mate, s) : null,
      sep: mate ? midDist(s, mate) : null,
      hwL: m.left?.pavementHW, hwR: m.right?.pavementHW,
      zeroed, oracle, signKey, authored,
      highway: s.highway,
    })
  }

  // ── P3: the actual zeroed-side skew, and who agrees with it
  const tally = k => rows.filter(r => r.zeroed === k).length
  console.log(`  P3 zeroed side (persisted measure${bc ? ' + customs' : ''}):`
    + `  right ${tally('right')} · left ${tally('left')} · BOTH ${tally('BOTH')} · NONE ${tally('NONE')}`)
  const real = rows.filter(r => r.zeroed === 'left' || r.zeroed === 'right')
  const oracleAgree = real.filter(r => r.oracle && r.oracle === r.zeroed).length
  const signAgree = real.filter(r => r.signKey === r.zeroed).length
  console.log(`     of ${real.length} one-side-zeroed chains:`
    + `  GEOMETRIC ORACLE predicts it ${oracleAgree}/${real.length}`
    + ` · persisted innerSign key predicts it ${signAgree}/${real.length}`)

  // ── P2: mate relation
  const recip = rows.filter(r => r.reciprocal).length
  const mirrored = rows.filter(r => r.oracle && r.mateOracle).length
  const facing = rows.filter(r => r.oracle && r.mateOracle
    && (r.oracle !== r.mateOracle || true)).length   // both oracles resolve = both face each other
  console.log(`  P2 mates: pairId reciprocal ${recip}/${rows.length}`
    + ` · both oracles resolve ${mirrored}/${rows.length}`
    + ` · separation min/med/max ${fmtSep(rows)}`)

  // BOTH-zeroed: is it a legitimately ped-free class (freeway) or a defect?
  const both = rows.filter(r => r.zeroed === 'BOTH')
  if (both.length) {
    const byHw = {}
    for (const r of both) byHw[r.highway || '?'] = (byHw[r.highway || '?'] || 0) + 1
    console.log(`     BOTH-zeroed by highway tag: ${Object.entries(byHw).map(([k, v]) => `${k}×${v}`).join(' ')}`)
  }

  console.log('\n  chain                          mate                     zeroed  oracle  signKey  agree  hwL/hwR      sep   auth')
  for (const r of rows.sort((a, b) => a.id.localeCompare(b.id))) {
    const agree = r.oracle ? (r.oracle === r.zeroed ? 'ORACLE' : (r.zeroed === 'BOTH' ? '  —   ' : ' ✗    ')) : ' n/a  '
    console.log(`  ${pad(r.id, 30)} ${pad(r.mate || '—', 24)} ${pad(r.zeroed, 7)} ${pad(r.oracle || '—', 7)} ${pad(r.signKey, 8)} ${agree} `
      + `${pad(num(r.hwL) + '/' + num(r.hwR), 12)} ${pad(r.sep == null ? '—' : r.sep.toFixed(1), 6)} ${r.authored ? 'AUTH' : ''}`)
  }

  grand.chains += rows.length
  grand.zRight += tally('right'); grand.zLeft += tally('left')
  grand.zBoth += tally('BOTH'); grand.zNone += tally('NONE')
  grand.disagree += real.length - oracleAgree
  grand.oracleNull += rows.filter(r => !r.oracle).length
}

function fmtSep(rows) {
  const v = rows.map(r => r.sep).filter(x => x != null).sort((a, b) => a - b)
  if (!v.length) return 'n/a'
  return `${v[0].toFixed(1)}/${v[Math.floor(v.length / 2)].toFixed(1)}/${v[v.length - 1].toFixed(1)} m`
}
function pad(s, n) { s = String(s); return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length) }
function num(x) { return Number.isFinite(x) ? x.toFixed(2) : '—' }

console.log(`\n=== TOTAL  chains ${grand.chains} · zeroed right ${grand.zRight} left ${grand.zLeft} BOTH ${grand.zBoth} NONE ${grand.zNone}`
  + ` · oracle DISAGREES with persisted zeroing on ${grand.disagree} · oracle unresolvable on ${grand.oracleNull}`)
