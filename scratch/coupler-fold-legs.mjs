// coupler-fold-legs.mjs — THE TRUNK PORT of the dead-end fold-leg derivation.
//
// WHY THIS EXISTS. The dead-end probes were written on branch `polygon-asks-stamp`
// and read Slice-1 fields (`run.foldBranch`, `run.walkOrd`, `buildFoldWalkIndex`)
// that trunk does not have. Copied to trunk they do not fail — they print a silent
// `0`, which reads as "no defect" and is the opposite of the truth
// (`POLYGON-FIRST §2.1`, the WHERE-THE-PROBES-LIVE note). This module re-derives the
// same folds from the FROZEN FACE ARTIFACT alone, so the probes run on trunk and say
// the same thing.
//
// ⭐ THE ONE RULE OF THE PORT: identify the two legs by INTEGER RING SPAN, never by
// position. At a zero-width spur the two legs' polys are the SAME coordinates, so any
// positional or L/R test collapses (BRIEF §10.1, the (b-i) collapse). The spans come
// from walking `tile.edges` by index — pure arithmetic on frozen data — and the tip is
// `tile.caps[].vertexIdx`, frozen at prebake by `detectTileCaps`.
//
// Reads ONLY `ribbons.tiles[]` ({ring, edges{skelId,side}, caps{vertexIdx,skelId,capEnd}}).
// No FILL, no Slice 1, no src change. Import it; it prints nothing on its own.
import fs from 'fs'

export const EPS = 0.05                       // metres; the slit / displacement threshold
export const D = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1])
export const ringKey = (r) => r.map(p => `${Math.round(p[0] * 1000)},${Math.round(p[1] * 1000)}`).join(';')

export function loadRibbons(path = 'src/data/ribbons.json') {
  return JSON.parse(fs.readFileSync(path, 'utf8'))
}

// The run-span walk — the frozen-edge twin of tileGround's `groupRuns`, carrying the
// integer span groupRuns drops on trunk. Same seam-then-scan algorithm; the run key is
// (skelId, side) because frozen edges carry ids, not streetIdx.
export function runSpans(tile) {
  const { ring, edges } = tile
  const n = edges?.length || 0
  if (!n || ring?.length !== n) return []
  const same = (a, b) => a.skelId === b.skelId && a.side === b.side
  let seam = 0, found = false
  for (let i = 0; i < n; i++) if (!same(edges[i], edges[(i - 1 + n) % n])) { seam = i; found = true; break }
  if (!found) return [{ skelId: edges[0].skelId, side: edges[0].side, ringI0: 0, ringLen: n, ringN: n }]
  const runs = []
  for (let c = 0, start = seam; c < n;) {
    const i0 = start % n
    let len = 1
    while (len < n && same(edges[(start + len) % n], edges[i0])) len++
    runs.push({ skelId: edges[i0].skelId, side: edges[i0].side, ringI0: i0, ringLen: len, ringN: n })
    start = (start + len) % n
    c += len
  }
  return runs
}

// Every dead-end fold on the map, with its two legs.
// A leg is a run whose integer span STARTS or ENDS at the cap's tip vertex — exactly
// one of the two (`starts !== ends`), which is what makes the branch assignment exact
// rather than positional. `branch` matches Slice 1's convention (starts ⇒ 1).
export function foldLegs(ribbons = loadRibbons()) {
  const out = []
  const tiles = ribbons.tiles || []
  for (let ti = 0; ti < tiles.length; ti++) {
    const tile = tiles[ti]
    const caps = tile.caps || []
    if (!caps.length) continue
    const spans = runSpans(tile)
    for (const cap of caps) {
      const legs = []
      for (const r of spans) {
        if (r.skelId !== cap.skelId) continue
        const starts = r.ringI0 === cap.vertexIdx
        const ends = (r.ringI0 + r.ringLen) % r.ringN === cap.vertexIdx
        if (starts !== ends) legs.push({ ...r, branch: starts ? 1 : 0 })
      }
      out.push({ tileIdx: ti, ring: tile.ring, skelId: cap.skelId, capEnd: cap.capEnd, vertexIdx: cap.vertexIdx, legs })
    }
  }
  return out
}

// Is the FACE a zero-width slit at this tip? Pure ring geometry: the two vertices
// flanking the tip. Coincident ⇒ the ring walked out and came straight back.
export function tipGap(fold) {
  const { ring, vertexIdx: v } = fold
  const N = ring.length
  return D(ring[(v - 1 + N) % N], ring[(v + 1) % N])
}

// ⭐ THE MOUTH — where the spur meets the rest of the map, and the corner test there.
//
// The mouth is NOT "the far end of each leg". On a doubled-back spur the ring visits the
// mouth COORDINATE twice, and the returning leg's run does not stop there — with no corner
// to break it, its span runs THROUGH the mouth to the next real corner beyond. That
// run-through is the defect itself, so the mouth has to be found by COORDINATE (every ring
// index coincident with it), not by span endpoint.
//
// Anchor: the leg that arrives at the tip (branch 0) starts at the mouth.
// Verdict per pass: `cornerAt(a,b)` is a real corner iff the incoming and outgoing edges
// carry DIFFERENT chains (`RIBBONS §1`).
export function mouthInfo(fold, tile) {
  const ring = fold.ring, N = ring.length
  const arriving = fold.legs.find(l => l.branch === 0) || fold.legs[0]
  if (!arriving) return null
  const mouthIdx = arriving.ringI0 === fold.vertexIdx ? (arriving.ringI0 + arriving.ringLen) % arriving.ringN : arriving.ringI0
  const passes = []
  for (let i = 0; i < N; i++) if (i !== fold.vertexIdx && D(ring[i], ring[mouthIdx]) < 1e-6) passes.push(i)
  const corners = passes.map(i => {
    const inc = tile.edges[(i - 1 + N) % N], out = tile.edges[i]
    return { idx: i, inc: `${inc.skelId}/${inc.side}`, out: `${out.skelId}/${out.side}`, isCorner: inc.skelId !== out.skelId }
  })
  // does a leg's span run PAST the mouth instead of ending at it?
  const runThrough = fold.legs.filter(l => {
    const ends = [l.ringI0, (l.ringI0 + l.ringLen) % l.ringN].filter(i => i !== fold.vertexIdx)
    return ends.some(i => !passes.includes(i))
  })
  return { mouthIdx, passes, corners, built: corners.filter(c => c.isCorner).length, runThrough }
}

// Distance from a point to the tile's ring polyline — how far the FILL's run.poly was
// displaced off the frozen ring by the mouth-wrap snap (a span-free measurement, so it
// needs nothing Slice 1 carried).
export function distToRing(p, ring) {
  let best = Infinity
  for (let i = 0, n = ring.length; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n]
    const vx = b[0] - a[0], vy = b[1] - a[1]
    const L2 = vx * vx + vy * vy
    const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L2)) : 0
    best = Math.min(best, D(p, [a[0] + vx * t, a[1] + vy * t]))
  }
  return best
}

// The FILL side, when a probe needs it: build tileGround once and index the shape
// artifact by ring key, so a frozen fold can find the runs the FILL made for it.
export async function fillByRing(ribbons = loadRibbons(), designPath = 'public/looks/lafayette-square/design.json') {
  let design = {}
  try { design = JSON.parse(fs.readFileSync(designPath, 'utf8')) } catch {}
  const o = console.log; console.log = () => {}
  const { buildTileGround } = await import('../src/lib/tileGround.js')
  const g = buildTileGround(ribbons, { smooth: 0, emitArtifact: true, blockCustoms: design.blockCustoms || null, curbWidth: design.curbWidth ?? 0.15 })
  console.log = o
  const byRing = new Map()
  for (const st of g._shapeArtifact) if (st.ring) byRing.set(ringKey(st.ring), st)
  return { g, design, byRing }
}
