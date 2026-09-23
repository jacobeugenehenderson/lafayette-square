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
// authored against. Every authored key must resolve to the same OSM way ids in both.
//   SAME      — resolves to the same ways.                                   ✅
//   MOVED     — resolves, but to different ways: authoring would re-point.   ⛔
//   GONE      — resolved before, resolves to nothing now.                    ⛔
//   DANGLING  — already resolves to nothing on disk: authoring on no road.   ⛔
//
// ⭐ THIS READS THE SOURCE, IT DOES NOT RESTATE IT (`CLAUDE.md` PRUNE §1): the ids come from running
// the code; the scene-keyed design fields are parsed out of `serve.js`'s SCENE_KEYED_DESIGN_FIELDS;
// the looks come from the manifest. Nothing here is a list of towns or keys.
//
// ▶ node checks/claims-authored-skelids-keep-their-ways.mjs [scene ...]
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { ROOT, scenes } from './_scenes.mjs'

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))

// The design fields keyed in a scene's frame — read from the one place that declares them.
const serveSrc = readFileSync(join(ROOT, 'cartograph/serve.js'), 'utf8')
const fieldsBlock = serveSrc.match(/const SCENE_KEYED_DESIGN_FIELDS = \[([\s\S]*?)\]/)
if (!fieldsBlock) { console.error('⛔ NOT CHECKED — SCENE_KEYED_DESIGN_FIELDS not found in cartograph/serve.js'); process.exit(2) }
const DESIGN_FIELDS = [...fieldsBlock[1].matchAll(/'([A-Za-z]+)'/g)].map(m => m[1])

const looks = readJson(join(ROOT, 'public/looks/index.json')).looks

// id → sorted OSM way ids, over streets[] and paths[] (a path id is positional too).
function waysById(skel) {
  const m = new Map()
  for (const s of skel.streets || []) m.set(s.id, [...(s.osmIds || s.sources || [])].map(String).sort())
  for (const p of skel.paths || []) m.set(p.id, [String(p.osmId)])
  return m
}

// A key may be a bare skelId or a composite ("x,z|skelId:end|skelId:end"). Take the '|' parts,
// strip a trailing ':end', and keep what is id-shaped — a coordinate part never is.
const ID_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
function idsInKey(key) {
  return key.split('|').map(t => t.replace(/:[^:]*$/, '')).filter(t => ID_SHAPE.test(t))
}

function authoredKeys(scene) {
  const out = new Map()   // skelId → [where]
  const add = (id, where) => { if (!out.has(id)) out.set(id, []); out.get(id).push(where) }
  const ov = join(ROOT, 'cartograph/data', scene, 'clean/overlay.json')
  if (existsSync(ov)) for (const k of Object.keys(readJson(ov).streets || {})) add(k, 'overlay.streets')
  for (const look of looks.filter(l => l.scene === scene)) {
    const dp = join(ROOT, 'public/looks', look.id, 'design.json')
    if (!existsSync(dp)) continue
    const d = readJson(dp)
    for (const f of DESIGN_FIELDS) {
      const v = d[f]
      if (!v || typeof v !== 'object' || Array.isArray(v)) continue
      for (const k of Object.keys(v)) for (const id of idsInKey(k)) add(id, `${look.id}/design.${f}`)
    }
  }
  return out
}

let red = false
const tmp = mkdtempSync(join(tmpdir(), 'skelids-'))
try {
  for (const scene of scenes('cartograph/data/<scene>/raw/osm.json')) {
    const onDisk = join(ROOT, 'cartograph/data', scene, 'clean/skeleton.json')
    if (!existsSync(onDisk)) { console.log(`\n── ${scene}   ⛔ NOT CHECKED — no clean/skeleton.json`); red = true; continue }
    const keys = authoredKeys(scene)
    console.log(`\n── ${scene} ── ${keys.size} authored skelId(s)`)
    if (!keys.size) continue

    const outPath = join(tmp, `${scene}.json`)
    const run = spawnSync(process.execPath, [join(ROOT, 'cartograph/skeleton.js'), `--scene=${scene}`, `--out=${outPath}`],
      { cwd: join(ROOT, 'cartograph'), encoding: 'utf8', maxBuffer: 1 << 28 })
    if (run.status !== 0 || !existsSync(outPath)) {
      console.log(`   ⛔ NOT CHECKED — skeleton.js exited ${run.status}\n${(run.stderr || '').slice(-2000)}`)
      red = true; continue
    }
    const before = waysById(readJson(onDisk))
    const after = waysById(readJson(outPath))

    const tally = { SAME: 0, MOVED: 0, GONE: 0, DANGLING: 0 }
    for (const [id, where] of [...keys].sort()) {
      const b = before.get(id), a = after.get(id)
      const status = !b ? 'DANGLING' : !a ? 'GONE' : b.join(',') === a.join(',') ? 'SAME' : 'MOVED'
      tally[status]++
      if (status !== 'SAME') {
        red = true
        console.log(`   ⛔ ${status.padEnd(8)} ${id}  [${where.join(', ')}]  ways ${b ? b.join(',') : '—'} → ${a ? a.join(',') : '—'}`)
      }
    }
    console.log(`   ${Object.entries(tally).map(([k, n]) => `${k} ${n}`).join(' · ')}`)
  }
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

console.log(red
  ? '\n⛔ An authored key would re-point, or points at nothing. Fix the id scheme; never re-key authoring quietly.'
  : '\n✅ Every authored skelId names the same OSM ways under the current skeleton code.')
process.exit(red ? 1 : 0)
