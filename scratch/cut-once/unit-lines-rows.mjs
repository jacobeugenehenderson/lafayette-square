// THE UNIT-LINE RULE'S PLANTED ROWS (Zob's ruling, 2026-10-29): the three kit-own residual pieces af7d3eaa named, each its fixture,
// against the definition past 2·NODE_BOUND: the kit (openClose.mjs), and cand3 live and under setUnitLinesKept (RED: they return)
// node scratch/cut-once/unit-lines-rows.mjs
import fs from 'fs'
const K = await import('../../cartograph/openClose.mjs'), C3 = await import('./cand3.mjs'), J = await import('../../cartograph/openCloseJudge.mjs')
for (const f of ['huron-deck-part15', 'huron-deck-part26', 'ptown-residual-largest-crop']) { const d = JSON.parse(fs.readFileSync(new URL(`./fixtures/${f}.json`, import.meta.url), 'utf8')), P = J.ip(d.paths)
  const judge = (run) => { try { const r = J.residualOf(J.ip(run()), P, d.fineM); return `${r.n} piece(s) ${r.m2} m²` } catch (e) { return `REFUSED ${String(e.message).slice(0, 140)}` } }
  const kit = judge(() => K.openCloseCutOnce(P, d.fineM, f).rings), live = judge(() => C3.openCloseProvenance(P, d.fineM, f).rings)
  C3.setUnitLinesKept(true); const mut = judge(() => C3.openCloseProvenance(P, d.fineM, f).rings); C3.setUnitLinesKept(false)
  console.log(`${f}: kit ${kit} · cand3 ${live} · mutant (unit lines kept) ${mut}`) }
