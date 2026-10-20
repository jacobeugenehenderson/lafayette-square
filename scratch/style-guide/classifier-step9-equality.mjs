#!/usr/bin/env node
// Classifier step 9: does each new table column select EXACTLY the ways the old copied set did?
// Run once, per town, over every raw way, before the old sets were deleted (Tally, 2026-10-19).
// The OLD sets are quoted from 6429ac08 because they no longer exist in the code: this is a
// migration proof, not a standing check.
// ▶ node scratch/style-guide/classifier-step9-equality.mjs lafayette-square hipointedemun huron jacksonheights provincetown
import { readFileSync } from 'node:fs'
import { CLASSES, classOf, labelMajor } from '../../src/cartograph/streetClass.js'

const OLD = {
  // survey.js vehTypes · seed-centerlines.js vehicularTypes · extend-centerlines.js vehicular (identical lists)
  surveyed: (t) => new Set(['residential', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'unclassified']).has(t.highway),
  // seed-centerlines.js osmAlleys · extend-centerlines.js alley branch
  alley: (t) => t.highway === 'service' && t.service === 'alley',
  // serve.js OSM_LABEL_MAJOR
  labelMajor: (t) => new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary']).has(t.highway),
}
const NEW = {
  surveyed: (t) => CLASSES[classOf(t).class].surveyed === true,
  alley: (t) => classOf(t).class === 'alley',
  labelMajor,
}
let bad = 0
for (const town of process.argv.slice(2)) {
  const ways = JSON.parse(readFileSync(`cartograph/data/${town}/raw/osm.json`, 'utf8')).ground?.highway || []
  const row = []
  for (const k of Object.keys(OLD)) {
    let n = 0, diff = []
    for (const f of ways) {
      const t = f.tags || {}
      if (!t.highway) continue   // every consumer skips these; the pour refuses them
      const a = OLD[k](t), b = NEW[k](t)
      if (a) n++
      if (a !== b) diff.push(`${f.osmId} highway=${t.highway} old=${a} new=${b}`)
    }
    bad += diff.length
    row.push(`${k} ${n}${diff.length ? ` ⛔ ${diff.length} differ: ${diff.slice(0, 3).join('; ')}` : ' ='}`)
  }
  console.log(`${town.padEnd(17)} ${ways.length} ways · ${row.join(' · ')}`)
}
console.log(bad ? `⛔ ${bad} way(s) differ` : '✅ every column selects exactly the ways its old set did, on every town')
process.exit(bad ? 1 : 0)
