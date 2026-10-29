// the port against the scratch candidate it came from (live defaults): identical k rings and tags, or refused alike,
// on every planted row and the three fixtures. node scratch/cut-once/port-equal.mjs [--skip-huron]
import fs from 'fs'
const C3 = await import('./cand3.mjs'), K = await import('../../cartograph/openClose.mjs'), G = await import('./gate.mjs'), { ROWS, STEP_M } = await import('./planted.mjs')
const fx = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), 'utf8'))
const cases = Object.entries(ROWS).map(([k, r]) => [k, () => [G.ip(r.rings), STEP_M]])
const cfx = (n) => JSON.parse(fs.readFileSync(new URL(`../../checks/fixtures/cut-once-${n}.json`, import.meta.url), 'utf8'))
// the crops the rule mutants were found and seen RED on (Zob, 2026-10-29): parity must hold exactly where they bite
for (const n of ['ptown-widefill-crop', 'ptown-claimant-crop', 'ptown-claimant2-crop']) cases.push([n, () => { const d = cfx(n); return [G.ip(d.paths), d.fineM] }])
cases.push(['decks', () => { const d = fx('ptown-deck-inputs'); return [G.ip(d.inputs.flat()), d.fineM] }], ['breakwater', () => { const d = fx('ptown-embankments'); return [G.ip(d.paths), d.fineM] }], ['pier', () => { const d = fx('huron-pier-deck-inputs'); return [G.ip(d.inputs.flat()), d.fineM] }])
if (!process.argv.includes('--skip-huron')) cases.push(['huron', () => { const d = fx('huron-traced'); return [G.ip(d.traced), d.fineM] }])
const run = (f, src, step, k) => { try { const r = f(src, step, k); return JSON.stringify([r.rings.map(q => q.map(v => [v.X, v.Y])), r.tags]) } catch (e) { return 'REFUSED ' + String(e.message).replace(/\[[^\]]*\]/, '').slice(0, 120) } }
let bad = 0
for (const [k, mk] of cases) { const [src, step] = mk(), a = run(C3.openCloseProvenance, src, step, k), b = run(K.openCloseCutOnce, src, step, k)
  const same = a === b; if (!same) bad++; console.log(same ? '✅' : '⛔', k, same ? '' : `scratch ${a.slice(0, 100)} · kit ${b.slice(0, 100)}`) }
process.exitCode = bad ? 1 : 0
