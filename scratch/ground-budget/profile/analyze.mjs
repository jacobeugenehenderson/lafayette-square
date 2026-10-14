// Top self-time functions per window of a profile.sh run (Brace, 2026-10-14; Boz). Windows come from the run's own
// `[window] <name> · <counts>` lines, in order; each window CLOSES at a call to __win_mark (a ~4 ms spin nothing else calls),
// found in the profile's own samples, so no clock is shared with the log (hrtime and the profiler differ on this machine).
// Refuses unless the profile holds exactly one marker per [window] line.
//   node scratch/ground-budget/profile/analyze.mjs <profile.log> <x.cpuprofile> [window,...] [top N]
import { readFileSync } from 'fs'
const [logPath, profPath, want = 'pre-stack,mat:asphalt,mat:treelawn:underived', topN = '15'] = process.argv.slice(2)
const marks = [...readFileSync(logPath, 'utf8').matchAll(/\[window\] (\S+) · ([^\n]*)/g)].map(m => ({ name: m[1], counts: m[2] }))
const P = JSON.parse(readFileSync(profPath, 'utf8'))
const byId = new Map(P.nodes.map(n => [n.id, n])), parent = new Map()
for (const n of P.nodes) for (const c of n.children || []) parent.set(c, n.id)
const inMark = (id) => { for (let x = id; x != null; x = parent.get(x)) if (byId.get(x).callFrame.functionName === '__win_mark') return true; return false }
const label = (n) => `${n.callFrame.functionName || '(anonymous)'} ${n.callFrame.url.split('/').slice(-2).join('/')}:${n.callFrame.lineNumber + 1}`
const t = new Float64Array(P.samples.length); let acc = P.startTime
for (let i = 0; i < P.samples.length; i++) { acc += P.timeDeltas[i]; t[i] = acc }
// marker clusters: runs of samples inside __win_mark, a new cluster after a gap of > 50 ms
const ends = []
for (let i = 0; i < t.length; i++) if (inMark(P.samples[i])) { if (!ends.length || t[i] - ends.at(-1).last > 5e4) ends.push({ first: t[i], last: t[i] }); else ends.at(-1).last = t[i] }
if (ends.length !== marks.length) throw new Error(`${ends.length} __win_mark cluster(s) in the profile but ${marks.length} [window] line(s) in the log`)
for (const name of want.split(',')) {
  const k = marks.findIndex(m => m.name === name)
  if (k < 0) { console.log(`== ${name}: ⛔ no such window in the log`); continue }
  const from = k ? ends[k - 1].last : P.startTime, to = ends[k].first
  const self = new Map(); let total = 0
  for (let i = 0; i < t.length - 1; i++) if (t[i] > from && t[i] < to) {
    const w = t[i + 1] - t[i], n = byId.get(P.samples[i]); total += w
    const L = label(n); self.set(L, (self.get(L) || 0) + w)
  }
  console.log(`== ${name}: ${(total / 1e6).toFixed(1)} s sampled · ${marks[k].counts}`)
  for (const [L, w] of [...self].sort((a, b) => b[1] - a[1]).slice(0, +topN))
    console.log(`  ${(w / 1e6).toFixed(2).padStart(8)} s  ${(100 * w / total).toFixed(1).padStart(5)}%  ${L}`)
}
