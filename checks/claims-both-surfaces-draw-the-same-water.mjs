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

for (const [name, path] of [['runtime', RUNTIME], ['designer', DESIGNER]]) {
  const src = strip(path)
  if (!/<WaterSurface\b/.test(src)) {
    fail.push(`⛔ ${path} (the ${name} surface) does not mount <WaterSurface>. If it draws water any other way, the two ` +
              `surfaces disagree and a water change will be invisible on one of them — silently.`)
    continue
  }
  ok.push(`${name} surface mounts <WaterSurface> (${path})`)
}

// ⛔ And the specific regression, by name: the Designer must not paint water flat.
const designer = strip(DESIGNER)
// ⛔ Scoped to the water BRANCH, not to "somewhere near the word water" — a
// first version matched the makeFlatMat that serves every OTHER ground kind
// three lines below and reported a failure that was not there. A guard that
// cries wolf gets muted, which is worse than no guard.
const branch = designer.match(/if \(kind === 'water'\)\s*\{[\s\S]*?\n\s*\}/)
const waterFlat = !branch || /makeFlatMat/.test(branch[0]) || !/<WaterSurface\b/.test(branch[0])
if (waterFlat) {
  fail.push(`⛔ ${DESIGNER}'s water branch does not hand off to <WaterSurface> (or paints it flat). That is the exact ` +
            `divergence this check was written for: the operator would be judging a different surface from the one that ships.`)
} else {
  ok.push('the Designer does not paint water with a flat swatch')
}

for (const line of ok) console.log(`  ✅ ${line}`)
if (fail.length) {
  console.error('\n' + fail.join('\n'))
  console.error(`\n⛔ ${fail.length} failure(s) — the two surfaces do not draw the same water.`)
  process.exit(1)
}
console.log(`\n✅ the Designer and the runtime draw water with one component.`)
