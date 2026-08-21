/**
 * claims-preclip-walk — DOES THE PUNCH-OUT EVER SEE A CLIPPED VERTEX?
 *
 * BRIEF (2026-08-21). ⛔ A READ + ONE MEASUREMENT. No cure, no pour, no promote.
 *
 * derive.js states "BUILD FULL, CROP LAST". If the walk runs on the FULL pre-clip
 * graph and the stencil crops the result, the clip's manufactured endpoints are
 * never walked and the nodeless-tip class is irrelevant to face closure. If it runs
 * on post-clip `ribbons.streets`, the sequencing fork is real.
 *
 * ⭐ THE PRIMARY MEASUREMENT NEEDS NO RECONSTRUCTION. Partition the walk's OWN
 * no-node failures by whether the vertex is clip-manufactured. If every one of them
 * is, then a pre-clip walk has zero no-node failures BY CONSTRUCTION — those
 * vertices do not exist in the pre-clip graph. No synthesised geometry, no fidelity
 * argument. A reconstructed pre-clip walk runs SECOND, as corroboration only, and
 * says out loud what it had to invent.
 *
 * ⛔ POPULATIONS ARE LABELLED EVERYWHERE: pre-clip · post-clip · rim · interior.
 * ⛔ RIM closure is NOT a health signal — RIBBONS §1 (Tessel, 2026-08-12) measured
 * that a bare walk closes only LS 14/31 rim tiles on real streets alone, and THE
 * STENCIL CLOSES THOSE. INTERIOR closure is the control and must not regress.
 *
 * usage: node scratch/claims-preclip-walk.mjs [--scene=<name>] [--ribbons=<path>]
 */
import fs from 'fs'
import { loadScene, banner, ARG, CHILLERED, H } from './_substrate-feed.mjs'

const o = console.log; console.log = () => {}
const { walkSubstrate } = await import('../src/lib/substrateWalk.js')
console.log = o

const SCENE = ARG('scene', 'lafayette-square')
if (CHILLERED.includes(SCENE)) { o(`  ${SCENE}: CHILLERED (2026-08-13). ⛔ No number is printed for it.`); process.exit(0) }

const S = await loadScene(SCENE, ARG('ribbons', null))
banner(S, o)

const { ribbons, streets, nb, byId, widthAtSegOrd, outerRing } = S
const vKey = p => `${p[0].toFixed(3)},${p[1].toFixed(3)}`
const [cx, cz] = nb.center
const keepR = Math.max(nb.streetFade?.outer ?? 0, nb.radius ?? 0) + 30   // pipeline.js:172
const rad = p => Math.hypot(p[0] - cx, p[1] - cz)
const RIM_EPS = 0.5

// ⛔⛔ THE MINT-VINTAGE GUARD, AND IT FIRED ON THE FIRST RUN OF THIS PROBE.
// _substrate-feed's default for a non-LS scene is clean/ribbons.json, which on
// hipointe-demun is the PRE-MINT bundle — 2015 nodes, via:'cap' 0. Walking it
// reports 62 no-node failures that are the ABSENT MINT, not the clip, and the
// partition below would have read as "the clip is not the whole class." 9f53ef39
// mints a cap coupler at EVERY degree-1 tip, so via:'cap' 0 on a town that has
// tips is the mint's own fingerprint saying PRE-MINT. Refuse to interpret it.
{
  const nodes = ribbons.junctionMap?.nodes || []
  const caps = nodes.reduce((s, n) => s + (n.cornersAdjacent || []).filter(c => c.via === 'cap').length, 0)
  const tipish = nodes.filter(n => (n.kinds || []).includes('pendant-tip')).length
  if (caps === 0 && tipish === 0 && nodes.length) {
    o(`\n⛔⛔ PRE-MINT ARTIFACT — ${S.ribbonsPath}`)
    o(`   junctionMap has ${nodes.length} nodes, 0 pendant-tip kinds and 0 via:'cap' couplers. 9f53ef39 mints`)
    o(`   a cap coupler at EVERY degree-1 tip, so this bundle PREDATES the mint. Every no-node failure`)
    o(`   here is the absent mint, not the clip, and the partition below would be measuring the wrong thing.`)
    o(`   ⇒ re-run against the POUR:  --ribbons=cartograph/data/${SCENE}/clean/map.json`)
    o(`   ⛔ REFUSING TO INTERPRET. Exiting 2 rather than printing a number that reads like an answer.`)
    process.exit(2)
  }
}

o(`\n═══ ① WHICH GEOMETRY DOES THE WALK RECEIVE? — traced in source, not assumed ═══`)
o(`  tileGround.js:3059  electSubstrateTiles({ ..., streets: streetsOrig, ... })`)
o(`  tileGround.js:2781  const streetsOrig = streets`)
o(`  tileGround.js:2770  let streets = (ribbons?.streets || []).filter(points>=2 && !gradeSeparated)`)
o(`  tileGround.js:1107  walkSubstrate({ streets, junctionMap: ribbons.junctionMap, ... })`)
o(`  ⇒ the walk receives ribbons.streets VERBATIM. This probe reads ${S.ribbonsPath},`)
o(`    which is ${S.isPour ? 'the POUR' : 'the PROMOTED bundle'} — both are written by pipeline.js AFTER its clip.`)
{
  const beyond = streets.filter(s => s.points.some(p => rad(p) > keepR + 1e-6)).length
  o(`  MEASURED on that artifact: ${beyond} of ${streets.length} chains carry a vertex beyond keepR ${keepR} m.`)
  o(`  ⇒ POST-CLIP${beyond === 0 ? ', confirmed' : ' — ⛔ UNEXPECTED, a chain runs past keepR; re-read'}.`)
  o(`  ⛔ And pre-clip geometry is NOT REACHABLE at walk time: the only geometry in scope is`)
  o(`     \`ribbons\`. clean/skeleton.json is a cartograph-side file, absent from the bundle —`)
  o(`     a pre-clip walk would require carrying that geometry THROUGH the freeze, deliberately.`)
}

o(`\n═══ ② IS "BUILD FULL, CROP LAST" IMPLEMENTED, OR ONLY STATED? ═══`)
{
  const D = fs.readFileSync('cartograph/derive.js', 'utf8')
  const lineOf = (needle) => { const i = D.indexOf(needle); return i < 0 ? null : D.slice(0, i).split('\n').length }
  const doctrine = lineOf('build full,\n    // crop LAST')
  const faceClip = lineOf('const clipped = []')
  const ringInject = lineOf('faceStreets = [...clipped,')
  const capFreeze = lineOf('const capEndpointKeys = chainEndpointKeys(ribbonsLayer.streets)')
  o(`  the doctrine is stated at derive.js:${doctrine ?? '⛔ NOT FOUND — re-read'} ("build full, crop LAST")`)
  o(`  it is IMPLEMENTED for extractFaces only:`)
  o(`     derive.js:${faceClip}  clipStreet over a LOCAL \`faceStreets\` array`)
  o(`     derive.js:${ringInject}  the boundary ring injected as closing edges`)
  o(`     derive.js:${capFreeze}  the cap freeze resolves against ribbonsLayer.streets — "not the boundary-clipped faceStreets"`)
  // Confirm the disjointness memory records: does the face clip write back to ribbonsLayer.streets?
  const seg = D.slice(D.indexOf('const clipped = []'), D.indexOf('const fzTiles = extractFaces(faceStreets)'))
  const writesBack = /ribbonsLayer\.streets\s*=|\.points\s*=/.test(seg)
  o(`  DISJOINTNESS re-confirmed in source: the face clip ${writesBack ? '⛔ WRITES BACK — memory is STALE, re-read' : 'never assigns ribbonsLayer.streets or mutates .points'} ⇒ ${writesBack ? 'NOT disjoint' : 'disjoint outputs, as recorded'}.`)
  const wsSrc = fs.readFileSync('src/lib/substrateWalk.js', 'utf8')
  const outerRingIsArg = /outerRing\s*=\s*null/.test(wsSrc)
  const tgSrc = fs.readFileSync('src/lib/tileGround.js', 'utf8')
  const passesRing = /walkSubstrate\(\{[^}]*outerRing/.test(tgSrc)
  o(`  AND THE WALK: outerRing is an argument defaulting to null (${outerRingIsArg ? 'confirmed' : '⛔ re-read'});`)
  o(`     tileGround's call site passes it: ${passesRing ? 'YES' : 'NO — the walk is handed NO stencil at all'}.`)
  o(`  ⇒ VERDICT: "build full, crop last" is implemented for the FACE WALK and NOT for the`)
  o(`    SUBSTRATE WALK. The walk is handed cropped input and no stencil. ⛔ ASPIRATION for the`)
  o(`    walk — intent filed as done. Not rot (the sentence is true of extractFaces), not a`)
  o(`    regression (the walk never had it). Surfaced as work; ⛔ no canon edited here.`)
}

o(`\n═══ ③ THE MEASUREMENT — POST-CLIP walk, and what a PRE-CLIP walk would see ═══`)
const widthAt = (skelId, side, vertexIdx, arc) => widthAtSegOrd(skelId, side, vertexIdx, arc)
const R = walkSubstrate({ streets, junctionMap: ribbons.junctionMap, widthAt, orientation: 'a-to-b' })

// the clip-manufactured vertex set — the SAME predicate as claims-nodeless-tip-classifier
const curbed = s => !s.gradeSeparated && !s.disabled
const endsAt = new Map(), interiorAt = new Map()
for (const s of (ribbons.streets || [])) {
  if (!curbed(s)) continue
  const p = s.points
  for (const [end, pt] of [['start', p[0]], ['end', p[p.length - 1]]]) {
    const k = vKey(pt); if (!endsAt.has(k)) endsAt.set(k, []); endsAt.get(k).push({ s, end })
  }
  for (let i = 1; i < p.length - 1; i++) {
    const k = vKey(p[i]); if (!interiorAt.has(k)) interiorAt.set(k, []); const a = interiorAt.get(k); if (!a.includes(s)) a.push(s)
  }
}
const jmSet = new Set((ribbons.junctionMap?.nodes || []).map(n => vKey(n.at)))
const manufactured = new Set()
for (const [k, list] of endsAt) {
  if (list.length !== 1 || (interiorAt.get(k) || []).length) continue
  if (jmSet.has(k)) continue
  const t = list[0], pt = t.end === 'start' ? t.s.points[0] : t.s.points[t.s.points.length - 1]
  if (Math.abs(rad(pt) - keepR) < RIM_EPS) manufactured.add(k)
}

const noSucc = R.failures.filter(f => f.kind === 'no-successor')
const noNode = noSucc.filter(f => f.reason === 'no-node')
const noNodeAtClip = noNode.filter(f => manufactured.has(f.node))
const noNodeElsewhere = noNode.filter(f => !manufactured.has(f.node))

o(`  POST-CLIP walk (the live path):`)
o(`     chains ${R.stats.chains} · arcs ${R.stats.arcs} · half-edges ${R.stats.halfEdges}/${R.stats.halfEdgesExpected} (unbuilt ${R.stats.halfEdgesUnbuilt})`)
o(`     faces closed ${R.stats.faces} · openRuns ${R.stats.openRuns} · degenerate ${R.stats.degenerateFaces}`)
o(`     no-successor ${noSucc.length}, of which reason=no-node ${noNode.length}`)
o(`  ⭐⭐ THE PARTITION — is every no-node failure at a CLIP-MANUFACTURED vertex?`)
o(`     at a clip-manufactured vertex (r ≈ keepR ${keepR} m) : ${noNodeAtClip.length}`)
o(`     ⛔ ELSEWHERE                                          : ${noNodeElsewhere.length}`)
for (const f of noNodeElsewhere.slice(0, 12)) o(`        ${f.skelId}/${f.side} @ ${f.node}  r=${(() => { const [x, z] = f.node.split(',').map(Number); return rad([x, z]).toFixed(2) })()}`)
if (noNodeElsewhere.length > 12) o(`        … ${noNodeElsewhere.length - 12} more`)
o(`     ⇒ a PRE-CLIP walk's no-node count, BY CONSTRUCTION (those vertices do not exist there):`)
o(`       ${noNodeElsewhere.length}${noNodeElsewhere.length === 0 ? '   — ZERO, with no reconstruction and no synthesised geometry.' : '   — NONZERO: the clip is not the whole of the no-node class.'}`)

// ── the control: INTERIOR tile coverage, post-clip. Rim reported separately. ──
const tiles = ribbons.tiles || []
const isRim = t => (t.edges || []).some(e => e.skelId === '__boundary__')
const inRing = (p, r) => { let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const xi = r[i][0], zi = r[i][1], xj = r[j][0], zj = r[j][1]; if ((zi > p[1]) !== (zj > p[1]) && p[0] < (xj - xi) * (p[1] - zi) / (zj - zi) + xi) ins = !ins } return ins }
const dSeg = (p, a, b) => { const ex = b[0] - a[0], ez = b[1] - a[1], L2 = ex * ex + ez * ez || 1; let t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ez) / L2)); return Math.hypot(p[0] - (a[0] + ex * t), p[1] - (a[1] + ez * t)) }
const interiorPoint = (r) => {   // mirrors tileGround.js:1112 — interior point, ⛔ never centroid
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity
  for (const p of r) { if (p[0] < x0) x0 = p[0]; if (p[1] < z0) z0 = p[1]; if (p[0] > x1) x1 = p[0]; if (p[1] > z1) z1 = p[1] }
  let best = null, bd = -1
  for (let i = 1; i < 40; i++) for (let j = 1; j < 40; j++) {
    const p = [x0 + (x1 - x0) * i / 40, z0 + (z1 - z0) * j / 40]
    if (!inRing(p, r)) continue
    let d = Infinity
    for (let a = 0, b = r.length - 1; a < r.length; b = a++) { const dd = dSeg(p, r[b], r[a]); if (dd < d) d = dd }
    if (d > bd) { bd = d; best = p }
  }
  return best
}
const goodFaces = R.faces.filter(f => !f.degenerate)
const covers = (pt) => pt && goodFaces.some(f => inRing(pt, f.ring))
let intN = 0, intCov = 0, rimN = 0, rimCov = 0
for (const t of tiles) {
  const pt = interiorPoint(t.ring)
  const c = covers(pt)
  if (isRim(t)) { rimN++; if (c) rimCov++ } else { intN++; if (c) intCov++ }
}
o(`\n  ⭐ THE CONTROL — frozen-tile coverage by a closed, non-degenerate walk face (POST-CLIP):`)
o(`     INTERIOR tiles covered ... ${intCov}/${intN}   ⛔ this is the health signal; it must not regress`)
o(`     RIM tiles covered ........ ${rimCov}/${rimN}   ⛔ NOT a failure — RIBBONS §1 (Tessel): a bare walk`)
o(`        closes only some rim tiles on real streets alone, and THE STENCIL CLOSES THOSE. The rim`)
o(`        BOUNDS, it does not OWN (retracted + re-ruled 2026-08-12) — it supplies no couplers, ever.`)

// ── ④ CORROBORATION ONLY — a RECONSTRUCTED pre-clip walk. Says what it invents. ──
o(`\n═══ ④ CORROBORATION — a RECONSTRUCTED pre-clip walk (⛔ synthesised; ③ is the finding) ═══`)
try {
  const sk = JSON.parse(fs.readFileSync(`cartograph/data/${SCENE}/clean/skeleton.json`, 'utf8'))
  const skById = new Map((sk.streets || []).map(s => [s.id, s.points.map(p => [p.x, p.z])]))
  const legNode = new Map()
  for (const n of (ribbons.junctionMap?.nodes || [])) for (const l of (n.legs || [])) {
    if (rad(n.at) > keepR) legNode.set(`${l.chain}|${l.end}`, n.at)
  }
  let restored = 0, unrestorable = 0
  const preStreets = streets.map(s => {
    const skPts = skById.get(s.skelId)
    if (!skPts) return s
    let pts = s.points.map(p => [p[0], p[1]])
    const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
    const fwd = d(skPts[0], pts[0]) <= d(skPts[skPts.length - 1], pts[0])
    const ord = fwd ? skPts : [...skPts].reverse()
    let touched = false
    for (const end of ['start', 'end']) {
      const cur = end === 'start' ? pts[0] : pts[pts.length - 1]
      if (Math.abs(rad(cur) - keepR) >= RIM_EPS) continue
      const node = legNode.get(`${s.skelId}|${end}`)
      if (!node) { unrestorable++; continue }
      let bi = 0, bd = Infinity
      ord.forEach((p, i) => { const dd = d(p, cur); if (dd < bd) { bd = dd; bi = i } })
      const tail = (end === 'start' ? ord.slice(0, bi) : ord.slice(bi + 1)).filter(p => rad(p) > keepR)
      const withNode = end === 'start' ? [node, ...tail] : [...tail, node]
      pts = end === 'start' ? [...withNode, ...pts] : [...pts, ...withNode]
      touched = true; restored++
    }
    return touched ? { ...s, points: pts } : s
  })
  const R2 = walkSubstrate({ streets: preStreets, junctionMap: ribbons.junctionMap, widthAt, orientation: 'a-to-b' })
  const nn2 = R2.failures.filter(f => f.kind === 'no-successor' && f.reason === 'no-node')
  let i2 = 0
  for (const t of tiles) { if (isRim(t)) continue; const pt = interiorPoint(t.ring); if (pt && R2.faces.filter(f => !f.degenerate).some(f => inRing(pt, f.ring))) i2++ }
  o(`  ⛔ WHAT THIS INVENTS, SAID PLAINLY: ${restored} chain-end(s) re-extended by splicing the`)
  o(`     clean/skeleton.json tail back on and snapping the last vertex to the stranded node's`)
  o(`     exact coords. ${unrestorable} end(s) had no stranded node to snap to and were LEFT CUT.`)
  o(`     Chains the clip DROPPED ENTIRELY are absent from the artifact and are NOT restored, so`)
  o(`     the far graph is thinner than a true pre-clip walk. ⇒ treat ④ as directional only.`)
  o(`  RECONSTRUCTED pre-clip walk: faces ${R2.stats.faces} · openRuns ${R2.stats.openRuns} · no-node ${nn2.length}`)
  o(`     post-clip → reconstructed pre-clip:  no-node ${noNode.length} → ${nn2.length} · faces ${R.stats.faces} → ${R2.stats.faces} · INTERIOR tiles ${intCov} → ${i2} of ${intN}`)
  o(`     ⇒ interior control ${i2 === intCov ? 'UNMOVED' : i2 > intCov ? `IMPROVED by ${i2 - intCov}` : `⛔ REGRESSED by ${intCov - i2}`}.`)
} catch (e) {
  o(`  ⛔ NOT MEASURED — ${e.message}. Absence of a number here means nothing.`)
}

o(`\n═══ THE ANSWER ═══`)
o(`  Does the punch-out see clipped vertices? ${manufactured.size ? 'YES' : 'NO'} — it is handed ribbons.streets,`)
o(`  post-clip, with no stencil argument. ${manufactured.size} clip-manufactured vertex/vertices are in its input.`)
o(`  The A/B fork is ${noNodeElsewhere.length === 0 && manufactured.size ? 'ALIVE: the walk really does walk the clipped graph, and no-node is 100% the clip.' : noNodeElsewhere.length ? 'ALIVE, and WIDER than the clip: ' + noNodeElsewhere.length + ' no-node failure(s) are not clip-manufactured.' : 'not decidable from this run — re-read.'}`)
