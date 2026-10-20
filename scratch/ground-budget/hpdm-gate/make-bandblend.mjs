// make-bandblend.mjs — a SCRATCH, MEASURE-ONLY copy of a groundDeformer.mjs with THE BAND BLEND (Boz, 2026-10-18): a ped point
// takes its owners from the band PIECE holding it (tileGround's protoBandPieces), and every band width from the depths CARRIED
// on the tile (`edgeDepths[si][e]`, offsetRingByRects' own record), never a ray:
//  · the absorption stations round ② read cw / walkFrom / walkTo / WB at their own edge and parameter;
//  · a point in a piece: per owner, its foot on that owner's OWN ② edges (`owner.edges`), H and the absorption there, the
//    girdle with that edge's depths at the foot; a multi-owner piece blends D_k by 1/d_k (limits.bandWeights 'equal': equal);
//  · a point in a drawn band but no piece, or in a piece whose owner lists no edges: null, counted by name;
//  · the lot (no band): the nearest span's ease, its back edge from the carried depths (the ray gone here too).
// ⛔ Not for the bake. Every anchor asserted.   node make-bandblend.mjs <groundDeformer.mjs> <out.mjs>
import { readFileSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
const [inp, outp] = process.argv.slice(2)
let s = readFileSync(inp, 'utf8')
const one = (a, b) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`make-bandblend: anchor found ${n}× — ${a.slice(0, 80)}`); s = s.replace(a, b) }
s = s.replace(/from '(\.\.?\/[^']+)'/g, (m, p) => `from '${resolve(dirname(resolve(inp)), p)}'`)
one("export function buildDeformer({ town, tiles, ink, bands, stencil = null, raw, line, limits }) {",
    "export function buildDeformer({ town, tiles, ink, bands, stencil = null, raw, line, limits, pieces: bandPieces = null }) {\n  if (!Array.isArray(bandPieces)) throw new Error(`groundDeformer[band blend]: ⛔ ${town}: no band pieces passed`)\n  const BW = limits.bandWeights ?? 'inv'")
one("    road: 0, roadBlended: 0, ink: 0, inkCrossing: 0, inkOnGrid: 0 }",
    "    road: 0, roadBlended: 0, ink: 0, inkCrossing: 0, inkOnGrid: 0, piece: 0, pieceMulti: 0, noPiece: 0, noEdges: 0, noDepth: 0, lotEase: 0 }\n  const unownedSites = []")
// the carried depths: per tile index → edgeDepths[si][e]; piece records per tile
one("  // ── the tiles: their ① ring (which tile holds a point), ② with H per edge ──",
`  // ── THE BAND BLEND's records: the depths and the pieces, by tile index ──
  const depthsByTile = new Map(), piecesByTile = new Map()
  for (const bp of bandPieces) { depthsByTile.set(bp.tile, bp.edgeDepths || null)
    piecesByTile.set(bp.tile, (bp.pieces || []).map((q, qi) => { const rings = (q.rings || []).filter(r => r?.length >= 3).map(frozenCopy)
      let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const r of rings) for (const [x, z] of r) { a = Math.min(a, x); b = Math.min(b, z); c = Math.max(c, x); d = Math.max(d, z) }
      return { qi, cls: q.cls, rings, owners: q.owners || [], bb: [a, b, c, d] } })) }
  // a level's depth at parameter u along (si, e): breakpoints [[t, d], …], interpolated; a repeated t is a step (the later wins past it)
  const depthAt = (ti, si, e, u, lvl) => { const bp = depthsByTile.get(ti)?.[si]?.[e]?.[lvl]; if (!bp?.length) return null
    if (u <= bp[0][0]) return bp[0][1]
    for (let k = 1; k < bp.length; k++) if (u <= bp[k][0]) { const [t0, d0] = bp[k - 1], [t1, d1] = bp[k]; return t1 > t0 ? d0 + (d1 - d0) * (u - t0) / (t1 - t0) : d1 }
    return bp[bp.length - 1][1] }
  // the ped intervals the carried depths give at (ti, si, e, u): [{ from, to, cls }] from ② inward, and the back edge
  const pedAt = (ti, si, e, u) => { const cw = depthAt(ti, si, e, u, 'cw') ?? 0, wf = depthAt(ti, si, e, u, 'walkFrom'), wt = depthAt(ti, si, e, u, 'walkTo'), WB = depthAt(ti, si, e, u, 'WB')
    const ped = []; if (cw > 0) ped.push({ from: 0, to: cw, cls: 'curb' })
    if (wf != null && wt != null && wt > wf) { if (wf > cw) ped.push({ from: cw, to: wf, cls: 'lawn' }); ped.push({ from: Math.max(cw, wf), to: wt, cls: 'walk' }); if (WB != null && WB > wt) ped.push({ from: wt, to: WB, cls: 'lawn' }) }
    else if (WB != null && WB > cw) ped.push({ from: cw, to: WB, cls: 'lawn' })
    const back = ped.length ? ped[ped.length - 1].to : 0
    return { ped, back, none: wf == null && wt == null && WB == null && !(cw > 0) } }
  // ── the tiles: their ① ring (which tile holds a point), ② with H per edge ──`)
// the absorption stations: carried depths instead of the ray
one(`      const B = bandsAlong(px - uz * SIDESTEP, pz + ux * SIDESTEP, ux, uz, CAP)
      const { ped, back } = pedOf(B); let lawnW = 0, walkW = 0`,
`      const { ped, back } = pedAt(t.ti, R.k, S.i, S.u); let lawnW = 0, walkW = 0`)
// the ped branch: pieces, not rays
one(`    for (const c of owners(t, x, z, Math.min(CAP, REACH + LATTICE))) {
      // within the lattice of ② the point IS on ②: the bands are on the 1 mm grid and ② is not, so a ray aimed from a
      // station a fraction of a millimetre away points nowhere in particular (measured: 536 of 664 orphan clusters on HPDM)
      if (c.d < LATTICE) return { v: c.H, owner: own(c) }
      const p = profile(c, x, z)
      if (p.held) { if (c.R !== n.R || c.key !== nearKey(n)) stats.byBand++; return { v: p.v, owner: own(c) } }
    }
    if (inBand(x, z)) { stats.unowned++; return { v: null, owner: null, unowned: t.ti } }
    return { v: profile(n, x, z).v, owner: own(n) }`,
`    // ⭐ THE BAND BLEND: the piece holding P names its owners; each owner's height is read off its OWN ② edges
    const q = pieceAt(t, x, z)
    if (q) { const Dk = [], Wk = []
      for (const o of q.owners) { if (!o.edges?.length) { stats.noEdges++; unownedSites.push({ x, z, ti: t.ti, why: \`owner \${o.skelId} \${o.side ?? ''} segOrd \${o.segOrd ?? ''} lists no source edges\`, cls: q.cls }); return { v: null, owner: null, unowned: t.ti } }
        let f = null
        for (const { si, e } of o.edges) { const R = t.rings.find(r => r.k === si); if (!R) continue
          const p0 = R.ring[e], p1 = R.ring[(e + 1) % R.ring.length], dx = p1[0] - p0[0], dz = p1[1] - p0[1], L2 = dx * dx + dz * dz
          const u = L2 > 0 ? Math.max(0, Math.min(1, ((x - p0[0]) * dx + (z - p0[1]) * dz) / L2)) : 0, px = p0[0] + u * dx, pz = p0[1] + u * dz, d = Math.hypot(x - px, z - pz)
          if (!f || d < f.d) f = { R, i: e, u, px, pz, d, si } }
        if (!f) { stats.noEdges++; unownedSites.push({ x, z, ti: t.ti, why: \`owner \${o.skelId}'s edges are on no ② ring of this tile\`, cls: q.cls }); return { v: null, owner: null, unowned: t.ti } }
        f.H = f.R.Hat(f.i, f.u)
        const P = pedAt(t.ti, f.si, f.i, f.u)
        if (P.none) { stats.noDepth++; unownedSites.push({ x, z, ti: t.ti, why: \`owner \${o.skelId}'s edge \${f.si}/\${f.i} carries no depth\`, cls: q.cls }); return { v: null, owner: null, unowned: t.ti } }
        Dk.push(f.d < LATTICE ? f.H : girdle(f, P, x, z)); Wk.push(f.d) }
      stats.piece++; if (Dk.length > 1) stats.pieceMulti++
      if (Dk.length === 1) return { v: Dk[0], owner: \`piece|\${t.ti}|\${q.qi}\` }
      const on = Wk.findIndex(d => d < 1e-9); if (on >= 0) return { v: Dk[on], owner: \`piece|\${t.ti}|\${q.qi}\` }
      let sw = 0, sv = 0; Dk.forEach((v, k) => { const w = BW === 'equal' ? 1 : 1 / Wk[k]; sw += w; sv += w * v })
      return { v: sv / sw, owner: \`piece|\${t.ti}|\${q.qi}\` } }
    if (inBand(x, z)) { stats.noPiece++; unownedSites.push({ x, z, ti: t.ti, why: 'in a drawn band, in no piece' }); return { v: null, owner: null, unowned: t.ti } }
    // the lot: the nearest span's ease past its carried back edge
    stats.lotEase++
    const P = pedAt(t.ti, n.R.k, n.i, n.u)
    return { v: girdle(n, P, x, z), owner: own(n) }`)
// the girdle on carried intervals (the old ray profile's formulas, the intervals from pedAt)
one("  // for probes: the station, the depth and the band intervals a point's ray finds (never used by the bake)",
`  const pieceAt = (t, x, z) => { for (const q of piecesByTile.get(t.ti) || []) { if (x < q.bb[0] || x > q.bb[2] || z < q.bb[1] || z > q.bb[3]) continue; if (pipRings(x, z, q.rings)) return q } return null }
  function girdle(n, P, x, z) {
    const { ped, back } = P, R = absorbAt(n.R, n.i, n.u)
    let walkW = 0, lawnW = 0; for (const b of ped) { if (b.cls === 'walk') walkW += b.to - b.from; else if (b.cls === 'lawn') lawnW += b.to - b.from }
    const head = 4 * ulp32(n.H)
    const sgn = Math.sign(R), lawnCap = lawnMax == null ? Infinity : Math.max(0, lawnMax * lawnW / exag - head)
    const byLawn = lawnW > 0 ? Math.min(Math.abs(R), lawnCap) : 0
    const byWalk = Math.min(Math.abs(R) - byLawn, Math.max(0, WALK_SHARE * walkMax * walkW / exag - head))
    const at = (s) => { let h = n.H
      for (const b of ped) { const w = b.to - b.from; if (w <= 0) continue
        const share = b.cls === 'walk' ? (walkW > 0 ? byWalk * w / walkW : 0) : b.cls === 'lawn' ? (lawnW > 0 ? byLawn * w / lawnW : 0) : 0
        if (s <= b.to) return h + sgn * share * (Math.max(0, s - b.from)) / w
        h += sgn * share }
      return h }
    if (n.d <= back) return at(n.d)
    const hBack = at(back)
    if (n.d >= back + blend) return raw(x, z)
    stats.eased++
    return hBack + (raw(x, z) - hBack) * (n.d - back) / blend }
  // for probes: the station, the depth and the band intervals a point's ray finds (never used by the bake)`)
one("  return { heightAt, stats, reach: CAP,", "  return { unownedSites, heightAt, stats, reach: CAP,")
writeFileSync(outp, s)
console.log('written', outp)
