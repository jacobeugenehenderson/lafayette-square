// load-summary.mjs — summarise scratch/browse-perf/load.mjs --profile output (one JSON per run per line): reveal, bytes,
// long tasks, and the long tasks whose inclusive stack reaches the revetment (SlabRevetment / revetmentDrape).
// ▶ node scratch/far-shore/load-summary.mjs <file.jsonl> [label]
import { readFileSync } from 'node:fs'
const [file, label = file] = process.argv.slice(2)
const runs = readFileSync(file, 'utf8').split('\n').filter(l => l.startsWith('{"run"')).map(l => JSON.parse(l))
const rev = (t) => (t.inclusive || []).some(([, f]) => /SlabRevetment|revetmentDrape|revetmentFromSlab/.test(f))
const terr = (t) => (t.top || []).some(([, f]) => /_PlaneGeometry/.test(f))
for (const r of runs) {
  const long = r.long || [], tasks = r.tasks || [], rt = tasks.filter(rev), tt = tasks.filter(terr)
  console.log(`${label} run ${r.run}: reveal ${(r.reveal / 1000).toFixed(1)} s · ${r.total.mb} MB / ${r.total.n} req · long tasks ${long.length}, Σ ${(long.reduce((s, t) => s + t.ms, 0) / 1000).toFixed(1)} s · revetment tasks >200 ms: ${rt.length}${rt.length ? ` (max ${Math.max(...rt.map(t => t.ms))} ms, Σ ${rt.reduce((s, t) => s + t.ms, 0)} ms)` : ''} · Terrain PlaneGeometry tasks: ${tt.length}${tt.length ? ` (${tt.map(t => t.ms).join(', ')} ms)` : ''}${r.failed?.length ? ` · FAILED ${r.failed}` : ''}${r.timedOut ? ' · TIMED OUT' : ''}`)
}
