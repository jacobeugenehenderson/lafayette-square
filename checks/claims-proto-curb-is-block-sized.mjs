// ⛔ ACCEPTANCE 2 + 3 of `BRIEF-compound-faces.md`, measured WITH the scene's authoring loaded.
//   2. the largest live ② ring is comparable to the largest real city block, not to the disc
//   3. (RETIRED 2026-10-22 with ribbons.tiles, its comparison partner)
// ▶ node checks/claims-proto-curb-is-block-sized.mjs [scene ...]
import { feed, buildProto, feedScenes } from '../scratch/_proto-feed.mjs'

const sa = r => { let a = 0; for (let i = 0; i < r.length; i++) { const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length]; a += x1 * y2 - x2 * y1 } return a / 2 }
const scenes = feedScenes()

for (const scene of scenes) {
  const f = feed(scene); if (!f) continue
  const P = f.ribbons.protopolygon
  if (!P?.blocks) { console.log(`⛔ ${scene}: ① carries no blocks — NOT checked`); continue }
  const bR = P.boundaryRing
  const discA = bR ? Math.abs(sa(bR)) : null
  const tg = buildProto(f)
  const curb = tg.curb || []
  const A = curb.map(r => Math.abs(sa(r))).sort((x, y) => y - x)
  const blocksA = P.blocks.map((r, i) => Math.abs(sa(r)) - (P.blockHoles?.[i] || []).reduce((s, h) => s + Math.abs(sa(h)), 0)).sort((x, y) => y - x)
  console.log(`${scene}: ② rings ${curb.length} · largest ${(A[0] / 1e6).toFixed(4)} km² · top5 ${A.slice(0, 5).map(a => (a / 1e6).toFixed(4)).join(' ')}`)
  console.log(`  largest ① block face ${(blocksA[0] / 1e6).toFixed(4)} km²${discA ? ` · disc ${(discA / 1e6).toFixed(4)} km²` : ''}`)
  console.log(`  ACCEPTANCE 2 — largest ② as a share of the disc: ${discA ? (100 * A[0] / discA).toFixed(1) + '%' : 'no disc in this pour'} (it must read as a BLOCK, not as the town)`)

  // interior-point containment, for the outside-the-disc count below
  const inR = (p, g) => { let o = false; for (let i = 0, j = g.length - 1; i < g.length; j = i++) { const a = g[i], b = g[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / ((b[1] - a[1]) || 1e-12) + a[0]) o = !o } return o }
  const interiorPt = (g) => { for (let i = 0; i < g.length; i++) { const a = g[i], b = g[(i + 1) % g.length], c = g[(i + 2) % g.length]; const q = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3]; if (inR(q, g)) return q } return g[0] }
  // ⛔ ACCEPTANCE 3 is RETIRED (2026-10-22): it measured ① against the D2 face freeze (`ribbons.tiles`), which is deleted
  // (BRIEF-the-disc-is-one-source §2a); its comparison partner no longer exists.
  const outside = bR ? P.blocks.filter(r => { const p = interiorPt(r); return !inR(p, bR) }).length : 0
  console.log(`  ① block faces whose interior point lies OUTSIDE the disc: ${outside} (they are stamped out at ${'`'}[PROTO⊙]${'`'}, not built wrong)`)
}
