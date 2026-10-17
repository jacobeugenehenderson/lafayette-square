// make-tj.mjs <bake-ground src> <out> — adds a dump at the T-junction refusal: every T-junction found, and for each the
// mesh edge it lies on (both groups' buffers), whether the vertex is an INPUT polygon vertex of any plane group (and which)
// or was made by conformAndRefine, and the input polygon edges within 5 mm. Writes $TJ_OUT, then throws as before.
import { readFileSync, writeFileSync } from 'fs'
const [src, out] = process.argv.slice(2)
let s = readFileSync(src, 'utf8')
const anchor = "    if (tj.total > 0) {\n      const w = tj.found[0]\n"
if (s.split(anchor).length !== 2) throw new Error('anchor not found exactly once')
const hook = `      if (process.env.TJ_OUT) { const R = 0.5, segD = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz
          const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L)) : 0; return [Math.hypot(px - (ax + t * dx), pz - (az + t * dz)), t] }
        const rec = tj.found.map(f => { const o = { ...f, inputVerts: [], inputEdges: [], meshEdges: [], meshVertUse: [] }
          planeSpecs.forEach((sp, gi) => sp.polys.forEach((p, pi) => [p.outer, ...(p.holes || [])].forEach((ring, ri) => ring.forEach((v, vi) => {
            const w2 = ring[(vi + 1) % ring.length], d = Math.hypot(v[0] - f.x, v[1] - f.z)
            if (d < R) o.inputVerts.push({ g: planeKeys[gi], pi, ri, vi, v, d: +d.toFixed(5) })
            const [e, t] = segD(f.x, f.z, v[0], v[1], w2[0], w2[1]); if (e < 0.005) o.inputEdges.push({ g: planeKeys[gi], pi, ri, vi, a: v, b: w2, d: +e.toFixed(6), t: +t.toFixed(4) }) }))))
          bufs.forEach((b, gi) => { const P = b.positions, I = b.indices; let use = 0
            for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) { const a = I[t + k], c = I[t + (k + 1) % 3]
              if (Math.hypot(P[a * 3] - f.x, P[a * 3 + 2] - f.z) < 1e-6) use++
              const [e, u] = segD(f.x, f.z, P[a * 3], P[a * 3 + 2], P[c * 3], P[c * 3 + 2]); if (e < 0.002 && u > 0 && u < 1) o.meshEdges.push({ g: planeKeys[gi], a: [P[a * 3], P[a * 3 + 2]], b: [P[c * 3], P[c * 3 + 2]], d: e, u }) }
            if (use) o.meshVertUse.push({ g: planeKeys[gi], triCorners: use }) })
          return o })
        writeFileSync(process.env.TJ_OUT, JSON.stringify({ total: tj.total, within: tj.within, cross: tj.cross, pairs: [...tj.pairs], rec })) }
`
s = s.replace(anchor, anchor + hook)
writeFileSync(out, s); console.log('wrote', out)
