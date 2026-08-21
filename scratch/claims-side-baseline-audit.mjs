/**
 * claims-side-baseline-audit — VERIFY THE BASELINE BEFORE COMPARING TO IT.
 *
 * claims-node-pair-key-parity's ④ compared the node pair's ORDER against
 * `fe.side`. 4124c486 establishes that left/right are POINT-ORDER-RELATIVE.
 * ⇒ ④ may have been measuring a bad baseline rather than a bad key.
 * This probe asks that, and ONLY that. It writes nothing, pours nothing.
 *
 * ⛔ NOT a retraction of ④. ④'s measurement stands as measured; what is under
 * test is what it was measuring against.
 *
 * ONE DERIVATION, NEVER RESTATED: the span/pair derivation and the definition
 * of "a break" are IMPORTED from claims-node-pair-key-parity.mjs. The physical
 * side comes from the topology method in claims-physical-side-reconcile.mjs
 * (deg-2 ends only, ENDPOINT_SNAP) — no street names, no per-town table.
 *
 * usage: node scratch/claims-side-baseline-audit.mjs [scene ...]
 */
import { deriveNodePairs, classifySides, nodeKey, dist, quantiles } from './claims-node-pair-key-parity.mjs'

// ⛔ The instrument-input guard applies here too — this probe consumes the same
// derivation, so it inherits the same "which artifact?" hazard. NO DEFAULT.
const ARGV = process.argv.slice(2)
const SOURCE = (ARGV.find(a => a.startsWith('--source=')) || '').split('=')[1] || null
if (!SOURCE) {
  console.error(`⛔ LOUD FAIL — no --source given, and there is deliberately NO DEFAULT.\n` +
    `   usage: node scratch/claims-side-baseline-audit.mjs --source=pour|bundle [scene ...]`)
  process.exit(2)
}

// ── the PHYSICAL side, by topology alone (4124c486 / claims-physical-side-reconcile) ──
// Union the (chain, side) keys that are physically continuous. Join ONLY at a
// DEGREE-2 end: "shares an endpoint" is not "is continuous with" — at a Y the
// hand does not carry across, and unioning there manufactures false cycles.
function physicalSideGroups(streets) {
  const parent = new Map()
  const add = k => { if (!parent.has(k)) parent.set(k, k) }
  const find = k => { while (parent.get(k) !== k) { parent.set(k, parent.get(parent.get(k))); k = parent.get(k) } return k }
  const union = (a, b) => { add(a); add(b); const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb) }
  const sideKey = (st, side) => `${st.skelId}|${side}`
  for (const st of streets) for (const side of ['left', 'right']) add(sideKey(st, side))
  const byRoad = new Map()
  for (const st of streets) {
    const rid = st.roadId || st.skelId
    if (!byRoad.has(rid)) byRoad.set(rid, [])
    byRoad.get(rid).push(st)
  }
  const EPS = 0.15                       // = tileGround's ENDPOINT_SNAP
  const nk = p => `${Math.round(p[0] / EPS)},${Math.round(p[1] / EPS)}`
  let joins = 0, flips = 0, skippedDeg = 0
  const flipEdges = []                   // the joins where the LABEL flips — 4124c486's instances
  for (const group of byRoad.values()) {
    const ends = new Map()
    for (const st of group) {
      const p = st.points
      if (!p?.length) continue
      for (const [pt, isStart] of [[p[0], true], [p[p.length - 1], false]]) {
        const k = nk(pt)
        if (!ends.has(k)) ends.set(k, [])
        ends.get(k).push({ st, isStart, pt })
      }
    }
    for (const [, inc] of ends) {
      if (inc.length !== 2) { if (inc.length > 2) skippedDeg++; continue }
      const [X, Y] = inc
      if (X.st === Y.st) continue
      const reversed = X.isStart === Y.isStart
      joins++
      if (reversed) { flips++; flipEdges.push({ a: X.st.skelId, b: Y.st.skelId, at: X.pt }) }
      union(sideKey(X.st, 'left'), sideKey(Y.st, reversed ? 'right' : 'left'))
      union(sideKey(X.st, 'right'), sideKey(Y.st, reversed ? 'left' : 'right'))
    }
  }
  const contradicted = new Set()
  for (const st of streets) {
    if (find(sideKey(st, 'left')) === find(sideKey(st, 'right'))) contradicted.add(find(sideKey(st, 'left')))
  }
  return { groupOf: (skelId, side) => find(`${skelId}|${side}`), joins, flips, skippedDeg, flipEdges, contradicted }
}

// ── fe ↔ span CORRESPONDENCE (Group B) ──
// The fe should BE the chain sub-polyline over [min segOrd .. max segOrd] offset
// by pavementHW. Sample the fe, project each sample onto the span, and report the
// fraction of samples whose perpendicular distance is within tolerance of hw AND
// whose projection is INTERIOR to the span. Correspondence, not a single midpoint.
function spanCorrespondence(fe, chain, i0, i1, hw) {
  const pts = fe.points
  const N = 24
  let inBand = 0, interior = 0, n = 0
  const perps = []
  for (let s = 0; s <= N; s++) {
    const t = s / N
    // sample the fe by arc length
    let tot = 0
    for (let i = 0; i < pts.length - 1; i++) tot += dist(pts[i], pts[i + 1])
    let want = tot * t, acc = 0, p = pts[pts.length - 1]
    for (let i = 0; i < pts.length - 1; i++) {
      const d = dist(pts[i], pts[i + 1])
      if (acc + d >= want) { const u = (want - acc) / (d || 1); p = [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u]; break }
      acc += d
    }
    let perp = Infinity, clamped = true
    for (let j = i0; j < i1; j++) {
      const a = chain.points[j], b = chain.points[j + 1]
      const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz
      if (L2 < 1e-9) continue
      const tt = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2
      const tc = tt < 0 ? 0 : tt > 1 ? 1 : tt
      const d = Math.hypot(p[0] - (a[0] + tc * dx), p[1] - (a[1] + tc * dz))
      if (d < perp) { perp = d; clamped = (tt < -1e-9 || tt > 1 + 1e-9) }
    }
    if (!Number.isFinite(perp)) continue
    n++; perps.push(perp)
    if (hw > 0 && Math.abs(perp - hw) <= Math.max(1.0, 0.25 * hw)) inBand++
    if (!clamped) interior++
  }
  return { n, inBandFrac: n ? inBand / n : NaN, interiorFrac: n ? interior / n : NaN, perpQ: quantiles(perps) }
}

// THE DECIDING DIAGNOSTIC for Group A. fe.side is computed against the chain
// segment NEAREST the fe (findAdjacentChainForBlockEdge probes outward and takes
// bestSeg over the WHOLE chain); ④ computed its sign against the SPAN only. If the
// nearest-overall segment lies OUTSIDE [i0..i1], the two are not disagreeing about
// a side — they are looking at different geometry, and the pair is not the thing
// that is wrong. Returns the nearest segment index over the whole chain.
function nearestSegOverChain(chain, p) {
  let best = Infinity, bj = -1
  for (let j = 0; j < chain.points.length - 1; j++) {
    const a = chain.points[j], b = chain.points[j + 1]
    const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz
    if (L2 < 1e-9) continue
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2
    if (t < 0) t = 0; else if (t > 1) t = 1
    const d = Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz))
    if (d < best) { best = d; bj = j }
  }
  return { j: bj, d: best }
}
// The fe's index-middle edge midpoint — the point buildBlockGeometryV2 itself uses
// as (mx,mz) when it computes fe.side (:1195-1205). Read from the code's own choice,
// not a re-invention, so the comparison is against the real baseline.
function feSideProbePoint(fe) {
  const pts = fe.points, N = pts.length
  const mid = N >> 1
  const a = pts[Math.max(0, mid - 1)], b = pts[Math.min(N - 1, mid)]
  return [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5]
}

function audit(scene) {
  console.log(`\n${'='.repeat(78)}\n${scene}   [source: ${SOURCE}]\n${'='.repeat(78)}`)
  const { streets, derived, ribPath } = deriveNodePairs(scene, SOURCE)
  console.log(`reading ${ribPath}`)
  const { majSign, conventionClean, sideBreaks } = classifySides(derived)
  const phys = physicalSideGroups(streets)
  console.log(`physical-side union (deg-2 ends only, ENDPOINT_SNAP 0.15): joins ${phys.joins} · orientation FLIPS ${phys.flips} · deg>2 ends skipped ${phys.skippedDeg} · contradictions ${phys.contradicted.size}`)
  console.log(`④ convention ${conventionClean ? 'clean' : 'NOT CLEAN'} (${Object.entries(majSign).map(([k, v]) => `${k}→${v > 0 ? '+1' : '-1'}`).join(' · ')}) · ${sideBreaks.length} break(s)`)

  // ── PARTITION, by what the parity probe already prints ──
  const A = sideBreaks.filter(d => !d.clamped && Number.isFinite(d.offRatio) && d.offRatio > 0.75)
  const B = sideBreaks.filter(d => d.clamped)
  const C = sideBreaks.filter(d => !d.clamped && Number.isFinite(d.offRatio) && d.offRatio <= 0.25)
  const rest = sideBreaks.filter(d => !A.includes(d) && !B.includes(d) && !C.includes(d))
  console.log(`partition: A(ratio>0.75, not clamped) ${A.length} · B(CLAMPED) ${B.length} · C(ratio≤0.25, not clamped) ${C.length} · unpartitioned ${rest.length}`)

  // ── GROUP A — THE DECIDING GROUP ──
  console.log(`\n─ GROUP A — offset ratio ≈ 1, NOT clamped. Span attribution is not the suspect here.`)
  if (!A.length) console.log(`   (empty on this town)`)
  for (const d of A) {
    const g = phys.groupOf(d.chain.skelId, d.fe.side)
    const gOther = phys.groupOf(d.chain.skelId, d.fe.side === 'left' ? 'right' : 'left')
    // Does this chain participate in a LABEL FLIP join? That is 4124c486's mechanism.
    const rid = d.chain.roadId || d.chain.skelId
    const flipsHere = phys.flipEdges.filter(f => f.a === d.chain.skelId || f.b === d.chain.skelId)
    // How many OTHER chains share this fe's physical side group?
    let coMembers = 0
    for (const st of streets) for (const side of ['left', 'right']) if (st.skelId !== d.chain.skelId && phys.groupOf(st.skelId, side) === g) coMembers++
    // ⭐ THE TRAP, CHECKED FIRST: a divided road's two carriageways legitimately carry
    // opposite hand. Read the chain's own stamped phase — do not infer it from a name.
    const ph = d.chain.phase || {}
    console.log(`   ${d.name} · roadId ${rid} · perp ${d.perp.toFixed(2)} vs hw ${d.hw.toFixed(2)} (ratio ${d.offRatio.toFixed(2)}) · span ${d.span.toFixed(1)} m`)
    console.log(`      phase.kind=${ph.kind ?? 'null'} role=${ph.role ?? 'null'} pairKey=${ph.pairKey ?? 'null'} · pairId=${d.chain.pairId ?? 'null'} · anchor=${d.chain.anchor ?? 'null'} · innerSign=${d.chain.innerSign ?? 'null'}`)
    console.log(`      ⇒ ${d.chain.pairId || ph.pairKey ? '⚠️ DIVIDED — opposite hand may be CORRECT here; a difference is not a defect' : 'not divided (no pairId/pairKey), so the divided-road explanation does NOT apply'}`)
    console.log(`      physical group of (${d.chain.skelId},${d.fe.side}) = ${g === gOther ? '⛔ SAME AS OPPOSITE SIDE (contradicted)' : g}  · co-members on this physical side: ${coMembers}`)
    console.log(`      label-FLIP joins touching this chain: ${flipsHere.length}${flipsHere.length ? ' → ' + flipsHere.map(f => `${f.a}↔${f.b}`).join(', ') : ' — NONE, so 4124c486\'s mechanism is ABSENT here'}`)
    // decisive: does fe.side's own probe point sit nearest a chain segment INSIDE the span?
    const pp = feSideProbePoint(d.fe)
    const ns = nearestSegOverChain(d.chain, pp)
    const inSpan = ns.j >= d.uIdx && ns.j < d.vIdx
    console.log(`      fe.side's probe point is nearest chain segment ${ns.j} (${ns.d.toFixed(2)} m); the span is [${d.uIdx}..${d.vIdx}] ⇒ ${inSpan ? '⛔ INSIDE the span — same geometry' : '✅ OUTSIDE the span — fe.side and ④ read DIFFERENT chain geometry; the pair is not what is wrong'}`)
    // ⭐ Is the BASELINE itself well-defined here? fe.side is the sign of a cross product
    // taken at THAT probe point. If the probe point sits ~on the centerline, fe.side's own
    // sign is decided by sub-metre noise — the baseline is undefined, not the key.
    const baselineDefined = ns.d > Math.max(0.5, 0.25 * d.hw)
    console.log(`      BASELINE at that point: offset ${ns.d.toFixed(2)} m vs hw ${d.hw.toFixed(2)} ⇒ ${baselineDefined ? '⭐ WELL-DEFINED — fe.side is not noise here, so this is a HARD contradiction' : '⛔ UNDEFINED — fe.side\'s own sign is decided by ' + ns.d.toFixed(2) + ' m; ④ was compared against a coin-flip'}`)
  }
  const aWithFlip = A.filter(d => phys.flipEdges.some(f => f.a === d.chain.skelId || f.b === d.chain.skelId)).length
  const aInSpan = A.filter(d => { const ns = nearestSegOverChain(d.chain, feSideProbePoint(d.fe)); return ns.j >= d.uIdx && ns.j < d.vIdx }).length
  const aHard = A.filter(d => { const ns = nearestSegOverChain(d.chain, feSideProbePoint(d.fe)); return ns.j >= d.uIdx && ns.j < d.vIdx && ns.d > Math.max(0.5, 0.25 * d.hw) }).length
  console.log(`   ⇒ of ${A.length} Group-A break(s), ${aWithFlip} sit on a chain touched by a LABEL-FLIP join,`)
  console.log(`     ${aInSpan} have fe.side's probe point nearest a segment INSIDE the span,`)
  console.log(`     and of those only ${aHard} have a WELL-DEFINED baseline at that point — the rest were compared against a noise-decided fe.side.`)
  console.log(`   ⛔ NOTE THE PREMISE CHECK PRINTED BELOW before reading this as a rehabilitation.`)

  // ── GROUP B — CLAMPED: does the fe front the span it is credited? ──
  console.log(`\n─ GROUP B — projection CLAMPED. Correspondence test over the whole fe, not a midpoint.`)
  if (!B.length) console.log(`   (empty on this town)`)
  for (const d of B) {
    const so = [...d.fe.segOrds].sort((a, b) => a - b)
    const contiguous = so[so.length - 1] - so[0] === so.length - 1
    const c = spanCorrespondence(d.fe, d.chain, d.uIdx, d.vIdx, d.hw)
    const verdict = c.interiorFrac < 0.5
      ? '❌ DOES NOT front its credited span (majority of the fe projects OFF THE END)'
      : c.inBandFrac < 0.5 ? '❌ fronts the span but NOT at one half-width' : '✅ corresponds'
    console.log(`   ${d.name} · segOrds [${so}] ${contiguous ? 'contiguous' : '⛔ NON-CONTIGUOUS'} · hw ${d.hw.toFixed(2)}`)
    console.log(`      samples interior to span ${(c.interiorFrac * 100).toFixed(0)}% · within ±hw band ${(c.inBandFrac * 100).toFixed(0)}% · perp min ${c.perpQ.min.toFixed(2)} med ${c.perpQ.median.toFixed(2)} — ${verdict}`)
  }
  const bNoFront = B.filter(d => spanCorrespondence(d.fe, d.chain, d.uIdx, d.vIdx, d.hw).interiorFrac < 0.5)
  const bNonContig = B.filter(d => { const so = [...d.fe.segOrds].sort((a, b) => a - b); return so[so.length - 1] - so[0] !== so.length - 1 })
  console.log(`   ⇒ ${bNoFront.length}/${B.length} do not front their credited span · ${bNonContig.length} own NON-CONTIGUOUS segOrds.`)
  if (bNoFront.length && !bNonContig.length) {
    console.log(`   ⭐ The two candidate faults are SEPARABLE here: non-contiguous ownership is ABSENT, so the`)
    console.log(`      min..max span derivation cannot be the cause of these — the credit itself is the locus`)
    console.log(`      (assignSegOrdsToFes attributing a segment to an fe that does not front it).`)
  } else if (bNoFront.length && bNonContig.length) {
    console.log(`   ⛔ CAUSE NOT ESTABLISHED — both candidate faults are present in this set and this probe`)
    console.log(`      cannot separate them. Not picking one.`)
  }

  // ── GROUP C — midpoint essentially ON the centerline ──
  console.log(`\n─ GROUP C — offset ratio ≤ 0.25: the midpoint sits essentially ON the centerline.`)
  if (!C.length) console.log(`   (empty on this town — every near-zero-ratio break is ALSO clamped, so it is in B)`)
  for (const d of C) {
    const so = [...d.fe.segOrds].sort((a, b) => a - b)
    console.log(`   ${d.name} · perp ${d.perp.toFixed(2)} m vs hw ${d.hw.toFixed(2)} · span ${d.span.toFixed(1)} m · segOrds [${so}] · fe len ${(() => { let t = 0; for (let i = 0; i < d.fe.points.length - 1; i++) t += dist(d.fe.points[i], d.fe.points[i + 1]); return t.toFixed(1) })()} m`)
    console.log(`      ⇒ the sign here is decided by ${d.perp.toFixed(2)} m of offset. NOT a side disagreement — an UNDEFINED side.`)
  }

  // ── GROUP D — the mid-ratio remainder. NAMED, never silently dropped. ──
  console.log(`\n─ GROUP D — 0.25 < offset ratio ≤ 0.75, NOT clamped. Outside the brief's three groups; named, not dropped.`)
  if (!rest.length) console.log(`   (empty on this town)`)
  for (const d of rest) {
    const pp = feSideProbePoint(d.fe)
    const ns = nearestSegOverChain(d.chain, pp)
    const inSpan = ns.j >= d.uIdx && ns.j < d.vIdx
    const c = spanCorrespondence(d.fe, d.chain, d.uIdx, d.vIdx, d.hw)
    console.log(`   ${d.name} · perp ${d.perp.toFixed(2)} vs hw ${d.hw.toFixed(2)} (ratio ${d.offRatio.toFixed(2)}) · span ${d.span.toFixed(1)} m`)
    console.log(`      interior to span ${(c.interiorFrac * 100).toFixed(0)}% · in ±hw band ${(c.inBandFrac * 100).toFixed(0)}% · fe.side probe nearest segment ${ns.j}, span [${d.uIdx}..${d.vIdx}] ⇒ ${inSpan ? 'INSIDE' : 'OUTSIDE'}`)
  }

  // ── THE PREMISE CHECK — is `fe.side` even a digitisation LABEL at fe level? ──
  console.log(`\n─ PREMISE CHECK — is ④'s baseline a stored label, or a computed geometry?`)
  console.log(`   buildBlockGeometryV2.js:1265-1273 computes fe.side AT FE-BUILD TIME:`)
  console.log(`     projL = cdx*(mz-az) - cdz*(mx-ax) ;  side = projL > 0 ? 'right' : 'left'`)
  console.log(`   ④'s instrument computes  cross = dx*(pz-az) - dz*(px-ax)  — THE SAME EXPRESSION.`)
  console.log(`   And ④ read its convention off the data as right→+1, which is exactly projL>0→'right'.`)
  console.log(`   ⇒ fe.side is NOT a label carried from digitisation; it is the same cross product ④ used,`)
  console.log(`     taken against the SAME chain. Two chains of one road with opposing point order therefore`)
  console.log(`     CANNOT make these two quantities disagree — 4124c486's mechanism operates on the`)
  console.log(`     \`roadId|side\` GROUPING in derive.js, one consumer down, not on this comparison.`)
  console.log(`   The two DO differ in what geometry each picks:`)
  console.log(`     fe.side  → findAdjacentChainForBlockEdge's NEAREST chain segment, anywhere on the chain`)
  console.log(`     ④       → the span [min segOrd .. max segOrd] from assignSegOrdsToFes`)
  console.log(`   ⇒ That difference — fe↔span attribution — is the locus the breaks localise to, not the label.`)

  return { scene, A: A.length, B: B.length, C: C.length, rest: rest.length, aWithFlip, aInSpan, aHard,
    bNoFront: bNoFront.length, bNonContig: bNonContig.length, flips: phys.flips, breaks: sideBreaks.length }
}

const scenes = ARGV.filter(a => !a.startsWith('--')).length ? ARGV.filter(a => !a.startsWith('--')) : ['lafayette-square', 'hipointe-demun']
const res = scenes.map(audit)
console.log(`\n${'='.repeat(78)}\nSUMMARY (reproduce, never quote)\n${'='.repeat(78)}`)
for (const r of res) console.log(`${r.scene}: ${r.breaks} breaks = A ${r.A} · B ${r.B} · C ${r.C} · unpartitioned ${r.rest} | A on a label-flip chain: ${r.aWithFlip}/${r.A}, in-span ${r.aInSpan}/${r.A}, HARD (baseline well-defined) ${r.aHard}/${r.A} | B not fronting span: ${r.bNoFront}/${r.B} (non-contiguous ${r.bNonContig}) | road label-flips on town: ${r.flips}`)
