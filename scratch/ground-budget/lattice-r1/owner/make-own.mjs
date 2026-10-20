// make-own.mjs <ucap copy> <out .js> — adds to a make-ucap capture copy: each labelOf null record's contributors carry their
// ORIGINAL ① edge (`oe`, origE) and the ① turn between consecutive ① edges at their shared vertex; right after each
// offsetRingByRects call (outer ring and holes) the block's pending records resolve `oe` to the ① owner (skelId|side|segOrd)
// through the caller's own labels and protoOwners. The artifact hook adds each kept unowned edge's iaArc at its start vertex.
import { readFileSync, writeFileSync } from 'node:fs'
const [src, out] = process.argv.slice(2)
let s = readFileSync(src, 'utf8')
const one = (a, b) => { if (s.split(a).length !== 2) throw new Error('anchor not found exactly once: ' + a.slice(0, 60)); s = s.replace(a, b) }
one("ops.push({ kind: c.kind, lab: c.lab, a: c.a, b: c.b, ...(c.ext ? { ext: c.ext } : {}) }) }",
    "ops.push({ kind: c.kind, lab: c.lab, oe: origE[c.lab], a: c.a, b: c.b, e: seg[c.lab].e }) }")
one("const rings2 = offsetRingByRects(WC.ring,", "const _res = (L) => { for (const r of (globalThis.__offNull || [])) if (r.block == null) { r.block = k; for (const c of r.ops) { const o = protoOwners[L[c.oe]]; c.owner = o ? `${o.skelId}|${o.side}|${o.segOrd}` : null } } }\n        const rings2 = offsetRingByRects(WC.ring,")
one("        // ⭐ per-vertex ① OWNER for each offset ring", "        _res(labs)\n        // ⭐ per-vertex ① OWNER for each offset ring")
one("const hOff = offsetRingByRects(HW.ring, (j) => (hRec.depth[j] = HW.depth[j]), true, hSt, null, PROTO_HW, HW)", "const hOff = offsetRingByRects(HW.ring, (j) => (hRec.depth[j] = HW.depth[j]), true, hSt, null, PROTO_HW, HW); _res(holeLabs[hi])")
one("protoUnlabelled.at.forEach(a => { a.inDisc = _in(a.p); a.kept = _kept.has(a.p.join(',')) })",
    "const _arc = new Map(); for (const t of protoShapeTiles) (t.iaFull || []).forEach((r, ri) => r.forEach((v, i) => _arc.set(v.join(','), t.iaArc?.[ri]?.[i] ?? null)))\n          protoUnlabelled.at.forEach(a => { a.inDisc = _in(a.p); a.kept = _kept.has(a.p.join(',')); a.arc = _arc.get(a.p.join(',')) ?? null })")
writeFileSync(out, s)
console.log('owner copy written:', out)
