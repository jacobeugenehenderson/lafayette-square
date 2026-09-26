// Which AUTHORED slots (design.json blockCustoms: skelId → side → segOrd) govern different ① block edges under two
// label sets on the same geometry? A slot "moves" when the edges keyed to it differ; its authoring would then render
// on other faces. Length = the block edges it governed before (A) that it no longer governs (B), and vice versa.
//   node scratch/proto-authoring-moves.mjs <ribbonsA> <ribbonsB> <design.json> [label]
import fs from 'fs'
const [A, B] = [2, 3].map(i => JSON.parse(fs.readFileSync(process.argv[i], 'utf8')).protopolygon)
const bc = JSON.parse(fs.readFileSync(process.argv[4], 'utf8')).blockCustoms || {}
const slots = new Set(); for (const [sk, sides] of Object.entries(bc)) for (const [sd, ords] of Object.entries(sides || {})) for (const o of Object.keys(ords || {})) slots.add(`${sk}|${sd}|${o}`)
const gov = (P) => { const m = new Map(); P.blocks.forEach((b, k) => { const rs = [[b, P.blockLabels[k]], ...(P.blockHoles?.[k] || []).map((h, j) => [h, P.blockHoleLabels?.[k]?.[j]])]
  for (const [r, labs] of rs) { if (!r || !labs) continue; r.forEach((a, i) => { const o = P.owners[labs[i]]; if (!o) return; const key = `${o.skelId}|${o.side}|${o.segOrd}`; if (!slots.has(key)) return
    const c = r[(i + 1) % r.length], id = `${k}:${a[0]},${a[1]}`; const s = m.get(key) || new Map(); s.set(id, Math.hypot(c[0] - a[0], c[1] - a[1])); m.set(key, s) }) } }); return m }
const GA = gov(A), GB = gov(B); let moved = 0, lost = 0, gained = 0; const ex = []
for (const k of slots) { const a = GA.get(k) || new Map(), b = GB.get(k) || new Map(); let l = 0, g = 0
  for (const [id, L] of a) if (!b.has(id)) l += L; for (const [id, L] of b) if (!a.has(id)) g += L
  if (l > 0.01 || g > 0.01) { moved++; lost += l; gained += g; if (ex.length < 4) ex.push(`${k}: −${l.toFixed(0)} m / +${g.toFixed(0)} m`) } }
console.log(`${(process.argv[5] || '').padEnd(17)} authored slots ${slots.size} · MOVE ${moved} (their faces: ${lost.toFixed(0)} m no longer governed, ${gained.toFixed(0)} m newly governed)${ex.length ? '\n                  e.g. ' + ex.join(' · ') : ''}`)
