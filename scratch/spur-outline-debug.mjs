// spur-outline-debug.mjs — inspect ONE asserted spur outline end to end.
// Runs assertSpurOutlines on the real ribbons, then extractFaces on the result, and
// reports whether the spur's strokes actually became face edges.
import fs from 'fs'
import { assertSpurOutlines } from '../cartograph/spurOutline.js'
import { extractFaces } from '../src/lib/tileGround.js'

const target = process.argv[2] || 'simpson-place'
const rib = JSON.parse(fs.readFileSync('src/data/ribbons.json', 'utf8'))
const mById = new Map(rib.streets.map(s => [s.skelId || s.name, s]))
const faceStreets = rib.streets
  .filter(s => s?.points?.length >= 2 && !s.gradeSeparated)
  .map(s => (s.strokePoints ? { ...s, points: s.strokePoints } : s))

const tips = (rib.junctionMap?.nodes || [])
  .filter(n => n.kinds.includes('pendant-tip'))
  .map(n => ({ skelId: n.legs[0]?.chain, end: n.legs[0]?.end, at: n.at }))
  .filter(t => t.skelId && t.end)

const res = assertSpurOutlines(faceStreets, tips, id => mById.get(id)?.measure,
  (id, end) => { const st = mById.get(id); return (end === 'start' ? st?.capStart : st?.capEnd) || st?.capEnds || 'round' })

console.log(`asserted ${res.spurs.length}, skipped ${res.skipped.length}`)
const rec = res.spurs.find(s => s.skelId === target)
console.log(`\n── ${target} ──`)
console.log(rec ? JSON.stringify(rec, null, 1) : `NOT ASSERTED: ${JSON.stringify(res.skipped.find(s => s.skelId === target))}`)

const mine = res.faceStreets.filter(s => (s.skelId || s.name) === target)
console.log(`\nface-streets carrying ${target}: ${mine.length}`)
for (const s of mine) {
  const tag = s.spurCap ? 'CAP' : s.spurSide ? `CURB ${s.spurSide}` : 'centreline'
  console.log(`  ${tag.padEnd(12)} ${s.points.length} pts  ${s.points[0].map(v => v.toFixed(2))} → ${s.points[s.points.length - 1].map(v => v.toFixed(2))}`)
}

// Does every endpoint of the spur's strokes coincide with another stroke's vertex?
const vk = p => Math.round(p[0] * 1e4) + ',' + Math.round(p[1] * 1e4)
const allV = new Map()
for (const s of res.faceStreets) for (const p of s.points) allV.set(vk(p), (allV.get(vk(p)) || 0) + 1)
console.log('\nendpoint sharing (a dangling end has count 1):')
for (const s of mine) {
  for (const [lbl, p] of [['head', s.points[0]], ['tail', s.points[s.points.length - 1]]]) {
    console.log(`  ${(s.spurCap ? 'CAP' : s.spurSide || 'centre').padEnd(8)} ${lbl}  count=${allV.get(vk(p))}  ${p.map(v => v.toFixed(3))}`)
  }
}

const faces = extractFaces(res.faceStreets)
console.log(`\nextractFaces → ${faces.length} bounded faces`)
const idxOf = new Map(res.faceStreets.map((s, i) => [i, s]))
let hits = 0
faces.forEach((f, fi) => {
  const n = f.edges.filter(e => (idxOf.get(e.streetIdx)?.skelId || idxOf.get(e.streetIdx)?.name) === target).length
  if (n) { hits++; console.log(`  face#${fi}: ${n}/${f.edges.length} edges are ${target}`) }
})
if (!hits) console.log(`  ⚠️ ${target} appears in NO face — its strokes are dangling.`)
