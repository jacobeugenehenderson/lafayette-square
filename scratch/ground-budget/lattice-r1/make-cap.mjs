// make-cap.mjs <tileGround.js source> <out .js> — a capture copy of a tileGround.js (never committed): imports made
// absolute against the source's own tree, and a hook at the end of the ① producer (just before `[PROTO⇢artifact]`) that
// measures every tile and exits. CAP_OUT = the JSON it writes; CAP_PTS = JSON [[x,z],…] whose containing tiles are dumped.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
const [src, out] = process.argv.slice(2), lib = dirname(resolve(src))
let s = readFileSync(src, 'utf8')
s = s.replace(/from '(\.\.?\/[^']+)'/g, (m, p) => `from '${resolve(lib, p)}'`)
const anchor = "        console.log(`[tileGround][PROTO⇢artifact]"
if (s.split(anchor).length !== 2) throw new Error('anchor not found exactly once')
const st = '          return { ...tile, _evGroups: groups } })'
if (s.split(st).length === 2) s = s.replace(st, '          return { ...tile, _evGroups: groups, _iAstamped: tile.iA } })')
const dl = '          delete t2._luSeed; delete t2._evGroups'
if (s.split(dl).length === 2) s = s.replace(dl, '          t2._evG = t._evGroups; delete t2._luSeed; delete t2._evGroups')
s = s.replace(anchor, "        globalThis.__cap(protoShapeTiles, MP.boundaryRing, landEv)\n" + anchor)
const hook = `import * as _fsC from 'node:fs'
import { makeRim as _makeRim, oneSided as _oneSided } from '${resolve(dirname(new URL(import.meta.url).pathname), '../flatten-r1/onesided.mjs')}'
globalThis.__cap = (tiles, rim, landEv) => {
  const onRim = _makeRim(rim), rawKeys = new Set((landEv || []).flatMap(g => g.rings.flatMap(x => x.r.map(v => v.join(',')))))
  const inRing = (p, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > p[1]) !== (zj > p[1]) && p[0] < (xj - xi) * (p[1] - zi) / (zj - zi) + xi) c = !c } return c }
  const _sd = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz) }
  const offLattice = (rings) => (rings || []).flat().filter(v => v.some(c => Math.abs(c * SCALE - Math.round(c * SCALE)) > 1e-6)).length
  const acc = { tiles: tiles.length, rim: 0, interior: 0, poured: 0, iAoff: 0, iAverts: 0, iaFullOff: 0, iaFullVerts: 0, at: [], dump: [] }
  const pts = JSON.parse(process.env.CAP_PTS || '[]')
  tiles.forEach((t, n) => {
    acc.iAoff += offLattice(t.iA); acc.iAverts += (t.iA || []).flat().length
    acc.iaFullOff += offLattice(t.iaFull); acc.iaFullVerts += (t.iaFull || []).flat().length
    if (t._iAstamped) { const now = new Set((t.iA || []).flat().map(v => v.join(','))), q = (v) => v.map(c => Math.round(c * SCALE))
      const onExact = (P) => (t.iA || []).some(r => r.some((a0, k) => { const a = q(a0), b = q(r[(k + 1) % r.length]), p = q(P)
        return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) === 0 && Math.min(a[0], b[0]) <= p[0] && p[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= p[1] && p[1] <= Math.max(a[1], b[1]) }))
      for (const v of t._iAstamped.flat()) { if (now.has(v.join(',')) || !inRing(v, t.ring)) continue; acc.dropped = (acc.dropped || 0) + 1
        if (!onExact(v)) { acc.droppedNotCollinear = (acc.droppedNotCollinear || 0) + 1; (acc.droppedAt ||= []).length < 10 && acc.droppedAt.push([n, v]) } } }
    if (Array.isArray(t.evidenceByPiece)) { const rk = t._evG ? new Set(t._evG.flatMap(g => g.rings.flatMap(x => x.r.map(v => v.join(','))))) : rawKeys
      const o = _oneSided(t.iA, t.evidenceByPiece, rk, onRim)
      if (o.interior) { const near = (p, R) => R.some(r => r.some((a, k) => _sd(p, a, r[(k + 1) % r.length]) <= 0.001))
        const keys = new Set(t.iA.flat().map(v => v.join(',')))
        for (const e of t.evidenceByPiece.flatMap(l => l || [])) for (const r of e.rings) for (const p of r) { const kk = p.join(','); if (keys.has(kk) || rk.has(kk)) continue
          let d = Infinity, ea, eb; for (const ring of t.iA) for (let k = 0; k < ring.length; k++) { const dd = _sd(p, ring[k], ring[(k + 1) % ring.length]); if (dd < d) { d = dd; ea = ring[k]; eb = ring[(k + 1) % ring.length] } }
          if (!(d > 0 && d <= 0.005) || onRim(ea, eb)) continue
          const onTileRing = near(ea, [t.ring]) && near(eb, [t.ring]), onFull = near(ea, t.iaFull) && near(eb, t.iaFull)
          ;(acc.interiorAt ||= []).push([n, p, +(d * 1000).toFixed(3), onTileRing ? 'tileRingEdge' : 'notTileRing', onFull ? 'onIaFull' : 'offIaFull']) } }
      acc.rim += o.rim; acc.interior += o.interior; acc.poured += o.poured; if (acc.at.length < 40) acc.at.push(...o.at.map(a => [n, ...a])) }
    for (const p of pts) if (t.ring && (inRing(p, t.ring) || t.ring.some(v => Math.hypot(v[0] - p[0], v[1] - p[1]) < 60))) acc.dump.push({ inside: inRing(p, t.ring), inIA: (t.iA || []).some(r => inRing(p, r)), p, n, ring: t.ring, iA: t.iA, iaFull: t.iaFull, evidenceByPiece: t.evidenceByPiece, luByPiece: t.luByPiece, runs: t.runs?.map(r => ({ skelId: r.skelId, side: r.side, segOrd: r.segOrd, poly: r.poly })) })
  })
  _fsC.writeFileSync(process.env.CAP_OUT, JSON.stringify(acc))
  console.log('  [CAP] ' + JSON.stringify({ ...acc, at: undefined, interiorAt: undefined, dump: acc.dump.map(d => ({ n: d.n, inside: d.inside, inIA: d.inIA })) }) + ' — written; exiting')
  process.exit(0)
}
`
writeFileSync(out, hook + s)
console.log('capture copy written:', out)
