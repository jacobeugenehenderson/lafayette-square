// Forensic (Sward): what step 1 (per-piece land use) moves, per town, WITHOUT a pour or a build.
// Runs the LIVE mint function (`landUseByPiece`) on each town's BAKED tiles (public/baked/<town>/shape.json,
// their `iA` + one baked `lu`) against that town's voted faces, and lists every piece whose class changes.
// Verge/JR tiles keep `verge` by the mint's own ruling. Usage: node scratch/huron-median-lu/per-piece-moves.mjs [town ...]
import fs from 'fs'
import { landUseByPiece, piecesOfIA } from '../../src/lib/tileGround.js'
const A = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return a / 2 }
const bb = r => { let b = [Infinity, -Infinity, Infinity, -Infinity]; for (const [x, z] of r) b = [Math.min(b[0], x), Math.max(b[1], x), Math.min(b[2], z), Math.max(b[3], z)]; return b }
for (const town of process.argv.slice(2).length ? process.argv.slice(2) : ['lafayette-square', 'hipointedemun', 'huron', 'provincetown']) {
  const S = JSON.parse(fs.readFileSync(`public/baked/${town}/shape.json`)), T = Array.isArray(S) ? S : S.tiles
  const rib = JSON.parse(fs.readFileSync(town === 'lafayette-square' ? 'src/data/ribbons.json' : `cartograph/data/${town}/clean/ribbons.json`))
  const faces = (rib.faces || []).filter(f => f?.ring?.length >= 3 && f.use).map(f => { const ring = A(f.ring) < 0 ? f.ring.slice().reverse() : f.ring; return { use: f.use, ring, bb: bb(ring), area: Math.abs(A(ring)) } })
  const moves = {}; let n = 0, ha = 0; const rows = []
  T.forEach((t, ti) => {
    const fixed = (t.blockClass === 'verge' || t.blockClass === 'jr') ? 'verge' : null
    const now = landUseByPiece(t.iA, { faces, fixed })
    for (const p of piecesOfIA(t.iA)) {
      if (now[p.i] === t.lu) continue
      const a = A(p.outer) / 1e4; n++; ha += a
      const k = `${t.lu} → ${now[p.i]}`; (moves[k] ||= { n: 0, ha: 0 }); moves[k].n++; moves[k].ha += a
      rows.push({ ti, a, k })
    }
  })
  console.log(`\n${town}: ${n} piece(s), ${ha.toFixed(2)} ha, change class`)
  for (const [k, v] of Object.entries(moves).sort((x, y) => y[1].ha - x[1].ha)) console.log(`   ${k.padEnd(32)} ${String(v.n).padStart(3)} piece(s) ${v.ha.toFixed(2).padStart(8)} ha`)
  for (const r of rows.sort((x, y) => y.a - x.a).slice(0, 6)) console.log(`      tile ${r.ti} ${r.a.toFixed(2)} ha  ${r.k}`)
}
