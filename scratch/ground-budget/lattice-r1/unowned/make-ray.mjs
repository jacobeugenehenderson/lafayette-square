// make-ray.mjs <bake-ground src> <out> — a bake-ground copy that, once the deformer is built, follows the nearest owner's ray
// to each RAY_PTS point ("x,z;x,z") through every painted band polygon (byMaterial, as painted, before the flatten): the
// along-ray intervals each polygon covers, its key and index, whether it holds the point. Writes $RAY_OUT and exits.
import { readFileSync, writeFileSync } from 'fs'
const [src, out] = process.argv.slice(2)
let s = readFileSync(src, 'utf8')
const anchor = "    // ⭐ THE EASE'S END IS A LINE OF THE PARTITION"
if (s.split(anchor).length !== 2) throw new Error('anchor not found exactly once')
const hook = `    if (process.env.RAY_OUT) { const keys = [...byMaterial.keys()].filter(k => /^(curb|curbCut|sidewalk|treelawn)(:|$)/.test(k))
      const pip = (p, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]
        if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c } return c }
      const inPoly = (p, it) => { const o = it.outer || it, h = it.holes || []; return pip(p, o) && !h.some(r => pip(p, r)) }
      const cross = (o, u, it) => { const ts = []; for (const r of [it.outer || it, ...(it.holes || [])]) for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]
          const ex = b[0] - a[0], ez = b[1] - a[1], den = u[0] * ez - u[1] * ex; if (Math.abs(den) < 1e-15) continue
          const t = ((a[0] - o[0]) * ez - (a[1] - o[1]) * ex) / den, w = ((a[0] - o[0]) * u[1] - (a[1] - o[1]) * u[0]) / den
          if (w >= 0 && w <= 1 && t >= 0) ts.push(t) } return ts.sort((x, y) => x - y) }
      const res = (process.env.RAY_PTS || '').split(';').filter(Boolean).map(q => { const [x, z] = q.split(',').map(Number), e = deform.explain(x, z)
        if (!e?.station) return { x, z, explain: e }
        const o = e.station, d = Math.hypot(x - o[0], z - o[1]), u = [(x - o[0]) / d, (z - o[1]) / d], hits = []
        for (const k of keys) (byMaterial.get(k) || []).forEach((it, i) => { const ts = cross(o, u, it).filter(t => t <= d + 1)
          const holds = inPoly([x, z], it); if (ts.length || holds) hits.push({ key: k, i, holds, ts: ts.map(t => +t.toFixed(4)), n: (it.outer || it).length, outer: (it.outer || it) }) })
        return { x, z, station: o, d, bands: e.bands, owners: deform._owners(x, z).map(c => ({ key: c.key, run: c.run, d: c.d, bands: c.bands })), hits } })
      writeFileSync(process.env.RAY_OUT, JSON.stringify(res)); console.log('[RAY] written ' + res.length + '; exiting'); process.exit(0) }
`
s = s.replace(anchor, hook + anchor)
writeFileSync(out, s); console.log('wrote', out)
