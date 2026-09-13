#!/usr/bin/env node
// ⛔⛔ WHERE DOES ②'s FAR-FIELD MISS LIVE — ON THE OFFSET TILES OR THE CARVED ONES?
//
// WHY THIS EXISTS, AND IT IS A BASELINE QUESTION, NOT A GEOMETRY ONE.
// `claims-proto-leg-tail-is-corner-reach.mjs` measures ② against the `iA` built by the same
// run, and finds LS plateaus — ~27% of vertices ≥20 m from any node are metres off. Read
// naively that says "② has a mid-leg error and Gate C is real."
// ⛔ BUT `iA` IS NOT ONE THING. `ROADMAP A06`/`A07`: the curb has TWO PRODUCERS and the choice
// is stamped per tile — `offset` (the concentric law) and `carve` (`tile.ring − aFill`, the
// legacy chain-derived path, 42 of 101 on LS). A06 is OPEN precisely because the carved half is
// the one still built from chains, and `A06`'s 2026-09-06 retraction records Jacob's eye on it:
// *"this is chains."*
// ⇒ If ②'s miss is concentrated on CARVE tiles, ② is not deviating from the curb — it is
// deviating from the half of the baseline we already know is wrong, and "Gate C is real" would
// be a finding manufactured by comparing a new producer to a bad reference.
// ⭐ `feedback_verify_the_baseline_before_comparing_to_it`, applied before the conclusion ships.
//
// ⛔ Vertices are attributed to a tile BY GEOMETRY (nearest iA edge), never by tile index — the
// live pass and the frozen artifact number tiles differently (`CLAUDE.md` routing gate).
// ⛔ Authored state only, through `_proto-feed`. ⛔ Grade-separated rings excluded (no baseline).
// ▶ node checks/claims-proto-legmiss-by-producer.mjs [scene ...]
import { feed, buildProto } from './_proto-feed.mjs'

const scenes = process.argv.slice(2)
if (!scenes.length) scenes.push('lafayette-square')
const FAR = 20, HIT = 0.10, CELL = 25

const d2seg = (p, a, b) => { const ex = b[0]-a[0], ez = b[1]-a[1], L2 = ex*ex+ez*ez||1
  let t = ((p[0]-a[0])*ex + (p[1]-a[1])*ez)/L2; t = Math.max(0, Math.min(1, t))
  return Math.hypot(p[0]-(a[0]+ex*t), p[1]-(a[1]+ez*t)) }
const q = (a, fr) => { const s = [...a].sort((x,y)=>x-y); return s.length ? s[Math.min(s.length-1, Math.floor(s.length*fr))] : NaN }

let failed = false
for (const scene of scenes) {
  const f = feed(scene); if (!f) { failed = true; continue }
  const r = buildProto(f, { emitArtifact: true })
  const tiles = r._shapeArtifact || []
  if (!tiles.length || !r.protoCurb?.length) { console.log(`⛔ ${scene}: nothing to measure`); failed = true; continue }

  // ⭐ the producer split is READ OFF THE ARTIFACT, never assumed — A07's stamp is the instrument
  const bySrc = {}
  for (const t of tiles) bySrc[t.producer || 'UNSTAMPED'] = (bySrc[t.producer || 'UNSTAMPED'] || 0) + 1
  console.log(`\n${'='.repeat(72)}\n${scene} — ${tiles.length} tile(s): ${Object.entries(bySrc).map(([k,v]) => `${k} ${v}`).join(' · ')}`)
  if (!tiles.some(t => t.producer)) { console.log('   ⛔ NO PRODUCER STAMP in this run\'s artifact — the question cannot be asked. NOT "no difference".'); failed = true; continue }

  // grid of baseline edges, each carrying its owning tile's producer
  const grid = new Map(), key = (cx, cz) => cx + ',' + cz
  for (const t of tiles) for (const ring of (t.iA || [])) for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i+1) % ring.length], src = t.producer || 'UNSTAMPED'
    const x0 = Math.min(a[0],b[0]), x1 = Math.max(a[0],b[0]), z0 = Math.min(a[1],b[1]), z1 = Math.max(a[1],b[1])
    for (let cx = Math.floor(x0/CELL); cx <= Math.floor(x1/CELL); cx++)
      for (let cz = Math.floor(z0/CELL); cz <= Math.floor(z1/CELL); cz++) {
        const k = key(cx,cz); let e = grid.get(k); if (!e) grid.set(k, e = []); e.push([a, b, src])
      }
  }
  const nearest = (p) => {
    let best = Infinity, src = null
    for (let ring = 0; ring < 24 && !(best < ring * CELL); ring++) {
      const cx0 = Math.floor(p[0]/CELL), cz0 = Math.floor(p[1]/CELL)
      for (let cx = cx0-ring; cx <= cx0+ring; cx++) for (let cz = cz0-ring; cz <= cz0+ring; cz++) {
        if (ring && Math.abs(cx-cx0) !== ring && Math.abs(cz-cz0) !== ring) continue
        for (const [a, b, s] of (grid.get(key(cx,cz)) || [])) { const d = d2seg(p, a, b); if (d < best) { best = d; src = s } }
      }
    }
    return { d: best, src }
  }
  const nodes = []
  for (const s of f.ribbons.streets) if (s.points?.length >= 2) { nodes.push(s.points[0], s.points.at(-1)) }
  const nGrid = new Map()
  for (const n of nodes) { const k = key(Math.floor(n[0]/CELL), Math.floor(n[1]/CELL)); let e = nGrid.get(k); if (!e) nGrid.set(k, e = []); e.push(n) }
  const dNode = (p) => { let best = Infinity
    for (let ring = 0; ring < 12 && !(best < ring * CELL); ring++) {
      const cx0 = Math.floor(p[0]/CELL), cz0 = Math.floor(p[1]/CELL)
      for (let cx = cx0-ring; cx <= cx0+ring; cx++) for (let cz = cz0-ring; cz <= cz0+ring; cz++) {
        if (ring && Math.abs(cx-cx0) !== ring && Math.abs(cz-cz0) !== ring) continue
        for (const n of (nGrid.get(key(cx,cz)) || [])) { const d = Math.hypot(p[0]-n[0], p[1]-n[1]); if (d < best) best = d }
      } }
    return best }

  const acc = {}, unmatched = {}
  for (let k = 0; k < r.protoCurb.length; k++) {
    if (r.protoCurbGs?.[k]) continue
    for (const p of r.protoCurb[k]) {
      if (dNode(p) < FAR) continue                       // far field only — corners are expected to miss
      const { d, src } = nearest(p)
      if (!Number.isFinite(d)) { unmatched[src || 'none'] = (unmatched[src || 'none'] || 0) + 1; continue }
      ;(acc[src] ||= []).push(d)
    }
  }
  console.log(`\n   far-field (≥${FAR} m from a node) ② vertices, by the PRODUCER of the nearest baseline curb:`)
  console.log(`   ${'producer'.padEnd(12)} ${'n'.padStart(7)} ${'median'.padStart(9)} ${'p90'.padStart(9)} ${('within '+HIT+' m').padStart(14)}`)
  for (const [src, a] of Object.entries(acc).sort((x,y) => y[1].length - x[1].length))
    console.log(`   ${src.padEnd(12)} ${String(a.length).padStart(7)} ${q(a,.5).toFixed(3).padStart(9)} ${q(a,.9).toFixed(3).padStart(9)} ${((100*a.filter(d=>d<HIT).length/a.length).toFixed(1)+'%').padStart(14)}`)
  const un = Object.values(unmatched).reduce((n,v)=>n+v,0)
  if (un) console.log(`   ⛔ ${un} UNMEASURABLE (no baseline edge found) — its own class, excluded above.`)

  const off = acc.offset || [], carve = acc.carve || []
  if (!off.length || !carve.length) { console.log('\n   ⛔ one producer has no far-field population here — NO VERDICT.'); failed = true; continue }
  const w = (a) => 100 * a.filter(d => d < HIT).length / a.length
  console.log(`\n   offset ${w(off).toFixed(1)}% within ${HIT} m  ·  carve ${w(carve).toFixed(1)}%`)
  // ⛔ The verdict names which artifact is on trial. It does NOT explain the mechanism.
  if (w(off) >= 99) console.log('   ⭐ ② AGREES WITH THE OFFSET BASELINE. The far-field miss lives on the CARVED tiles — i.e. against the half of the baseline `A06` says is still chain-built. ⛔ "Gate C is real" does NOT follow from it. Cause of the carve disagreement not established here.')
  else if (w(off) - w(carve) > 20) console.log('   ⚠️ ② agrees FAR better with offset than with carve, but not exactly. Both a baseline effect and a ② effect are live; neither is established.')
  else console.log('   ⛔ ② misses BOTH producers about equally — the baseline split does NOT explain it. Gate C survives this check.')
}

console.log(`\n${failed ? '⛔ incomplete' : 'done'} — re-run this; do not quote its digits.`)
