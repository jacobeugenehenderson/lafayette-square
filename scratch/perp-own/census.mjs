// census.mjs <scene> [--live-norm] [--file=tileGround.js] — read-only; run from the worktree root. The pour's band-piece census,
// summed over tiles: refused · refusedPerp (a perpendicular corner's own ground with no owner) · the legs that built no extension.
// --live-norm resolves the curb-cut norm the way derive does today (`resolveCurbCutNorm`), in place of the frozen one.
import { fileURLToPath } from 'url'
const WT = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '')
const scene = process.argv[2], live = process.argv.includes('--live-norm'), file = (process.argv.find(a => a.startsWith('--file=')) || '--file=tileGround.js').slice(7)
const { feed } = await import(`${WT}/scratch/_proto-feed.mjs`)
const { buildTileGround } = await import(`${WT}/src/lib/${file}`)
const f = feed(scene); if (!f) process.exit(2)
if (live) { const { resolveCurbCutNorm } = await import(`${WT}/cartograph/curb-cut-norm.mjs`); const was = f.ribbons.curbCutNorm?.style ?? f.ribbons.curbCutNorm; f.ribbons.curbCutNorm = resolveCurbCutNorm(scene, null); console.log(`norm: frozen ${JSON.stringify(was)} → live ${f.ribbons.curbCutNorm.style}`) }
const prev = console.log, pw = console.warn; console.log = () => {}; console.warn = () => {}
let R; try {
  R = buildTileGround(f.ribbons, { smooth: 0, stencil: f.stencil, curbWidth: f.curbWidth, curbedMinWidth: f.curbedMinWidth,
    blockCustoms: f.blockCustoms, blockLandUse: f.blockLandUse, cornerCornerRadiusOverrides: f.cornerCornerRadiusOverrides,
    cornerRadiusOverrides: f.cornerRadiusOverrides, cornerRadiusScale: f.cornerRadiusScale ?? 1 })
} finally { console.log = prev; console.warn = pw }
const T = R.protoBandPieces || [], S = {}
for (const t of T) for (const [k, v] of Object.entries(t.census || {})) if (typeof v === 'number') S[k] = (S[k] || 0) + v
const recs = T.reduce((n, t) => n + (t.perp || []).length, 0)
const g = (k) => +(S[k] || 0).toFixed(3)
console.log(`${scene} · ${file} · tiles with pieces ${T.length} · perpendicular records ${recs} · refused ${g('refused')} region(s) ${g('refusedM2')} m² · refusedPerp ${g('refusedPerp')} region(s) ${g('refusedPerpM2')} m² · legs bare ${g('perpLegBare')} · no sub-edge ${g('perpLegNoSub')} · no stamp ${g('perpLegNoStamp')} · noOwner ${g('noOwner')} · peak rss ${(process.memoryUsage().rss / 1e9).toFixed(2)} GB`)
