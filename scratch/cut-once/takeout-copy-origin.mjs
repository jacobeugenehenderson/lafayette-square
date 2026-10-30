// Zob's trace of the arrangement take-out's one copy (2026-10-29): where does (192.267, 63.196) come from? Each stage of
// structures.mjs#waterWithoutDecks replayed with the scratch candidate's own functions (cand3.mjs = the kit, port-equal), and after each:
// is the point a vertex of the output, did the noding INSERT it (cand3.mjs#INSERTED, on which segments), did an emit make it (ORIGIN).
// node scratch/cut-once/takeout-copy-origin.mjs
import fs from 'fs'
import clipperLib from 'clipper-lib'
const { Clipper } = clipperLib
const C3 = await import('./cand3.mjs')
const fx = (n) => JSON.parse(fs.readFileSync(new URL(`../../checks/fixtures/cut-once-${n}.json`, import.meta.url), 'utf8')), coast = fx('ptown-coast'), sd = fx('ptown-street-decks-port'), stepM = coast.fineM, cellU = stepM * 1000
const toP = (r) => r.map(([x, z]) => ({ X: Math.round(x * 1000), Y: Math.round(z * 1000) }))
const mine = (rs) => C3.tagOwn(rs.map(toP)), waterT = mine(coast.water.flatMap(b => [b.outer, ...b.holes])), decksT = sd.rings.map(r => mine([r]))
const PT = [[192267, 63196, 'the copy point'], [192267, 63197, 'the water vertex']]
const look = (name, rings) => { for (const [x, y, nm] of PT) { const hits = []; rings.forEach((r, k) => r.forEach((q, i) => { if (q.X === x && q.Y === y) hits.push(`r${k}:${i} tag ${JSON.stringify(q.tag)?.slice(0, 70)}`) }))
    const ins = C3.INSERTED.get(x + ',' + y), org = C3.ORIGIN.get(x + ',' + y)
    if (hits.length || ins || org) console.log(`${name} · ${nm} (${x},${y}): ${hits.length ? hits.join(' | ') : 'not a vertex'}${ins ? ` · INSERTED on ${JSON.stringify(ins.map(s => s.seg)).slice(0, 160)}` : ''}${org ? ` · ORIGIN ${org}` : ''}`) } }
look('the water (input)', waterT); decksT.forEach((D, k) => look(`deck ${k} (input)`, D))
const w0 = C3.boolOf('minus', waterT, decksT.flat(), 'w0'); look('w0 = water − decks', w0)
const ext = decksT.map((D, k) => {
  const g2 = C3.growBy(D, 2 * cellU, `deck ${k}`); look(`deck ${k}: growBy(2 cells)`, g2)
  const loc = C3.boolOf('intersect', w0, g2, `loc ${k}`); look(`deck ${k}: loc`, loc)
  const open = C3.openAt(loc, stepM, `open ${k}`); look(`deck ${k}: open`, open)
  const lmo = C3.boolOf('minus', loc, open, `loc−open ${k}`); look(`deck ${k}: loc − open`, lmo)
  const g1 = C3.growBy(D, cellU, `deck ${k}`), thin = C3.boolOf('intersect', lmo, g1, `thin ${k}`); look(`deck ${k}: thin`, thin)
  const R0 = D[0], onDeck = (v) => R0.some((a, i) => { const b = R0[(i + 1) % R0.length], dx = b.X - a.X, dy = b.Y - a.Y, L2 = dx * dx + dy * dy; const t = L2 ? Math.max(0, Math.min(1, ((v.X - a.X) * dx + (v.Y - a.Y) * dy) / L2)) : 0; return Math.hypot(v.X - a.X - t * dx, v.Y - a.Y - t * dy) <= 0.7072 })
  const touching = thin.filter(q => C3.area(q) > 0 && q.some(onDeck)); look(`deck ${k}: touching`, touching)
  const u0 = C3.boolOf('union', D, touching, `u0 ${k}`); look(`deck ${k}: u0`, u0)
  const e = C3.closeAt(u0, stepM, `e ${k}`); look(`deck ${k}: e = closeAt(u0)`, e)
  return e.filter(q => C3.area(q) > 0) })
const fin = C3.boolOf('minus', waterT, ext.flat(), 'final'); look('FINAL water − decks', fin)
