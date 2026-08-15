// SLICE 2 — the scene + width feed the substrate probes share. (Wren, 2026-08-14)
//
// ⛔ ONE feed, imported by every probe. Two probes each carrying their own copy
// of the segOrd resolution is the parallel-mechanism anti-pattern one level up
// from the one substrateWalk.js's header forbids.
//
// ⭐ PER SEGORD, THROUGH THE MECHANISM THAT ALREADY EXISTS — the producer's rule,
// mirrored and NOT reinvented:
//   · IX identity  — `resolveChainSegmentation` (buildBlockGeometryV2.js:701),
//     the SSoT for "what is an IX on this chain"; imported, not copied.
//   · segOrd of a SPAN — tileGround.js:2739 `runSegOrd` / :2779 `segOrdAtVertex`:
//     the number of interior-IX vertices at or before the span's LOWER original
//     index. This is why the walk hands `widthAt` the arc: a custom resolves per
//     RUN, and a bare vertex index cannot express a span.
//   · the override read — tileGround.js:2770 `feWidthAt`: a custom's pavementHW
//     LAYERS onto the chain measure and is taken only when finite, so a custom
//     carrying materials alone does not read as 0.
// ⚠️ The IX set is resolved over the SAME filtered street list the SHAPE producer
// uses (points≥2, grade-sep excluded — tileGround.js:2681), not
// buildBlockGeometryV2's unfiltered list, which would partition differently.
// ✅ Measured, not assumed: `effectiveMeasure` (tileGround.js:1166) rewrites only
// `treelawn`/`sidewalk`, never `pavementHW`, so the per-chain BASE is identical.
//
// ⛔ Reads objects, never source text. A `grep '"via":"cap"'` returned 0 on a
// pretty-printed file and put a false absence into canon (RIBBONS §1, corrected
// e406571b). Every count here parses.
import fs from 'fs'
import crypto from 'crypto'

export const CHILLERED = ['ksi-y-m-yn', 'centrum', 'altadena']
export const H = (f) => { try { return 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 10) } catch { return 'ABSENT' } }
export const ARG = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d }

export async function loadScene(scene, ribbonsPathArg) {
  if (CHILLERED.includes(scene)) return { chillered: true, scene }
  const o = console.log; console.log = () => {}
  const { resolveChainSegmentation } = await import('../src/lib/buildBlockGeometryV2.js')
  console.log = o

  const ribbonsPath = ribbonsPathArg || (scene === 'lafayette-square'
    ? 'src/data/ribbons.json'
    : `cartograph/data/${scene}/clean/ribbons.json`)
  const nbPath = `cartograph/data/${scene}/neighborhood_boundary.json`
  const designPath = `public/looks/${scene}/design.json`

  const rawFile = JSON.parse(fs.readFileSync(ribbonsPath, 'utf8'))
  // A clean/map.json is the POUR; src/data/ribbons.json is the PROMOTED bundle.
  // ⛔ Promoting is a material clobber of the operator's map and is no probe's business.
  const ribbons = rawFile.layers?.ribbons || rawFile
  const isPour = !!rawFile.layers
  const nb = JSON.parse(fs.readFileSync(nbPath, 'utf8'))
  const design = JSON.parse(fs.readFileSync(designPath, 'utf8'))

  const streets = (ribbons.streets || []).filter(s => s?.points?.length >= 2 && !s.gradeSeparated)
  const bc = design.blockCustoms || {}
  const byId = new Map(streets.map(s => [s.skelId, s]))

  const segSets = resolveChainSegmentation(streets)
  const ixByChain = new Map()
  for (const s of streets) {
    const n = s.points.length
    ixByChain.set(s.skelId, [...(segSets.get(s) || [])].filter(i => i > 0 && i < n - 1).sort((a, b) => a - b))
  }
  const segOrdAt = (skelId, lower) => { let so = 0; for (const i of (ixByChain.get(skelId) || [])) if (i <= lower) so++; return so }
  const baseHW = (skelId, side) => Math.max(0, byId.get(skelId)?.measure?.[side]?.pavementHW || 0)

  const widthAtSegOrd = (skelId, side, vertexIdx, arc) => {
    if (!byId.has(skelId)) return NaN
    const c = bc[skelId]?.[side]?.[segOrdAt(skelId, arc ? arc.i0 : vertexIdx)]
    return (c && Number.isFinite(c.pavementHW)) ? Math.max(0, c.pavementHW) : baseHW(skelId, side)
  }

  // ⛔ KEPT ONLY AS A COMPARAND — the pre-2026-08-14 feed, which ignores the
  // vertex it is handed and keeps whichever authored half-width Object.keys
  // enumerated last. Never the default.
  const hwCacheChain = new Map()
  const widthAtChain = (skelId, side) => {
    const k = skelId + '|' + side
    if (hwCacheChain.has(k)) return hwCacheChain.get(k)
    if (!byId.has(skelId)) { hwCacheChain.set(k, NaN); return NaN }
    let hw = baseHW(skelId, side)
    const cust = bc[skelId]?.[side]
    if (cust) for (const so of Object.keys(cust)) if (Number.isFinite(cust[so]?.pavementHW)) hw = cust[so].pavementHW
    hwCacheChain.set(k, hw)
    return hw
  }

  const [cx, cz] = nb.center
  const outerRing = nb.boundary.map(([x, z]) => [cx + (x - cx), cz + (z - cz)])

  return {
    chillered: false, scene, ribbonsPath, nbPath, designPath, isPour,
    ribbons, nb, design, streets, bc, byId, ixByChain, segOrdAt, baseHW,
    widthAtSegOrd, widthAtChain, outerRing,
  }
}

// The scene banner every probe prints — an eye-gate must record its scene, and
// so must a measurement. ⛔ Counts here are structural (objects), never grep.
export function banner(S, o) {
  const nodes = S.ribbons.junctionMap?.nodes || []
  const pairs = nodes.reduce((s, n) => s + (n.cornersAdjacent || []).length, 0)
  const cap = nodes.reduce((s, n) => s + (n.cornersAdjacent || []).filter(c => c.via === 'cap').length, 0)
  o('═══ SCENE + ARTIFACTS (an eye-gate must record its scene; so must a probe) ═══')
  o(`  scene ........................ ${S.scene}   (⛔ lafayette-square and lafayette-square-staging are DIFFERENT MAPS)`)
  o(`  ribbons READ FROM ............ ${S.ribbonsPath}`)
  o(`                                 ${H(S.ribbonsPath)}${S.isPour ? '   (the POUR — layers.ribbons)' : '   (the PROMOTED bundle)'}`)
  o(`  junction nodes / coupler pairs  ${nodes.length} / ${pairs}   via:'cap' ${cap}   ⛔ counted by READING OBJECTS`)
  o(`  design.json .................. ${H(S.designPath)}   ${Object.keys(S.bc).length} authored streets`)
  o(`  neighborhood_boundary.json ... ${H(S.nbPath)}   (read HERE, passed as an argument — the walk never opens it)`)
}
