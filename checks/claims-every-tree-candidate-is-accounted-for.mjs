#!/usr/bin/env node
/**
 * claims-every-tree-candidate-is-accounted-for — where does each town's tree census go?
 *
 * Jacob, 2026-09-26: *"Provincetown's trees are too sparse."* The bake log prints a
 * `placed N/M` line and a `forbidden:` breakdown, but not in one place, not per gate in
 * order, and not across towns — so a gate that eats most of one town's census and none
 * of another's is invisible unless someone reads four logs side by side.
 * (`docs/briefs/BRIEF-tree-density-and-size.md` measurement 1.)
 *
 * ⭐ IT RUNS THE BAKE ITSELF, into a temp file, and reads the counts `bakeTrees` returns.
 *    Nothing here restates a gate: the census union + cross-well dedup is `readCensus`, the
 *    dissolve is `makeMembership`, the surface verdict is `makeZoneTester`, the land-use
 *    kind is `resolveLuPolicy` — all the bake's own code, reached through the bake.
 *    The slab on disk is not touched.
 *
 * Per town it prints the FUNNEL, in the bake's order:
 *     candidates (per well) → cross-well dedup → unmatched (no variant) → dissolved
 *     (invented trees past the rim) → forbidden (by reason; `lu:*` split into the policy's
 *     `hard` / `planted` kinds) → placed
 * and names the single largest gate and its share. That share is the lead, not a verdict:
 * whether a gate is RIGHT is a question for the land-use canon, not this check.
 *
 * ⛔ IT FAILS ON:
 *   1. CONSERVATION — candidates − dedup − unmatched − dissolved − forbidden ≠ placed. A tree
 *      that leaves the bake by any path this funnel cannot name is a silent gate.
 *   2. A STALE SLAB — the on-disk `trees.json` does not have the count a bake of today's
 *      inputs produces. The runtime draws the file, so a stale file means the town on screen
 *      is not the town the census describes.
 *
 *   node checks/claims-every-tree-candidate-is-accounted-for.mjs              # every town
 *   node checks/claims-every-tree-candidate-is-accounted-for.mjs provincetown
 */
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { scenes, ROOT } from './_scenes.mjs'
import { bakeTrees } from '../arborist/bake-trees.js'
import { treeBakeInputsForMap } from '../cartograph/tree-bake-inputs.mjs'
import { resolveLuPolicy } from '../cartograph/lu-policy.mjs'

const towns = scenes('public/baked/<scene>/trees.json')
const tmp = mkdtempSync(join(tmpdir(), 'tree-funnel-'))
let failed = 0
let measured = 0
const bad = (m) => { failed++; console.log(`  ⛔ ${m}`) }
const pct = (n, d) => d ? `${(100 * n / d).toFixed(1)}%` : '—'
const row = (label, n, d, note = '') =>
  console.log(`  ${label.padEnd(34)} ${String(n).padStart(7)}  ${pct(n, d).padStart(6)}${note ? '  ' + note : ''}`)

for (const scene of towns) {
  console.log(`\n── ${scene}`)
  const resolved = treeBakeInputsForMap(scene)
  if (!resolved || !resolved.placements?.some(existsSync)) {
    console.log(`  NOT CHECKED — no census well resolves for '${scene}'. Nothing was measured.`)
    continue
  }
  const { inputs: _i, ...inputs } = resolved
  const out = join(tmp, `${scene}.json`)

  // The bake narrates as it goes; hold its voice and replay it only if it throws.
  const said = []
  const { log, warn } = console
  console.log = (...a) => said.push(a.join(' '))
  console.warn = (...a) => said.push(a.join(' '))
  let r
  try {
    r = await bakeTrees({ ...inputs, scene, output: out, verbose: false })
  } catch (e) {
    console.log = log; console.warn = warn
    // The bake REFUSING is its own loud verdict (no grove, no shape…) — nothing was measured,
    // which is neither a pass nor a finding about the funnel.
    said.forEach(l => console.log('    | ' + l))
    console.log(`  NOT MEASURED — the bake refused: ${e.message}`)
    continue
  } finally {
    console.log = log; console.warn = warn
  }

  measured++
  const N = r.candidates
  for (const w of r.perWell) row(`well ${basename(w.path)} (${w.source})`, w.count, N)
  row('CANDIDATES', N, N)
  row('− cross-well dedup', r.deduped, N,
    Object.entries(r.dedupedBySource).map(([s, n]) => `${s}=${n}`).join(' '))
  row('− unmatched (no variant in pool)', r.unmatched, N)
  row('− dissolved (invented, past rim)', r.dissolved, N)

  // `lu:<class>` reasons are split by what the town's land-use policy calls the class.
  const policy = resolveLuPolicy(scene, Object.keys(r.forbiddenCounts)
    .filter(k => k.startsWith('lu:')).map(k => k.slice(3)))
  const byKind = {}
  for (const [reason, n] of Object.entries(r.forbiddenCounts)) {
    const kind = reason.startsWith('lu:') ? `land use, ${policy.kindOf(reason.slice(3))}` : 'surface / footprint'
    ;(byKind[kind] ||= []).push([reason, n])
  }
  for (const [kind, list] of Object.entries(byKind).sort()) {
    const tot = list.reduce((s, [, n]) => s + n, 0)
    row(`− forbidden: ${kind}`, tot, N,
      list.sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}=${n}`).join(' '))
  }
  row('= PLACED', r.count, N, r.nudged ? `(incl. ${r.nudged} surveyed trees nudged onto legal ground)` : '')

  // The lead: the single largest thing standing between the census and the map.
  const gates = [['dedup', r.deduped], ['unmatched', r.unmatched], ['dissolved', r.dissolved],
    ...Object.entries(r.forbiddenCounts)].sort((a, b) => b[1] - a[1])
  if (gates[0]?.[1]) console.log(`  ▶ largest gate: ${gates[0][0]} — ${gates[0][1]} of ${N} (${pct(gates[0][1], N)})`)

  // ⛔ 1. Conservation.
  const accounted = r.deduped + r.unmatched + r.dissolved + r.forbidden + r.count
  if (accounted !== N) bad(`CONSERVATION: ${N} candidates, ${accounted} accounted for — ${N - accounted} left the bake by a path this funnel cannot name`)

  // ⛔ 2. The slab on disk is the one the runtime draws.
  const disk = JSON.parse(readFileSync(join(ROOT, 'public', 'baked', scene, 'trees.json'), 'utf8'))
  const onDisk = disk.count ?? disk.instances?.length
  const when = disk.generatedAt ? new Date(disk.generatedAt).toISOString().slice(0, 16) : 'unknown'
  if (onDisk !== r.count) {
    bad(`STALE SLAB: public/baked/${scene}/trees.json places ${onDisk} (baked ${when}); today's inputs place ${r.count}. Re-bake before reading its density.`)
  } else {
    console.log(`  ✓ on-disk trees.json agrees (${onDisk}, baked ${when})`)
  }
}

rmSync(tmp, { recursive: true, force: true })
if (!measured) { console.error('\n⛔ NOT MEASURED — no town could be baked. This is not a pass.'); process.exit(2) }
console.log(failed ? `\n⛔ ${failed} problem(s).` : '\n✓ every candidate accounted for, every slab current.')
process.exit(failed ? 1 : 0)
