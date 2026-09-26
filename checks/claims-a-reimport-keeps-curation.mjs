// claims-a-reimport-keeps-curation.mjs — DOES RE-IMPORTING THE TREE LIBRARY LEAVE THE OPERATOR'S CURATION ALONE?
//
// 2026-09-25: a PREVIEW run of arborist/ingest.js (`--out` → scratch) re-laid the real
// public/library anyway, and every curated bark/leaf category (exfoliating, fibrous,
// furrowed…) came back `_unassigned` — library-builder still named the pre-cutover axes
// (`bark.type`, `leaf.silhouette`), so nothing resolved, and reapOrphans deleted the rest.
//   ① a preview (`--out`) writes its index and NOTHING under the library;
//   ② a real re-import never moves a part from an ASSIGNED category to `_unassigned`, and
//     never drops an id the library already gave it (the 2026-08-25 form rename —
//     `columnar_01`, not `gray_poplar_a_trunk22` — is what compositions name), and a kept
//     id still says where it came from (`derivedFrom`), which is how generate-salon finds its GLB;
//   ③ library-builder's primary axes are live rubric axes.
//
// ⛔ It never touches the real library, not even when a mutation breaks the guard: ingest
// runs in a CHILD process whose cwd is a scratch skeleton holding copies of the small
// inputs it reads (chassis meta, index.json, leaf/bark meta, rubric, curation, dossiers,
// public/library). The real repo is only read.
//
// ▶ MUTATION-TEST IT:
//     · ingest.js: `const writeLibrary = !opts.out || !!libRoot` → `const writeLibrary = true`   → ① RED
//     · library-builder.js: drop `|| assignedPlacement(part, root)` from canonicalValue            → ② RED
//     · library-builder.js: PRIMARY_AXIS bark back to 'bark.type'                                  → ③ RED
//     · ingest.js: `const idFor = (sourcePath, minted) => ids.get(sourcePath) || minted` → `=> minted`  → ② RED
//     · ingest.js: `parts.push(provenance(part, partId))` → `parts.push(part)`                     → ② RED
//   Put each back.
//
//   node checks/claims-a-reimport-keeps-curation.mjs
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let red = 0
const bad = m => { red++; console.log(`   ⛔ ${m}`) }

// ── the scratch skeleton ─────────────────────────────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reimport-'))
const cp = (rel, filter = () => true) => {
  const src = path.join(REPO, rel)
  if (!fs.existsSync(src)) return
  fs.cpSync(src, path.join(tmp, rel), { recursive: true, filter: (s) => fs.statSync(s).isDirectory() || filter(s) })
}
cp('public/trees/_chassis', s => s.endsWith('.meta.json'))
cp('public/trees/index.json')
cp('public/textures/leaves/shapes', s => s.endsWith('meta.json'))
cp('public/textures/bark', s => s.endsWith('meta.json') || s.endsWith('LICENSE.txt'))
cp('arborist/rubric.json'); cp('arborist/state/_chassis-curation.json'); cp('arborist/dossiers')
cp('public/library')

const snapshot = (root) => {
  const out = new Map()
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : out.set(path.relative(root, p), fs.readFileSync(p, 'utf8')) } }
  if (fs.existsSync(root)) walk(root)
  return out
}
const placements = (root) => {   // partId → category, per tree
  const out = {}
  for (const tree of ['chassises', 'barks', 'leaves']) {
    const td = path.join(root, tree); if (!fs.existsSync(td)) continue
    for (const v of fs.readdirSync(td)) { const vd = path.join(td, v); if (!fs.statSync(vd).isDirectory()) continue
      for (const id of fs.readdirSync(vd)) out[`${tree}/${id}`] = v }
  }
  return out
}
const runIngest = (opts) => execFileSync(process.execPath, ['--input-type=module', '-e',
  `import { runIngest } from ${JSON.stringify(path.join(REPO, 'arborist/ingest.js'))}; runIngest(${JSON.stringify(opts)})`],
  { cwd: tmp, stdio: ['ignore', 'ignore', 'pipe'] })

const lib = path.join(tmp, 'public/library')
const before = snapshot(lib), beforePlaced = placements(lib)

console.log('① A PREVIEW TOUCHES NOTHING')
try {
  runIngest({ out: path.join(tmp, 'preview-index.json') })
  const after = snapshot(lib)
  const changed = [...new Set([...before.keys(), ...after.keys()])].filter(k => before.get(k) !== after.get(k))
  changed.length ? bad(`a --out preview changed ${changed.length} library file(s), e.g. ${changed.slice(0, 3).join(', ')}`)
                 : console.log(`   ✅ ${before.size} library files byte-identical after a preview`)
} catch (e) { bad(`preview run failed: ${String(e.stderr || e.message).slice(0, 300)}`) }

console.log('② A RE-IMPORT KEEPS EVERY ASSIGNED CATEGORY AND ID')
try {
  runIngest({})
  const afterPlaced = placements(lib)
  const downgraded = Object.entries(beforePlaced).filter(([k, v]) => v !== '_unassigned' && afterPlaced[k] === '_unassigned')
  // The one excused loss: the operator SET ASIDE or rejected the source (curation keys the source filename).
  const cur = JSON.parse(fs.readFileSync(path.join(tmp, 'arborist/state/_chassis-curation.json'), 'utf8')).chassis || {}
  const setAside = ([k, v]) => { try {
    const src = JSON.parse(fs.readFileSync(path.join(REPO, 'public/library', k.split('/')[0], v, k.split('/')[1], 'meta.json'), 'utf8')).sourcePath
    const c = cur[path.basename(src)]; return !!c && (c.setAside || c.approved === false)
  } catch { return false } }
  const gone = Object.entries(beforePlaced).filter(([k, v]) => v !== '_unassigned' && !afterPlaced[k])
  const lost = gone.filter(e => !setAside(e))
  downgraded.length ? bad(`${downgraded.length} assigned part(s) moved to _unassigned, e.g. ${downgraded.slice(0, 3).map(([k, v]) => `${k} (${v})`).join(', ')}`)
                    : console.log(`   ✅ ${Object.values(beforePlaced).filter(v => v !== '_unassigned').length} assigned placements: none downgraded`)
  lost.length ? bad(`${lost.length} assigned part(s) lost their id, e.g. ${lost.slice(0, 3).map(([k]) => k).join(', ')}`)
              : console.log(`   ✅ every assigned id kept (${gone.length} withdrawn by an operator set-aside)`)
  const idx = JSON.parse(fs.readFileSync(path.join(tmp, 'arborist/state/part-index.json'), 'utf8'))
  const orphan = idx.parts.filter(p => p.partType === 'chassis' && p.partId !== path.basename(p.sourcePath, '.glb')
    && p.derivedFrom !== path.basename(p.sourcePath, '.glb'))
  orphan.length ? bad(`${orphan.length} renamed chassis carry no derivedFrom — generate-salon cannot find their GLB, e.g. ${orphan.slice(0, 3).map(p => p.partId).join(', ')}`)
                : console.log(`   ✅ every renamed chassis names its source (${idx.parts.filter(p => p.derivedFrom).length} derivedFrom)`)
} catch (e) { bad(`re-import run failed: ${String(e.stderr || e.message).slice(0, 300)}`) }

console.log('③ THE BUILDER READS LIVE AXES')
{
  const src = fs.readFileSync(path.join(REPO, 'arborist/library-builder.js'), 'utf8')
  const m = src.match(/const PRIMARY_AXIS = \{([^}]*)\}/)
  const axes = new Set((JSON.parse(fs.readFileSync(path.join(REPO, 'arborist/rubric.json'), 'utf8')).axes || []).map(a => a.id))
  const used = m ? [...m[1].matchAll(/(chassis|bark|leaf):\s*'([^']+)'/g)].map(x => x[2]) : []
  const dead = used.filter(a => !axes.has(a))
  !used.length ? bad('PRIMARY_AXIS not found in library-builder.js')
    : dead.length ? bad(`PRIMARY_AXIS names axes the rubric does not carry: ${dead.join(', ')}`)
    : console.log(`   ✅ ${used.join(' · ')} — all live rubric axes`)
}

fs.rmSync(tmp, { recursive: true, force: true })
console.log(red ? `\n⛔ FAIL — ${red}` : '\n✅ PASS')
process.exit(red ? 1 : 0)
