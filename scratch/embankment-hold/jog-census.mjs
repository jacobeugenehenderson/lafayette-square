// READ-ONLY: edges ≤ 2 mm in the deck footprints BEFORE openCloseAtStep (the inputs' union) and AFTER (deckFootprints), per town
import clipperLib from 'clipper-lib'
import { readFileSync } from 'node:fs'
const ROOT = new URL('../../', import.meta.url).pathname, D = ROOT.replace(/\.claude\/worktrees\/shore\/$/, '') + 'cartograph/data'
const S = await import(ROOT + 'cartograph/structures.mjs')
const { Clipper, Paths, PolyType, ClipType, PolyFillType } = clipperLib
const short = (ps) => ps.reduce((t, p) => t + p.filter((q, i) => { const b = p[(i + 1) % p.length]; return Math.hypot(b.X - q.X, b.Y - q.Y) <= 2 }).length, 0)
for (const [t, step] of [['provincetown', 0.9987867588490528], ['huron', 0.9987366601341472]]) {
  const g = JSON.parse(readFileSync(`${D}/${t}/raw/osm.json`, 'utf8')).ground
  const { paths } = S.deckInputs(g), c = new Clipper(), u = new Paths(); c.AddPaths(paths, PolyType.ptSubject, true); c.Execute(ClipType.ctUnion, u, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  const fp = S.deckFootprints(g, step)
  console.log(`${t}: decks, edges ≤ 2 mm — the inputs' union ${short(u)} · after open+close ${short(fp.paths)}`) }
