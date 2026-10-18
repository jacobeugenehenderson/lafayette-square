// h2-at.mjs — read-only: the ② edges within 1 cm of (x, z) in the tile holding it: owner (run/arc/cap) and that owner's height there
import { readFileSync } from 'fs'
import { loadSceneTerrain } from '../../../cartograph/terrainLoad.js'
import { lineHeights } from '../../../.claude/worktrees/hpdm-gate/cartograph/lineHeight.mjs'
const [dumpF, X, Z] = process.argv.slice(2), x = +X, z = +Z, dump = JSON.parse(readFileSync(dumpF, 'utf8')), T = loadSceneTerrain('hipointedemun')
const LH = lineHeights({ streets: JSON.parse(readFileSync('cartograph/data/hipointedemun/clean/ribbons.json', 'utf8')).streets, raw: T.getElevationRaw, sigma: 5 })
const pip = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c } return c }
const segD = (p, q) => { const dx = q[0] - p[0], dz = q[1] - p[1], L2 = dx * dx + dz * dz, u = L2 > 0 ? Math.max(0, Math.min(1, ((x - p[0]) * dx + (z - p[1]) * dz) / L2)) : 0; return [Math.hypot(x - p[0] - u * dx, z - p[1] - u * dz), u] }
const ti = dump.tiles.findIndex(t => t.ring && pip(x, z, t.ring)), t = dump.tiles[ti]
t.iaFull.forEach((r, ri) => r.forEach((p, i) => { const q = r[(i + 1) % r.length], [d, u] = segD(p, q); if (d > 0.01) return
  const a = t.iaArc?.[ri]?.[i], arcE = a != null && t.iaArc[ri][(i + 1) % r.length] === a, st = t.iaStamp?.[ri]?.[i], cp = t.iaCap?.[ri]?.[i], o = st != null ? t.runs[st] : cp != null ? t.caps[cp] : null
  console.log(`tile ${ti} ② ring ${ri} edge ${i}/${r.length} (${p.map(v => v.toFixed(3))} → ${q.map(v => v.toFixed(3))}) len ${Math.hypot(q[0] - p[0], q[1] - p[1]).toFixed(3)} · d ${d.toFixed(4)} u ${u.toFixed(3)} · ${arcE ? `ARC ${a}` : o ? `${st != null ? 'run' : 'cap'} ${o.skelId} ${o.side ?? ''}/${o.segOrd ?? ''}${o.noLine ? ' noLine ' + o.noLine : ''} → line ${LH.heightAt(o.skelId, [x, z])?.toFixed(3)}` : 'NO OWNER'}`) }))
