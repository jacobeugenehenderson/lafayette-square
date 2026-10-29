// which emission made each of these points (cand3.mjs#ORIGIN), and any cut-join detail: node scratch/cut-once/origin-of.mjs <fixture> x,y …
import fs from 'fs'
import clipperLib from 'clipper-lib'
import { openCloseProvenance, ORIGIN, DETAIL } from './cand3.mjs'
const { IntPoint } = clipperLib
const F = { decks: () => { const d = JSON.parse(fs.readFileSync(new URL('./fixtures/ptown-deck-inputs.json', import.meta.url), 'utf8')); return { src: d.inputs.flat().map(p => p.map(q => new IntPoint(q.X, q.Y))), stepM: d.fineM } } }
const { src, stepM } = F[process.argv[2]](); try { openCloseProvenance(src, stepM, process.argv[2]) } catch (e) { console.log('(run refused, as expected:', String(e.message).slice(0, 80), '…)') }
for (const a of process.argv.slice(3)) { const k = a.split(',').map(Number).join(','); console.log(k, ORIGIN.get(k) || 'not emitted (noding or source)', DETAIL.has(k) ? JSON.stringify((({ A, B, ...x }) => ({ ...x, A, B }))(DETAIL.get(k))) : '') }
