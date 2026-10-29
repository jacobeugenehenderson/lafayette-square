const W = new URL('./', import.meta.url).pathname
const { ROWS, STEP_M } = await import(W + 'planted.mjs'), G = await import(W + 'gate.mjs'), C3 = await import(W + 'cand3.mjs')
G.useCandidate(C3)
for (const [k, r] of Object.entries(ROWS)) { try { const m = G.measure(G.ip(r.rings), STEP_M, k), g = m.gate
  console.log(k, JSON.stringify({ copy: g.vsNoded.copy, nearWall: g.vsNoded.nearWall, crossings: m.crossings, books: g.books.balance, unacc: g.unaccounted, added: g.added, removed: g.removed, outers: m.outers, holes: m.holes, folded: m.stat.folded || 0, rIsX: m.stat.rIsX, squared: m.stat.squared, arcSquared: m.stat.arcSquared || 0, sharpPast: m.sharp.past, sharpP: m.sharp.Pcorners.length, noLine: m.sharp.noLine })) }
  catch (e) { console.log(k, 'REFUSED:', String(e.message).slice(0, 160)) } }
