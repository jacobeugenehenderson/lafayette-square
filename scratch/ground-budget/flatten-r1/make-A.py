# make-A.py — writes tileGround.A.js (never committed): the worktree's tileGround.js (option A, as built) plus counters only —
# per stamped tile at the land-use cut, one-side vertices split rim/interior (onesided.mjs) and the stamp vertices the disc
# cut dropped inside the piece; written to A_OUT, then exits after the producer.
WT='/Users/jacobhenderson/Desktop/lafayette-square.nosync/.claude/worktrees/rings-only'
s=open(WT+'/src/lib/tileGround.js').read()
s=s.replace("from '../../",f"from '{WT}/").replace("from './",f"from '{WT}/src/lib/").replace("from '../",f"from '{WT}/src/")
def rep(a,b):
    global s
    assert s.count(a)==1,(s.count(a),a[:70]); s=s.replace(a,b)
rep("return { ...tile, _evGroups: groups } })","return { ...tile, _evGroups: groups, _iAstamped: tile.iA, _iAraw: t.iA } })\n        globalThis.__rimRing = MP.boundaryRing")
rep("          delete t2._luSeed; delete t2._evGroups\n","          globalThis.__Ameasure?.({ ...t2, _evGroups: t._evGroups }); delete t2._iAstamped; delete t2._iAraw\n          delete t2._luSeed; delete t2._evGroups\n")
rep("            if (!ringsArea(differenceRings([t.ring], [stamp]))) { kept.push(t); inside++; continue }", "            if (!ringsArea(differenceRings([t.ring], [stamp]))) { globalThis.__Aprobe?.(t, intersectRings(t.iA || [], [t.ring])); kept.push(t); inside++; continue }")
rep("        if (landEv) console.log(`[tileGround][stamp] the land-use stamp written","        globalThis.__Adone?.()\n        if (landEv) console.log(`[tileGround][stamp] the land-use stamp written")
hook = """import * as _fsA from 'node:fs'
import { makeRim as _makeRim, oneSided as _oneSided } from '""" + WT + """/scratch/ground-budget/flatten-r1/onesided.mjs'
{ const acc = { tiles: 0, rim: 0, interior: 0, poured: 0, dropped: 0, droppedNotCollinear: 0, droppedAt: [], at: [], skipped: 0, wouldDrop: 0, wouldDropSelfTouch: 0, wouldDropAt: [] }; let onRim = null
  const _sd = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz) }
  // on a tile the circle does not reach: what the cut it no longer makes WOULD have dropped (stamp vertices, not exactly
  // collinear), and whether iA⁺ self-touches there — the vertex within one lattice step of an edge that is not its own
  globalThis.__Aprobe = (t, cutIA) => { if (!t._iAstamped) return; acc.skipped++
    const was = new Set(t._iAraw.flat().map(v => v.join(','))), now = new Set(cutIA.flat().map(v => v.join(',')))
    t.iA.forEach((r, ri) => r.forEach((v, k) => { const kk = v.join(','); if (was.has(kk) || now.has(kk) || onExact(v, cutIA)) return
      acc.wouldDrop++
      let touch = false
      t.iA.forEach((r2, rj) => r2.forEach((a, m) => { if (rj === ri && (m === k || (m + 1) % r2.length === k)) return; if (_sd(v, a, r2[(m + 1) % r2.length]) <= 0.001) touch = true }))
      if (touch) acc.wouldDropSelfTouch++; if (acc.wouldDropAt.length < 8) acc.wouldDropAt.push([v, touch]) })) }
  const _inRing = (p, rr) => { const R = Array.isArray(rr?.[0]?.[0]) ? rr : [rr]; let ins = false; for (const r of R) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > p[1]) !== (zj > p[1]) && p[0] < (xj - xi) * (p[1] - zi) / (zj - zi) + xi) ins = !ins } return ins }
  const q = v => Math.round(v * 1000)
  const onExact = (P, iA) => iA.some(r => r.some((a0, k) => { const a = a0.map(q), b = r[(k + 1) % r.length].map(q), p = P.map(q)
    return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) === 0 && Math.min(a[0], b[0]) <= p[0] && p[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= p[1] && p[1] <= Math.max(a[1], b[1]) }))
  globalThis.__Ameasure = (t) => { if (!t._evGroups || !Array.isArray(t.evidenceByPiece)) return
    onRim ||= _makeRim(globalThis.__rimRing); acc.tiles++
    const rk = new Set(t._evGroups.flatMap(g => g.rings.flatMap(x => x.r.map(v => v.join(','))))); const o = _oneSided(t.iA, t.evidenceByPiece, rk, onRim)
    acc.rim += o.rim; acc.interior += o.interior; acc.poured += o.poured; if (acc.at.length < 12) acc.at.push(...o.at)
    const was = new Set(t._iAraw.flat().map(v => v.join(','))), now = new Set(t.iA.flat().map(v => v.join(',')))
    for (const v of t._iAstamped.flat()) { const kk = v.join(','); if (was.has(kk) || now.has(kk) || !_inRing(v, t.ring)) continue
      acc.dropped++; if (!onExact(v, t.iA)) { acc.droppedNotCollinear++; if (acc.droppedAt.length < 8) acc.droppedAt.push(v) } } }
  globalThis.__Adone = () => { _fsA.writeFileSync(process.env.A_OUT, JSON.stringify(acc)); console.log('  [A] ' + JSON.stringify({ ...acc, at: undefined, droppedAt: undefined }) + ' — written; exiting'); process.exit(0) } }
"""
open(WT+'/scratch/ground-budget/flatten-r1/tileGround.A.js','w').write(hook+s)
print('tileGround.A.js written')
