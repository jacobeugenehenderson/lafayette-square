#!/usr/bin/env node
/**
 * "IS THIS SCENE AT THE STUDS?" — enumerate every surviving authoring gesture,
 * per channel, for one scene or all of them.
 *
 * WHY THIS EXISTS (2026-08-06). `claims-revert-field-coverage.mjs` reports
 * ✅ PASS while a scene visibly is NOT at default. That guard asks
 * *"is this field named in some revert list in the store?"* — a question about
 * CODE. The operator's question is *"is there any authoring left on my map?"* —
 * a question about STATE. A field can be in a revert list and still be sitting
 * in the artifact because the gesture that clears it was never run, is disabled,
 * or lives in another panel.
 *
 * The symptom that produced this: Section → "Revert to Default" was run, which
 * cleared treelawn/sidewalk/materials/capFlip; the Survey channel (pavementHW,
 * terminal) was untouched because its revert is a DIFFERENT button in a
 * DIFFERENT panel — and Survey's "Revert to Default" is disabled outright when
 * the scene has no blessed surveyDefault. The map was believed to be at default
 * with 154 Survey overrides still live.
 *
 * ⭐ Field lists are PARSED FROM THE STORE, never copied, so this cannot go
 *    stale when the scopes change (the pattern from claims-revert-field-coverage).
 * ⛔ Read-only. Writes nothing. Touches no authoring.
 *
 * Usage:
 *   node scratch/claims-scene-at-default.mjs                 # every look
 *   node scratch/claims-scene-at-default.mjs lafayette-square
 */
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'

const ROOT = new URL('..', import.meta.url).pathname
const STORE = join(ROOT, 'src/cartograph/stores/useCartographStore.js')

// ── the revert scopes, read out of the store (never restated here) ──────────
const parseScope = (name) => {
  const src = readFileSync(STORE, 'utf8')
  const m = src.match(new RegExp(`${name}:\\s*\\[([^\\]]*)\\]`))
  if (!m) throw new Error(`could not parse ${name} from the store — has it been renamed?`)
  return m[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
}
const SURVEY_FE = parseScope('_SURVEY_FE_FIELDS')
const SECTION_FE = parseScope('_SECTION_FE_FIELDS')

const GESTURE = {
  survey:  'Survey panel → "Revert to Skeleton" (⤓)   [“Revert to Default” is DISABLED without a blessed surveyDefault]',
  section: 'Section/Measure panel → "Revert to Default" (↺)',
  corner:  'Survey panel → "Revert to Skeleton" (⤓), or ⌃-click a corner',
  cap:     'no whole-scene gesture — a cap is cleared by ⌃-click on that cap',
  coupler: 'no whole-scene gesture',
}

const countFe = (blockCustoms, fields) => {
  const hist = {}
  for (const sk of Object.keys(blockCustoms || {}))
    for (const side of Object.keys(blockCustoms[sk] || {}))
      for (const seg of Object.keys(blockCustoms[sk][side] || {}))
        for (const f of Object.keys(blockCustoms[sk][side][seg] || {}))
          if (fields.includes(f)) hist[f] = (hist[f] || 0) + 1
  return hist
}

const looksDir = join(ROOT, 'public/looks')
const argLook = process.argv[2]
const looks = argLook ? [argLook]
  : readdirSync(looksDir).filter(d => existsSync(join(looksDir, d, 'design.json')))

console.log(`revert scopes, parsed from ${STORE.replace(ROOT, '')}:`)
console.log(`  SURVEY : ${SURVEY_FE.join(', ')}`)
console.log(`  SECTION: ${SECTION_FE.join(', ')}\n`)

let anyDirty = false
for (const look of looks) {
  const designPath = join(looksDir, look, 'design.json')
  if (!existsSync(designPath)) { console.log(`${look}: no design.json — skipped`); continue }
  const d = JSON.parse(readFileSync(designPath, 'utf8'))
  const residue = []

  const sHist = countFe(d.blockCustoms, SURVEY_FE)
  const nSurvey = Object.values(sHist).reduce((a, b) => a + b, 0)
  if (nSurvey) residue.push(['SURVEY  blockCustoms', Object.entries(sHist).map(([k, v]) => `${k}×${v}`).join(' '), GESTURE.survey])

  const cHist = countFe(d.blockCustoms, SECTION_FE)
  const nSection = Object.values(cHist).reduce((a, b) => a + b, 0)
  if (nSection) residue.push(['SECTION blockCustoms', Object.entries(cHist).map(([k, v]) => `${k}×${v}`).join(' '), GESTURE.section])

  const nCorner = Object.keys(d.cornerRadiusOverrides || {}).length
    + Object.keys(d.cornerCornerRadiusOverrides || {}).length
    + ((d.cornerRadiusScale ?? 1) !== 1 ? 1 : 0)
  if (nCorner) residue.push(['SURVEY  corners', `${nCorner} override(s)/scale`, GESTURE.corner])

  // the second authoring channel — the skelId-keyed overlay prebake DOES read
  const ovPath = join(ROOT, 'cartograph/data', look, 'clean/overlay.json')
  if (existsSync(ovPath)) {
    const streets = JSON.parse(readFileSync(ovPath, 'utf8')).streets || {}
    const ov = {}
    for (const id of Object.keys(streets))
      for (const k of Object.keys(streets[id] || {}))
        if (k !== 'name') ov[k] = (ov[k] || 0) + 1
    const caps = (ov.capStart || 0) + (ov.capEnd || 0)
    if (caps) residue.push(['SURVEY  overlay caps', `capStart×${ov.capStart || 0} capEnd×${ov.capEnd || 0}`, GESTURE.cap])
    for (const k of ['measure', 'segmentMeasures']) if (ov[k]) residue.push([`SURVEY  overlay ${k}`, `×${ov[k]}`, GESTURE.survey])
    if (ov.couplers) residue.push(['overlay couplers', `×${ov.couplers}`, GESTURE.coupler])
  }

  const blessed = d.surveyDefault ? 'blessed' : '⛔ surveyDefault: null — "Revert to Default" is DISABLED for this scene'
  if (!residue.length) { console.log(`✅ ${look} — AT THE STUDS (no authoring in any channel). [${blessed}]`); continue }

  anyDirty = true
  console.log(`⛔ ${look} — NOT at default. [${blessed}]`)
  for (const [chan, what, how] of residue) console.log(`   ${chan.padEnd(22)} ${what}\n      ↳ clears via: ${how}`)
  console.log('')
}

console.log(anyDirty
  ? '⛔ At least one scene carries authoring. That is FINE if intended — the override is the product.\n   This check exists so "I reverted it" can be VERIFIED rather than believed.'
  : '✅ Every scene checked is at the studs.')
