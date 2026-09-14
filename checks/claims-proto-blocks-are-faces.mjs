// ⛔ Re-mints ① from the SAME inputs `derive.js`'s `[①]` block uses (the SIMPLIFIED skeleton
// + the raw neighborhood boundary) with the WORKING-TREE `mintProtopolygon`, so the frozen
// artifact's age cannot be mistaken for the code's behaviour. Reports the block-containment
// acceptance from `BRIEF-compound-faces.md` #1.
//
// ▶ node checks/claims-proto-blocks-are-faces.mjs [scene ...]
import fs from 'fs'
import { mintProtopolygon } from '../src/lib/tileGround.js'
import { ribbonsPath, ribbonScenes } from './_scenes.mjs'

const scenes = ribbonScenes()

const sa = g => { let a = 0; for (let i = 0, j = g.length - 1; i < g.length; j = i++) a += g[j][0] * g[i][1] - g[i][0] * g[j][1]; return a / 2 }
const inR = (p, g) => { let o = false; for (let i = 0, j = g.length - 1; i < g.length; j = i++) { const a = g[i], b = g[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / ((b[1] - a[1]) || 1e-12) + a[0]) o = !o } return o }
// a point KNOWN to be interior to a ring, not just a vertex (a vertex lies ON every shared edge)
const interiorPt = (g) => {
  for (let i = 0; i < g.length; i++) {
    const a = g[i], b = g[(i + 1) % g.length], c = g[(i + 2) % g.length]
    const p = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3]
    if (inR(p, g)) return p
  }
  return g[0]
}

for (const scene of scenes) {
  const rp = ribbonsPath(scene)
  const skp = `cartograph/data/${scene}/clean/skeleton.json`
  const bp = `cartograph/data/${scene}/neighborhood_boundary.json`
  if (!fs.existsSync(rp) || !fs.existsSync(skp)) { console.log(`⛔ ${scene}: missing ${!fs.existsSync(rp) ? rp : skp} — SKIPPED LOUDLY, NOT checked`); continue }
  const rb = JSON.parse(fs.readFileSync(rp, 'utf8'))
  const sk = JSON.parse(fs.readFileSync(skp, 'utf8'))
  const boundary = fs.existsSync(bp) ? JSON.parse(fs.readFileSync(bp, 'utf8')).boundary : null
  const simplified = new Map((sk.streets || []).map(st => [st.id, (st.points || []).map(q => Array.isArray(q) ? [q[0], q[1]] : [q.x, q.z])]))
  const all = (rb.streets || []).filter(s => s?.points?.length >= 2)
  const mapped = all.map(s => { const pts = simplified.get(s.skelId ?? s.name); return { s, sim: pts?.length >= 2 ? { ...s, points: pts } : null } })
  const unjoined = mapped.filter(m => !m.sim)
  if (unjoined.length) { console.log(`⛔ ${scene}: ${unjoined.length}/${all.length} chains have no simplified geometry — derive would REFUSE. NOT checked.`); continue }
  const MP = mintProtopolygon({
    streets: mapped.filter(m => !m.s.gradeSeparated).map(m => m.sim),
    gradeSep: mapped.filter(m => m.s.gradeSeparated).map(m => m.sim),
    boundary,
  })
  const B = MP.blocks
  if (!B) { console.log(`⛔ ${scene}: mint returned NO blocks (boundary present: ${!!boundary}) — NOT checked`); continue }
  const H = MP.blockHoles || B.map(() => [])
  // ⛔ A FACE IS OUTER MINUS ITS HOLES. A face legitimately nested inside another face's HOLE is
  // not an overlap — testing against the outer ring alone reports the compound face as a defect,
  // which is the naive form of this very check.
  const inFace = (p, k) => inR(p, B[k]) && !(H[k] || []).some(h => inR(p, h))
  const S = B.map((g, i) => ({ i, a: Math.abs(sa(g)), g, p: interiorPt(g) })).sort((x, y) => y.a - x.a)
  let nested = 0, worst = null
  for (const t of S) {
    const holders = S.filter(u => u.i !== t.i && u.a > t.a && inFace(t.p, u.i))
    if (holders.length) { nested++; if (!worst) worst = { t, holders } }
  }
  const nh = H.filter(h => h.length).length
  console.log(`${scene}: ${B.length} blocks (${nh} compound — outer + holes) · largest ${(S[0].a / 1e6).toFixed(4)} km² (${S[0].g.length} verts) · top5 km² ${S.slice(0, 5).map(s => (s.a / 1e6).toFixed(4)).join(' ')}`)
  console.log(`  ACCEPTANCE 1 — blocks nested inside another block: ${nested}  (expect 0)`)
  if (worst) console.log(`  e.g. block ${worst.t.i} (${(worst.t.a).toFixed(0)} m²) sits inside ${worst.holders.length} larger one(s), biggest ${(worst.holders[worst.holders.length - 1].a / 1e6).toFixed(4)} km²`)
}
