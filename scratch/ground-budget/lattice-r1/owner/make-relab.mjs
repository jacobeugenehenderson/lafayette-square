// make-relab.mjs <ucap copy> <out .js> — adds the OLD labelOf (the float contributor test alone, before the owner fix) beside the
// new one on every labelled ② edge, and records each edge whose label differs (old → new owner, with what the old rule saw).
import { readFileSync, writeFileSync } from 'node:fs'
const [src, out] = process.argv.slice(2)
let s = readFileSync(src, 'utf8')
const a = "  if (labelled) B.labels = B.rings.map(rg => rg.map((p, j) => { const q = rg[(j + 1) % rg.length], lab = labelOf(p, q)\n"
if (s.split(a).length !== 2) throw new Error('anchor')
const old = `  const oldLabelOf = (p, q) => {
    const ids = new Set([...(grid.get(gk((p[0] + q[0]) / 2, (p[1] + q[1]) / 2)) || []), ...(grid.get(gk(p[0], p[1])) || []), ...(grid.get('*') || [])])
    const ex = q[0] - p[0], ey = q[1] - p[1], eL = Math.hypot(ex, ey); if (!(eL > 0)) return null
    let best = null
    for (const id of ids) { const c = contrib[id], dx = c.b[0] - c.a[0], dy = c.b[1] - c.a[1], L = Math.hypot(dx, dy)
      const off = (r) => Math.abs((r[0] - c.a[0]) * dy - (r[1] - c.a[1]) * dx) / L
      if (off(p) > 2 / SCALE || off(q) > 2 / SCALE) continue
      const tp = ((p[0] - c.a[0]) * dx + (p[1] - c.a[1]) * dy) / L, tq = ((q[0] - c.a[0]) * dx + (q[1] - c.a[1]) * dy) / L
      const ov = Math.min(L, Math.max(tp, tq)) - Math.max(0, Math.min(tp, tq))
      if (!(ov > 2 / SCALE)) continue
      if (!best || c.kind < best.kind || (c.kind === best.kind && ov > best.ov)) best = { kind: c.kind, ov, lab: c.lab, off: Math.max(off(p), off(q)) } }
    return best }
`
s = s.replace(a, old + a + "    if (stamp) { const ob = oldLabelOf(p, q), o = ob ? ob.lab : null; if (o !== lab) (globalThis.__relab ||= []).push({ p, q, old: o, new: lab, oldOwner: o == null ? null : ownerKeyOf(origE[o]), newOwner: lab == null ? null : ownerKeyOf(origE[lab]), eL: Math.hypot(q[0] - p[0], q[1] - p[1]), oldOv: ob?.ov, oldOff: ob?.off, oldKind: ob?.kind }) }\n")
s = s.replace("offNull: globalThis.__offNull || []", "offNull: globalThis.__offNull || [], relab: globalThis.__relab || []")
writeFileSync(out, s); console.log('relabel copy written:', out)
