// memo-stream.mjs — the deformer's memo on conformity's REAL call stream (Boz's ask 2026-10-12, before the exact key is
// built): (1) distinct positions under today's 1 mm lattice key vs the exact key, on the same stream; (2) where the time
// goes: memo hits vs misses, and inside resolveUncached by phase (tileAt · nearest · pipRings · owners · profile · inBand).
// READ-ONLY. conformAndRefine at HEAD on a bake dump (deform.json + specs.ndjson + meta.json), as dumped, deform sampler.
// An instrumented copy of the deformer is written beside this probe (each edit asserted to match exactly once).
// Lattice distinct = the memo's own size (exact). Exact distinct = a HyperLogLog (2^16 registers, ~0.4% std error),
//   because V8's Map/Set caps at 16,777,216 entries — so the exact key in one Map would THROW past that count.
// The timers add their own cost; the totals are an upper bound, the split between phases is the reading.
//   node --max-old-space-size=14000 scratch/ground-height/memo-stream.mjs <dump dir>
import { readFileSync, writeFileSync, createReadStream } from 'fs'
import { createInterface } from 'readline'
import { createHash } from 'crypto'
const R = new URL('../../', import.meta.url).pathname
const { loadSceneTerrain } = await import(R + 'cartograph/terrainLoad.js')
const { waterLevels } = await import(R + 'cartograph/waterLevel.mjs')
const { conformAndRefine } = await import(R + 'cartograph/groundConformity.js')
const dir = process.argv[2]
if (!dir) throw new Error('usage: memo-stream.mjs <dump dir> | --check')

// ── the instrumented deformer ──
let src = readFileSync(R + 'cartograph/groundDeformer.mjs', 'utf8')
const edit = (from, to) => { if (src.split(from).length !== 2) throw new Error(`not found exactly once in groundDeformer.mjs — the probe is stale:\n${from}`); src = src.replace(from, to) }
edit("'../src/lib/lattice.js'", `'${R}src/lib/lattice.js'`)
edit(`    if (memo.has(mk)) return memo.get(mk)
    const v = resolveUncached(x, z); memo.set(mk, v); return v`,
`    PH.key += now() - _k; _k = now()
    if (memo.has(mk)) { const h = memo.get(mk); PH.hit += now() - _k; PH.hits++; return h }
    PH.look += now() - _k; _k = now()
    const v = resolveUncached(x, z); PH.miss += now() - _k; PH.misses++
    if (memo.size >= 16777215) { PH.capped++; return v }   // the probe never throws on the cap; it counts what would
    memo.set(mk, v); return v`)
edit('  function resolve(x, z) {\n', '  function resolve(x, z) {\n    let _k = now()\n')
edit('    const t = tileAt(x, z)\n    if (!t) { stats.outside++; return NONE }',
  '    let _a = now(); const t = tileAt(x, z); PH.tileAt += now() - _a\n    if (!t) { stats.outside++; return NONE }')
edit('    const n = nearest(t, x, z, CAP)\n    if (!n || n.d > CAP) { stats.deep++; return NONE }',
  '    _a = now(); const n = nearest(t, x, z, CAP); PH.nearest += now() - _a\n    if (!n || n.d > CAP) { stats.deep++; return NONE }')
edit('    if (!pipRings(x, z, t.iA) || n.d < 1e-9) return',
  '    _a = now(); const _pip = pipRings(x, z, t.iA); PH.pipRings += now() - _a\n    if (!_pip || n.d < 1e-9) return')
edit('    for (const c of owners(t, x, z, Math.min(CAP, REACH + LATTICE))) {',
  '    _a = now(); const _own = owners(t, x, z, Math.min(CAP, REACH + LATTICE)); PH.owners += now() - _a; PH.ownersN += _own.length ?? 0\n    for (const c of _own) {')
edit('      const p = profile(c, x, z)\n', '      _a = now(); const p = profile(c, x, z); PH.profile += now() - _a; PH.profileN++\n')
edit('    if (inBand(x, z)) { stats.unowned++;', '    _a = now(); const _ib = inBand(x, z); PH.inBand += now() - _a\n    if (_ib) { stats.unowned++;')
edit('    return { v: profile(n, x, z).v, owner: own(n) }\n  }',
  '    _a = now(); const _pv = profile(n, x, z).v; PH.profile += now() - _a; PH.profileN++\n    return { v: _pv, owner: own(n) }\n  }')
src = src.replace(/^(import [^\n]*\n)(?!import)/m, `$1const now = () => performance.now()\nexport const PH = { key: 0, hit: 0, look: 0, miss: 0, hits: 0, misses: 0, capped: 0, tileAt: 0, nearest: 0, pipRings: 0, owners: 0, ownersN: 0, profile: 0, profileN: 0, inBand: 0 }\n`)
if (!src.includes('export const PH')) throw new Error('could not place the timer table')
const instPath = new URL('./groundDeformer.instrumented.mjs', import.meta.url).pathname
writeFileSync(instPath, src)
const { buildDeformer, PH } = await import(instPath)
if (dir === '--check') { console.log(`[check] instrumented copy written and imported: ${instPath}`); process.exit(0) }

// ── HyperLogLog over the exact (x, z) bits ──
const M = 1 << 16, reg = new Uint8Array(M), f64 = new Float64Array(2), u32 = new Uint32Array(f64.buffer)
const mix = (h) => { h = Math.imul(h ^ (h >>> 16), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0 }
function hllAdd(x, z) {
  f64[0] = x; f64[1] = z
  let a = mix(u32[0] ^ mix(u32[1] ^ 0x9e3779b9)), b = mix(u32[2] ^ mix(u32[3] ^ a))
  a = mix(a ^ b ^ 0x7f4a7c15); b = mix(b + 0x632be5ab ^ a)
  const idx = a & (M - 1), rank = Math.clz32(b) + 1
  if (rank > reg[idx]) reg[idx] = rank
}
function hllCount() {
  let s = 0, zeros = 0; for (let i = 0; i < M; i++) { s += 2 ** -reg[i]; if (!reg[i]) zeros++ }
  const e = (0.7213 / (1 + 1.079 / M)) * M * M / s
  return e <= 2.5 * M && zeros ? M * Math.log(M / zeros) : e
}

// ── conformity, as the bake runs it, on the dump ──
const meta = JSON.parse(readFileSync(dir + '/meta.json', 'utf8')), T = loadSceneTerrain(meta.scene)
const A = JSON.parse(readFileSync(dir + '/deform.json', 'utf8'))
let t = Date.now()
const D = buildDeformer({ ...A, raw: T.getElevationRaw })
console.log(`[deformer] built in ${((Date.now() - t) / 1000).toFixed(1)} s`)
let calls = 0, ms = 0
const sampler = (x, z) => { calls++; hllAdd(x, z); const a = performance.now(); const y = (D.heightAt(x, z) ?? T.getElevationRaw(x, z)) * T.exag; ms += performance.now() - a; return y }
const L = T.water ? waterLevels(T.water) : null
const levels = L ? (x, z) => [L.lowAt(x, z) * T.exag, L.highAt(x, z) * T.exag] : null
const specs = []
for await (const line of createInterface({ input: createReadStream(dir + '/specs.ndjson'), crlfDelay: Infinity })) {
  if (!line) continue
  const s = JSON.parse(line), r = s.refine
  const refine = r && typeof r === 'object' ? { ...r, sampler: r.sampler ? sampler : null, band: r.band && levels ? { ...r.band, levels } : null } : r
  specs.push({ key: s.key, polys: s.polys, refine, yLift: s.yLift })
}
t = Date.now()
const st = {}, out = conformAndRefine(specs, st)
const sec = (Date.now() - t) / 1000, tris = out.reduce((n, b) => n + b.indices.length / 3, 0)
const h = createHash('sha256')
for (const b of out) for (const a of [b.positions, b.indices, b.side]) { h.update(String(a?.length ?? -1)); if (a) h.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)) }
console.log(`[conform] ${sec.toFixed(1)} s · ${tris} tris · refTJ ${st.refineTJunctions} · hash ${h.digest('hex')} (the timers do not change the mesh; compare to an untimed run)`)

// ── the readings ──
const s = (v) => `${(v / 1000).toFixed(1)} s`, us = (v, n) => `${(v * 1000 / Math.max(1, n)).toFixed(2)} µs`
console.log(`[stream] ${calls} sampler calls · ${s(ms)} in the sampler (${us(ms, calls)}/call)`)
console.log(`[distinct] lattice key (the memo's size): ${PH.misses} resolves (capped ${PH.capped}) · exact key (HLL, ±~0.4%): ${Math.round(hllCount())} · ratio ${(hllCount() / Math.max(1, PH.misses)).toFixed(3)}`)
console.log(`[cap] V8 Map holds at most 16,777,216 entries: the exact key in one Map ${hllCount() > 16777216 ? 'WOULD THROW on this stream' : 'fits on this stream'}; the lattice memo ${PH.capped ? `hit the cap (${PH.capped} resolves not stored)` : 'stayed under it'}`)
let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity
for (const g of specs) for (const p of g.polys) for (const [x, z] of p.outer) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z }
const km2 = (x1 - x0) * (z1 - z0) / 1e6, CAP = 16777216
console.log(`[headroom] lattice memo ${PH.misses} of ${CAP} cells (${(100 * PH.misses / CAP).toFixed(1)}%, ${(CAP / Math.max(1, PH.misses)).toFixed(2)}× headroom) · ${Math.round(PH.misses / Math.max(1e-9, km2))} cells/km² of the input's bbox (${km2.toFixed(2)} km²) · ${(PH.misses / Math.max(1, tris)).toFixed(2)} cells/output tri · a town crosses the cap past ~${(CAP / Math.max(1, PH.misses / Math.max(1e-9, km2))).toFixed(2)} km² at THIS density (a projection, not a measurement: density varies by town)`)
console.log(`[resolve] key build ${s(PH.key)} · hits ${PH.hits} in ${s(PH.hit)} (${us(PH.hit, PH.hits)}) · lookup on a miss ${s(PH.look)} · misses ${PH.misses} in ${s(PH.miss)} (${us(PH.miss, PH.misses)})`)
const phases = ['tileAt', 'nearest', 'pipRings', 'owners', 'profile', 'inBand'], inner = phases.reduce((n, k) => n + PH[k], 0)
console.log(`[resolveUncached] ${phases.map(k => `${k} ${s(PH[k])}`).join(' · ')} · the rest ${s(PH.miss - inner)} · owners ${(PH.ownersN / Math.max(1, PH.misses)).toFixed(2)}/miss · profile ${(PH.profileN / Math.max(1, PH.misses)).toFixed(2)}/miss`)
console.log(`[stats] ${JSON.stringify(D.stats)}`)
