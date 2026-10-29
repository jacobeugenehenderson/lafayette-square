#!/usr/bin/env node
// claims-the-town-has-no-hover.mjs — DOES THE TOWN STAY STILL UNDER A MOVING POINTER, AND IS THE CITY MODEL GONE?
//
// ⭐ THE CLAIM (BRIEF-the-balsa-model-LANDED-2026-10-28 §4.2, Jacob 2026-10-27: "I do not like the light-up-when-mouse-passes-over-it in
// general, too much" · "no pointer-cursor change either, let's just ditch for now"). A click is the first sign of life.
// R3F raycasts, on every pointer move, each object carrying an onPointer{Move,Over,Enter,Out,Leave} handler
// (@react-three/fiber events `filterPointerEvents`), so with none of those handlers a move raycasts nothing.
// Three judges, each reading the source:
//   1 · NO HOVER HANDLER IN THE SCENE: in every module the drawn town imports (the closure of src/components/Town.jsx,
//       which is what the Ward ships), plus every module of the LS player (src/main.jsx's closure) that imports
//       @react-three/*, no onPointer{Move,Over,Enter,Out,Leave} handler, as a JSX prop or an object key.
//   2 · NO CURSOR CHANGE IN THE SCENE: the same modules write no cursor (`.style.cursor =`, a `cursor:` style).
//   3 · NO CITY MODEL: no `citymodel` (any case) in src/, cartograph/ (not _archive), workers/ or scripts/. It had no
//       producer and no town shipped one (Boz's ruling, BRIEF §1).
// A judge whose subject is missing fails loudly: the scene closure must hold SlabBuildings, NeonBands and SetPiece.
// ⭐ MUTANTS (--mutants), each must go RED: (a) an onPointerMove back on SlabBuildings' mesh → 1 · (b) onPointerMove back
// in NeonBands' pick handlers (an object key) → 1 · (c) onPointerOver on SetPiece's group (a module that imports no
// @react-three, reached through Town) → 1 · (d) the pin's `cursor: 'pointer'` back in LandmarkMarkers → 2 · (e)
// CityModel re-imported by Town → 3 · (f) a citymodel path in the staging-sites worker → 3.
//   node checks/claims-the-town-has-no-hover.mjs [--mutants]
// Read-only. Exits 1 on any failing judge or any mutant left GREEN.
import fs from 'fs'
import path from 'path'
import { sourceFiles, closure } from './_imports.mjs'

const TOWN = 'src/components/Town.jsx', PLAYER = 'src/main.jsx'
const SUBJECTS = ['src/components/SlabBuildings.jsx', 'src/components/NeonBands.jsx', 'src/components/SetPiece.jsx']
const HOVER = /\bonPointer(Move|Over|Enter|Out|Leave)\b\s*[:=]/
const CURSOR = /\.style\.cursor\s*=|\bcursor\s*:\s*['"`]/
const CITY = /citymodel/i
const comment = (s) => /^\s*(\/\/|\*|\/\*)/.test(s)

const files = sourceFiles()
const scene = () => {
  const town = closure(files, TOWN).map((x) => x.path)
  const r3f = closure(files, PLAYER).filter((x) => /from\s+['"]@react-three\//.test(x.src)).map((x) => x.path)
  return [...new Set([...town, ...r3f])].sort()
}
const SCENE = scene()
const walk = (d) => !fs.existsSync(d) ? [] : fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory()
  ? (['node_modules', '_archive', 'dist'].includes(e.name) ? [] : walk(path.join(d, e.name)))
  : /\.(m?js|jsx|ts|json|jsonc)$/.test(e.name) ? [path.join(d, e.name)] : [])
const CODE = ['src', 'cartograph', 'workers', 'scripts'].flatMap(walk).filter((f) => !/^cartograph\/data\//.test(f))

function judge(textOf) {
  const out = { 1: [], 2: [], 3: [] }
  const missing = SUBJECTS.filter((s) => !SCENE.includes(s))
  if (missing.length) out[1].push(`the scene closure of ${TOWN} lost ${missing.join(', ')}: the judge has no subject`)
  for (const f of SCENE) textOf(f).split('\n').forEach((s, i) => {
    if (comment(s)) return
    const code = s.replace(/\/\/.*$/, '')
    if (HOVER.test(code)) out[1].push(`${f}:${i + 1}  ${s.trim().slice(0, 130)}`)
    if (CURSOR.test(code)) out[2].push(`${f}:${i + 1}  ${s.trim().slice(0, 130)}`)
  })
  for (const f of CODE) textOf(f).split('\n').forEach((s, i) => { if (CITY.test(s)) out[3].push(`${f}:${i + 1}  ${s.trim().slice(0, 130)}`) })
  return out
}
const read = (f) => fs.readFileSync(f, 'utf8')
const NAMES = { 1: 'no hover handler in the scene', 2: 'no cursor change in the scene', 3: 'no city model' }

let bad = 0
const R = judge(read)
for (const k of [1, 2, 3]) {
  const n = k === 3 ? `${CODE.length} code file(s)` : `${SCENE.length} scene module(s)`
  console.log(`${R[k].length ? '⛔' : '✅'} ${k} ${NAMES[k]}: ${n} read · offending ${R[k].length}`)
  for (const s of R[k]) console.log(`      ${s}`)
  if (R[k].length) bad++
}

if (process.argv.includes('--mutants')) {
  const swap = (file, a, b) => (f) => { const t = read(f); if (f !== file) return t; if (!t.includes(a)) throw new Error(`mutant anchor not found in ${file}: ${a}`); return t.replace(a, b) }
  const MUTANTS = [
    ['a', 1, swap('src/components/SlabBuildings.jsx', '      raycast={raycastDrawn}\n', '      raycast={raycastDrawn}\n      onPointerMove={(e) => e.stopPropagation()}\n')],
    ['b', 1, swap('src/components/NeonBands.jsx', '    onClick: (e) => {', '    onPointerMove: (e) => { e.stopPropagation() },\n    onClick: (e) => {')],
    ['c', 1, swap('src/components/SetPiece.jsx', '    <group\n      onClick=', '    <group\n      onPointerOver={(e) => e.stopPropagation()}\n      onClick=')],
    ['d', 2, swap('src/components/LandmarkMarkers.jsx', "            userSelect: 'none',", "            cursor: 'pointer',\n            userSelect: 'none',")],
    ['e', 3, swap(TOWN, "import SlabBuildings from './SlabBuildings'\n", "import SlabBuildings from './SlabBuildings'\nimport CityModel from './CityModel'\n")],
    ['f', 3, swap('workers/staging-sites/src/index.js', '\n', "\n// citymodel/citymodel.json\n")],
  ]
  for (const [id, want, textOf] of MUTANTS) {
    let red
    try { red = judge(textOf)[want].length > 0 } catch (e) { console.log(`⛔ mutant (${id}) could not be applied: ${e.message}`); bad++; continue }
    console.log(`${red ? '✅' : '⛔'} mutant (${id}) → judge ${want} ${red ? 'RED' : 'still GREEN'}`)
    if (!red) bad++
  }
}
process.exit(bad ? 1 : 0)
