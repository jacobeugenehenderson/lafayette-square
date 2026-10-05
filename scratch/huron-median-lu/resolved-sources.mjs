// Forensic (Sward): every town's sources.json AS RESOLVED (readSources + readAddressPointSources) — wells after
// state resolution, with `_*` notes and the `fromState` stamp dropped — as JSON on stdout. Run before and after
// moving a town to state wells and diff: only the stamp may change.  Usage: node scratch/huron-median-lu/resolved-sources.mjs
import { readSources, readAddressPointSources } from '../../cartograph/sources.js'
const strip = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k.startsWith('_') || k === 'fromState' || k === 'path') ? undefined : v))
const out = {}
for (const t of ['huron', 'lafayette-square', 'hipointedemun', 'provincetown']) {
  try { const s = readSources(t); out[t] = strip({ parcels: s.parcels || null, landUseCodes: s.landUseCodes, absentReason: s.absentReason ?? null, addressPoints: readAddressPointSources(t).sources }) }
  catch (e) { out[t] = { error: e.message.split('\n')[0] } }
}
console.log(JSON.stringify(out, null, 1))
