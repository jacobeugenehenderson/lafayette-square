// THE RESIDUAL CENSUS (Zob's ruling, 2026-10-29): every piece past 2·NODE_BOUND the runtime net finds (openCloseJudge.mjs#residualOf,
// the definition per part), on each town and path, classified before any fix. For each piece: its side, m², key; the part it lies in;
// the emission rules within its neighbourhood (cand3.mjs#ORIGIN, the kit's equal: port-equal); and the FIRST STAGE where the kit and the
// definition part there (oracle.mjs#stagewise: erode / open / dilate / closedK / k, a later stage's piece overlapping an earlier one's is
// carried, not new). A piece whose stages all agree until k parts at the taken/filled SELECTION. → a table: class · count · m² · sites.
// node scratch/cut-once/residual-census.mjs [huron-water huron-decks provincetown-water]
import fs from 'fs'
import clipperLib from 'clipper-lib'
const { IntPoint } = clipperLib
const S = await import('../../cartograph/structures.mjs'), K = await import('../../cartograph/openClose.mjs'), J = await import('../../cartograph/openCloseJudge.mjs')
const C3 = await import('./cand3.mjs'), O = await import('./oracle.mjs')
const fx = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), 'utf8'))
const data = (t, f) => JSON.parse(fs.readFileSync(new URL(`../../cartograph/data/${t}/${f}`, import.meta.url), 'utf8'))
const SRC = {
  'huron-water': () => { const d = fx('huron-traced-now'); return { P: d.traced.map(p => p.map(([X, Y]) => new IntPoint(X, Y))), stepM: d.fineM, kit: (P, s) => S.openCloseAtStep(P, s, 'water').paths } },
  'huron-decks': () => { const osm = data('huron', 'raw/osm.json'), stepM = data('huron', 'clean/coast.json').fineM; return { P: S.deckInputs(osm.ground).paths, stepM, kit: () => S.deckFootprints(osm.ground, stepM).paths } },
  'provincetown-water': () => { const d = fx('provincetown-traced'); return { P: d.traced.map(p => p.map(([X, Y]) => new IntPoint(X, Y))), stepM: d.fineM, kit: (P, s) => S.openCloseAtStep(P, s, 'water').paths } } }
const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SRC), rows = []
for (const name of want) { const t0 = Date.now(), { P, stepM, kit } = SRC[name](), res = J.residualOf(kit(P, stepM), P, stepM), parts = K.partsOf(P, name)
  console.log(`\n=== ${name}: ${res.n} piece(s) past 2·NB, ${res.m2} m² (judged in ${((Date.now() - t0) / 1000).toFixed(0)} s)`)
  const inPart = (w) => { const X = w.at[0] * 1000, Y = w.at[1] * 1000; let best = -1, bd = Infinity
    parts.forEach((pp, i) => { const xs = pp[0].map(q => q.X), ys = pp[0].map(q => q.Y), d = Math.max(Math.min(...xs) - X, X - Math.max(...xs), Math.min(...ys) - Y, Y - Math.max(...ys), 0); if (d < bd) { bd = d; best = i } }); return best }
  const byPart = new Map(); for (const w of res.pieces) { const g = inPart(w); (byPart.get(g) || byPart.set(g, []).get(g)).push(w) }
  for (const [g, ws] of byPart) { const pp = J.ip(parts[g]), sw = O.stagewise(pp, stepM, `${name} part ${g}`), origin = new Map(C3.ORIGIN), h = stepM / 2 * 1000
    for (const w of ws) { const X = w.at[0] * 1000, Y = w.at[1] * 1000, kinds = {}
      for (const [key, v] of origin) { const [vx, vy] = key.split(',').map(Number); if (Math.hypot(vx - X, vy - Y) < 2 * h + 1000) for (const kd of String(v).split('|')) kinds[kd] = (kinds[kd] || 0) + 1 }
      const born = sw.largest.concat(sw.bornAll || []).filter(b => Math.hypot(b.at[0] - w.at[0], b.at[1] - w.at[1]) < 3).sort((a, b) => ['erode', 'open', 'dilate', 'closedK', 'k'].indexOf(a.stage) - ['erode', 'open', 'dilate', 'closedK', 'k'].indexOf(b.stage))[0]
      const rules = Object.keys(kinds).filter(kd => !['own', 'run-vertex'].includes(kd)).sort().join('+') || (Object.keys(kinds).length ? 'own/run only' : 'no emission near')
      const row = { name, part: g, side: w.side, m2: w.m2, key: w.key, at: w.at, stage: born ? born.stage : 'k (selection)', rules }
      rows.push(row); console.log(`  ${row.side} ${row.m2} m² at (${row.at.join(', ')}) · part ${g} · first parts at: ${row.stage} · rules near: ${rules}`) } } }
// the classes: the first stage that parts, and the side
const cls = new Map(); for (const r of rows) { const k = `${r.stage} · ${r.side}`; const v = cls.get(k) || cls.set(k, { n: 0, m2: 0, sites: [], rules: {} }).get(k); v.n++; v.m2 += r.m2; v.sites.push(`${r.name} (${r.at.join(', ')}) ${r.m2}`); v.rules[r.rules] = (v.rules[r.rules] || 0) + 1 }
console.log('\nclass (first stage · side) | count | m² | rules near (count) | sites')
for (const [k, v] of [...cls].sort((a, b) => b[1].m2 - a[1].m2)) console.log(`${k} | ${v.n} | ${v.m2.toFixed(4)} | ${JSON.stringify(v.rules)} | ${v.sites.slice(0, 6).join(' · ')}${v.sites.length > 6 ? ` … +${v.sites.length - 6}` : ''}`)
fs.writeFileSync(new URL('./fixtures/residual-census.json', import.meta.url), JSON.stringify(rows, null, 1))
