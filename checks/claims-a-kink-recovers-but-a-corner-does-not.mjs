#!/usr/bin/env node
// ⛔⛔ AT A VERTEX WHERE ① TURNS ON A JUNCTION APPROACH, IS THAT A CORNER OR AN APPROACH KINK?
//
// WHY THIS EXISTS. Jacob, 2026-09-08: "streets should continue their predominant direction into an
// intersection." The straighten that delivers it has one prerequisite nobody has built:
// ⛔ **straightening a REAL corner is worse than the defect it fixes** — a removed corner is a
// MISSING ADA RAMP on a town nobody has inspected, which is the one-sided-safety failure
// `RIBBONS §1` retired. This is the discriminator that has to exist first.
//
// ⭐ MEASURED ON ①'s OWN SHARP RING, from the FROZEN artifact — never on ② (which eases a 90°
// corner into ~12 vertices of 7.5°, so a turn test there finds nothing) and never on the
// skeleton's `points`, which is the CONTROL POLYGON: the curves live in `segments`, and the mint
// eats `tessellateAdaptive(points, segments)` (`derive.js:5090`). ⛔ Reading the anchors and
// calling them "what the mint eats" is measuring the thing next to the thing; this probe was
// written that way first and the negative recoveries it produced were the tell.
//
// ⭐⭐ THE SPLIT IS STRUCTURAL BEFORE IT IS NUMERIC — carried identity, never recovered geometry.
// ①'s `labels[q]` owns the EDGE q→q+1, so the two edges meeting at vertex q are q−1 and q:
//   · skelId CHANGES ⇒ two different streets' ink meets here. Not one street's bend at all.
//   · same skelId, DIFFERENT SIDE ⇒ a CAP APEX — `RIBBONS §1`: "a cap apex is where ONE chain's two
//     sides meet… Same skelId both sides is the apex." The contour turns around a tip. ⛔ Not a bend,
//     and this probe classified 6 of them as one until the side was added to the test.
//   · same skelId AND same side ⇒ ONE STREET IS BENDING. Only here is there a question, and only
//     here can a straighten legitimately act.
// ⇒ then, and only within that population: A KINK RECOVERS, A CORNER DOES NOT.
//   `recovery = localTurn − sustainedTurn`, headings read along the ring inside the same owner.
//
// ⭐ AUTHORING-INDEPENDENT BY RULING, NOT BY OVERSIGHT: ① is width-free, and `RIBBONS §1` rules it
// EXEMPT — "do not 'fix' them". That is why `POLYGON-FIRST §5` RULE 1 does not bite here.
// ⛔ NO FALLBACK (RULE 2): no frozen ① ⇒ SKIPPED LOUDLY. A vertex whose heading cannot be read ⇒
// UNCLASSIFIED, its own counted class, never binned into one of the answers.
// ⛔ NO THRESHOLD IS INVENTED: FILLET_TURN_TOL is read out of the source, and the kink/corner line
// is left to the eye — a number chosen in this file would be the tuning Layer 0 forbids.
//
// ⛔⛔ KNOWN LIMIT, MEASURED, AND IT BOUNDS WHAT THIS PROBE CAN ANSWER: **THE RECOVERY HALF IS
// LARGELY VACUOUS ON ①, BECAUSE ① IS SPARSE BY RULING.** A straight frontage is ONE EDGE — LS's ①
// edges run median 10.6 m, p75 45.7 m, max 703 m, and only 35.6% are as long as the 20 m heading
// window. Where one edge spans the whole window the two sample points collide and the heading is
// unreadable: that is 105 of LS's 113 UNCLASSIFIED, not an incidental failure.
// ⭐ AND THE DEEPER CONSEQUENCE IS THE USEFUL ONE: on a contour whose straight runs are single
// edges, the LOCAL turn at a vertex already compares two prevailing headings — "local" and
// "sustained" are the same quantity, so there is nothing for a recovery test to recover. A kink
// mostly does not survive into ① at all; the skeleton's simplification has already removed it.
// ⇒ **THE STRUCTURAL SPLIT IS WHAT ① CAN ANSWER.** If the numeric question still needs answering,
// it belongs on the tessellated CHAIN the mint eats, which is a different object — ⛔ do not
// "fix" this probe by loosening the window until numbers appear.
// ▶ re-derive the sparsity before trusting any of that:
//   node -e "const r=require('./src/data/ribbons.json').protopolygon;const L=[];for(const g of r.rings)for(let i=0;i<g.length;i++){const a=g[i],b=g[(i+1)%g.length];L.push(Math.hypot(b[0]-a[0],b[1]-a[1]))}L.sort((x,y)=>x-y);console.log('median',L[L.length>>1].toFixed(2),'| >=20m',L.filter(x=>x>=20).length,'of',L.length)"
// ▶ node checks/claims-a-kink-recovers-but-a-corner-does-not.mjs [scene ...] [--list]
import fs from 'fs'
import { feed, feedScenes } from '../scratch/_proto-feed.mjs'

const src = fs.readFileSync(new URL('../src/lib/tileGround.js', import.meta.url), 'utf8')
const m = src.match(/const FILLET_TURN_TOL\s*=\s*([0-9.]+)\s*\*\s*Math\.PI\s*\/\s*180/)
if (!m) { console.log('⛔ LOUD FAIL: cannot read FILLET_TURN_TOL out of tileGround.js — the ruled constant moved. FIX THE PROBE against the new source; do not guess it.'); process.exit(1) }
const TOL = Number(m[1])

const LIST = process.argv.includes('--list')
const scenes = feedScenes().filter(a => !a.startsWith('--'))

const NEAR_R = 12    // m — "on the approach to a junction"
const BODY_IN = 4, BODY_OUT = 20   // m — the heading window either side, skipping the deviation itself
const ang = (u, v) => {
  const lu = Math.hypot(u[0], u[1]), lv = Math.hypot(v[0], v[1])
  if (lu < 1e-9 || lv < 1e-9) return null
  return Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (lu * lv)))) * 180 / Math.PI
}

for (const scene of scenes) {
  const f = feed(scene); if (!f) continue
  const P = f.ribbons.protopolygon
  if (!P?.rings?.length || !P.owners?.length) {
    console.log(`⛔ ${scene}: no frozen protopolygon in ${scene === 'lafayette-square' ? 'src/data/ribbons.json' : 'its ribbons'} — SKIPPED LOUDLY. This scene has not been poured since ① landed; it was NOT checked.`)
    continue
  }
  const nodePts = Object.values(P.nodes || {}).filter(Array.isArray)
  const own = (ri, qi) => P.owners[P.labels[ri][qi]] || null

  const rows = []
  for (let ri = 0; ri < P.rings.length; ri++) {
    const R = P.rings[ri], n = R.length
    if (n < 4 || !P.labels[ri]) continue
    // heading along the ring from vertex q, walking `dir`, over [BODY_IN, BODY_OUT] m,
    // ⛔ stopping the moment the owning chain OR SIDE changes. ⭐⭐ THE SIDE IS LOAD-BEARING AND
    // OMITTING IT IS WHY THIS PROBE FIRST REPORTED NEGATIVE RECOVERIES: ①'s ring is the BOUNDARY
    // of the ink, so it runs out along a chain's right side and back along its left. Walk past a
    // tip with only `skelId` guarding and the "heading" reverses — the same chain, the opposite
    // direction, ~180° of spurious sustained turn. Identity here is (chain, side), never chain.
    const key = (o) => o ? `${o.skelId}|${o.side}` : null
    const heading = (q, dir) => {
      const home = key(own(ri, dir > 0 ? q : (q - 1 + n) % n))
      let acc = 0, a = null, b = null
      for (let s = 0; s < n; s++) {
        const cur = (q + dir * s + n) % n, nxt = (q + dir * (s + 1) + n) % n
        const eOwn = key(own(ri, dir > 0 ? cur : nxt))
        if (s > 0 && eOwn !== home) break
        acc += Math.hypot(R[nxt][0] - R[cur][0], R[nxt][1] - R[cur][1])
        if (a === null && acc >= BODY_IN) a = R[nxt]
        if (acc >= BODY_OUT) { b = R[nxt]; break }
      }
      if (!a || !b) return null
      return dir > 0 ? [b[0] - a[0], b[1] - a[1]] : [a[0] - b[0], a[1] - b[1]]
    }
    for (let q = 0; q < n; q++) {
      const p = R[q], pv = R[(q - 1 + n) % n], nx = R[(q + 1) % n]
      const local = ang([p[0] - pv[0], p[1] - pv[1]], [nx[0] - p[0], nx[1] - p[1]])
      if (local === null || local <= TOL) continue                 // curve sample — no corner here
      let bd = Infinity
      for (const nd of nodePts) { const d = Math.hypot(p[0] - nd[0], p[1] - nd[1]); if (d < bd) bd = d }
      if (bd >= NEAR_R) continue                                    // not an approach
      const oPrev = own(ri, (q - 1 + n) % n), oNext = own(ri, q)
      const rec = { at: p, nodeD: bd, local, skelId: oNext?.skelId ?? null }
      if (!oPrev || !oNext) { rec.cls = 'UNCLASSIFIED'; rec.why = 'a minted crossing vertex — no carried label (two chains actually cross here)' }
      else if (oPrev.skelId !== oNext.skelId) { rec.cls = 'OWNER-CHANGE'; rec.why = `${oPrev.skelId} → ${oNext.skelId}`; rec.skelId = `${oPrev.skelId}→${oNext.skelId}` }
      else if (oPrev.side !== oNext.side) { rec.cls = 'CAP-APEX'; rec.why = `one chain's two sides meet — a tip, not a bend (${oNext.skelId})` }
      else {
        const back = heading(q, -1), fwd = heading(q, +1)
        if (!back || !fwd) { rec.cls = 'UNCLASSIFIED'; rec.why = `too little same-owner contour to read a heading (${!back ? 'back' : 'fwd'})` }
        else {
          const sus = ang(back, fwd)
          // ⛔ `local - null` is `local` in JS — a null heading would have scored as a perfect KINK.
          // An unreadable heading is UNCLASSIFIED, never a silently plausible answer (RULE 2).
          if (sus === null) { rec.cls = 'UNCLASSIFIED'; rec.why = 'headings read but degenerate (zero-length)' }
          else { rec.sustained = sus; rec.recovery = local - sus; rec.cls = 'ONE-STREET-BENDS' }
        }
      }
      rows.push(rec)
    }
  }

  const bends = rows.filter(r => r.cls === 'ONE-STREET-BENDS')
  const sorted = bends.map(r => r.recovery).sort((a, b) => a - b)
  const qf = t => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * t))].toFixed(1) : '—'
  console.log(`\n${scene} — ① frozen: ${P.rings.length} rings · ${P.owners.length} owners · ${nodePts.length} corner nodes · FILLET_TURN_TOL ${TOL}° (read from source)`)
  console.log(`  ① vertices turning past the tolerance within ${NEAR_R} m of a node: ${rows.length}`)
  console.log(`\n  STRUCTURAL — decided by CARRIED IDENTITY, no threshold:`)
  console.log(`    OWNER-CHANGE      two streets' ink meets — not one street's bend : ${rows.filter(r => r.cls === 'OWNER-CHANGE').length}`)
  console.log(`    CAP-APEX          one chain's two sides meet at a tip            : ${rows.filter(r => r.cls === 'CAP-APEX').length}`)
  console.log(`    ONE-STREET-BENDS  the only population a straighten may touch     : ${bends.length}`)
  const unc = rows.filter(r => r.cls === 'UNCLASSIFIED')
  console.log(`    ⛔ UNCLASSIFIED                                                  : ${unc.length}   ⬅ loud, never binned`)
  // ⭐ RULE 3 — if a class needs a taxonomy to explain, it is really N classes. Break it out, so
  // "unclassified" cannot hide a population that is actually decidable by a different question.
  const byWhy = new Map()
  for (const r of unc) { const k = r.why.replace(/\(.*\)/, '').trim(); byWhy.set(k, (byWhy.get(k) || 0) + 1) }
  for (const [k, v] of [...byWhy].sort((a, b) => b[1] - a[1])) console.log(`         ${String(v).padStart(4)}  ${k}`)
  if (bends.length) {
    console.log(`\n  WITHIN "one street bends" — recovery = local − sustained`)
    console.log(`    ⭐ ≈ +local ⇒ heading unchanged either side, a local deviation ⇒ KINK`)
    console.log(`    ⭐ ≈ 0 or NEGATIVE ⇒ the street genuinely turns (negative = the turn is spread over several`)
    console.log(`       vertices, the strongest corner signal there is). ⛔ Never straighten a negative.`)
    console.log(`    n=${bends.length}   min ${qf(0)}°  p25 ${qf(0.25)}°  median ${qf(0.5)}°  p75 ${qf(0.75)}°  max ${qf(0.999)}°`)
  }
  if (LIST && bends.length) {
    console.log(`\n  most-recovering first — ⭐ THE EYE DECIDES WHERE THE LINE IS (record the scene):`)
    for (const r of [...bends].filter(r => Number.isFinite(r.recovery) && Number.isFinite(r.sustained)).sort((a, b) => b.recovery - a.recovery).slice(0, 20))
      console.log(`    rec ${r.recovery.toFixed(1).padStart(6)}°  local ${r.local.toFixed(0).padStart(3)}°  sustained ${r.sustained.toFixed(0).padStart(3)}°  ${r.nodeD.toFixed(1).padStart(5)} m from node  ${String(r.skelId).padEnd(26)} @ ${r.at[0].toFixed(1)},${r.at[1].toFixed(1)}`)
  }
}
console.log(`\n⛔ NO KINK/CORNER LINE IS DRAWN HERE, DELIBERATELY — it is an EYE ruling, and a number\n   invented in this file would be tuning against the town it was written on.\n`)
