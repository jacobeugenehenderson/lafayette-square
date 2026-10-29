// the three fixtures through gate.mjs#measure, one row each: the same measures the check judges (copy (c) against P_noded, near-wall
// (b), crossings, books, accounting, the sharpness gate, topology). node scratch/cut-once/fixtures-measure.mjs [decks breakwater huron]
import fs from 'fs'
const G = await import('./gate.mjs'), C3 = await import('./cand3.mjs'); G.useCandidate(C3)
const fx = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), 'utf8'))
const F = { decks: () => { const d = fx('ptown-deck-inputs'); return [G.ip(d.inputs.flat()), d.fineM] }, breakwater: () => { const d = fx('ptown-embankments'); return [G.ip(d.paths), d.fineM] }, huron: () => { const d = fx('huron-traced'); return [G.ip(d.traced), d.fineM] } }
for (const k of (process.argv.length > 2 ? process.argv.slice(2) : Object.keys(F))) { const [src, step] = F[k](); try { const m = G.measure(src, step, k), g = m.gate
  console.log(k, JSON.stringify({ copy: g.vsNoded.copy, nearWall: g.vsNoded.nearWall, crossings: m.crossings, le2mm: m.le2mm, books: g.books.balance, unacc: g.unaccounted, added: g.added, removed: g.removed, outers: m.outers, holes: m.holes, src: m.src, squared: m.stat.squared || 0, arcSquared: m.stat.arcSquared || 0, sharpPast: m.sharp.past, sharpPcorners: m.sharp.Pcorners.length, noLine: m.sharp.noLine, ms: m.ms }))
  const SC = await G.classifySharp(m.sharp.all, m.P, step); console.log('  sharp: errors', SC.errors.length, JSON.stringify(SC.errors), '· the definition\'s or P\'s', JSON.stringify(SC.list.filter(x => x.Pcorner || x.definition))); if (m.sharp.noLine) console.log('  no line', JSON.stringify(m.sharp.noLineList)) } catch (e) { console.log(k, 'REFUSED:', String(e.message).slice(0, 300)) } }
