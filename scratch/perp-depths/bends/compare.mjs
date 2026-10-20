// compare.mjs <scene> — the corner test (iaJunction: 'bend' vs a junction, `classifyCornerLegs`) against the DRAWN-WALK
// reading (Jacob, 2026-10-18: "if the rule is the sidewalk has to terminate in asphalt, sidewalks that terminate in each
// other don't draw a corner"): an arc is a corner when one of its walks, run straight on from its tangent, reaches the road
// within the corner's own reach — the painter's own landing search, run here on bend arcs too (tg.allperp.mjs, a scratch
// copy: bends are not skipped and every arc is drawn perpendicular). Per arc: its walks, how many land, its TURN (the angle
// between the arc's first and last chord, i.e. how far the kerb turns). Measures only.
import { writeFileSync } from 'fs'
import { feed } from '../../_proto-feed.mjs'
import { resolveCurbCutNorm } from '../../../cartograph/curb-cut-norm.mjs'
import { readSources } from '../../../cartograph/sources.js'
const { buildTileGround } = await import('./tg.allperp.mjs')
const scene = process.argv[2] || 'huron', f = feed(scene), src = readSources(scene)
// the norm the pour would freeze now (a town poured before the kit rung became perpendicular froze 'none', with no sizes)
f.ribbons = { ...f.ribbons, curbCutNorm: resolveCurbCutNorm(scene, src.declared ? src.state : null) }
globalThis.__allPerp = true
const pl = console.log, pw = console.warn; console.log = () => {}; console.warn = () => {}
const R = buildTileGround(f.ribbons, { grout: 'proto', smooth: 0, stencil: f.stencil, curbWidth: f.curbWidth, curbedMinWidth: f.curbedMinWidth, blockCustoms: f.blockCustoms, blockLandUse: f.blockLandUse, cornerCornerRadiusOverrides: f.cornerCornerRadiusOverrides, cornerRadiusOverrides: f.cornerRadiusOverrides, cornerRadiusScale: f.cornerRadiusScale ?? 1, protoProducer: true })
console.log = pl; console.warn = pw
const turn = (A) => { if (!A || A.length < 3) return null; const u = [A[1][0] - A[0][0], A[1][1] - A[0][1]], n = A.length, v = [A[n - 1][0] - A[n - 2][0], A[n - 1][1] - A[n - 2][1]]
  return Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v))))) * 180 / Math.PI }
const rows = (R.curbCutCorners || []).filter(c => c.probeKind).map(c => {
  const landed = Math.max(0, (c.walks || 0) - (c.noLanding || 0))
  return { at: c.at, kind: c.probeKind, walks: c.walks || 0, landed, turn: turn(c.arcPts), reading: landed > 0 ? 'corner' : (c.walks ? 'no landing' : 'no walk') } })
const T = {}; for (const r of rows) { const k = `${r.kind} · ${r.reading}`; T[k] = (T[k] || 0) + 1 }
console.log(`${scene}: ${rows.length} arc(s) judged (junction + bend; unknown and no-street arcs are not corners on either test)`)
for (const [k, v] of Object.entries(T).sort()) console.log(`  ${k.padEnd(28)} ${v}`)
const hist = (L) => { const b = [[0, 10], [10, 20], [20, 30], [30, 45], [45, 60], [60, 90], [90, 181]]; return b.map(([a, z]) => `${a}–${z === 181 ? '' : z}°: ${L.filter(r => r.turn != null && r.turn >= a && r.turn < z).length}`).join(' · ') }
for (const k of ['bend · corner', 'bend · no landing', 'junction · no landing', 'junction · corner']) { const L = rows.filter(r => `${r.kind} · ${r.reading}` === k); if (L.length) console.log(`  ${k} — turn: ${hist(L)}`) }
for (const k of ['bend · corner', 'junction · no landing']) for (const r of rows.filter(r => `${r.kind} · ${r.reading}` === k).sort((a, b) => (a.turn ?? 0) - (b.turn ?? 0)).slice(0, 10))
  console.log(`    ${k}: (${r.at.map(v => v.toFixed(1))}) turn ${r.turn?.toFixed(0)}° · ${r.landed}/${r.walks} walk(s) land`)
writeFileSync(new URL(`./${scene}.json`, import.meta.url), JSON.stringify(rows))
