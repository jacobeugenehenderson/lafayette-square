// classify.mjs <dump dir> <points.csv> --scene=<town> — READ-ONLY (Tern, 2026-10-14; Boz). The dump is deform.json + meta.json,
// the deformer's own input, written by dump.sh beside this file. The csv is x,z,tile off the bake's refusal message (printed to the cm,
// so each row is searched in its ±5 mm cell on the 1 mm grid for HEAD's unowned point). Writes <dump>/classified.json.
// Run from the checkout whose groundDeformer you mean (the 2026-10-14 rows: the main checkout at 55cf53ab), e.g.
//   node <this>/classify.mjs <dump> <this>/unowned-hipointedemun-55cf53ab.csv --scene=hipointedemun
// Owner is off the POLYGON: the nearest iaFull edge of the row's tile → its iaStamp run, or its iaArc and the runs at the arc's ends.
// per unowned point: HEAD's deformer vs the same with bandsAlong's window CHAINED
// (each crossing within one lattice of the PREVIOUS joins the group); the ray-vs-point-test parting; owner off the polygon.
import { readFileSync, writeFileSync, mkdtempSync } from 'fs'
import { join } from 'path'; import { tmpdir } from 'os'; import { pathToFileURL } from 'url'
const R = process.cwd() + '/'   // ⭐ the CHECKOUT YOU RUN FROM supplies the deformer and terrain: run it from the commit the dump was taken on
const [dump, csv] = process.argv.slice(2).filter(a => !a.startsWith('--'))
const { scene } = JSON.parse(readFileSync(dump + '/meta.json', 'utf8'))
const F = JSON.parse(readFileSync(dump + '/deform.json', 'utf8'))
const { loadSceneTerrain } = await import(R + 'cartograph/terrainLoad.js'); const T = loadSceneTerrain(scene)
const HOME = R + 'cartograph/groundDeformer.mjs', src = readFileSync(HOME, 'utf8')
const win = 'while (pending.length && pending[0].t - t0 <= LATTICE) { const h = pending.shift()'
if (src.split(win).length !== 2) throw new Error('the window anchor moved')
const mf = join(mkdtempSync(join(tmpdir(), 'hpdm-ray-')), 'groundDeformer.mjs')
writeFileSync(mf, src.replace(win, 'let tp = t0; while (pending.length && pending[0].t - tp <= LATTICE) { const h = pending.shift(); tp = h.t')
  .replace(/from '\.\.\/src\/lib\//g, `from '${R}src/lib/`).replace(/from '\.\//g, `from '${R}cartograph/`))
const build = async (u) => (await import(u)).buildDeformer({ ...structuredClone(F), raw: T.getElevationRaw })
const H = await build(pathToFileURL(HOME).href), C = await build(pathToFileURL(mf).href)
const pts = readFileSync(csv, 'utf8').trim().split('\n').slice(1).map(l => l.split(',').map(Number))
const cls = (D, x, z) => ['walk', 'lawn', 'curb'].find(c => D._inClass(c, x, z)) || 'lot'
const runName = (t, run) => { const r = typeof run === 'number' ? t?.runs?.[run] : run; return r ? `${r.skelId}|${r.side}|${r.segOrd}` : String(run) }
const ownerOff = (ti, x, z) => { const t = F.tiles[ti]; if (!t?.iaFull) return 'tile has no ②'; let b = null
  t.iaFull.forEach((r, ri) => { for (let i = 0; i < r.length; i++) { const a = r[i], c = r[(i + 1) % r.length], dx = c[0] - a[0], dz = c[1] - a[1], L2 = dx * dx + dz * dz, u = L2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)) : 0, d = Math.hypot(x - a[0] - u * dx, z - a[1] - u * dz); if (!b || d < b.d) b = { d, ri, i, n: r.length } } })
  const st = t.iaStamp?.[b.ri], arc = t.iaArc?.[b.ri]?.[b.i], name = (k) => { const r = t.runs[k]; return `${r.skelId}|${r.side}|${r.segOrd}` }
  if (arc != null) { const ends = new Set(); for (const dj of [-1, 1]) { let j = b.i; for (let s = 0; s < b.n; s++) { j = (j + dj + b.n) % b.n; if (t.iaArc[b.ri][j] !== arc) { if (st?.[j] != null) ends.add(name(st[j])); break } } } return `arc ${arc} (${[...ends].join(' / ')})` }
  if (st?.[b.i] != null) return name(st[b.i])
  return t.iaCap?.[b.ri]?.[b.i] != null ? 'a cap' : 'unstamped' }
// the refusal prints to the cm: the vertex is within 5 mm of the row; search that cell on the 1 mm grid for HEAD's unowned point
const snap = (x, z) => { if (H.unownedIn(x, z) != null) return [x, z, 0]; let best = null
  for (let i = -5; i <= 5; i++) for (let j = -5; j <= 5; j++) { const p = [x + i / 1000, z + j / 1000]; if (H.unownedIn(...p) != null) { const d = Math.hypot(i, j); if (!best || d < best[2]) best = [...p, d] } } return best }
const rows = [], byOwner = {}, tally = { reproduced: 0, notReproduced: 0, chainedOwns: 0, chainedStill: 0 }
for (const [x0, z0, tile] of pts) {
  const sn = snap(x0, z0); const [x, z] = sn || [x0, z0]; if (sn && sn[2]) tally.snapped = (tally.snapped || 0) + 1
  const hu = sn ? 0 : null; if (hu == null) { tally.notReproduced++; rows.push({ x, z, tile, verdict: 'HEAD owns it here (not reproduced)' }); continue }
  tally.reproduced++
  const cu = C.unownedIn(x, z), pt = cls(H, x, z)
  // each candidate span: where its ray reads lot before reaching the point while the point test reads a band
  const cands = H._owners(x, z).map(c => { const B = c.bands, last = B.at(-1), reach = B.filter(b => b.cls !== 'lot').reduce((m, b) => Math.max(m, b.to), 0)
    return { key: c.key, d: +c.d.toFixed(3), reach: +reach.toFixed(3), seq: B.slice(0, 5).map(b => `${b.cls}${b.from.toFixed(3)}-${b.to.toFixed(3)}`).join(' ') } })
  const e = H.explain(x, z), t = F.tiles[tile]
  const near = H._owners(x, z)[0]
  const owner = ownerOff(tile, x, z)
  const v = cu == null ? 'window' : 'not the window'
  tally[cu == null ? 'chainedOwns' : 'chainedStill']++
  ;(byOwner[`${owner} (tile ${tile})`] ??= { window: 0, 'not the window': 0 })[v]++
  rows.push({ x, z, tile, pointTest: pt, verdict: v, owner, d: e.d, cands })
}
console.log(`${scene}: ${pts.length} points · HEAD unowned ${tally.reproduced} (of them found within the 5 mm print cell: ${tally.snapped || 0}) (not reproduced ${tally.notReproduced}) · with the window chained: owned ${tally.chainedOwns}, still unowned ${tally.chainedStill}`)
for (const [k, v] of Object.entries(byOwner).sort((a, b) => (b[1].window + b[1]['not the window']) - (a[1].window + a[1]['not the window']))) console.log(`  ${k}: window ${v.window} · not ${v['not the window']}`)
writeFileSync(dump + '/classified.json', JSON.stringify(rows, null, 1))
