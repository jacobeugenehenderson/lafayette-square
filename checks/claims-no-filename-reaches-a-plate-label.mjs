// claims-no-filename-reaches-a-plate-label.mjs — DOES A SOURCE FILENAME (OR A SPECIES READ OFF ONE) REACH THE OPERATOR?
//
// Jacob, 2026-09-25: filenames are internal evidence — "can't get to the user that way". A plate is
// shown as an anonymised id + its trait. Two halves, because either can leak:
//   ① every label the Salon is served (library-builder plateIdentities over the live part-index)
//     is `<category> NN`, the category a word that names NO species or genus (the rubric's values,
//     "unsorted", or a legacy library folder such as `multi-stem`) — so no filename token and no
//     species string can be in it;
//   ② in the Salon's source, no `label` / `subtitle` / `note` / `title` renders a raw plate key
//     (chassis name, bark ref, leaf packId) except through plateLabel().
//
// ▶ MUTATION-TEST IT:
//     · library-builder.js plateIdentities: `label: \`${word} …\`` → `label: p.partId`         → ① RED
//     · SalonWorkstage.jsx bark items: `label = plateLabel(plateLabels.bark, ref)` → `label = ref` → ② RED
//
//   node checks/claims-no-filename-reaches-a-plate-label.mjs
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { plateIdentities } from '../arborist/library-builder.js'
import { resolveSpecies } from '../arborist/vocabulary.mjs'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const rubric = JSON.parse(fs.readFileSync(path.join(REPO, 'arborist/rubric.json'), 'utf8'))
const parts = JSON.parse(fs.readFileSync(path.join(REPO, 'arborist/state/part-index.json'), 'utf8')).parts
let red = 0
const bad = (m) => { red++; console.log(`   ⛔ ${m}`) }

console.log('① SERVED LABELS ARE <category> NN')
const rubricWords = new Set(['unsorted', ...rubric.axes.flatMap(a => a.values || []).map(String)])
const genera = new Set(parts.flatMap(p => [p.label?.genus, ...(p.label?.genera || [])]).filter(Boolean).map(g => String(g).toLowerCase()))
// A word is a CATEGORY iff it's a rubric value, or it names no species (vocabulary) and no genus (labels).
const isCategory = (w) => rubricWords.has(w) || (!resolveSpecies(w).resolved && !w.split(/[\s_-]+/).some(t => genera.has(t)))
const ids = plateIdentities(parts)
let n = 0
for (const [type, byKey] of Object.entries(ids)) for (const [key, { label }] of Object.entries(byKey)) {
  n++
  const m = /^(.+) (\d{2,})$/.exec(label || '')
  if (!m || !isCategory(m[1])) bad(`${type} "${key}" is labelled "${label}" — not <category> NN`)
}
if (!n) bad('no labels produced — the check tested nothing')
else if (!red) console.log(`   ✅ ${n} keys → labels, every one <category> NN`)

console.log('② THE SALON RENDERS NO RAW PLATE KEY')
const src = fs.readFileSync(path.join(REPO, 'src/arborist/SalonWorkstage.jsx'), 'utf8').split('\n')
const DISPLAY = /\b(label\s*[:=]|subtitle=|note\s*:|title=)/
const RAW = /\b(ref|packId|nativePack|chassis\.name|bark\?*\.ref|leaves\?*\.pack)\b|subtitle=\{chassis\b/
let sites = 0
// Judge each display EXPRESSION, not the whole line: `id: p.packId, label, …` is fine.
src.forEach((line, i) => {
  for (const m of line.matchAll(new RegExp(DISPLAY.source, 'g'))) {
    const expr = line.slice(m.index + m[0].length).split(/,\s*(?:\.\.\.|[A-Za-z_]+\s*:)/)[0]
    if (!RAW.test(expr)) continue
    sites++
    if (!/plateLabel\(/.test(expr)) bad(`SalonWorkstage.jsx:${i + 1} renders a plate key raw: ${m[0]}${expr.trim().slice(0, 90)}`)
  }
})
if (!sites) bad('found no plate display site at all — the pattern and the source have drifted')
else console.log(`   ${sites} plate display site(s) checked`)
console.log(red ? `\n⛔ FAIL — ${red}` : '\n✅ PASS')
process.exit(red ? 1 : 0)
