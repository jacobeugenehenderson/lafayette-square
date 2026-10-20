// make-dump.mjs <bake-ground src> <out> — a bake-ground copy that, at the unowned refusal, writes every unowned vertex with
// what the deformer saw there (its tile by ring, the bands its owners' rays find, the band classes holding it) to
// $UNOWNED_OUT, then throws as before. Optional DUMP_PTS="x,z;x,z" also dumps the deformer at those points. Read-only probe.
import { readFileSync, writeFileSync } from 'fs'
const [src, out] = process.argv.slice(2), R = '/Users/jacobhenderson/Desktop/lafayette-square.nosync/cartograph/'
let s = readFileSync(src, 'utf8').replace(/from '\.\/([^']+)'/g, `from '${R}$1'`).replace(/from '\.\.\/([^']+)'/g, `from '${R}../$1'`)
const anchor = '  if (deformTally.unowned.size) throw new Error(`[bake-ground] ⛔ ${scene}: ${deformTally.unowned.size} ped'
if (s.split(anchor).length !== 2) throw new Error('anchor not found exactly once')
const hook = `  if (process.env.UNOWNED_OUT && deform) { const T = (ti) => { const t = shapeArtifact.tiles ? shapeArtifact.tiles[ti] : shapeArtifact[ti]; return t }
    const sc = (o) => o && Object.fromEntries(Object.entries(o).filter(([k, v]) => v == null || typeof v !== 'object'))
    const bs = (B) => (B || []).map(b => [b.cls, +(+b.from).toFixed(4), +(+b.to).toFixed(4)])
    const at = (x, z) => { const e = deform.explain(x, z)
      return { x, z, inWalk: deform._inClass('walk', x, z), inLawn: deform._inClass('lawn', x, z), inCurb: deform._inClass('curb', x, z),
        explain: e && { ...sc(e), station: e.station, bands: bs(e.bands) },
        owners: deform._owners(x, z).map(c => ({ key: c.key, run: c.run, d: +c.d.toFixed(4), bands: bs(c.bands) })) } }
    const seenK = new Set(), pts = (deformTally._exact || []).filter(([x, z]) => { const k = x + ',' + z; if (seenK.has(k)) return false; seenK.add(k); return true }).map(([x, z, ti]) => ({ ...at(x, z), ti, ring: T(ti)?.ring, tile: sc(T(ti)) }))
    const extra = (process.env.DUMP_PTS || '').split(';').filter(Boolean).map(q => at(...q.split(',').map(Number)))
    writeFileSync(process.env.UNOWNED_OUT, JSON.stringify({ n: pts.length, pts, extra })) }
`
s = s.replace(anchor, hook + anchor)
const tally = "if (ti != null) deformTally.unowned.set(`${P[v * 3].toFixed(2)},${P[v * 3 + 2].toFixed(2)}`, ti)"
if (s.split(tally).length !== 2) throw new Error('tally not found exactly once')
s = s.replace(tally, "if (ti != null) { (deformTally._exact ||= []).push([P[v * 3], P[v * 3 + 2], ti]); deformTally.unowned.set(`${P[v * 3].toFixed(2)},${P[v * 3 + 2].toFixed(2)}`, ti) }")
if (!/import \{[^}]*writeFileSync/.test(s) && !/import \* as fs/.test(s)) s = `import { writeFileSync } from 'fs'\n` + s
writeFileSync(out, s); console.log('wrote', out)
