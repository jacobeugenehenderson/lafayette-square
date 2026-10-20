// make-xsec.mjs <bake-ground src> <out> — at the deformer build, samples XSEC="ax,az,bx,bz,px,pz" (an edge and a point on
// it): along the edge's normal through the point, every 0.5 mm from −5 cm to +5 cm, which byMaterial / byFaceUse items
// hold each sample (shore items tagged ink (pr.inkShore) or median). Writes $XSEC_OUT and exits. Read-only probe.
import { readFileSync, writeFileSync } from 'fs'
const [src, out] = process.argv.slice(2)
let s = readFileSync(src, 'utf8')
const pre = "      byMaterial.get('shore').push(...s.items)\n"
if (s.split(pre).length !== 2) throw new Error('pre')
s = s.replace(pre, "      globalThis.__nInk = byMaterial.get('shore').length\n" + pre)
const anchor = "    } else if (S.state === 'pending')"
if (s.split(anchor).length !== 2) throw new Error('anchor')
const hook = `    if (process.env.XSEC_OUT) { const [ax, az, bx, bz, px, pz] = process.env.XSEC.split(',').map(Number)
      const L = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / L, nz = (bx - ax) / L
      const pip = (p, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]
        if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c } return c }
      const inIt = (p, it) => { const o = it.outer || it; return pip(p, o) && !(it.holes || []).some(h => pip(p, h)) }
      const nInk = globalThis.__nInk
      const groups = [...[...byMaterial].map(([k, v]) => ['mat:' + k, v]), ...[...byFaceUse].map(([k, v]) => ['face:' + k, v])]
      const near = groups.map(([k, v]) => [k, v.map((it, i) => ({ it, i })).filter(({ it }) => (it.outer || it).some(q => Math.hypot(q[0] - px, q[1] - pz) < 400))])
      const rows = []; for (let w = -0.05; w <= 0.05 + 1e-9; w += 0.0005) { const p = [px + nx * w, pz + nz * w], held = []
        for (const [k, L2] of near) for (const { it, i } of L2) if (inIt(p, it)) held.push(k === 'mat:shore' ? (i < nInk ? 'shore:ink#' + i : 'shore:median#' + (i - nInk)) : k + '#' + i)
        rows.push([+(w * 1000).toFixed(1), held]) }
      writeFileSync(process.env.XSEC_OUT, JSON.stringify({ normal: [nx, nz], nInk, rows })); console.log('[XSEC] written; exiting'); process.exit(0) }
`
s = s.replace(anchor, hook.replace(/^    if/, '      if') + anchor); writeFileSync(out, s); console.log('wrote', out)
