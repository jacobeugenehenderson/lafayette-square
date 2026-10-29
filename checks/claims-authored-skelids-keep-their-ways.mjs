#!/usr/bin/env node
// ⭐⭐ DOES EVERY AUTHORED STREET KEY STILL NAME THE SAME OSM WAYS? — the guard behind `ROADMAP A19`.
//
// THE TRAP. `skeleton.js` names an unnamed road `<highway> <n>` and slugs it into its id
// (`primary_link 192` → `primary-link-192`). That id is a skelId — the key the operator's authoring
// is stored under (`clean/overlay.json` streets, `design.json` blockCustoms, corner overrides). The
// number is POSITIONAL, so any change to what gets promoted, or in what order, renumbers the ids and
// re-attaches the operator's widths to a DIFFERENT road. The map still draws; nothing says so.
// That is `CLAUDE.md` Layer 0 q2 and q3 at once — the worst outcome, looking like a working map.
//
// WHAT THIS DOES, per town: runs the CURRENT `skeleton.js` into a temp file (`--out=`, the scene is
// never written) and compares it with the `clean/skeleton.json` on disk — the frame the operator
// authored against. Every authored key must survive: the verdicts are cartograph/authoredKeys.mjs's (its header). A key whose
// chain is highway class (before OR after) is not red: a highway takes no authoring (`r-highway-no-authoring`), so it is printed
// by name with its `measure.source` (Boz, 2026-09-23, the H-3 weld), and loud when that source is not "seed".
//
// ⭐ ONE HOME WITH THE BAKE (2026-10-28): the keys and the verdicts are cartograph/authoredKeys.mjs's — the same rows the Bake's
// skeleton step refuses on (reskeleton.mjs) — so this report and the refusal cannot disagree. Beyond the ways, it also reports
// ENDS (a capped or cornered chain's start or end moved), SEGORD (an authored street's crossings changed at or before an authored
// slot) and CORNER (a corner's point left the chain), and it reads every scene-keyed design field: until then this file's parse
// of SCENE_KEYED_DESIGN_FIELDS stopped at the first ']' (inside a comment, "[skelId]") and read blockCustoms alone, so no corner
// override was ever checked.
// ⭐ THIS READS THE SOURCE, IT DOES NOT RESTATE IT (`CLAUDE.md` PRUNE §1): the ids come from running the code; the scene-keyed
// design fields are parsed out of `serve.js`'s SCENE_KEYED_DESIGN_FIELDS; the looks come from the manifest.
//
// ▶ node checks/claims-authored-skelids-keep-their-ways.mjs [scene ...]
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { ROOT, scenes } from './_scenes.mjs'
import { authoringOf, authoringReKeys, highwayClasses } from '../cartograph/authoredKeys.mjs'

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
const HIGHWAY = highwayClasses(ROOT)

let red = false
const tmp = mkdtempSync(join(tmpdir(), 'skelids-'))
try {
  for (const scene of scenes('cartograph/data/<scene>/raw/osm.json')) {
    const onDisk = join(ROOT, 'cartograph/data', scene, 'clean/skeleton.json')
    if (!existsSync(onDisk)) { console.log(`\n── ${scene}   ⛔ NOT CHECKED — no clean/skeleton.json`); red = true; continue }
    const A = authoringOf(scene, ROOT)
    console.log(`\n── ${scene} ── ${A.ids.size} authored skelId(s)`)
    for (const n of A.notJudged) console.log(`   ⚠️ not judged at the skeleton: ${n}`)
    if (!A.ids.size) continue

    const outPath = join(tmp, `${scene}.json`)
    const run = spawnSync(process.execPath, [join(ROOT, 'cartograph/skeleton.js'), `--scene=${scene}`, `--out=${outPath}`],
      { cwd: join(ROOT, 'cartograph'), encoding: 'utf8', maxBuffer: 1 << 28 })
    if (run.status !== 0 || !existsSync(outPath)) {
      console.log(`   ⛔ NOT CHECKED — skeleton.js exited ${run.status}\n${(run.stderr || '').slice(-2000)}`)
      red = true; continue
    }
    const R = authoringReKeys(readJson(onDisk), readJson(outPath), A, HIGHWAY)
    for (const h of R.hits) { red = true; console.log(`   ⛔ ${h}`) }
    if (R.highway.length) {
      console.log(`   HIGHWAY  ${R.highway.length} key(s) on a highway chain — refused by r-highway-no-authoring, kept in the file: ${R.highway.map(r => `${r.id}(${r.status}; ${[].concat(r.where).join(', ')})`).join(' · ')}`)
      const gesture = R.highway.filter(r => ![].concat(r.where).every(w => w.endsWith('(source:seed)')))
      if (gesture.length) console.log(`   ⛔ ${gesture.length} operator authoring on a highway — refused, review: ${gesture.map(r => `${r.id} [${[].concat(r.where).join(', ')}]`).join(' · ')}`)
      else console.log(`   (all ${R.highway.length} are seed snapshots — measure.source "seed")`)
    }
    console.log(`   ${Object.entries(R.tally).map(([k, n]) => `${k} ${n}`).join(' · ')}`)
  }
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

console.log(red
  ? '\n⛔ An authored key would re-point, or points at nothing. Fix the id scheme; never re-key authoring quietly.'
  : '\n✅ Every authored skelId names the same OSM ways under the current skeleton code.')
process.exit(red ? 1 : 0)
