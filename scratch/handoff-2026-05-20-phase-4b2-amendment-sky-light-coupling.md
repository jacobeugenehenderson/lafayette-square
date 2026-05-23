# Phase 4b.2 — AMENDMENT: sky-light coupling

**From:** Meteorologist orchestrator
**To:** Wren (continuing 4b.2)
**Date:** 2026-05-20

---

Small extension to the brief you're already working. Jacob asked whether the clouds can pick up light from the sky honestly — the answer is yes, with three more uniform writes in the same `useFrame` loop you're already editing. Fold this into the same commit.

## What

The `<Atmosphere />` shader already has three lighting uniforms set up for this:

- `uSunDir` — currently hardcoded `vec3(0, 0.7, 0.7).normalize()`
- `uSunColor` — currently hardcoded `'#ffe6c8'` (warm)
- `uSkyColor` — currently hardcoded `'#9faab8'` (grey-blue)

The sky pivot's resolved mosaic has everything needed to drive them live.

## How

In the same `useFrame` block where you're writing the 12 preset-bound uniforms, add three more lines reading from the sky channel and SunCalc:

```js
import SunCalc from 'suncalc'
import { resolveSkyAtMinute } from '../cartograph/skyGrid.js'
import { useSceneJson } from '../lib/useSceneJson.js'
import { INSTANCE } from '../instance.js'

// (inside Atmosphere component, before useFrame)
const lookId = resolveLookId(propLookId)  // same pattern as CelestialBodies
const scene = useSceneJson(lookId)
const skyChannel = scene?.skyLight?.sky ?? SKY_DEFAULT_CHANNEL  // same default as CelestialBodies uses

// (inside useFrame, after the preset uniforms write)
const currentTime = useTimeOfDay.getState().currentTime
const slotMinutes = getTodSlotMinutes(currentTime)
const minute = currentTime.getHours() * 60 + currentTime.getMinutes()

const sky = resolveSkyAtMinute(skyChannel, minute, slotMinutes)
material.uniforms.uSunColor.value.set(sky.sunGlow)
material.uniforms.uSkyColor.value.set(sky.low)

const sunPos = SunCalc.getPosition(currentTime, INSTANCE.geography.lat, INSTANCE.geography.lon)
material.uniforms.uSunDir.value.set(
  Math.cos(sunPos.altitude) * Math.sin(sunPos.azimuth),
  Math.sin(sunPos.altitude),
 -Math.cos(sunPos.altitude) * Math.cos(sunPos.azimuth),
).normalize()
```

(Sample `CelestialBodies.jsx`'s sun-direction math if mine has a sign error — that file is the authority on this projection and it's been right for months.)

## The physical mapping

- **`uSunColor` ← `sky.sunGlow`** — the sunGlow band is literally the sun's color at this minute; clouds catch it on the side facing the sun
- **`uSkyColor` ← `sky.low`** — the low (horizon-ish) band is what cloud undersides see when they look down at the sky; this is the dominant ambient
- **`uSunDir`** — real sun position, same source CelestialBodies uses for its own directional light

No shader changes. The existing lighting model just gets honest inputs instead of hardcoded ones. Result: clouds warm at golden hour, deepen blue at twilight, dim at night — automatically, tracking the sky.

## Verification (in addition to the original 4b.2 checks)

- Scrub the TOD strip from noon → sunset → night. The cloud's lit color should track the sky — golden at sunset, deep blue at twilight, dark at night.
- Scrub the year strip across seasons. Winter's lower sun should warm-bias the cloud lighting more of the day than summer. (This is automatic — SunCalc gives real altitudes; sky mosaic resolves accordingly.)
- Author an override on the `sunGlow` band at 18:00 (bright magenta, say). At 6pm the cloud should pick up that magenta tint. This proves the sky-side authoring surface flows through to the cloud-side lighting.

## Disclosure

In the commit body, mention:

- Which `useSceneJson` path you used (Meteorologist already calls it for CanaryScene's sky; reuse that lookId resolution)
- If your sun-direction math differs from CelestialBodies' (it shouldn't; flag if so)
- Any sign/normalization gotcha you hit

## Why fold this in

It's the same per-frame loop, the same conceptual move (stop hardcoding, read from honest sources), and the same file. Splitting it into a follow-up phase would be ceremony. One commit, both wirings, both visible at once.

— Claude (Meteorologist orchestrator)
