// roadside-ped.mjs — read-only: the non-road vertices the sweep moved (ped-moved-new.json: [Δ, group, x, z]) — GEOMETRY (the
// painted band itself lies past ②, outside its tile's block iA) or CLASSIFICATION (the band holds it inside iA, but the
// deformer's road test said outside)? Per vertex: its tile (by ① ring), inside that tile's iA (exact even-odd), its signed
// distance to ② (iaFull), inside its own painted class (the dump's bands), and inside ANOTHER tile's iA.
import { readFileSync } from 'fs'
const dump = JSON.parse(readFileSync(process.argv[2], 'utf8')), L = JSON.parse(readFileSync(process.argv[3], 'utf8'))
const pip = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c } return c }
const pipR = (x, z, rs) => { let c = false; for (const r of rs) if (pip(x, z, r)) c = !c; return c }
const segD = (p, q, x, z) => { const dx = q[0] - p[0], dz = q[1] - p[1], L2 = dx * dx + dz * dz, u = L2 > 0 ? Math.max(0, Math.min(1, ((x - p[0]) * dx + (z - p[1]) * dz) / L2)) : 0; return Math.hypot(x - p[0] - u * dx, z - p[1] - u * dz) }
const items = (arr) => (arr || []).map(it => Array.isArray(it?.[0]) && typeof it[0][0] === 'number' ? [it] : [it.outer, ...(it.holes || [])].filter(Boolean))
const cls = { curb: items(dump.bands.curb), walk: items(dump.bands.walk), lawn: items(dump.bands.lawn) }
const classOf = (g) => g === 'curb' || g === 'curbCut' ? 'curb' : g === 'sidewalk' ? 'walk' : g.startsWith('treelawn') ? 'lawn' : null
const inClass = (c, x, z) => cls[c].some(rs => pipR(x, z, rs))
const by = new Map(), ex = new Map()
for (const [d, g, x, z] of L) { const ti = dump.tiles.findIndex(t => t.ring && pip(x, z, t.ring)), t = dump.tiles[ti]; if (!t) { by.set('in no tile', (by.get('in no tile') || 0) + 1); continue }
  const inIA = pipR(x, z, t.iA), d2 = Math.min(...t.iaFull.flatMap(r => r.map((p, i) => segD(p, r[(i + 1) % r.length], x, z)))), c = classOf(g), own = c ? inClass(c, x, z) : null
  const other = dump.tiles.some((u, j) => j !== ti && u.iA && pipR(x, z, u.iA))
  const k = `${c ?? 'land use / overlay (' + g + ')'} · ${inIA ? 'INSIDE iA (classification)' : d2 < 0.002 ? 'on ② (within 2 mm)' : 'outside iA, ' + (d2 < 0.5 ? '< 0.5 m' : d2 < 3 ? '0.5–3 m' : '≥ 3 m') + ' past ②'}${c ? (own ? ' · its band holds it' : ' · NOT in its band') : ''}${other ? ' · in another tile\'s iA' : ''}`
  by.set(k, (by.get(k) || 0) + 1); if (!ex.has(k)) ex.set(k, `(${x.toFixed(2)}, ${z.toFixed(2)}) ${g} Δ ${d.toFixed(3)} m`) }
for (const [k, v] of [...by].sort((a, b) => b[1] - a[1])) console.log(`${String(v).padStart(5)}  ${k}   e.g. ${ex.get(k) ?? ''}`)
