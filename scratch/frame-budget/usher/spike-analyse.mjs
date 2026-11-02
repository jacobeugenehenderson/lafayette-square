// spike-analyse.mjs <spike-<town>-x<thr>.cpuprofiles.json> — offline. A "busy span" is a run of consecutive samples that are
// not (idle): one long frame's main-thread work, whatever task it is (R3F's loop, a frameSlices port message, React's
// scheduler). For each flight's three longest spans: the top-level task, the self time by function, and the nearest kit
// function on each sample's stack (the kit = ward-kit/src, read through /@fs). Sampling interval 200 µs at 4x CPU.
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
const buf = readFileSync(process.argv[2]), P = JSON.parse(process.argv[2].endsWith('.gz') ? gunzipSync(buf) : buf)
const where = (cf) => { const u = cf.url.replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '').replace(/^\/@fs/, '')
  const m = u.match(/\/ward-kit\/(src\/.*)$/) || u.match(/\/lafayette-square\.nosync\/(src\/.*)$/); if (m) return 'kit:' + m[1]
  if (/\.vite\/deps\//.test(u)) return 'dep:' + u.split('deps/').pop().replace(/\.js$/, '')
  if (u.startsWith('/src/')) return 'ward:' + u.slice(1)
  return u || '(native)' }
const name = (cf) => `${cf.functionName || '(anon)'} ${where(cf)}${cf.url ? ':' + (cf.lineNumber + 1) : ''}`
const r1 = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${Math.round(v)}ms ${k}`)
const res = P.map((p, fi) => {
  const byId = new Map(p.nodes.map(n => [n.id, n]))
  for (const n of p.nodes) for (const c of n.children || []) byId.get(c).parent = n.id
  const stackOf = (id) => { const s = []; for (let n = byId.get(id); n; n = byId.get(n.parent)) s.push(n); return s.slice(0, -1) } // drop (root)
  const spans = []; let cur = null
  for (let i = 0; i < p.samples.length; i++) {
    const dt = (p.timeDeltas[i + 1] ?? 0) / 1000, st = stackOf(p.samples[i]), leaf = st[0]?.callFrame.functionName
    if (leaf === '(idle)') { cur = null; continue }
    if (!cur) { cur = { ms: 0, s: [] }; spans.push(cur) }
    cur.ms += dt; cur.s.push([st, dt])
  }
  spans.sort((a, b) => b.ms - a.ms)
  return { flight: fi + 1, spans: spans.length, top: spans.slice(0, 3).map(sp => {
    const task = {}, self = {}, kit = {}
    for (const [st, dt] of sp.s) {
      const t = st[st.length - 1]; const tk = t ? name(t.callFrame) : '?'; task[tk] = (task[tk] || 0) + dt
      self[name(st[0].callFrame)] = (self[name(st[0].callFrame)] || 0) + dt
      const k = st.find(n => /^(kit|ward):/.test(where(n.callFrame))); const kn = k ? name(k.callFrame) : '(no kit/ward frame: ' + (st[0]?.callFrame.functionName || '?') + ')'; kit[kn] = (kit[kn] || 0) + dt
    }
    return { ms: Math.round(sp.ms), task: r1(task, 4), self: r1(self, 8), nearestKit: r1(kit, 8) }
  }) }
})
for (const f of res) { console.log(`\n=== flight ${f.flight} (${f.spans} busy spans)`); for (const s of f.top) { console.log(`-- span ${s.ms} ms`); console.log('  task:  ' + s.task.join(' | ')); console.log('  self:  ' + s.self.join('\n         ')); console.log('  kit:   ' + s.nearestKit.join('\n         ')) } }
