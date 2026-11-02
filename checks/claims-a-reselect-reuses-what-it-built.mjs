// claims-a-reselect-reuses-what-it-built.mjs — THE NEAR LAYER BUILDS EACH STONE CHUNK ONCE, AND AN UNCHANGED NEAR SET
// HANDS REACT NOTHING.
//
// THE CLASS (Usher, 2026-11-02; BRIEF-a-frame-budget-for-every-shot): work a camera reselect re-does although its inputs did
// not change. SlabRevetment's near layer reselects on nearly every frame of a flight; it re-resolved every chosen stone chunk
// (shoreChunks.js#resolveWindow, a drawn-ground read per stone) and handed React new arrays each time: 1.3–1.8 s of a
// 1.8–2.4 s frame at 4× on Huron and Provincetown (▶ scratch/frame-budget/usher/spike-analyse.mjs).
// ⭐ HOW IT DECIDES:
//   BEHAVIOUR, on every coastal town's slab (public/baked/<town>/, the faces seated by the bake's own prepareFaces, the
//   stone context by the player's own revetmentNear.js#stoneContext), at EVERY stone chunk of every face:
//     1 · CACHED = FRESH: stonesOf's stones deep-equal (p, q, s, i, c, ground, groundY, id: every field) a fresh resolve of
//         the same chunk (chunkStones on a new context, the drawn ground's parts subtracted: the pre-cache path, 9bf8c976);
//     2 · BUILT ONCE: a second stonesOf of the same chunk returns the SAME array (===).
//     It reports each town's whole-shore stone count, the time to build each chunk once, and the finished stones' heap per
//     chunk (the figure the window bound, judges 7 and 8, is for).
//   SOURCE, read from src/components/SlabRevetment.jsx (babel; never a copy of it):
//     3 · the stones cache is made with the faces: `stones: new Map()` inside the `faces` useMemo, whose deps name doc and
//         groundGen (a town switch, a re-bake, a terrain or drawn-ground reload clear it, and nothing else does);
//     4 · the near useTownFrame returns before setBuilt when the near set's signature (nearSignature) is unchanged;
//     5 · the drape meshes are keyed by chunk key, never by array index;
//     6 · no component calls chunkStones: stones reach the map only through stonesOf;
//     7 · (planted, no slab) retainStones keeps exactly the chunks of the current near set and the one before, and the
//         shore's candidate memo exactly the windows those chunks read (each ± STONE_MARGIN);
//     8 · the near useTownFrame calls retainStones, so the cache is bounded by the window, never a session's whole shore;
//     9 · the near useTownFrame builds nothing itself (no revetmentDrape / groundRelative / stonesOf): its missing work goes
//         to runSliced(buildPending(…)), between frames;
//     10 · a near key is added only for a built drape chunk, so a pending chunk's far stays drawn (the shore is never bare);
//     11 · (planted) missingWork queues the missing chunks nearest the camera first.
// ▶ node checks/claims-a-reselect-reuses-what-it-built.mjs [--slab=<dir holding <town>/>] [--town=<id>] [--mutants]
//   --mutants: the cache bypassed → 2 · a stone's drawn-ground y, or its raw ground, not subtracted → 1 · the early return removed → 4 · the drape
//   keyed by index → 5 · groundGen dropped from the faces' deps → 3 · the cache hoisted out of the faces → 3 · a component
//   resolving its own stones → 6 · retention keeps everything → 7 · the candidate memo unbounded, or kept without the window → 7 · retention forgets the
//   previous set → 7 · the retention
//   call removed → 8 · the first use built in the frame again → 9 · the far hidden while its near is pending → 10 · the queue
//   farthest first → 11. Each must turn it RED.
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdtempSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { isDeepStrictEqual } from 'node:util'

if (typeof global.gc !== 'function') {   // the heap figure needs a settled heap: run again with the collector exposed
  const r = spawnSync(process.execPath, ['--expose-gc', fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: 'inherit' })
  process.exit(r.status ?? 1)
}
const require = createRequire(import.meta.url)
const { parse } = require('@babel/parser'), traverse = require('@babel/traverse').default
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const NEAR = join(ROOT, 'src/lib/revetmentNear.js'), REVETMENT = join(ROOT, 'src/components/SlabRevetment.jsx')
const arg = (n, d) => process.argv.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const SLAB = arg('slab', join(ROOT, 'public/baked')), ONLY = arg('town', null)
const { prepareFaces } = await import(pathToFileURL(join(ROOT, 'cartograph/bake-revetment-far.js')).href)
const { chunkStones } = await import(pathToFileURL(join(ROOT, 'src/lib/shoreChunks.js')).href)
const { boulderPalette } = await import(pathToFileURL(join(ROOT, 'src/lib/boulderGeometry.js')).href)
const bad = [], say = (ok, line) => { console.log(`  ${ok ? '✅' : '⛔'} ${line}`); if (!ok) bad.push(line) }

// a copy of revetmentNear.js with one edit, its imports made absolute so it loads from the OS temp dir
const nearWith = (a, b) => { const src = readFileSync(NEAR, 'utf8')
  if (a && !src.includes(a)) throw new Error(`⛔ mutant target gone from revetmentNear.js: ${JSON.stringify(a)}`)
  const out = join(mkdtempSync(join(tmpdir(), 'near-')), 'revetmentNear.mjs')
  writeFileSync(out, (a ? src.replace(a, b) : src).replace("from './shoreChunks.js'", `from '${pathToFileURL(join(ROOT, 'src/lib/shoreChunks.js')).href}'`)
    .replace("from './refusal.js'", `from '${pathToFileURL(join(ROOT, 'src/lib/refusal.js')).href}'`))
  return import(pathToFileURL(out).href) }

// ── BEHAVIOUR ────────────────────────────────────────────────────────────────
const ab = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
const towns = existsSync(SLAB) ? readdirSync(SLAB).filter(t => (!ONLY || t === ONLY) && ['revetment.json', 'ground.json', 'ground.bin', 'terrain.json', 'terrain.bin'].every(f => existsSync(join(SLAB, t, f)))) : []
function seat(t) {
  const rd = (f) => readFileSync(join(SLAB, t, f)), revetment = JSON.parse(rd('revetment.json'))
  if (!Number.isFinite(revetment.seed)) throw new Error(`⛔ ${t}: revetment.json carries no seed`)
  const { faces, parts } = prepareFaces({ revetment, terrainJson: JSON.parse(rd('terrain.json')), terrainBin: ab(rd('terrain.bin')), groundJson: JSON.parse(rd('ground.json')), groundBin: ab(rd('ground.bin')) })
  const paletteSize = boulderPalette({ seed: revetment.seed }).length
  return { faces, parts, paletteSize, seed: revetment.seed }
}
/** Judge every stone chunk of every face of every town with module M; returns the failures (first few per judge). Each
 *  face is built, judged and dropped before the next, so the check never holds a shore. */
function behaviour(M, seated, { report = false } = {}) {
  const fails = []
  for (const { t, faces, parts, paletteSize, seed } of seated) {
    let n = 0, chunks = 0, ms = 0, neq = 0, notOnce = 0
    for (const f0 of faces) {
      const f = { ...f0, ctx: M.stoneContext(f0, { paletteSize, seed }), stones: new Map() }, ref = M.stoneContext(f0, { paletteSize, seed })
      for (let ci = 0; ci < f.ctx.nChunks; ci++) {
        const t0 = performance.now(), a = M.stonesOf(f, ci, parts); ms += performance.now() - t0
        chunks++; n += a.length
        if (M.stonesOf(f, ci, parts) !== a) notOnce++
        const fresh = chunkStones(ref, ci, 2).map(st => { const g = parts(st.p[0], st.p[2]); return { ...st, p: [st.p[0], st.p[1] - g.raw - g.y, st.p[2]], ground: g.raw, groundY: g.y } })
        if (!isDeepStrictEqual(a, fresh)) { neq++; if (neq <= 3) fails.push(`1 · ${t} ${f.key} chunk ${ci}: cached ≠ fresh (${a.length} vs ${fresh.length} stones)`) }
      }
    }
    if (report) {
      // the finished stones' heap, on the town's largest face: its candidates warmed first (shoreChunks.js's memo, not this
      // cache), so the second figure is the stones alone. ⚠️ A stone shares its q/s/c arrays with its candidate, so this is the
      // stones' own share: what the cache adds while the candidate memo holds the rest.
      const big = [...faces].sort((a, b) => b.poly.length - a.poly.length)[0]
      const f = { ...big, ctx: M.stoneContext(big, { paletteSize, seed }), stones: new Map() }
      for (let ci = 0; ci < f.ctx.nChunks; ci++) chunkStones(f.ctx, ci, 2)
      global.gc(); const h1 = process.memoryUsage().heapUsed
      let m = 0; for (let ci = 0; ci < f.ctx.nChunks; ci++) m += M.stonesOf(f, ci, parts).length
      global.gc(); const kb = (process.memoryUsage().heapUsed - h1) / 1e3 / f.ctx.nChunks
      console.log(`  · ${t}: ${faces.length} armoured faces, ${chunks} stone chunks, ${n} stones; each built once in ${Math.round(ms)} ms in all (${(ms / Math.max(1, chunks)).toFixed(1)} ms a chunk, here at 1×). The cache's own share, measured on the largest face (${f.ctx.nChunks} chunks, ${m} stones): ${kb.toFixed(0)} KB a chunk, so ~${(kb * chunks / 1e3).toFixed(0)} MB for the whole shore (inferred from that face), which the window bound never holds`)
    }
    if (notOnce) fails.push(`2 · ${t}: ${notOnce} of ${chunks} chunks built again on the second ask`)
  }
  return fails
}
/** 11 · (planted) missingWork orders the missing chunks nearest the camera first, drape and stones together. */
function nearestFirst(M) {
  const ctx = { total: 100, at: (sv) => ({ x: sv, z: 0 }) }
  const f = { key: 'p', at: [{ x: 90, z: 0 }, { x: 5, z: 0 }], ctx }
  const jobs = M.missingWork([[f, 0], [f, 1]], [[f, 3], [f, 6]], { x: 40, z: 0 })   // stone 3 at s=42, stone 6 at s=78
  const got = jobs.map(j => j.key).join(','), want = 'p@3,p#1,p@6,p#0'   // d: 2, 35, 38, 50
  return got === want ? [] : [`11 · missingWork ordered [${got}], not nearest first [${want}]`]
}

/** 7 · retainStones keeps exactly the chunks of this near set and the one before, on a planted face (no slab needed). */
function retention(M) {
  const cand = (n) => ({ _cand: new Map(Array.from({ length: n }, (_, c) => [c, [c]])) })
  const fails = [], f = { key: 'planted', stones: new Map([0, 1, 2, 3, 4, 5].map(ci => [ci, [ci]])), ctx: cand(20) }, g = { key: 'other', stones: new Map([[9, [9]]]), ctx: cand(20) }
  M.retainStones([f, g], [[f, 3], [f, 4]], [[f, 1], [g, 9]])
  const ks = (m) => [...m.keys()].sort((a, b) => a - b).join(',')
  if (ks(f.stones) !== '1,3,4') fails.push(`7 · retainStones kept chunks [${ks(f.stones)}] of a face whose near set is [3,4] after [1]: it must keep exactly 1,3,4`)
  if (ks(g.stones) !== '9') fails.push(`7 · retainStones dropped a chunk of the previous near set on another face`)
  // the candidate memo: exactly what the kept chunks' windows read (each ± the margin), on both faces
  const win = (cs) => [...new Set(cs.flatMap(c => Array.from({ length: 2 * M.STONE_MARGIN + 1 }, (_, i) => c - M.STONE_MARGIN + i)))].filter(c => c >= 0 && c < 20).sort((a, b) => a - b).join(',')
  if (ks(f.ctx._cand) !== win([1, 3, 4])) fails.push(`7 · the candidate memo kept [${ks(f.ctx._cand)}], not the windows of the kept chunks [${win([1, 3, 4])}]`)
  if (ks(g.ctx._cand) !== win([9])) fails.push(`7 · the other face's candidate memo kept [${ks(g.ctx._cand)}], not [${win([9])}]`)
  return fails
}

// ── SOURCE ───────────────────────────────────────────────────────────────────
const parseSrc = (src) => parse(src, { sourceType: 'module', plugins: ['jsx'] })
function source(src, components) {
  const fails = [], ast = parseSrc(src)
  let facesMemo = null, near = null, drapeKey = null
  traverse(ast, {
    VariableDeclarator(p) {
      if (p.node.id.name === 'faces' && p.node.init?.type === 'CallExpression' && p.node.init.callee.name === 'useMemo') facesMemo = p.get('init')
    },
    CallExpression(p) {
      if (p.node.callee.name !== 'useTownFrame' || near) return
      let sets = false; p.traverse({ CallExpression(q) { if (q.node.callee.name === 'setBuilt') sets = true } })
      if (sets) near = p
    },
    JSXAttribute(p) {
      if (p.node.name.name !== 'key') return
      const map = p.findParent(q => q.isCallExpression() && q.node.callee.property?.name === 'map' && q.node.callee.object?.property?.name === 'drape')
      if (map) drapeKey = { attr: p.node, params: map.node.arguments[0].params.map(x => x.name) }
    },
  })
  // 3 · the cache is made with the faces, which re-make on doc and groundGen
  if (!facesMemo) fails.push('3 · no `faces` useMemo in SlabRevetment.jsx')
  else {
    const deps = (facesMemo.node.arguments[1]?.elements || []).map(e => e.name)
    let made = false; facesMemo.traverse({ ObjectProperty(q) { if (q.node.key.name === 'stones' && q.node.value.type === 'NewExpression' && q.node.value.callee.name === 'Map') made = true } })
    if (!made) fails.push('3 · the faces do not each make their own `stones: new Map()` (a cache outside them outlives a re-bake or a ground reload)')
    for (const d of ['doc', 'groundGen']) if (!deps.includes(d)) fails.push(`3 · the faces' deps [${deps.join(', ')}] do not name ${d}: the stones cache would outlive it`)
  }
  // 4 · an unchanged signature returns before setBuilt
  if (!near) fails.push('4 · no near useTownFrame calling setBuilt')
  else {
    let guarded = false, sigFromNearSignature = false
    near.traverse({
      VariableDeclarator(q) { if (q.node.id.name === 'sig' && q.node.init?.callee?.name === 'nearSignature') sigFromNearSignature = true },
      IfStatement(q) {
        const ret = q.node.consequent.type === 'ReturnStatement' || q.node.consequent.body?.[0]?.type === 'ReturnStatement'
        let usesSig = false; q.get('test').traverse({ Identifier(r) { if (r.node.name === 'sig') usesSig = true } })
        if (!(ret && usesSig)) return
        // it must come before the setBuilt in the same body
        let after = false; q.getAllNextSiblings().forEach(s => s.traverse?.({ CallExpression(r) { if (r.node.callee.name === 'setBuilt') after = true } }) ?? null)
        if (after) guarded = true
      },
    })
    let retains = false; near.traverse({ CallExpression(q) { if (q.node.callee.name === 'retainStones') retains = true } })
    if (!retains) fails.push('8 · the near useTownFrame never calls retainStones: the stones cache grows with every chunk a session visits')
    // 9 · the first use leaves the frame: the hook itself builds nothing (it queues; buildPending, run by runSliced, builds)
    let builds = []; near.traverse({ CallExpression(q) { const c = q.node.callee.name; if (['revetmentDrape', 'groundRelative', 'stonesOf'].includes(c)) builds.push(c) } })
    if (builds.length) fails.push(`9 · the near useTownFrame builds in the frame (${[...new Set(builds)].join(', ')}): a first use lands in one frame again`)
    let slices = false; near.traverse({ CallExpression(q) { if (q.node.callee.name === 'runSliced' && q.node.arguments[0]?.callee?.name === 'buildPending') slices = true } })
    if (!slices) fails.push('9 · the near useTownFrame does not hand its missing work to runSliced(buildPending(…))')
    // 10 · a pending chunk's FAR stays drawn: a near key is added only for a drape chunk that is built (inside an `if` on `built`)
    let bare = 0; near.traverse({ CallExpression(q) {
      if (q.node.callee.property?.name !== 'add' || q.node.callee.object?.name !== 'nearKeys') return
      const guard = q.findParent(r => r.isIfStatement()); let onBuilt = false
      if (guard) guard.get('test').traverse({ Identifier(r) { if (r.node.name === 'built') onBuilt = true } })
      if (!onBuilt) bare++ } })
    if (bare) fails.push(`10 · ${bare} near key(s) added for a chunk not yet built: its far chunk is hidden while the near is pending, and the shore is bare`)
    if (!sigFromNearSignature) fails.push('4 · the near set\'s `sig` is not revetmentNear.js#nearSignature')
    if (!guarded) fails.push('4 · the near useTownFrame reaches setBuilt without returning on an unchanged signature: every reselect hands React new arrays')
  }
  // 5 · the drape meshes are keyed by chunk key
  if (!drapeKey) fails.push('5 · no key on the drape meshes')
  else {
    const e = drapeKey.attr.value.expression
    const byIndex = e?.type === 'Identifier' && drapeKey.params.indexOf(e.name) === 1
    const byChunk = e?.type === 'MemberExpression' && e.property.name === 'key'
    if (byIndex || !byChunk) fails.push('5 · the drape meshes are not keyed by their chunk key (an index key rebinds every mesh when the set shifts)')
  }
  // 6 · no component resolves its own stones
  for (const [file, s] of components) { let hit = false
    traverse(parseSrc(s), { CallExpression(q) { if (q.node.callee.name === 'chunkStones' || q.node.callee.name === 'resolveWindow') hit = true } })
    if (hit) fails.push(`6 · ${file} resolves stones itself (chunkStones/resolveWindow), not through revetmentNear.js#stonesOf`) }
  return fails
}
const COMP = join(ROOT, 'src/components')
const components = readdirSync(COMP).filter(f => /\.jsx?$/.test(f)).map(f => [`src/components/${f}`, readFileSync(join(COMP, f), 'utf8')])
const REV_SRC = readFileSync(REVETMENT, 'utf8')

// ── RUN ──────────────────────────────────────────────────────────────────────
console.log('── a reselect reuses what it built (revetmentNear.js, SlabRevetment.jsx)')
if (!towns.length) say(false, `no coastal town's slab under ${SLAB}: pass --slab=<dir holding <town>/>`)
const seated = []
for (const t of towns) { const s = seat(t); if (!s.faces.length) { console.log(`  · ${t}: no armoured face (an inland or bare shore), nothing to judge`); continue } seated.push({ t, ...s }) }
if (towns.length && !seated.length) say(false, 'no town has an armoured face: nothing was judged')
const M = await nearWith(null)
const bf = behaviour(M, seated, { report: true })
say(!bf.length && seated.length > 0, `every stone chunk of ${seated.map(s => s.t).join(', ') || 'no town'}: cached = fresh, built once` + (bf.length ? `\n      ${bf.join('\n      ')}` : ''))
const sf = source(REV_SRC, components)
const nf = nearestFirst(M)
say(!nf.length, 'missingWork queues the missing chunks nearest the camera first' + (nf.length ? `\n      ${nf.join('\n      ')}` : ''))
const rf = retention(M)
say(!rf.length, 'retainStones keeps this near set and the one before, and the candidates their windows read, nothing else' + (rf.length ? `\n      ${rf.join('\n      ')}` : ''))
say(!sf.length, `SlabRevetment: the cache is made with the faces and bounded by the window, an unchanged near set returns before setBuilt, the drape is keyed by chunk, stones only through stonesOf` + (sf.length ? `\n      ${sf.join('\n      ')}` : ''))

if (process.argv.includes('--mutants')) {
  console.log('── mutants (each must turn it RED)')
  // the behaviour mutants run on the smallest seated town's first face only: a mutant needs one failing chunk, not a shore
  // ⭐ each behaviour mutant runs on a face whose stones make it visible: any face for the cache; for the ground mutants a face
  // whose stones stand on a non-zero raw ground, or a non-zero drawn-ground y (searched chunk by chunk: a face's first chunk may
  // stand off the drawn mesh, where y is 0). A slab with no such face cannot judge that mutant, and says so.
  const faceWhere = (pred) => { for (const st of seated) for (const f0 of st.faces) { const ctx = M.stoneContext(f0, st)
    for (let ci = 0; ci < ctx.nChunks; ci++) if (chunkStones(ctx, ci, 2).some(x => pred(st.parts(x.p[0], x.p[2])))) return [{ ...st, faces: [f0] }] } return [] }
  const any = seated.length ? [{ ...[...seated].sort((a, b) => a.faces.length - b.faces.length)[0], faces: [[...seated].sort((a, b) => a.faces.length - b.faces.length)[0].faces[0]] }] : []
  const onRaw = faceWhere(g => g.raw !== 0), onY = faceWhere(g => g.y !== 0)
  if (seated.length && !onY.length) bad.push(`no face of ${seated.map(x => x.t).join(', ')} stands on a non-zero drawn-ground y: the y mutant cannot be judged on these slabs (run every town)`)
  let alive = 0
  const judge = (name, fails) => { const caught = fails.length > 0; console.log(`  mutant: ${name} → ${caught ? 'RED ✓' : 'GREEN ✗'}`); if (!caught) alive++ }
  judge('the cache bypassed', behaviour(await nearWith('  if (hit) return hit\n', ''), any))
  if (onY.length) judge('a stone\'s drawn-ground y not subtracted', behaviour(await nearWith('st.p[1] - g.raw - g.y', 'st.p[1] - g.raw'), onY))
  if (onRaw.length) judge('a stone\'s raw ground not subtracted', behaviour(await nearWith('st.p[1] - g.raw - g.y', 'st.p[1] - g.y'), onRaw)); else bad.push('no face stands on a non-zero raw ground: the raw mutant cannot be judged')
  judge('retention keeps everything', retention(await nearWith('if (!keep.get(f).has(ci)) f.stones.delete(ci)', 'if (false) f.stones.delete(ci)')))
  judge('the candidate memo left unbounded', retention(await nearWith('    retainCandidates(f.ctx, keep.get(f), STONE_MARGIN)\n', '')))
  judge('the candidate memo kept to the chunks alone, no window', retention(await nearWith('retainCandidates(f.ctx, keep.get(f), STONE_MARGIN)', 'retainCandidates(f.ctx, keep.get(f), 0)')))
  judge('retention forgets the previous near set', retention(await nearWith('  for (const [f, ci] of before) keep.get(f)?.add(ci)\n', '')))
  const rev = (a, b) => { if (!REV_SRC.includes(a)) throw new Error(`⛔ mutant target gone from SlabRevetment.jsx: ${JSON.stringify(a)}`); return REV_SRC.replace(a, b) }
  judge('the early return removed', source(rev('lastSet.current.sig === sig) return', 'lastSet.current.sig === sig) {}'), components))
  judge('the drape keyed by index', source(rev('{built.drape.map(d => (\n        <mesh key={d.key}', '{built.drape.map((d, i) => (\n        <mesh key={i}'), components))
  judge('groundGen dropped from the faces\' deps', source(rev('}, [doc, palette, groundGen])\n\n  const [built', '}, [doc, palette])\n\n  const [built'), components))
  judge('the cache hoisted out of the faces', source(rev('cache: new Map(), stones: new Map(), failed', 'cache: new Map(), stones: STONES, failed'), components))
  judge('the retention call removed', source(rev('    retainStones(faces, stoneAt, lastSet.current?.stoneAt)\n', ''), components))
  judge('the first use built in the frame again', source(rev('    // the near set\'s missing chunks, nearest the camera first (revetmentNear.js#missingWork)\n', '    for (const [f, ci] of stoneAt) stonesOf(f, ci, drawnGroundParts)\n'), components))
  judge('the far hidden while its near is pending', source(rev('if (!f.cache.has(k)) { if (!f.failed.has(k)) drapeWanted.push([f, k]); continue }', 'if (!f.cache.has(k)) { nearKeys.add(`${f.key}#${k}`); drapeWanted.push([f, k]); continue }'), components))
  judge('the queue not nearest first', nearestFirst(await nearWith('return jobs.sort((a, b) => (a.d - b.d) ||', 'return jobs.sort((a, b) => (b.d - a.d) ||')))
  judge('a component resolving its own stones', source(REV_SRC, [...components, ['src/components/Planted.jsx', 'export const x = (ctx) => chunkStones(ctx, 0, 2)']]))
  if (alive) bad.push(`${alive} mutant(s) survived`)
}
console.log(bad.length ? `⛔ ${bad.length} failed` : '✅ the near layer builds each stone chunk once, and an unchanged near set hands React nothing')
process.exit(bad.length ? 1 : 0)
