#!/usr/bin/env node
// ⭐ IS ANY BAKED STREET LABEL A NAME THE SKELETON MADE UP? — `ROADMAP A19`.
//
// An unnamed road the skeleton promotes gets a synthetic name, `<highway> <n>` ("primary_link 53"),
// and the street carries `synthetic: true`. That name is an id — an authoring key — never a place.
// Before A19 three consumers each hid it with their own class list, and each list was short: huron's
// labels.json shipped "primary_link 53" and "primary_link 54" on 2026-09-23.
//
// ⭐ READS THE SOURCE: the skeleton's naming is taken from `skeleton.js` itself (the `synthName`
// template), and each label is joined to the skeleton street that bears its name. A label is bad if
//   FLAGGED   — a street with that name carries `synthetic: true`, or
//   UNFLAGGED — the name is exactly that street's own class + a number (a skeleton from before the
//               flag existed — stale, and just as wrong on screen).
//
// ▶ node checks/claims-no-label-is-a-made-up-name.mjs [scene ...]
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, scenes } from './_scenes.mjs'

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))

// The naming rule, read out of the code: `const synthName = \`${hw} ${i + 1}\``.
const skelSrc = readFileSync(join(ROOT, 'cartograph/skeleton.js'), 'utf8')
if (!/const synthName = `\$\{hw\} \$\{i \+ 1\}`/.test(skelSrc)) {
  console.error('⛔ NOT CHECKED — skeleton.js no longer names unnamed streets `${hw} ${i + 1}`; update this check to the new rule.')
  process.exit(2)
}
const madeUpFor = (hw, name) => !!hw && name.startsWith(hw + ' ') && /^\d+$/.test(name.slice(hw.length + 1))

let red = false
for (const scene of scenes('public/baked/<scene>/labels.json')) {
  const skelPath = join(ROOT, 'cartograph/data', scene, 'clean/skeleton.json')
  if (!existsSync(skelPath)) { console.log(`\n── ${scene}   ⛔ NOT CHECKED — no clean/skeleton.json`); red = true; continue }
  const byName = new Map()
  for (const s of readJson(skelPath).streets || []) {
    if (!byName.has(s.name)) byName.set(s.name, [])
    byName.get(s.name).push(s)
  }
  const labels = readJson(join(ROOT, 'public/baked', scene, 'labels.json')).labels || []
  const bad = []
  for (const l of labels) {
    const st = byName.get(l.name) || []
    if (st.some(s => s.synthetic)) bad.push(`FLAGGED   ${l.name}`)
    else if (st.some(s => madeUpFor(s.highway, l.name))) bad.push(`UNFLAGGED ${l.name}`)
  }
  const uniq = [...new Set(bad)]
  console.log(`\n── ${scene} ── ${labels.length} label(s), ${uniq.length} made-up`)
  for (const b of uniq.slice(0, 12)) console.log(`   ⛔ ${b}`)
  if (uniq.length > 12) console.log(`   … and ${uniq.length - 12} more`)
  if (uniq.length) red = true
}

console.log(red
  ? '\n⛔ A baked label is a skeleton-made name. Re-run skeleton.js for the town, then re-bake labels.'
  : '\n✅ No baked label is a skeleton-made name.')
process.exit(red ? 1 : 0)
