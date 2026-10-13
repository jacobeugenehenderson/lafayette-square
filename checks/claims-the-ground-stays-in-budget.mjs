#!/usr/bin/env node
/**
 * "DOES THIS GROUND BAKE FIT UNDER ITS TOWN'S SERVED SLAB SIZE AND SERVED GROUND-BAKE TIME?"
 *
 * WHY (Jacob, 2026-10-13, `docs/briefs/BRIEF-the-ground-stays-in-budget.md` §1): "Big slab = bad" · "we are already at
 * the limit and anything that spikes sizes or times from here is not going to work." Each town's SERVED ground is the
 * ceiling, and a new ground (the deformer's, or any other) has to fit under it.
 *
 * Reads, never restates:
 *   · the ceiling's size  = the byte length of `public/baked/<town>/ground.bin`;
 *   · the ceiling's time  = the town's whole served ground cost: the sum of its GROUND_PASSES in
 *     `cartograph/data/<town>/clean/bake-timings.json` (serve.js `saveBakeTiming`) — `ground`, plus `ground-shore` where
 *     the town paid it (Boz's ruling, 2026-10-13: the shore median is retired, so after its removal ONE pass must fit
 *     under what the town paid for two). `ground` is required; a pass the town never ran costs it nothing.
 *     ⭐ GROUND_PASSES is a list, not read from serve.js, ON PURPOSE: the ceiling is what was PAID, and must not shrink
 *     the day a pass is retired. It cannot go stale silently: every serve.js step that runs `node bake-ground.js` must
 *     be in it, or the check refuses.
 *   · the candidate's town = its own `ground.json` `look` (never an argument, so a slab cannot be judged against another
 *     town's ceiling);
 *   · the candidate's size = its `ground.bin` byte length;
 *   · the candidate's time = the same sum, from a `bake-timings.json` BESIDE the candidate slab, in serve.js's schema.
 *     bake-ground itself records no wall time, so whoever runs a scratch bake writes this file.
 * ⛔ NO FALLBACKS: a candidate with no recorded time, a town with no served slab or no served time, or a manifest that
 *   names no look is REFUSED by name — never passed, never skipped.
 *
 *   node checks/claims-the-ground-stays-in-budget.mjs                 # print every served town's ceiling
 *   node checks/claims-the-ground-stays-in-budget.mjs <slab dir> ...  # judge each candidate; exit 1 if any is refused
 *   node checks/claims-the-ground-stays-in-budget.mjs --self-test     # fixtures: equal passes, one byte/ms over refuses
 * Read-only.
 */
import { readFileSync, existsSync, statSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const ROOTS = { baked: join(REPO, 'public', 'baked'), data: join(REPO, 'cartograph', 'data') }

const readJson = (p) => JSON.parse(readFileSync(p, 'utf-8'))
// every bake-ground pass a town pays for (see the header for why this is a list)
export const GROUND_PASSES = ['ground', 'ground-shore']
// the serve.js steps that run bake-ground today, read from its source
export function servePasses(src = readFileSync(join(REPO, 'cartograph', 'serve.js'), 'utf-8')) {
  return src.split("runIfDirty('").slice(1).filter(c => /`node bake-ground\.js[ `]/.test(c.split('runIfDirty(')[0])).map(c => c.slice(0, c.indexOf("'")))
}
const groundMs = (timingsPath, town) => {
  if (!existsSync(timingsPath)) return { why: `no ${timingsPath}` }
  const T = readJson(timingsPath), paid = GROUND_PASSES.filter(p => Number.isFinite(T[`${town}:${p}`]?.ms))
  if (!paid.includes('ground')) return { why: `${timingsPath} has no "${town}:ground" time` }
  return { ms: paid.reduce((s, p) => s + T[`${town}:${p}`].ms, 0), passes: paid }
}

// The served ceiling for one town, or the reason there is none.
export function ceilingOf(town, roots = ROOTS) {
  const bin = join(roots.baked, town, 'ground.bin')
  if (!existsSync(bin)) return { town, why: `no served slab at ${bin}` }
  const t = groundMs(join(roots.data, town, 'clean', 'bake-timings.json'), town)
  if (t.why) return { town, why: `no served ground-bake time: ${t.why}` }
  return { town, bytes: statSync(bin).size, ms: t.ms, passes: t.passes }
}

// The candidate slab's own size, time and town.
function candidateOf(dir) {
  const man = join(dir, 'ground.json'), bin = join(dir, 'ground.bin')
  if (!existsSync(man) || !existsSync(bin)) return { why: `${dir} holds no ground.json + ground.bin` }
  const m = readJson(man), bytes = statSync(bin).size
  if (!m.look) return { why: `${man} names no look` }
  const t = groundMs(join(dir, 'bake-timings.json'), m.look)
  if (t.why) return { town: m.look, why: `the candidate's bake time is not recorded: ${t.why}` }
  return { town: m.look, bytes, ms: t.ms, passes: t.passes, tris: m.groups.reduce((s, g) => s + g.indexCount / 3, 0) }
}

export function judge(dir, roots = ROOTS) {
  const c = candidateOf(dir)
  if (c.why) return { dir, ok: false, refusals: [c.why] }
  const ceil = ceilingOf(c.town, roots)
  if (ceil.why) return { dir, town: c.town, ok: false, refusals: [ceil.why] }
  const refusals = []
  if (c.bytes > ceil.bytes) refusals.push(`slab ${c.bytes} B > served ${ceil.bytes} B (×${(c.bytes / ceil.bytes).toFixed(2)})`)
  if (c.ms > ceil.ms) refusals.push(`ground bake ${c.ms} ms (${c.passes.join(' + ')}) > served ${ceil.ms} ms (${ceil.passes.join(' + ')}) (×${(c.ms / ceil.ms).toFixed(2)})`)
  return { dir, town: c.town, ok: refusals.length === 0, refusals, cand: c, ceil }
}

function selfTest() {
  const root = mkdtempSync(join(tmpdir(), 'ground-budget-'))
  const roots = { baked: join(root, 'baked'), data: join(root, 'data') }
  // a slab of `v` verts / `t` tris in one group, padded with terrain sections when `terrain`
  const slab = (dir, town, { v = 3, t = 1, terrain = false, ms = null, shoreMs = null } = {}) => {
    mkdirSync(dir, { recursive: true })
    const g = { id: 'x', vertexCount: v, indexCount: t * 3, ...(terrain ? { rawByteOffset: 0, gradByteOffset: 0 } : {}) }
    writeFileSync(join(dir, 'ground.json'), JSON.stringify({ look: town, groups: [g] }))
    writeFileSync(join(dir, 'ground.bin'), Buffer.alloc(v * 12 + t * 12 + (terrain ? v * 20 : 0)))
    if (ms != null || shoreMs != null) writeFileSync(join(dir, 'bake-timings.json'), JSON.stringify({ ...(ms != null ? { [`${town}:ground`]: { ms } } : {}),
      ...(shoreMs != null ? { [`${town}:ground-shore`]: { ms: shoreMs } } : {}) }))
  }
  slab(join(roots.baked, 'a'), 'a', { v: 100, t: 100 })
  mkdirSync(join(roots.data, 'a', 'clean'), { recursive: true })
  writeFileSync(join(roots.data, 'a', 'clean', 'bake-timings.json'), JSON.stringify({ 'a:ground': { ms: 600 }, 'a:ground-shore': { ms: 400 }, 'a:ground-ao': { ms: 9e9 } }))
  slab(join(roots.baked, 'b'), 'b', { v: 100, t: 100 })   // served slab, no served time
  mkdirSync(join(roots.data, 'c', 'clean'), { recursive: true })   // served time, no served slab
  writeFileSync(join(roots.data, 'c', 'clean', 'bake-timings.json'), JSON.stringify({ 'c:ground': { ms: 1000 } }))
  const cases = [
    ['equal size, equal time', { town: 'a', v: 100, t: 100, ms: 1000 }, true],
    ['smaller slab, faster', { town: 'a', v: 50, t: 50, ms: 10 }, true],
    ['one triangle over', { town: 'a', v: 100, t: 101, ms: 1000 }, false],
    ['same triangles + terrain sections', { town: 'a', v: 100, t: 100, terrain: true, ms: 1000 }, false],
    ['one ms over the two served passes', { town: 'a', v: 100, t: 100, ms: 1001 }, false],
    ['one pass under the two-pass ceiling', { town: 'a', v: 100, t: 100, ms: 999 }, true],
    ['two passes, one ms over', { town: 'a', v: 100, t: 100, ms: 601, shoreMs: 400 }, false],
    ['two passes, equal', { town: 'a', v: 100, t: 100, ms: 600, shoreMs: 400 }, true],
    ['a shore pass with no ground pass', { town: 'a', v: 10, t: 10, shoreMs: 1 }, false],
    ['no recorded time', { town: 'a', v: 10, t: 10 }, false],
    ['a town with no served time', { town: 'b', v: 10, t: 10, ms: 1 }, false],
    ['a town with a served time but no served slab', { town: 'c', v: 10, t: 10, ms: 1 }, false],
  ]
  let bad = 0
  cases.forEach(([name, o, want], i) => {
    const dir = join(root, 'cand' + i); slab(dir, o.town, o)
    const r = judge(dir, roots)
    const pass = r.ok === want
    if (!pass) bad++
    console.log(`  ${pass ? '✓' : '✗'} ${name}: ${r.ok ? 'fits' : 'refused — ' + r.refusals.join(' · ')}`)
  })
  // the list must cover every serve.js step that runs bake-ground: a synthetic serve.js with an unlisted pass must be caught
  const fake = "runIfDirty('ground', [], [], `node bake-ground.js --x`)\nrunIfDirty('ground-new', [], [], `node bake-ground.js --y`)\nrunIfDirty('trees', [], [], `node bake-trees.js`)"
  const seen = servePasses(fake), miss = seen.filter(p => !GROUND_PASSES.includes(p))
  const covPass = seen.join() === 'ground,ground-new' && miss.join() === 'ground-new'
  if (!covPass) bad++
  console.log(`  ${covPass ? '✓' : '✗'} an unlisted serve.js bake-ground pass is seen: [${seen}] · unlisted [${miss}]`)
  rmSync(root, { recursive: true, force: true })
  console.log(bad ? `⛔ self-test: ${bad} case(s) wrong` : `self-test: ${cases.length + 1} cases as expected`)
  return bad === 0
}

const argv = process.argv.slice(2)
if (argv.includes('--self-test')) process.exit(selfTest() ? 0 : 1)
{ const miss = servePasses().filter(p => !GROUND_PASSES.includes(p))
  if (miss.length) { console.log(`⛔ serve.js runs bake-ground as step(s) [${miss}] that GROUND_PASSES does not count — the ceiling and every candidate's time would be short`); process.exit(1) } }
if (!argv.length) {
  for (const town of readdirSync(ROOTS.baked).filter(d => existsSync(join(ROOTS.baked, d, 'ground.bin'))).sort()) {
    const c = ceilingOf(town)
    console.log(c.why ? `  ${town}: ⛔ no ceiling — ${c.why}` : `  ${town}: slab ≤ ${c.bytes} B · ground bake ≤ ${c.ms} ms (${c.passes.join(' + ')})`)
  }
  process.exit(0)
}
let refused = 0
for (const dir of argv) {
  const r = judge(dir)
  if (!r.ok) refused++
  console.log(r.ok
    ? `✓ ${dir} (${r.town}): ${r.cand.bytes} B ≤ ${r.ceil.bytes} B · ${r.cand.ms} ms ≤ ${r.ceil.ms} ms`
    : `⛔ ${dir}${r.town ? ` (${r.town})` : ''} REFUSED: ${r.refusals.join(' · ')}`)
}
process.exit(refused ? 1 : 0)
