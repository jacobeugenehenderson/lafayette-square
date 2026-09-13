// THE CHECK: walk the OUTER EDGE (the asphalt polygon `iA`) of every tile that
// touches a same-road seam, station by station, and report (a) the pavementHW the
// offset was handed at each station, (b) whether it STEPS across a vertex the
// construction was told is NOT a corner, and (c) whether the emitted offset
// SELF-INTERSECTS there.
//
// ⭐ Why this generalises to a town nobody has looked at: every quantity is read
// out of the artifact's own per-run `roadId` / `side` / `segOrd` / `measure`, and
// the authored state is read from the look's own `design.json`. No street name is
// used to SELECT anything — names are printed last, as labels for the human.
// A corner (different roadId) changing width PASSES. An authored asymmetry
// PASSES and is reported as AUTHORED. Only a step the construction was told is a
// through-node, or a genuine offset self-crossing, is reported as a finding.
//
//   node scratch/claims-uturn-outer-edge-walk.mjs [scene] [--near x,y] [--radius m]
//
// Writes nothing. Exit 1 if any finding.
import fs from 'fs'
import crypto from 'crypto'

const argv = process.argv.slice(2)
const scene = argv.find(a => !a.startsWith('--')) || 'lafayette-square'
const nearArg = (argv.find(a => a.startsWith('--near=')) || '').split('=')[1]
const NEAR = nearArg ? nearArg.split(',').map(Number) : null
const RADIUS = Number((argv.find(a => a.startsWith('--radius=')) || '').split('=')[1]) || 60
const TOL = 0.01                      // metres; below this is float noise

const SHAPE = `public/baked/${scene}/shape.json`
const DESIGN = `public/looks/${scene}/design.json`
const o = console.log

const RAW = fs.readFileSync(SHAPE)
const sh = JSON.parse(RAW)
if (!Array.isArray(sh.tiles)) { o(`⛔ ${scene}: no tiles in shape.json — not a poured artifact`); process.exit(2) }

// ── the authored state. ⛔ Loading this is not optional (Layer 0 q3): a width
// the operator authored is the PRODUCT, and a probe blind to it reports the
// authoring gesture as the defect. If the look is missing, REFUSE — do not
// silently measure the un-authored map.
if (!fs.existsSync(DESIGN)) { o(`⛔ ${scene}: no design.json at ${DESIGN} — refusing to measure without the authored state`); process.exit(2) }
const design = JSON.parse(fs.readFileSync(DESIGN, 'utf8'))
const BC = design.blockCustoms || {}
const authoredHW = (skelId, side, segOrd) => {
  const v = BC?.[skelId]?.[side]?.[String(segOrd)]?.pavementHW
  return Number.isFinite(v) ? v : null
}

o(`\n── ${scene}   shape.json sha256 ${crypto.createHash('sha256').update(RAW).digest('hex').slice(0, 10)}   tiles ${sh.tiles.length}`)
o(`   authored: ${Object.keys(BC).length} blockCustoms chains from ${DESIGN}`)

// ═════ PART 1 — the datum. Per canonical road, per SIDE LABEL, and per PHYSICAL
// side. RIBBONS §3.3 / derive.js:2613: a through-road carries ONE pavementHW per
// side. The reconcile keys on the literal 'left'/'right' label — and that label
// is POINT-ORDER-RELATIVE, so two chains of one road whose points run opposite
// ways disagree about which label faces which way. Test the label AND the
// geometry, separately, and report when they disagree.
const byRoad = new Map()
for (const [ti, t] of sh.tiles.entries()) {
  for (const r of t.runs || []) {
    const rid = r.roadId || r.skelId
    if (!byRoad.has(rid)) byRoad.set(rid, new Map())
    const chains = byRoad.get(rid)
    const key = `${r.skelId}|${r.side}`
    if (!chains.has(key)) chains.set(key, { skelId: r.skelId, side: r.side, hw: new Set(), base: new Set(), segs: new Set(), tiles: new Set(), pts: [] })
    const c = chains.get(key)
    const hw = r.measure?.[r.side]?.pavementHW
    const bh = r.baseMeasure?.[r.side]?.pavementHW
    if (Number.isFinite(hw)) c.hw.add(+hw.toFixed(4))
    if (Number.isFinite(bh)) c.base.add(+bh.toFixed(4))
    c.segs.add(r.segOrd); c.tiles.add(ti)
    if (r.poly?.length >= 2) c.pts.push(r.poly)
  }
}

// ═════ PART 2 — the outer-edge walk.
// `iaEdge[k]` binds iA vertex k to the ring edge that produced it. Depth per ring
// edge = the run that owns it, at level 'A' (pavementHW exactly — tileGround.js:1163).
const edgeKey = (p, q) => `${Math.round(p[0] * 50)},${Math.round(p[1] * 50)}|${Math.round(q[0] * 50)},${Math.round(q[1] * 50)}`

function segInt(a, b, c, d) {                    // proper segment crossing, no epsilon fudge
  const cr = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  const d1 = cr(c, d, a), d2 = cr(c, d, b), d3 = cr(a, b, c), d4 = cr(a, b, d)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    const t = d3 / (d3 - d4)
    return [c[0] + t * (d[0] - c[0]), c[1] + t * (d[1] - c[1])]
  }
  return null
}

// Reproduce offsetRingVariable's per-vertex branch (tileGround.js:452-476) so we
// can say WHICH branch ran and what it emitted. Same expressions, same order.
function cornerGeometry(ring, facts, i, n) {
  const ccw = signedArea(ring) > 0
  const edge = (k) => {
    const a = ring[k], b = ring[(k + 1) % n]
    let dx = b[0] - a[0], dy = b[1] - a[1]; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L
    const nx = ccw ? -dy : dy, ny = ccw ? dx : -dx
    const d = Math.max(0, facts[k]?.hw || 0)
    return { dir: [dx, dy], P: [a[0] + nx * d, a[1] + ny * d], nrm: [nx, ny], d, L }
  }
  const A = edge((i - 1 + n) % n), B = edge(i)
  const det = A.dir[0] * B.dir[1] - A.dir[1] * B.dir[0]
  const turnDeg = Math.atan2(det, A.dir[0] * B.dir[0] + A.dir[1] * B.dir[1]) * 180 / Math.PI
  const out = { turnDeg, det, dA: A.d, dB: B.d, legA: A.L, legB: B.L }
  if (Math.abs(det) < 1e-9) { out.branch = 'collinear→averaged-normal'; return out }
  const t = ((B.P[0] - A.P[0]) * A.dir[1] - (B.P[1] - A.P[1]) * A.dir[0]) / det
  const X = [B.P[0] + B.dir[0] * t, B.P[1] + B.dir[1] * t]
  const lim = 2.5 * Math.max(A.d, B.d, 0.5) + 1
  const dist = Math.hypot(X[0] - ring[i][0], X[1] - ring[i][1])
  out.X = X; out.lim = lim; out.dist = dist
  out.branch = dist > lim ? 'MITER-CLAMPED → BEVEL (two points = a straight chamfer)' : 'MITER (one point = a corner tooth)'
  // what the canonical roadId would have produced instead
  let mx = A.nrm[0] + B.nrm[0], my = A.nrm[1] + B.nrm[1]; const mL = Math.hypot(mx, my) || 1; mx /= mL; my /= mL
  out.wouldBe = [ring[i][0] + mx * ((A.d + B.d) / 2), ring[i][1] + my * ((A.d + B.d) / 2)]
  out.displacement = Math.hypot(out.wouldBe[0] - X[0], out.wouldBe[1] - X[1])
  return out
}
function signedArea(r) { let s = 0; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; s += a[0] * b[1] - b[0] * a[1] } return s / 2 }

const findings = []
const inScope = (p) => !NEAR || Math.hypot(p[0] - NEAR[0], p[1] - NEAR[1]) <= RADIUS

for (const [ti, t] of sh.tiles.entries()) {
  const runs = t.runs || []
  const ring = t.ring || []
  if (runs.length < 2 || ring.length < 3) continue

  // per ring-edge fact, exactly as freezeCurbEdgeFacts builds it (tileGround.js:195)
  const factByEdge = new Map()
  for (const r of runs) {
    for (let i = 0; i < (r.poly?.length || 0) - 1; i++) {
      const f = {
        skelId: r.skelId, side: r.side, segOrd: r.segOrd,
        // ⛔ Reproduce tileGround.js:206's precedence EXACTLY — `throughId` FIRST.
        // The probe must measure what the construction does, not what canon says
        // it does. `roadKey` is kept alongside so the two can be compared.
        streetKey: r.throughId || r.roadId || r.skelId,
        roadKey: r.roadId || r.skelId,
        hw: r.measure?.[r.side]?.pavementHW,
        base: r.baseMeasure?.[r.side]?.pavementHW,
      }
      const k1 = edgeKey(r.poly[i], r.poly[i + 1]), k2 = edgeKey(r.poly[i + 1], r.poly[i])
      factByEdge.set(k1, f)
      if (!factByEdge.has(k2)) factByEdge.set(k2, f)
    }
  }
  const n = ring.length
  const facts = []
  for (let i = 0; i < n; i++) facts.push(factByEdge.get(edgeKey(ring[i], ring[(i + 1) % n])) || null)

  // ── the walk: each ring VERTEX is a station. cornerAt = the two edges' streetKey differ.
  for (let i = 0; i < n; i++) {
    const A = facts[(i - 1 + n) % n], B = facts[i]
    if (!A || !B) continue
    if (!inScope(ring[i])) continue
    const isCorner = A.streetKey !== B.streetKey              // what the CONSTRUCTION decides
    const sameRoad = A.roadKey === B.roadKey                  // what the CANON says (RIBBONS §3.3)
    // ⭐ THE SHADOWED-KEY CLASS. The two identity keys DISAGREE: one continuous
    // road by roadId, two different streets by throughId. The construction takes
    // throughId (it is first at tileGround.js:206), so it builds an offset-
    // INTERSECTION CORNER at a vertex the canonical road says is a through-node.
    // Report it wherever it occurs — no street name selects it.
    if (isCorner && sameRoad) {
      const geom = cornerGeometry(ring, facts, i, n)
      findings.push({ ti, at: ring[i], kind: 'SHADOWED-KEY-CORNER', road: A.roadKey, a: A, b: B, geom, d: Math.abs((A.hw ?? 0) - (B.hw ?? 0)) })
      continue
    }
    if (isCorner) continue                                    // a corner may step — that is the product
    if (!Number.isFinite(A.hw) || !Number.isFinite(B.hw)) continue
    const d = Math.abs(A.hw - B.hw)
    if (d <= TOL) continue
    // ⛔ SPLIT THE CLASS. Did the OPERATOR author this step? Then it is the product.
    const aA = authoredHW(A.skelId, A.side, A.segOrd), aB = authoredHW(B.skelId, B.side, B.segOrd)
    const authored = aA != null || aB != null
    const capWrap = A.skelId === B.skelId && A.side !== B.side
    findings.push({
      ti, at: ring[i], kind: capWrap ? 'cap-wrap' : (A.side !== B.side ? 'SEAM-FLIP' : 'SEAM-STEP'),
      road: A.streetKey, a: A, b: B, d, authored, aA, aB,
      baseStep: Math.abs((A.base ?? 0) - (B.base ?? 0)),
    })
  }

  // ── the offset: does iA self-intersect within scope?
  for (const [pi, poly] of (t.iA || []).entries()) {
    const lab0 = t.iaEdge?.[pi] || null          // iaEdge is parallel to iA, per POLY
    const m = poly.length
    if (m < 4) continue
    for (let i = 0; i < m; i++) {
      for (let j = i + 2; j < m; j++) {
        if (i === 0 && j === m - 1) continue
        const X = segInt(poly[i], poly[(i + 1) % m], poly[j], poly[(j + 1) % m])
        if (X && inScope(X)) {
          const lab = lab0 ? [lab0[i], lab0[j]] : null
          findings.push({ ti, at: X, kind: 'OFFSET-SELF-INTERSECT', iaVerts: [i, j], iaEdge: lab })
        }
      }
    }
  }
}

// ═════ REPORT
o(`\n═══ PART 1 — the width datum per canonical road (label vs geometry)`)
let datumBad = 0
for (const [rid, chains] of byRoad) {
  if (chains.size < 2) continue
  const all = [...chains.values()]
  if (NEAR && !all.some(c => c.pts.some(p => p.some(inScope)))) continue
  // the reconcile's own invariant: max is uniform per (roadId, sideLabel)
  for (const side of ['left', 'right']) {
    const cs = all.filter(c => c.side === side && c.base.size)
    if (cs.length < 2) continue
    const vals = cs.map(c => [...c.base]).flat()
    const mx = Math.max(...vals), mn = Math.min(...vals)
    if (mx - mn > TOL) {
      datumBad++
      o(`  ⛔ ${rid} / ${side}: BASE not reconciled — ${mn.toFixed(4)} … ${mx.toFixed(4)}  (Δ ${(mx - mn).toFixed(4)} m)`)
      for (const c of cs) o(`       ${c.skelId}/${c.side}  base {${[...c.base].map(v => v.toFixed(4)).join(', ')}}  segOrd {${[...c.segs].sort((a, b) => a - b).join(',')}}`)
    }
  }
  // the physical test: ignore the label, compare across the whole road
  const allBase = all.map(c => [...c.base]).flat().filter(Number.isFinite)
  if (allBase.length >= 2) {
    const mx = Math.max(...allBase), mn = Math.min(...allBase)
    if (mx - mn > TOL) {
      o(`  ▸ ${rid}: across ALL side labels base spans ${mn.toFixed(4)} … ${mx.toFixed(4)}`)
      for (const c of all) o(`       ${c.skelId}/${c.side}  base {${[...c.base].map(v => v.toFixed(4)).join(', ')}}  authored@segOrd {${[...c.segs].sort((a, b) => a - b).filter(s => authoredHW(c.skelId, c.side, s) != null).map(s => `${s}=${authoredHW(c.skelId, c.side, s)}`).join(',') || 'none'}}`)
    }
  }
}
if (!datumBad) o(`  (no roadId/sideLabel base disagreement in scope)`)

o(`\n═══ PART 2 — the outer-edge walk${NEAR ? `   [scope: within ${RADIUS} m of ${NEAR}]` : ''}`)
const real = findings.filter(f => f.kind !== 'cap-wrap')
const auth = real.filter(f => f.authored)
const hard = real.filter(f => !f.authored)
o(`  stations flagged ${findings.length}   cap-wrap(expected) ${findings.length - real.length}   AUTHORED(pass) ${auth.length}   FINDINGS ${hard.length}`)
for (const f of auth) o(`  ✅ AUTHORED  tile ${f.ti}  Δ ${f.d.toFixed(4)} m  ${f.a.skelId}/${f.a.side}/${f.a.segOrd} → ${f.b.skelId}/${f.b.side}/${f.b.segOrd}  (operator set ${f.aA ?? f.aB})`)
for (const f of hard) {
  if (f.kind === 'SHADOWED-KEY-CORNER') {
    const g = f.geom
    o(`  ⛔ tile ${f.ti}  SHADOWED-KEY-CORNER  at [${f.at[0].toFixed(2)}, ${f.at[1].toFixed(2)}]`)
    o(`       roadId agrees (${f.road}) but throughId differs → construction builds a CORNER`)
    o(`       ${f.a.skelId}/${f.a.side}/segOrd ${f.a.segOrd} "${f.a.streetKey}" hw ${(f.a.hw ?? 0).toFixed(4)}`)
    o(`         → ${f.b.skelId}/${f.b.side}/segOrd ${f.b.segOrd} "${f.b.streetKey}" hw ${(f.b.hw ?? 0).toFixed(4)}   (Δ ${f.d.toFixed(4)} m)`)
    o(`       turn ${g.turnDeg.toFixed(2)}°   branch: ${g.branch}`)
    if (g.dist != null) o(`       miter dist ${g.dist.toFixed(3)} m vs lim ${g.lim.toFixed(3)} m   apex→[${g.X[0].toFixed(2)}, ${g.X[1].toFixed(2)}]`)
    if (g.displacement != null) o(`       through-node would emit [${g.wouldBe[0].toFixed(2)}, ${g.wouldBe[1].toFixed(2)}]  ⇒ DISPLACEMENT ${g.displacement.toFixed(3)} m`)
  } else if (f.kind === 'OFFSET-SELF-INTERSECT') {
    o(`  ⛔ tile ${f.ti}  OFFSET-SELF-INTERSECT at [${f.at[0].toFixed(2)}, ${f.at[1].toFixed(2)}]  iA verts ${f.iaVerts.join('×')}  ringEdge ${JSON.stringify(f.iaEdge)}`)
  } else {
    o(`  ⛔ tile ${f.ti}  ${f.kind}  Δ ${f.d.toFixed(4)} m (base Δ ${f.baseStep.toFixed(4)})  road ${f.road}`)
    o(`       ${f.a.skelId}/${f.a.side}/segOrd ${f.a.segOrd}  hw ${f.a.hw.toFixed(4)}  →  ${f.b.skelId}/${f.b.side}/segOrd ${f.b.segOrd}  hw ${f.b.hw.toFixed(4)}`)
    o(`       at [${f.at[0].toFixed(2)}, ${f.at[1].toFixed(2)}]   authored: neither side`)
  }
}

o(`\nTOTAL findings: ${hard.length}   (authored, passing: ${auth.length})`)
process.exit(hard.length ? 1 : 0)
