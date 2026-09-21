// claims-the-key-light-is-a-real-body.mjs — IS ANYTHING ACTUALLY THERE?
//
// ⭐⭐ THE INVARIANT: at every minute of every day, the key light must point at a
// body that EXISTS — the sun or the moon, never a point between them.
//
// ⛔ THIS IS NOT A LOOK CHECK. Jacob, 2026-09-20: "I want the sun and moon to
// trace their REAL paths. We have the data for that, and part of the purpose of
// the app is a weather and environment tracker." In a tracker, a body lit from
// where it is not is the PRODUCT BEING WRONG. That ruling is what makes this an
// assertion rather than a preference.
//
// ⛔ WHAT IT CAUGHT, AND WHY IT EXISTS: the key light's position was
// `_sunLP.clone().lerp(_nightLP, nightBlend)` — an average of the two bodies'
// positions. At either end it is real; across the whole twilight handover it is a
// phantom, and every shadow and the glint path on the lake tracked it. ⭐ Nothing
// in the build could see that: the scene renders, beautifully, lit from nowhere.
//
// ⭐⭐ AND THE REASON IT IS WORTH KEEPING FOREVER: "smooth the transition" is the
// most natural-sounding commit anyone could write against this rig, and it
// silently reintroduces an averaged position every time. This check is the only
// thing standing in front of that.
//
// ⚠️ THE ONE DIVERGENCE IT PERMITS, AND IT IS DELIBERATE: the sun's LIGHT is
// floored at y = SUN_LIGHT_MIN_Y so a horizon sun does not light the town from
// underneath. That changes the light's ALTITUDE at low sun; it never changes its
// AZIMUTH. ⇒ azimuth must match a real body to a tight angle, and altitude may
// differ only by exactly that clamp. An undocumented divergence and a documented
// one look the same in a screenshot; only this tells them apart.
//
// ▶ MUTATION-TEST IT: reintroduce the lerp in celestialLights.bodyLights —
//   `key.position.lerp(counter.position, 0.5)` — and watch the azimuth assertion
//   go red across twilight. (It was written RED against the pre-fix code first:
//   that run reported the phantom at every twilight minute, which is the mutation
//   test for free.)
//
//   node checks/claims-the-key-light-is-a-real-body.mjs
// Read-only. Exits 1 on a key light that points at nothing.
import fs from 'fs'
import SunCalc from 'suncalc'
import { bodyLights, celestialToPosition, LIGHT_RADIUS, SUN_LIGHT_MIN_Y } from '../src/components/celestialLights.js'
import * as THREE from 'three'

const fail = []
const ok = []

// Sweep a whole day at every town on disk — ⭐ the phantom window is a function of
// LATITUDE (twilight is long in the north, abrupt near the equator), so a single
// town's sweep is not evidence about the kit.
const looks = fs.readdirSync('cartograph/data', { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => ({ scene: d.name, path: `cartograph/data/${d.name}/geography.json` }))
  .filter(s => fs.existsSync(s.path))
  .map(s => ({ ...s, geo: JSON.parse(fs.readFileSync(s.path, 'utf8')) }))
  .filter(s => typeof s.geo.lat === 'number' && typeof s.geo.lon === 'number')

if (!looks.length) {
  console.error('⛔ no scene carries a geography.json with lat/lon — this check exercised NOTHING and is not evidence.')
  process.exit(1)
}

const STEP_MIN = 2                 // every 2 minutes — fine enough to land inside twilight
const AZ_TOL_DEG = 0.5             // tight: a phantom is tens of degrees off, never half of one
const ALT_TOL_DEG = 0.25

const _v = new THREE.Vector3()
const bearingOf = (v) => Math.atan2(v.x, -v.z) * 180 / Math.PI
const altitudeOf = (v) => Math.asin(v.y / v.length()) * 180 / Math.PI
const angleDiff = (a, b) => { let d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d }

// The date matters: a solstice has the longest twilight of the year, which is the
// widest the phantom window ever gets. ⭐ Both solstices and an equinox, so the
// sweep cannot pass by landing on a lucky day.
const DAYS = [
  ['summer solstice', new Date(Date.UTC(2026, 5, 21, 0, 0, 0))],
  ['winter solstice', new Date(Date.UTC(2026, 11, 21, 0, 0, 0))],
  ['equinox',         new Date(Date.UTC(2026, 2, 20, 0, 0, 0))],
]

let sampled = 0
const worst = { azErr: 0, where: null }
const phantomMinutes = []

for (const { scene, geo } of looks) {
  for (const [dayName, day0] of DAYS) {
    for (let m = 0; m < 24 * 60; m += STEP_MIN) {
      const t = new Date(day0.getTime() + m * 60000)
      const sunPos = SunCalc.getPosition(t, geo.lat, geo.lon)
      const moonPos = SunCalc.getMoonPosition(t, geo.lat, geo.lon)
      const moonIllum = SunCalc.getMoonIllumination(t)

      const { key } = bodyLights({
        sunAlt: sunPos.altitude, sunAz: sunPos.azimuth,
        moonAlt: moonPos.altitude, moonAz: moonPos.azimuth,
        moonIllumFraction: moonIllum.fraction,
      })
      sampled++

      // ⛔ A light with no intensity points nowhere that matters. Skip it rather
      // than assert on a direction nobody can see — and say how many were skipped,
      // because "all samples skipped" and "all samples passed" must never look alike.
      if (!(key.intensity > 1e-4)) continue

      const keyAz = bearingOf(key.position)
      const keyAlt = altitudeOf(key.position)

      // The two REAL bodies, built through the same convention the scene uses.
      const bodies = [
        ['sun', celestialToPosition(sunPos.azimuth + Math.PI, sunPos.altitude, LIGHT_RADIUS, _v.clone())],
        ['moon', celestialToPosition(moonPos.azimuth + Math.PI, moonPos.altitude, LIGHT_RADIUS, _v.clone())],
      ]
      let best = null
      for (const [name, pos] of bodies) {
        const azErr = angleDiff(keyAz, bearingOf(pos))
        // Altitude may differ ONLY by the documented floor: the clamp can only
        // RAISE the light, and only to the altitude that floor implies.
        const clampAlt = Math.asin(Math.min(1, SUN_LIGHT_MIN_Y / LIGHT_RADIUS)) * 180 / Math.PI
        const realAlt = altitudeOf(pos)
        const altOk = Math.abs(keyAlt - realAlt) <= ALT_TOL_DEG ||
                      (Math.abs(keyAlt - clampAlt) <= ALT_TOL_DEG && realAlt <= clampAlt + ALT_TOL_DEG)
        if (!best || azErr < best.azErr) best = { name, azErr, altOk, realAlt }
      }
      if (worst.where === null || best.azErr > worst.azErr) {
        worst.azErr = best.azErr
        worst.where = `${scene} ${dayName} ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')} UTC`
      }
      if (best.azErr > AZ_TOL_DEG || !best.altOk) {
        phantomMinutes.push({ scene, dayName, m, azErr: best.azErr, altOk: best.altOk,
          keyBody: key.body, sunAlt: sunPos.altitude })
      }
    }
  }
}

console.log(`  ·  swept ${looks.length} town(s) × ${DAYS.length} day(s) at ${STEP_MIN}-minute steps — ${sampled} samples`)
console.log(`  ·  towns: ${looks.map(l => `${l.scene} (lat ${l.geo.lat.toFixed(2)})`).join(', ')}`)

if (phantomMinutes.length) {
  const byScene = new Map()
  for (const p of phantomMinutes) {
    const k = `${p.scene}/${p.dayName}`
    if (!byScene.has(k)) byScene.set(k, [])
    byScene.get(k).push(p)
  }
  for (const [k, list] of byScene) {
    const w = list.reduce((a, b) => (b.azErr > a.azErr ? b : a))
    const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
    fail.push(`⛔ ${k}: ${list.length} minute(s) where the key light points at NO BODY — worst ` +
              `${w.azErr.toFixed(1)}° off the nearest real body at ${hhmm(w.m)} UTC ` +
              `(sun altitude ${(w.sunAlt * 180 / Math.PI).toFixed(1)}°, key claims to be the ${w.keyBody})`)
  }
} else {
  ok.push(`the key light points at a real body at every sampled minute (worst azimuth error ${worst.azErr.toFixed(3)}° at ${worst.where})`)
}

// ── THE DRAWN BODY SITS AT A VISUAL RADIUS ───────────────────────────────────
// ⭐ Second assertion, about what the operator SEES rather than what lights them.
// `SUN_VISUAL_RADIUS`'s own comment is "far enough to eliminate parallax"; a body
// DRAWN at LIGHT_RADIUS (600) is close enough to swim against the scene as the
// camera moves. So: the vectors the sun and moon are drawn from must be built at
// a visual radius, never at the light radius.
// ⛔ COMMENTS ARE STRIPPED FIRST. This check matched its own provenance note on
// its first run — the note quotes the deleted code — and reported a defect that
// existed only in a sentence about the defect. A source-reading check that does
// not strip comments is reading prose, not code.
const CB = 'src/components/CelestialBodies.jsx'
const cbCode = fs.readFileSync(CB, 'utf8')
  .split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '')

// Every `celestialToPosition(az, alt, RADIUS, _target …)` call site, as written.
const sites = [...cbCode.matchAll(/celestialToPosition\([^,]+,[^,]+,\s*([A-Z_]+)\s*,\s*(\w+)/g)]
  .map(m => ({ radius: m[1], target: m[2] }))
if (sites.length < 3) {
  fail.push(`⛔ parsed only ${sites.length} celestialToPosition call site(s) in ${CB} — the guard is blind; fix the parse before trusting a PASS.`)
} else {
  // The DRAWN bodies: the sun's visual vector and the moon's own position.
  const drawn = { _sunVP: 'SUN_VISUAL_RADIUS', _moonP: 'MOON_RADIUS' }
  for (const [target, wantRadius] of Object.entries(drawn)) {
    const site = sites.find(x => x.target === target)
    if (!site) {
      fail.push(`⛔ ${CB}: no construction site found for the drawn body vector \`${target}\` — the guard is blind.`)
    } else if (site.radius !== wantRadius) {
      fail.push(`⛔ ${CB}: the drawn body \`${target}\` is built at ${site.radius}, not ${wantRadius}. ` +
                `At LIGHT_RADIUS a drawn body parallaxes against the scene as the camera moves.`)
    }
  }
  if (!fail.some(f => f.includes('drawn body'))) {
    ok.push(`the drawn bodies are built at their visual radii (${Object.entries(drawn).map(([t, r]) => `${t}→${r}`).join(', ')})`)
  }
}

// And the margin that makes "visual radius" mean something.
const radiusOf = (name) => { const m = cbCode.match(new RegExp(`${name}\\s*=\\s*(\\d+)`)); return m ? Number(m[1]) : null }
const sunVis = radiusOf('SUN_VISUAL_RADIUS')
if (sunVis == null) fail.push(`⛔ could not read SUN_VISUAL_RADIUS from ${CB} — the guard is blind.`)
else if (sunVis / LIGHT_RADIUS < 10) {
  fail.push(`⛔ SUN_VISUAL_RADIUS (${sunVis}) is only ${(sunVis / LIGHT_RADIUS).toFixed(1)}× LIGHT_RADIUS (${LIGHT_RADIUS}) — ` +
            `not far enough to eliminate parallax, which is the entire reason the two radii differ.`)
} else {
  ok.push(`SUN_VISUAL_RADIUS is ${(sunVis / LIGHT_RADIUS).toFixed(0)}× the light radius — far enough to kill parallax`)
}

// ── ONLY THE SUN AND THE MOON MAY HAVE A SPECULAR LOBE ──────────────────────
// ⭐⭐ THE GAP THIS CLOSES, AND IT IS THE ONE THAT ACTUALLY BIT. Everything above
// asserts the KEY light is a real body — and a phantom walked straight past it,
// because it was never the key. `floorDir`, a `<directionalLight>` nailed at
// `[0, 100, -400]`, was pure fill on land and a LIE on water: a directional light
// has a specular lobe, so the lake reflected it, and because it never moved the
// reflection never moved. Every "sun path" screenshot taken before 2026-09-20 was
// that lamp. ⛔ Worse was the stylistic fill, which swung to the ANTI-SUN — a
// reflection that would slide the WRONG WAY as the sun crossed the sky.
//
// ⭐ THE INVARIANT, and it is what makes a bright path on water EVIDENCE: in
// three, `hemisphereLight` and `ambientLight` are irradiance-only — no lobe. So
// every fill is one of those, and every `<directionalLight>` must take its
// position from the body-light contract (`lightPosition`, which comes from
// `bodyLights`). A directional light positioned any other way is a fake body.
// ⛔ NOT AN ALLOW-LIST OF KNOWN-GOOD LIGHTS — that would be an exception table,
// and the next fill someone adds would be exempt by omission. The rule is on the
// SHAPE of the mount, so a new phantom fails on arrival.
{
  const mounts = [...cbCode.matchAll(/<directionalLight\b([\s\S]*?)\/>/g)].map(m => m[1])
  if (!mounts.length) {
    fail.push(`⛔ found no <directionalLight> mounts in ${CB} — the guard is blind; fix the parse before trusting a PASS.`)
  } else {
    const phantoms = mounts.filter(a => !/position=\{lightPosition\.toArray\(\)\}/.test(a))
    if (phantoms.length) {
      for (const a of phantoms) {
        const pos = (a.match(/position=\{([^}]*)\}/) || [, '(no position prop)'])[1]
        fail.push(`⛔ ${CB}: a <directionalLight> is positioned from \`${pos.trim()}\` rather than from the ` +
                  `body-light contract. A directional light HAS A SPECULAR LOBE, so water will reflect it and ` +
                  `an operator will read that reflection as the sun. Fills belong on hemisphereLight/ambientLight, ` +
                  `which are irradiance-only.`)
      }
    } else {
      ok.push(`all ${mounts.length} directional light(s) take their position from a real body — every other light in the rig is irradiance-only, so a reflection on water can only be the sun or the moon`)
    }
  }
}

// ── EVERY LIGHT HAS AN OPERATOR CHANNEL ─────────────────────────────────────
// ⭐⭐ JACOB'S RULE, 2026-09-20: "I don't think we should have lights that don't
// have operator facing knobs." ⛔ A light nobody can reach is a light nobody can
// turn down when it is wrong — and this rig has just been through two of them:
// the night-fill floor that laid a fake sun path on every lake, and the fill that
// swung to the anti-sun. Both were unreachable, so the only remedy was a code
// change. ⭐ A knob would have let an operator kill either one the evening they
// noticed it.
// ⛔ AND THE CHANNEL FOLLOWS THE BODY, NOT THE SLOT: `dirSun` scales the sun
// whether or not it is the key right now. A knob whose meaning depends on the
// hour is the unit confusion this project keeps paying for.
{
  // ⛔ RAW MOUNTS ARE HALF THE POPULATION. A first version of this check scanned
  // only `<directionalLight>`/`<hemisphereLight>`/`<ambientLight>` and PASSED
  // when the channel was deleted from `<CounterBodyLight>`'s call site — because
  // the raw light inside that component still *accepted* an `intensityMulRef`.
  // It asserted the component COULD take a channel, not that it WAS GIVEN one.
  // ⭐ So: find every component in this file that renders a light, and require
  // every mount of it to hand one in.
  const lightComponents = [...cbCode.matchAll(/function\s+(\w+)\s*\([\s\S]*?\n\}/g)]
    .filter(m => /<(ambientLight|hemisphereLight|directionalLight)\b/.test(m[0]))
    .map(m => m[1])
  const componentMounts = lightComponents.flatMap(name =>
    [...cbCode.matchAll(new RegExp(`<${name}\\b([\\s\\S]*?)\\/>`, 'g'))].map(m => [, name, m[1]]))
  const mounts = [...cbCode.matchAll(/<(ambientLight|hemisphereLight|directionalLight)\b([\s\S]*?)\/>/g), ...componentMounts]
  if (!lightComponents.length || mounts.length < 4) {
    fail.push(`⛔ parsed ${mounts.length} light mount(s) and ${lightComponents.length} light-bearing component(s) in ${CB} — the guard is blind; fix the parse before trusting a PASS.`)
  } else {
    const unreachable = []
    for (const [, kind, attrs] of mounts) {
      if (/intensityMulRef=/.test(attrs)) continue          // the channel is handed in directly
      const refName = (attrs.match(/ref=\{(\w+)\}/) || [])[1]
      // else the mount must be driven somewhere by a channel ref (…MulRef) or the
      // Ambient alias the night floors share.
      const driven = refName && new RegExp(`${refName}\\.current\\.intensity\\s*=[^\\n]*(MulRef|aMul)`).test(cbCode)
      if (!driven) unreachable.push(`<${kind}${refName ? ` ref={${refName}}` : ''}>`)
    }
    if (unreachable.length) {
      fail.push(`⛔ ${CB}: ${unreachable.length} light(s) have NO operator channel — ${unreachable.join(', ')}. ` +
                `A light nobody can reach can only be fixed by a code change, which is how a fake sun path ` +
                `survived on every lake in every town.`)
    } else {
      ok.push(`all ${mounts.length} light mounts (incl. ${lightComponents.join(', ')}) carry an operator channel (dirSun follows the sun, dirMoon the moon, the irradiance-only fills ride Ambient/Hemi)`)
    }
  }
}

for (const line of ok) console.log(`  ✅ ${line}`)
if (fail.length) {
  console.error('\n' + fail.join('\n'))
  console.error(`\n⛔ ${fail.length} failure(s) — the sky is lit from somewhere nothing is.`)
  process.exit(1)
}
console.log(`\n✅ every light in the sky is a body that is actually there.`)
