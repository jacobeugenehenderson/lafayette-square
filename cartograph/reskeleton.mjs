#!/usr/bin/env node
// reskeleton.mjs — THE SKELETON STEP: re-make a town's skeleton, and refuse by name before it replaces one the operator authored
// against (2026-10-28, BRIEF-the-bake-re-skeletons-a-stale-town §3). Run by the Bake when the step is stale
// (pourSteps.mjs#skeletonStep), and by Extent's commit and rollback through the same step and recorder (serve.js).
//   1. skeleton.js --out=<temp>: the scene is not touched yet
//   2. every authored key (authoredKeys.mjs#authoringOf) must survive into the new skeleton (#authoringReKeys); one that does not
//      stops here, by name, and clean/skeleton.json is left as it was. The key's migration is Jacob's (EXTENT-DESIGN §4.1; the
//      registry's r-block-keys-are-minted-once-and-inserted-between, unbuilt)
//   3. clean/skeleton.json written only if it changed (its mtime is the pour's authoring input), then skeleton.js --index
//   node reskeleton.mjs --scene=<town>
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { spawnSync } from 'child_process'
import { mapCleanDir } from './scene.js'
import { writeIfChanged } from './io.js'
import { authoringOf, authoringReKeys, highwayClasses } from './authoredKeys.mjs'

const HERE = import.meta.dirname
const scene = process.argv.find(a => a.startsWith('--scene='))?.slice(8)
if (!scene) { console.error('[reskeleton] ⛔ no --scene=<town>'); process.exit(2) }
const skeleton = (...args) => {
  const r = spawnSync(process.execPath, [join(HERE, 'skeleton.js'), `--scene=${scene}`, ...args], { cwd: HERE, stdio: 'inherit' })
  if (r.status !== 0) throw new Error(`[reskeleton] ⛔ skeleton.js ${args.join(' ')} exited ${r.status}`)
}

// ⭐ A REFUSAL SAYS WHAT THE OPERATOR DOES NEXT (Boz, 2026-10-28): it explains, not just stops. A rollback runs this too.
const NEXT = `What next: (a) restore the skeleton and the authoring that match each other (a rollback's snapshot, or git), so the keys name what they were drawn on; or (b) re-author the named keys on the new network (Survey, Section, the corner handles), then Bake again. Moving keys onto the new network automatically is Jacob's call (EXTENT-DESIGN §4.1; r-block-keys-are-minted-once-and-inserted-between, unbuilt).`
const skPath = join(mapCleanDir(scene), 'skeleton.json'), tmp = mkdtempSync(join(tmpdir(), `reskeleton-${scene}-`))
try {
  const out = join(tmp, 'skeleton.json')
  skeleton(`--out=${out}`)
  const A = authoringOf(scene)
  if (!existsSync(skPath)) {
    if (A.ids.size) throw new Error(`[reskeleton] ⛔ ${scene}: ${A.ids.size} authored key(s) and no skeleton on disk to say what they were authored against (${[...A.ids.keys()].slice(0, 6).join(', ')}). Refusing. ${NEXT}`)
    console.log(`[reskeleton] ${scene}: the first skeleton, no authoring to keep`)
  } else {
    const R = authoringReKeys(JSON.parse(readFileSync(skPath, 'utf8')), JSON.parse(readFileSync(out, 'utf8')), A, highwayClasses())
    console.log(`[reskeleton] ${scene}: ${A.ids.size} authored key(s) — ${Object.entries(R.tally).map(([k, n]) => `${k} ${n}`).join(' · ') || 'none'}`)
    if (R.highway.length) console.log(`[reskeleton] ${R.highway.length} key(s) on a highway chain, refused in the pour by r-highway-no-authoring: ${R.highway.map(r => `${r.status} ${r.id}`).join(' · ')}`)
    for (const n of A.notJudged) console.log(`[reskeleton] ⚠️ not judged at the skeleton: ${n}`)
    if (R.hits.length) throw new Error(`[reskeleton] ⛔ ${scene}: the new skeleton would re-key ${R.hits.length} of the operator's authored key(s), so clean/skeleton.json is left as it was: ${R.hits.join(' ‖ ')}. ${NEXT}`)
  }
  const wrote = writeIfChanged(skPath, readFileSync(out), { touch: false })
  console.log(`[reskeleton] → ${skPath}${wrote ? '' : ' [unchanged]'}`)
  skeleton('--index')
} catch (e) { console.error(e.message); process.exitCode = 1 }
finally { rmSync(tmp, { recursive: true, force: true }) }
