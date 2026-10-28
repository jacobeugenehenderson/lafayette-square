import { readFileSync, existsSync, writeFileSync } from 'node:fs'
const [town, dev] = process.argv.slice(2)
const R = JSON.parse(readFileSync(`raw-${town}-${dev}.json`, 'utf8'))
const srcCache = existsSync('src-cache.json') ? JSON.parse(readFileSync('src-cache.json', 'utf8')) : {}
async function src(url) { if (!(url in srcCache)) { try { srcCache[url] = await (await fetch(url)).text() } catch { srcCache[url] = '' } } return srcCache[url] }
function offsetOf(text, line, col) { let o = 0; for (let i = 0; i < line; i++) { o = text.indexOf('\n', o) + 1 } return o + col }
const IDENT = [
  ['index', /aBuildingId|idToNum|byNum|refusing buildings\.json|predates the raised kerb|buildingCount|buildingMap|slabBuildingIndex/],
  ['hover', /onPointerMove|onPointerOver|pointermove|setHovered|clearHovered|hoveredId|acceleratedRaycast|boundsTree|intersectObject/],
]
async function classify(prof) {
  const byId = new Map(prof.nodes.map((n) => [n.id, n])); const parent = new Map()
  for (const n of prof.nodes) for (const c of n.children || []) parent.set(c, n.id)
  const tag = new Map()
  for (const n of prof.nodes) {
    const cf = n.callFrame; let t = null
    if (cf.url && /_ward\//.test(cf.url) && cf.lineNumber >= 0) {
      const s = await src(cf.url); const o = offsetOf(s, cf.lineNumber, cf.columnNumber); const snip = s.slice(o, o + 1500)
      for (const [k, re] of IDENT) if (re.test(snip)) { t = k; break }
      n._snip = snip.slice(0, 120)
    }
    tag.set(n.id, t)
  }
  const stackTag = new Map()
  const st = (id) => { if (stackTag.has(id)) return stackTag.get(id); const p = parent.get(id); const v = tag.get(id) || (p != null ? st(p) : null); stackTag.set(id, v); return v }
  const sum = { total: 0, idle: 0, program: 0, gc: 0, index: 0, hover: 0 }; const self = new Map()
  prof.samples.forEach((id, i) => { const dt = (prof.timeDeltas[i + 1] ?? 0) / 1000; const n = byId.get(id); const name = n.callFrame.functionName
    if (name === '(idle)') { sum.idle += dt; return } sum.total += dt
    if (name === '(program)') sum.program += dt; else if (name === '(garbage collector)') sum.gc += dt
    const t = st(id); if (t) sum[t] += dt
    const k = `${name || '(anon)'}|${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber}:${n.callFrame.columnNumber}`; self.set(k, (self.get(k) || 0) + dt) })
  for (const k in sum) sum[k] = Math.round(sum[k])
  const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => [Math.round(v), k.slice(0, 70)])
  return { sum, top }
}
const ivals = (a, b) => { const r = R.raf.filter((t) => t >= a && t <= b); const d = []; for (let i = 1; i < r.length; i++) d.push(r[i] - r[i - 1]); return d }
const q = (d, p) => { const s = [...d].sort((x, y) => x - y); return s.length ? Math.round(s[Math.floor(p * (s.length - 1))] * 10) / 10 : null }
const fr = R.out.frames
const mv = ivals(fr.tMove, fr.tMoveEnd)
let lastHitch = null; { const r = R.raf.filter((t) => t >= fr.tMove && t <= fr.tMoveEnd); for (let i = 1; i < r.length; i++) if (r[i] - r[i - 1] > 50) lastHitch = Math.round(r[i] - fr.tMove) }
const steady = ivals(fr.tMoveEnd - 8000, fr.tMoveEnd)
const res = { town, dev, build: R.out.build?.slice(0, 8), fcp: R.out.marks['first-contentful-paint'], revealed: R.out.revealed, prepBuildings: R.out.marks['prepared:buildings'], prepGround: R.out.marks['prepared:ground'], prepTrees: R.out.marks['prepared:trees'], reveal: R.out.marks.reveal, usable: R.out.marks['first-truthful-frame'],
  move: { frames: mv.length, med: q(mv, 0.5), p95: q(mv, 0.95), hitches50: mv.filter((x) => x > 50).length, lastHitchAfterInput: lastHitch, steadyMed: q(steady, 0.5), steadyP95: q(steady, 0.95) },
  click: R.out.click && { domMs: Math.round(R.out.click.dom), paintMs: Math.round(R.out.click.firstPaint ?? -1) } }
if (fr.tHov) { const h = ivals(fr.tHov[0], fr.tHov[1]); res.hoverFrames = { med: q(h, 0.5), p95: q(h, 0.95) } }
const reqs = R.req.filter((r) => r.bytes != null).map((r) => ({ u: r.url.replace(/^https?:\/\/[^/]+/, ''), kb: Math.round(r.bytes / 1024), ms: Math.round((r.t1 - r.t0) * 1000) }))
res.bytesTotalKB = reqs.reduce((s, r) => s + r.kb, 0)
res.identityReqs = reqs.filter((r) => /buildings|\.ids\.json|listings|addresses|index/i.test(r.u) && !/hero-impostor/.test(r.u))
res.bigReqs = reqs.sort((a, b) => b.kb - a.kb).slice(0, 8)
for (const k of ['profLoad', 'profMove', 'profHover', 'profClick']) if (R[k]) res[k] = await classify(R[k])
writeFileSync('src-cache.json', JSON.stringify(srcCache))
console.log(JSON.stringify(res, null, 1))
