/**
 * claims-node-pair-key-parity — SLICE 1 of "fix the key". PROVE, DON'T SWITCH.
 *
 * Jacob's gate: PARITY BEFORE SWITCHING feCustomKey. A drifted key does not
 * error — it SILENTLY ORPHANS every authored custom, and authoring is the
 * product. So this probe measures whether the EXTENT-DESIGN §4.1 node-pair key
 * can replace [skelId, side, min(segOrds)] — and reports, per fe, every case
 * where it cannot. It writes nothing. It touches no src/.
 *
 * ⛔ NO FALLBACK. Every failure is its own NAMED, LOUD class. A degenerate fe is
 * a reported class, never a silent skip.
 *
 * THE KEY FORMULA IS READ, NEVER RESTATED:
 *   · feCustomKey / CAP_SEGORD / isCapSegOrd are IMPORTED from src/lib/feCustomKey.js
 *   · naturalSegments is NOT exported by buildBlockGeometryV2.js, so it is
 *     EXTRACTED FROM THAT FILE'S SOURCE TEXT at runtime (below). If the function
 *     is renamed or its body changes, this probe follows it or dies loudly — it
 *     cannot silently measure a stale copy.
 *
 * THE DERIVATION UNDER TEST (§4.1: "a run keys on an ordered node pair"):
 *   fe → chain = streets[fe.chainIdx]
 *      → segs  = naturalSegments(chain, resolveChainSegmentation)
 *      → span  = segs[min(segOrds)].start .. segs[max(segOrds)].end   (point indices)
 *      → U = chain.points[span.start], V = chain.points[span.end]     (positions)
 *      → ORDER from GEOMETRY ALONE: which side of the directed span U→V the fe's
 *        own polyline lies on. `side` is then READ BACK from the order — which is
 *        §4.1's load-bearing ⭐⭐ claim, and measurement ④ is the test of it.
 *
 * usage: node scratch/claims-node-pair-key-parity.mjs [scene ...]
 *        default scenes: lafayette-square hipointe-demun
 *        (ksi-y-m-yn / centrum / altadena are CHILLERED — do not size on them.)
 */
import { readFileSync } from 'fs'
import { buildBlockGeometryV2, resolveChainSegmentation } from '../src/lib/buildBlockGeometryV2.js'
import { feCustomKey, CAP_SEGORD, isCapSegOrd } from '../src/lib/feCustomKey.js'

const ROOT = '/Users/jacobhenderson/Desktop/lafayette-square.nosync'
const rd = p => readFileSync(`${ROOT}/${p}`, 'utf8')

// ── READ naturalSegments OUT OF THE SOURCE (never restate it) ──────────────
const V2_SRC = rd('src/lib/buildBlockGeometryV2.js')
function extractFn(src, name) {
  const start = src.indexOf(`function ${name}(`)
  if (start < 0) throw new Error(`LOUD FAIL: function ${name}() not found in buildBlockGeometryV2.js — the probe's source-read is stale. Fix the probe, do not guess the formula.`)
  let i = src.indexOf('{', start), depth = 0
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break } }
  }
  return src.slice(start, i)
}
export const naturalSegments = new Function(`${extractFn(V2_SRC, 'naturalSegments')}; return naturalSegments`)()

// ── scene load — AUTHORING ON (design.json blockCustoms), per Layer 0 Q3 ───
export function loadScene(scene) {
  const ribPath = scene === 'lafayette-square'
    ? 'src/data/ribbons.json' : `cartograph/data/${scene}/clean/ribbons.json`
  const ribbons = JSON.parse(rd(ribPath))
  const nb = JSON.parse(rd(`cartograph/data/${scene}/neighborhood_boundary.json`))
  let design = {}
  try { design = JSON.parse(rd(`public/looks/${scene}/design.json`)) } catch {}
  if (!design.blockCustoms) console.log(`  ⚠️  ${scene}: design.json has NO blockCustoms — this run is measuring an UNAUTHORED scene.`)
  const targetR = (nb?.streetFade?.outer ?? nb.radius) + 50
  const sc0 = targetR / nb.radius
  const [cx, cz] = nb.center
  const stencil = nb.boundary.map(([x, z]) => [cx + (x - cx) * sc0, cz + (z - cz) * sc0])
  const v2 = buildBlockGeometryV2(ribbons, {
    stencil,
    blockCustoms: design.blockCustoms || null,
    cornerRadiusScale: design.cornerRadiusScale,
    cornerRadiusOverrides: design.cornerRadiusOverrides,
    cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides,
    curbWidth: design.curbWidth ?? 0.15,
    blockLandUse: design.blockLandUse,
    useRingBandEmitter: true,
  })
  return { ribbons, design, v2, stencil, nb }
}

// ── geometry helpers ───────────────────────────────────────────────────────
export const nodeKey = p => `${p[0].toFixed(3)},${p[1].toFixed(3)}`
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
export function quantiles(arr) {
  if (!arr.length) return { min: NaN, p05: NaN, median: NaN }
  const s = [...arr].sort((a, b) => a - b)
  const at = q => s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))]
  return { min: s[0], p05: at(0.05), median: at(0.5) }
}
// Signed side of point p relative to the directed polyline pts[i0..i1].
// Projects p onto the CLOSEST span segment, then takes the cross-product sign.
// Returns +1 / -1, or 0 if degenerate (a LOUD class, never silently bucketed).
function sideOfDirectedSpan(pts, i0, i1, p) {
  let best = Infinity, cross = 0
  for (let j = i0; j < i1; j++) {
    const a = pts[j], b = pts[j + 1]
    const dx = b[0] - a[0], dz = b[1] - a[1]
    const L2 = dx * dx + dz * dz
    if (L2 < 1e-9) continue
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2
    if (t < 0) t = 0; else if (t > 1) t = 1
    const qx = a[0] + t * dx, qz = a[1] + t * dz
    const d2 = (p[0] - qx) ** 2 + (p[1] - qz) ** 2
    if (d2 < best) { best = d2; cross = dx * (p[1] - a[1]) - dz * (p[0] - a[0]) }
  }
  if (!Number.isFinite(best) || Math.abs(cross) < 1e-9) return 0
  return cross > 0 ? 1 : -1
}
// Perpendicular distance from p to the directed span, plus whether the closest
// projection CLAMPED to a span end (i.e. p lies off the end of the span entirely).
function projectOntoSpan(pts, i0, i1, p) {
  let perp = Infinity, clamped = true
  for (let j = i0; j < i1; j++) {
    const a = pts[j], b = pts[j + 1]
    const dx = b[0] - a[0], dz = b[1] - a[1]
    const L2 = dx * dx + dz * dz
    if (L2 < 1e-9) continue
    const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2
    const tc = t < 0 ? 0 : t > 1 ? 1 : t
    const d = Math.hypot(p[0] - (a[0] + tc * dx), p[1] - (a[1] + tc * dz))
    if (d < perp) { perp = d; clamped = (t < 0 || t > 1) }
  }
  return { perp, clamped }
}

// The fe's representative point: the midpoint of its own polyline, by arc length.
function feMidpoint(pts) {
  if (!pts || pts.length < 2) return null
  let total = 0
  for (let i = 0; i < pts.length - 1; i++) total += dist(pts[i], pts[i + 1])
  if (total <= 0) return pts[0]
  let acc = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const d = dist(pts[i], pts[i + 1])
    if (acc + d >= total / 2) {
      const t = (total / 2 - acc) / (d || 1)
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t]
    }
    acc += d
  }
  return pts[pts.length - 1]
}

// ── the measurement ────────────────────────────────────────────────────────
// THE ONE DERIVATION. Exported so a sibling probe consumes it rather than
// restating it — a second copy of the span/pair derivation is how they drift.
export function deriveNodePairs(scene) {
  const { ribbons, design, v2, stencil } = loadScene(scene)
  const streets = ribbons.streets || []
  const ixByChain = resolveChainSegmentation(streets)
  const fes = v2.frontageEdges || []
  const keyable = [], unkeyable = []
  for (const fe of fes) (feCustomKey(fe) ? keyable : unkeyable).push(fe)

  // ─ ① TOTALITY ─
  const derived = []          // { fe, key, U, V, uIdx, vIdx, chain, sign }
  const failTotality = []     // NAMED failures
  const nonContiguous = []
  for (const fe of keyable) {
    const key = feCustomKey(fe)
    const name = `${key[0]}/${key[1]}/${key[2]}`
    const chain = streets[fe.chainIdx]
    if (!chain?.points || chain.points.length < 2) { failTotality.push({ name, why: 'chain missing or <2 points' }); continue }
    const segs = naturalSegments(chain, ixByChain.get(chain))
    const so = [...fe.segOrds].sort((a, b) => a - b)
    if (so[so.length - 1] - so[0] !== so.length - 1) nonContiguous.push({ name, segOrds: so })
    const a = segs[so[0]], b = segs[so[so.length - 1]]
    if (!a || !b) { failTotality.push({ name, why: `segOrd out of range (chain has ${segs.length} natural segments, fe owns [${so}])` }); continue }
    const uIdx = a.start, vIdx = b.end
    if (uIdx === vIdx) { failTotality.push({ name, why: 'DEGENERATE: span start index == end index — zero-length node pair' }); continue }
    const U = chain.points[uIdx], V = chain.points[vIdx]
    if (!U || !V) { failTotality.push({ name, why: 'span index outside chain.points' }); continue }
    if (dist(U, V) < 1e-6) { failTotality.push({ name, why: `DEGENERATE: U and V are the SAME POSITION (${nodeKey(U)}) — a closed loop chain; an unordered pair cannot name it` }); continue }
    const mid = feMidpoint(fe.points)
    const sign = mid ? sideOfDirectedSpan(chain.points, uIdx, vIdx, mid) : 0
    // ── the CONFIDENCE of that sign, measured, not assumed ──
    // A frontage edge is the chain offset by pavementHW. So a TRUSTWORTHY sign has the
    // fe's midpoint sitting ~one half-width off its own span. When the midpoint sits ON
    // the span (ratio → 0) the sign is decided by sub-metre noise and the pair's ORDER
    // cannot carry `side`. Reported as a ratio so the reader can see the tail, not a verdict.
    const prj = projectOntoSpan(chain.points, uIdx, vIdx, mid)
    const hw = Math.max(chain.measure?.left?.pavementHW || 0, chain.measure?.right?.pavementHW || 0, 0)
    const offRatio = hw > 0 ? prj.perp / hw : NaN
    // SECOND, INDEPENDENT INSTRUMENT: does the fe's own polyline run WITH or AGAINST the
    // directed span? (p0→pN vs U→V). Agrees with the midpoint test or it does not; a break
    // confirmed by BOTH is geometry, a break seen by only one is instrument noise.
    const feDir = [fe.points[fe.points.length - 1][0] - fe.points[0][0], fe.points[fe.points.length - 1][1] - fe.points[0][1]]
    const spanDir = [V[0] - U[0], V[1] - U[1]]
    const dot = feDir[0] * spanDir[0] + feDir[1] * spanDir[1]
    derived.push({ fe, key, name, U, V, uIdx, vIdx, chain, sign, span: dist(U, V),
      offRatio, perp: prj.perp, clamped: prj.clamped, hw, withSpan: dot >= 0 ? 1 : -1 })
  }
  return { ribbons, design, v2, stencil, streets, fes, keyable, unkeyable, derived, failTotality, nonContiguous }
}

// ④'s classification, exported so the sibling probe shares ONE definition of
// "a break" rather than restating the convention.
export function classifySides(derived) {
  const table = new Map()   // `${side}|${sign}` → count
  const degenSign = []
  for (const d of derived) {
    if (d.sign === 0) { degenSign.push(d); continue }
    const k = `${d.fe.side}|${d.sign}`
    table.set(k, (table.get(k) || 0) + 1)
  }
  // Majority convention per side, then NAME every fe that breaks it.
  const majSign = {}
  for (const side of new Set(derived.map(d => d.fe.side))) {
    const plus = table.get(`${side}|1`) || 0, minus = table.get(`${side}|-1`) || 0
    majSign[side] = plus >= minus ? 1 : -1
  }
  const sidesUsed = Object.keys(majSign)
  const conventionClean = sidesUsed.length === 2 && majSign[sidesUsed[0]] !== majSign[sidesUsed[1]]
  const sideBreaks = derived.filter(d => d.sign !== 0 && d.sign !== majSign[d.fe.side])
  return { table, degenSign, majSign, sidesUsed, conventionClean, sideBreaks }
}

function measure(scene) {
  console.log(`\n${'='.repeat(78)}\n${scene}\n${'='.repeat(78)}`)
  const { ribbons, design, stencil, streets, fes, keyable, unkeyable, derived, failTotality, nonContiguous } = deriveNodePairs(scene)
  console.log(`fes ${fes.length} · keyable ${keyable.length} · NOT keyable today ${unkeyable.length} (no chain id / no side / no owned segment — out of scope: cannot carry a custom under EITHER key)`)

  console.log(`\n① TOTALITY — every keyable fe yields an ordered node pair`)
  console.log(`   ${derived.length}/${keyable.length} yield a pair · ${failTotality.length} FAIL`)
  for (const f of failTotality) console.log(`   ❌ ${f.name} — ${f.why}`)
  if (nonContiguous.length) {
    console.log(`   ⚠️  ${nonContiguous.length} fe(s) own NON-CONTIGUOUS segOrds — a span from min..max SPANS SEGMENTS THE FE DOES NOT OWN:`)
    for (const f of nonContiguous) console.log(`      ${f.name} — segOrds [${f.segOrds}]`)
  }

  // ─ ④ SIDE FROM ORDER (measured before ②/③, which consume the order) ─
  // Contingency: fe.side × geometric sign. The CONVENTION is not assumed — it is
  // read off the table. ④ passes only if the table is a clean 2x2 bijection.
  const { table, degenSign, majSign, sidesUsed, conventionClean, sideBreaks } = classifySides(derived)
  console.log(`\n④ SIDE FROM ORDER — §4.1's load-bearing ⭐⭐ claim: the pair's ORDER supplies \`side\``)
  console.log(`   contingency (fe.side × geometric side of the directed span U→V):`)
  for (const [k, n] of [...table].sort()) console.log(`      side=${k.split('|')[0]} × sign=${k.split('|')[1] === '1' ? '+1' : '-1'} : ${n}`)
  if (!conventionClean) {
    console.log(`   ❌ NO CLEAN CONVENTION — both sides map to the same geometric sign. Order CANNOT supply \`side\`.`)
  } else {
    console.log(`   convention read off the data: ${sidesUsed.map(s => `${s}→${majSign[s] > 0 ? '+1' : '-1'}`).join(' · ')}`)
  }
  if (sideBreaks.length === 0 && degenSign.length === 0 && conventionClean) {
    console.log(`   ✅ PASS — order reproduces \`side\` for all ${derived.length} fes.`)
  } else {
    console.log(`   ❌ FAIL — ${sideBreaks.length} fe(s) break the convention, ${degenSign.length} degenerate (no resolvable geometric side):`)
    for (const d of sideBreaks) console.log(`      ❌ ${d.name} — fe.side=${d.fe.side} but geometry says ${d.sign > 0 ? '+1' : '-1'} · span ${d.span.toFixed(2)} m · mid sits ${d.perp.toFixed(2)} m off its span vs pavementHW ${d.hw.toFixed(2)} (offset ratio ${Number.isFinite(d.offRatio) ? d.offRatio.toFixed(2) : 'n/a'})${d.clamped ? ' · projection CLAMPED: the midpoint lies OFF THE END of its own span' : ''}`)
    for (const d of degenSign) console.log(`      ❌ ${d.name} — DEGENERATE: fe midpoint has no resolvable side vs its chain span`)
  }

  // ── ④ diagnostics: is the sign TRUSTWORTHY, and does a second instrument agree? ──
  const ratios = derived.map(d => d.offRatio).filter(Number.isFinite)
  const rq = quantiles(ratios)
  const nearZero = derived.filter(d => Number.isFinite(d.offRatio) && d.offRatio < 0.5)
  console.log(`   ▸ sign CONFIDENCE — an fe is its chain offset by pavementHW, so a trustworthy sign has`)
  console.log(`     the fe midpoint ~1 half-width off its own span. offset ratio (perp / pavementHW):`)
  console.log(`     min ${rq.min.toFixed(2)} · p05 ${rq.p05.toFixed(2)} · median ${rq.median.toFixed(2)} · below 0.50: ${nearZero.length} fe(s)`)
  const breakSet = new Set(sideBreaks.map(d => d.name))
  const inTail = sideBreaks.filter(d => Number.isFinite(d.offRatio) && d.offRatio < 0.5).length
  console.log(`     of the ${sideBreaks.length} break(s), ${inTail} sit in that below-0.50 tail · ${sideBreaks.filter(d => d.clamped).length} project OFF THE END of their span`)
  // second instrument: fe polyline direction vs span direction
  const dirTable = new Map()
  for (const d of derived) { const k = `${d.fe.side}|${d.withSpan}`; dirTable.set(k, (dirTable.get(k) || 0) + 1) }
  const dirMaj = {}
  for (const side of sidesUsed) dirMaj[side] = (dirTable.get(`${side}|1`) || 0) >= (dirTable.get(`${side}|-1`) || 0) ? 1 : -1
  const dirBreaks = derived.filter(d => d.withSpan !== dirMaj[d.fe.side])
  const bothAgree = dirBreaks.filter(d => breakSet.has(d.name)).length
  console.log(`   ▸ SECOND INSTRUMENT (fe polyline direction vs span direction U→V), independent of the midpoint:`)
  console.log(`     ${dirBreaks.length} break(s) · ${bothAgree} of them are ALSO midpoint breaks (corroborated by both instruments)`)
  console.log(`     ⛔ a break seen by ONE instrument only is instrument noise; a break seen by BOTH is geometry.`)

  // ORDERED pair, ordered BY GEOMETRY (not by fe.side) — the honest key.
  const ordered = d => (d.sign === majSign[d.fe.side] || d.sign === 0)
    ? (majSign[d.fe.side] > 0 ? [nodeKey(d.U), nodeKey(d.V)] : [nodeKey(d.V), nodeKey(d.U)])
    : (majSign[d.fe.side] > 0 ? [nodeKey(d.V), nodeKey(d.U)] : [nodeKey(d.U), nodeKey(d.V)])

  // ─ ② UNIQUENESS ─
  const byPair = new Map()
  for (const d of derived) {
    const p = ordered(d).join(' → ')
    d.pair = p
    if (!byPair.has(p)) byPair.set(p, [])
    byPair.get(p).push(d)
  }
  const collisions = [...byPair].filter(([, v]) => v.length > 1)
  console.log(`\n② UNIQUENESS — no two fes collide on the ordered pair`)
  console.log(`   ${byPair.size} distinct ordered pairs for ${derived.length} fes · ${collisions.length} COLLIDING pair(s) covering ${collisions.reduce((s, [, v]) => s + v.length, 0)} fes`)
  for (const [p, v] of collisions) {
    console.log(`   ❌ pair ${p} claimed by ${v.length} fes:`)
    for (const d of v) console.log(`        ${d.name}  (chain "${d.chain.name}" ${d.chain.skelId}, span ${d.span.toFixed(2)} m)`)
  }

  // ─ ③ BIJECTION pair ↔ [skelId, side, min(segOrd)] ─
  console.log(`\n③ BIJECTION — pair ↔ [skelId, side, min(segOrds)], both directions named separately`)
  // → direction A: two fes with DIFFERENT old keys sharing one pair (= ② collisions,
  //   but reported here as loss of the OLD key's distinctions under the NEW key)
  const lossOldToNew = collisions.filter(([, v]) => new Set(v.map(d => d.name)).size > 1)
  // → direction B: one pair reachable from >1 old key is A; the reverse failure is an
  //   old key that yields NO pair (① failures) — restated here as the other direction.
  console.log(`   A · OLD→NEW (a distinction the old key makes that the pair LOSES): ${lossOldToNew.length} case(s)`)
  for (const [p, v] of lossOldToNew) console.log(`      ❌ ${v.map(d => d.name).join('  ==  ')}  collapse onto  ${p}`)
  console.log(`   B · NEW→OLD (an old key that yields NO pair, so its custom is unreachable): ${failTotality.length} case(s)`)
  for (const f of failTotality) console.log(`      ❌ ${f.name} — ${f.why}`)
  if (!lossOldToNew.length && !failTotality.length) console.log(`   ✅ 1:1 in both directions across ${derived.length} fes.`)

  // ─ ⑤ CONSULT TOLERANCE — on the population THIS derivation consults ─
  const consulted = new Map()   // nodeKey → position
  for (const d of derived) { consulted.set(nodeKey(d.U), d.U); consulted.set(nodeKey(d.V), d.V) }
  const pos = [...consulted.values()]
  const nn = pos.map((p, i) => {
    let best = Infinity
    for (let j = 0; j < pos.length; j++) if (j !== i) { const dd = dist(p, pos[j]); if (dd < best) best = dd }
    return best
  }).filter(Number.isFinite)
  const q = quantiles(nn)
  console.log(`\n⑤ CONSULT TOLERANCE — nearest-neighbour among the ${consulted.size} nodes THIS derivation consults`)
  console.log(`   min ${q.min.toFixed(2)} m · p05 ${q.p05.toFixed(2)} m · median ${q.median.toFixed(2)} m`)
  console.log(`   ⇒ a positional consult is unambiguous only BELOW ${q.min.toFixed(2)} m on this town.`)
  const under1 = nn.filter(d => d < 1).length, under253 = nn.filter(d => d < 2.53).length
  console.log(`   pairs closer than 1.00 m: ${under1} · closer than 2.53 m: ${under253}`)
  // Does the FROZEN frame know these nodes? (junctionMap.nodes is the upstream the brief trusts.)
  const jmNodes = ribbons.junctionMap?.nodes || []
  const jmSet = new Set(jmNodes.map(n => nodeKey(n.at)))
  const missing = [...consulted.keys()].filter(k => !jmSet.has(k))
  console.log(`   junctionMap.nodes = ${jmNodes.length}. Of the ${consulted.size} consulted nodes, ${consulted.size - missing.length} are present at EXACT coords; ${missing.length} are ABSENT.`)
  if (missing.length) {
    // classify: is the absent node a chain TERMINAL (0 / n-1) or an interior IX?
    let term = 0, interior = 0
    for (const d of derived) {
      for (const [k, idx, ch] of [[nodeKey(d.U), d.uIdx, d.chain], [nodeKey(d.V), d.vIdx, d.chain]]) {
        if (!jmSet.has(k)) { if (idx === 0 || idx === ch.points.length - 1) term++; else interior++ }
      }
    }
    console.log(`   ❌ the frozen junctionMap is NOT a superset of the consulted population — ${missing.length} nodes absent (${term} chain-terminal endpoint refs, ${interior} interior-IX refs, counted per fe-endpoint use).`)
  }

  // ─ ⑥ CAPS — the CAP_SEGORD slots, per tip ─
  console.log(`\n⑥ CAPS — CAP_SEGORD slots (start ${CAP_SEGORD.start} / end ${CAP_SEGORD.end}), keyed on a single deg-1 node`)
  const bc = design.blockCustoms || {}
  const capSlots = []
  for (const skel of Object.keys(bc)) for (const side of Object.keys(bc[skel] || {})) for (const so of Object.keys(bc[skel][side] || {})) {
    const n = Number(so)
    if (isCapSegOrd(n)) capSlots.push({ skel, side, segOrd: n, capEnd: n === CAP_SEGORD.start ? 'start' : 'end' })
  }
  console.log(`   ${capSlots.length} AUTHORED cap slot(s) in design.json`)
  if (!capSlots.length) console.log(`   (none authored — nothing to key, and nothing to lose)`)
  const bySkel = new Map(streets.map(s => [s.skelId, s]))
  // clip-artifact test: is the tip ON the stencil (i.e. manufactured by the clip)
  // or interior to it? distance from tip to the stencil polyline.
  const distToStencil = p => {
    let best = Infinity
    for (let i = 0; i < stencil.length; i++) {
      const a = stencil[i], b = stencil[(i + 1) % stencil.length]
      const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz
      if (L2 < 1e-9) continue
      let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2
      if (t < 0) t = 0; else if (t > 1) t = 1
      best = Math.min(best, Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz)))
    }
    return best
  }
  for (const c of capSlots) {
    const st = bySkel.get(c.skel)
    if (!st) { console.log(`   ❌ ${c.skel}/${c.side}/${c.segOrd} — NO SUCH CHAIN in ribbons.streets. The slot is ALREADY orphaned under TODAY's key.`); continue }
    const tip = c.capEnd === 'start' ? st.points[0] : st.points[st.points.length - 1]
    const dS = distToStencil(tip)
    // deg at the tip: how many chains share this coord?
    let deg = 0
    for (const s of streets) for (const p of (s.points || [])) if (dist(p, tip) < 0.5) { deg++; break }
    const verdict = dS < 1.0 ? '❌ ON THE STENCIL — this tip is a CLIP ARTIFACT, not a real dead end'
      : deg > 1 ? `❌ NOT deg-1 — ${deg} chains touch this tip within 0.5 m; a cap key on it is ambiguous`
      : `✅ interior real dead end (${dS.toFixed(1)} m inside the stencil, deg-1)`
    console.log(`   ${c.skel}/${c.side}/${c.segOrd} (${c.capEnd}) tip ${nodeKey(tip)} — ${verdict}`)
  }

  // ─ SLOT-LEVEL CONSEQUENCE (reported SEPARATELY — the A1 fan, store:26) ─
  console.log(`\n▸ SLOT-LEVEL CONSEQUENCE — reported separately, NOT mixed into ①–④`)
  let slots = 0, capSlotCount = 0
  for (const skel of Object.keys(bc)) for (const side of Object.keys(bc[skel] || {})) for (const so of Object.keys(bc[skel][side] || {})) {
    if (isCapSegOrd(Number(so))) capSlotCount++; else slots++
  }
  const feLevel = new Set()
  for (const d of derived) if (bc?.[d.key[0]]?.[d.key[1]]?.[d.key[2]]) feLevel.add(d.name)
  console.log(`   stored non-cap slots ${slots} (+ ${capSlotCount} cap) · fes whose REPRESENTATIVE min-segOrd slot is authored: ${feLevel.size}`)
  console.log(`   The store FANS one authored measure across ALL of an fe's segOrds (useCartographStore.js:26, the A1 fix).`)
  console.log(`   A node-pair key COLLAPSES that fan to one slot per fe: ${slots} stored slots → ${feLevel.size} fe-level keys.`)
  console.log(`   ⛔ That collapse is EXPECTED and is NOT data loss — the fan is a workaround for the fes-less bake reading per-run.`)
  console.log(`   ⚠️ But it means the BAKE (tileGround.js:1658 reads blockCustoms[run.skelId][run.side][run.segOrd] PER RUN)`)
  console.log(`      cannot read a pair-keyed store without a run→pair resolver. That is a DOWNSTREAM BLOCKER, not a key defect.`)

  return { scene, fes: fes.length, keyable: keyable.length, derived: derived.length,
    failTotality: failTotality.length, collisions: collisions.length, sideBreaks: sideBreaks.length + degenSign.length,
    conventionClean, minNN: q.min, jmMissing: missing.length, capSlots: capSlots.length }
}

const isMain = process.argv[1] && process.argv[1].endsWith('claims-node-pair-key-parity.mjs')
const scenes = process.argv.slice(2).length ? process.argv.slice(2) : ['lafayette-square', 'hipointe-demun']
const results = isMain ? scenes.map(measure) : []
console.log(`\n${'='.repeat(78)}\nSUMMARY (reproduce, never quote)\n${'='.repeat(78)}`)
for (const r of results) {
  console.log(`${r.scene}: ① ${r.derived}/${r.keyable} pairs, ${r.failTotality} fail · ② ${r.collisions} collisions · ③ see above · ④ ${r.conventionClean ? 'convention clean' : 'NO CLEAN CONVENTION'}, ${r.sideBreaks} breaks · ⑤ min NN ${r.minNN.toFixed(2)} m · ⑥ ${r.capSlots} cap slots · junctionMap absent for ${r.jmMissing} consulted nodes`)
}
