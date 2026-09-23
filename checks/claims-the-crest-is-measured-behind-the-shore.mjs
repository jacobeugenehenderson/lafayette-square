// claims-the-crest-is-measured-behind-the-shore.mjs — WHERE WAS THE WALL'S HEIGHT READ?
//
// ⭐⭐ THE INVARIANT: every station's crest is the terrain ONE GRID STEP LANDWARD, not
// the terrain under the shoreline arc.
//
// ⛔⛔ WHY. A shoreline arc sits AT the water, so the ground beneath it is ~0 BY
// CONSTRUCTION — the wall is what stands behind it. Reading the crest at the station
// gave huron a MEDIAN crest of 0.433 m against a 0.5 m threshold, so nearly every
// station sat within centimetres of the line and grid noise decided which side it fell
// on. That punched 148 one-station holes through an otherwise continuous wall and read
// to the operator as "still totally patchy" (Jacob, 2026-09-23). Reading one step inland
// takes the median to 1.234 m. ⛔ The defect was never in the predicate; the predicate
// was handed a number measured in the wrong place.
//
// ⛔ THIS CHECKS THE HEIGHTS THEMSELVES, NOT THE STAMP. `crestProbeM` in the artifact is
// a claim; a baker could stamp it and still sample at the station. So this re-derives
// BOTH readings from the town's own heightfield and asks which one the artifact's crests
// actually match. A stamp cannot lie its way past it.
//
// ⭐ MUTATION TEST, AND IT NEEDS NO EDIT: run it against any revetment.json baked before
// 2026-09-23 and it MUST go red — those were sampled at the station. That is a mutation
// with real data rather than a temporary sabotage of the source.
//
//   node checks/claims-the-crest-is-measured-behind-the-shore.mjs        # every town
//   node checks/claims-the-crest-is-measured-behind-the-shore.mjs huron
// Read-only. Exits 1 if a town's crests match the at-station reading.
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const only = process.argv[2] || null
let failed = false, towns = 0, without = 0

for (const look of readdirSync(join(ROOT, 'public', 'baked'), { withFileTypes: true })
  .filter(d => d.isDirectory()).map(d => d.name).sort()) {
  if (only && look !== only) continue
  const rp = join(ROOT, 'public', 'baked', look, 'revetment.json')
  if (!existsSync(rp)) { console.log(`  ${look.padEnd(18)} no revetment.json`); without++; continue }
  const doc = JSON.parse(readFileSync(rp, 'utf8'))
  if (!doc.arcs?.length) { console.log(`  ${look.padEnd(18)} no shoreline`); without++; continue }
  const scene = doc.scene || look
  const tmP = join(ROOT, 'cartograph', 'data', scene, 'clean', 'terrain.json')
  const tbP = join(ROOT, 'cartograph', 'data', scene, 'clean', 'terrain.bin')
  if (!existsSync(tmP) || !existsSync(tbP)) { console.log(`  ⚠️ ${look.padEnd(16)} no clean/terrain — CANNOT VERIFY`); failed = true; continue }
  const tm = JSON.parse(readFileSync(tmP, 'utf8'))
  const tb = readFileSync(tbP)
  const tf = new Float32Array(tb.buffer, tb.byteOffset, tb.length / 4)
  const stepX = (tm.bounds.maxX - tm.bounds.minX) / (tm.width - 1)
  const stepZ = (tm.bounds.maxZ - tm.bounds.minZ) / (tm.height - 1)
  const gridM = Math.min(stepX, stepZ)
  const heightAt = (x, z) => {
    const gx = Math.round((x - tm.bounds.minX) / stepX), gz = Math.round((z - tm.bounds.minZ) / stepZ)
    if (gx < 0 || gz < 0 || gx >= tm.width || gz >= tm.height) return NaN
    const v = tf[gz * tm.width + gx]
    return Number.isFinite(v) ? v : NaN
  }
  towns++
  let matchLand = 0, matchStation = 0, n = 0
  for (const arc of doc.arcs) {
    // ⛔ A two-faced arc has no landward at all; the station IS its crest there, by
    // ruling. Excluded rather than counted as evidence either way.
    if ((arc.faces || []).length !== 1) continue
    // ⛔⛔ THE CHECK DOES NOT USE THE WINDING CONVENTION AT ALL, AND THAT IS DELIBERATE.
    // My first cut derived landward from `faces` with the same sign expression the baker
    // used — and I had that sign inverted in BOTH. The check would have agreed with the
    // bug and called probing INTO the water correct. ⭐ So it asks the ground instead:
    // landward is, by definition, the HIGHER side. That is independent of any convention,
    // so a sign error in bake-revetment has nowhere to hide.
    const st = arc.stations
    for (let i = 1; i < st.length - 1; i++) {
      const c = st[i].crest
      if (c == null || !Number.isFinite(c)) continue
      const tx = st[i+1].x - st[i-1].x, tz = st[i+1].z - st[i-1].z
      const m = Math.hypot(tx, tz); if (!m) continue
      const rx = -tz / m, rz = tx / m
      const hR = heightAt(st[i].x + rx * gridM, st[i].z + rz * gridM)
      const hL = heightAt(st[i].x - rx * gridM, st[i].z - rz * gridM)
      const hAt = heightAt(st[i].x, st[i].z)
      if (!Number.isFinite(hR) || !Number.isFinite(hL) || !Number.isFinite(hAt)) continue
      const hLand = Math.max(hR, hL)   // the land is the high side; no convention needed
      // Only stations where the two readings actually DIFFER can discriminate.
      if (Math.abs(hLand - hAt) < 0.05) continue
      n++
      if (Math.abs(c - Math.max(0, hLand)) < 0.02) matchLand++
      else if (Math.abs(c - hAt) < 0.02) matchStation++
    }
  }
  const pct = n ? (100 * matchLand) / n : 0
  const ok = n > 0 && pct >= 90
  console.log(`  ${ok ? '✅' : '⛔'} ${look}/revetment  ${matchLand}/${n} discriminating stations match the LANDWARD read (${pct.toFixed(1)}%) · ` +
    `${matchStation} match the AT-STATION read · stamped crestProbeM ${doc.crestProbeM ?? '(absent)'} · gridM ${gridM.toFixed(3)}`)
  if (!ok) {
    console.log(`       ⛔ THE CREST IS BEING READ AT THE WATERLINE, where the ground is ~0 by construction.`)
    console.log(`          The wall's height is not where the arc is — it is one grid step behind it.`)
  }
  if (!ok) failed = true
}
console.log(`\n  ${towns} town(s) checked · ${without} without a revetment`)
if (failed) { console.log('\n⛔ a crest is measured in the wrong place — the armour predicate is being fed the waterline'); process.exit(1) }
console.log('\n✅ every crest is measured behind the shore, one grid step landward')
