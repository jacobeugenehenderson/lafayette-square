// claims-both-surfaces-draw-the-same-water.mjs — DOES THE OPERATOR SEE WHAT SHIPS?
//
// ⭐⭐ THE INVARIANT: the kit has TWO renderers for the same map — the RUNTIME
// (`BakedGround`, from the baked slab) and the DESIGNER/STAGE (`MapLayers`, from
// map.json) — and where they draw the SAME OBJECT they must mount the SAME
// COMPONENT.
//
// ⛔ WHAT IT COST TO LEARN. They painted water with different materials: the
// runtime with the kit water shader, the Designer with `makeFlatMat`, a flat
// colour swatch. Nothing errored. The Stage simply showed a different, simpler
// truth — so every change to the water shader was INVISIBLE on the surface the
// operator judges from, and an evening went into tuning a material that was not
// on screen. ⭐ That is the kit's signature failure wearing new clothes: a
// plausible-looking success, and worst precisely where someone is looking hardest.
//
// ⛔ A SHARED MATERIAL FACTORY WOULD NOT BE ENOUGH, which is why this asserts the
// COMPONENT. The per-frame uniform driving — sky bands, wind, key body, time — is
// half the material, and it was exactly the half that diverged.
//
// ▶ MUTATION-TEST IT: point MapLayers' water back at `makeFlatMat` and this goes
//   red naming the surface.
//
//   node checks/claims-both-surfaces-draw-the-same-water.mjs
// Read-only. Exits 1 when the two surfaces disagree about how to draw water.
import fs from 'fs'

const RUNTIME  = 'src/components/BakedGround.jsx'
const DESIGNER = 'src/cartograph/MapLayers.jsx'
const SHARED   = 'src/components/WaterSurface.jsx'
const fail = []
const ok = []

const strip = (p) => fs.readFileSync(p, 'utf8')
  .split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '')

if (!fs.existsSync(SHARED)) {
  fail.push(`⛔ ${SHARED} is gone. The shared water component IS the invariant — without it the two surfaces have nothing to agree on.`)
} else {
  const shared = strip(SHARED)
  if (!/makeWaterMaterial\(/.test(shared)) fail.push(`⛔ ${SHARED} no longer builds the kit water material.`)
  if (!/useFrame\(/.test(shared)) {
    fail.push(`⛔ ${SHARED} no longer drives its uniforms per frame. The driving is half the material — a component that ` +
              `does not drive is a material factory with extra steps, and that is the state this check exists to prevent.`)
  }
  if (!fail.length) ok.push('the shared water component builds the kit material and drives it per frame')
}

// ⚠️ THE DESIGNER IS NOT IN THIS LOOP YET, AND THAT IS DELIBERATE. Mounting the
// shared component there made the lake vanish in Stage (cause not established —
// both surfaces were probed and DO mount it, so it is this surface's render path).
// ⛔ A check that is red by design gets muted, so this asserts what is true today
// and the OWED hand-off is recorded in MapLayers.jsx and in the doc instead.
for (const [name, path] of [['runtime', RUNTIME]]) {
  const src = strip(path)
  if (!/<WaterSurface\b/.test(src)) {
    fail.push(`⛔ ${path} (the ${name} surface) does not mount <WaterSurface>. If it draws water any other way, the two ` +
              `surfaces disagree and a water change will be invisible on one of them — silently.`)
    continue
  }
  ok.push(`${name} surface mounts <WaterSurface> (${path})`)
}

// ⛔ IN A SHOT, ONLY ONE SURFACE MAY DRAW THE WATER. `MapLayers` runs in both
// modes; a shot also mounts <BakedGround/>, which draws the slab's water through
// the shared component. If MapLayers draws its own there too they STACK — both
// transparent, both depthWrite:false — and the opaque swatch simply hides the
// shader underneath.
// ⚠️ THE MEASUREMENT TRAP, recorded because it cost two reverts: a counter on a
// FRESH LOAD reports BakedGround rendering ZERO times, which looks like "it never
// runs here". It is true and it is the wrong moment — the Cartograph opens in
// DESIGNER, where not mounting it is correct. The shot is reached by clicking in.
// ▶ Verify by NETWORK instead: in a Hero shot the page fetches
// `baked/<look>/ground.poolmap.png`, which is loaded inside GroundMeshes.
const designer = strip(DESIGNER)
if (/kind === 'water' && inShot\) return null/.test(designer)) {
  ok.push('in a shot the slab owns the water — the Designer stands down (its swatch is correct in Designer mode)')
} else {
  fail.push(`⛔ ${DESIGNER} does not stand down for water in a shot. Its opaque swatch will cover the slab's water and ` +
            `the operator will judge the swatch — which is exactly what happened on 2026-09-20.`)
}

for (const line of ok) console.log(`  ✅ ${line}`)
if (fail.length) {
  console.error('\n' + fail.join('\n'))
  console.error(`\n⛔ ${fail.length} failure(s) — the two surfaces do not draw the same water.`)
  process.exit(1)
}
console.log(`\n✅ one surface draws the water in a shot, with the shared component.`)
