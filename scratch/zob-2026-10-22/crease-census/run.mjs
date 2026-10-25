// node --import ./scratch/zob-2026-10-22/crease-census/reg.mjs scratch/zob-2026-10-22/crease-census/run.mjs --look=<look> --scene=<scene>
// ⚠️ HEAVY: one bake-ground pass, from the tree it is run in, STOPPED the moment cutCreases settles. Its OWN pass after the
// tranche bake, one town at a time, in the slot, under the watchdog (Boz, 2026-10-25) — never inside the bake run.
// ⛔ It cannot touch the slab: outDir is a fresh temp dir (bake-ground writes nothing before cutCreases but that dir), and the
// town's live shore-median.json is COPIED into it so a coastal town paints its shore as the bake did.
import { mkdtempSync, existsSync, copyFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { startCensus, line } from './census.mjs'
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3)
const look = arg('look'), scene = arg('scene')
if (!look || !scene) { console.error('⛔ --look= and --scene= are both required'); process.exit(2) }
const out = mkdtempSync(join(tmpdir(), `crease-census-${scene}-`)), med = join('public/baked', look, 'shore-median.json')
if (existsSync(med)) copyFileSync(med, join(out, 'shore-median.json'))
const T = startCensus()
T.onDone = () => { console.log(line(`${scene} (look ${look})`, T)); process.exit(0) }
const { bakeGround } = await import(pathToFileURL(resolve('cartograph/bake-ground.js')).href)
await bakeGround({ look, scene, outDir: out })
console.log(`⛔ ${scene}: the bake finished without reaching cutCreases (no kerb height?) — NOT CHECKED`); process.exit(2)
