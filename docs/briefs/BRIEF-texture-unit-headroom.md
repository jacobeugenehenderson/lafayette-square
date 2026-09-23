<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-22
evict-when: cascades link and draw at N≥2 on huron AND a link failure names its material in the console AND RULING: Jacob's eye on the hero pan with cascades on
-->

# Every shadow receiver is one texture away from drawing nothing

> **The ask (Jacob, 2026-09-22):** freeing fragment texture units *"is a smart move anyway
> w/r/t the kit."* It is. Cascades are the occasion, not the reason.

⭐ **This is a headroom job, not a feature job.** Read §1 and §2, confirm the premises in §3,
then build §5. ⛔ The premises are CLAIMS — several of mine died tonight; check them.

---

## 1 · THE CEILING, AND WHY ITS FAILURE IS INVISIBLE

`MAX_TEXTURE_IMAGE_UNITS` is **16** — the GL ES *guaranteed minimum*, and what many phones
actually report. Cross it and the program **does not link**:

```
THREE.WebGLProgram: Shader Error 0 - VALIDATE_STATUS false
Program Info Log: FRAGMENT shader texture image units count exceeds MAX_TEXTURE_IMAGE_UNITS(16)
WebGL: INVALID_OPERATION: useProgram: program not valid
```

⛔ **There is no degraded mode. The surface draws NOTHING.** Measured 2026-09-22: mounting 3
cascaded shadow maps added three fragment samplers to every receiver and produced a bright,
shadowless ground. It took **four round trips with the operator** to identify, while the
error sat in the console the entire time — because nothing about the picture says *"a shader
did not link,"* and the error does not name the material.

⚠️ **The project has hit the neighbouring ceiling with the same silent shape.** The tree
shader sat at exactly `MAX_VERTEX_ATTRIBS = 16`; one more attribute killed the link and
**every tree vanished** (`treeAtlasMaterial.js`, the `aWindRadialNorm` note). Same class,
different budget, same four-hours-to-find.

⭐ **Layer 0.** The ceiling is invisible on the device and town you developed against and
catastrophic on the next one. A desktop with 32 units hides what a phone with 16 will not,
and a town with more land-use classes or one more authored map crosses it with no warning.
**This is the kit's signature failure: fine on town #1, dead on town #2.**

## 2 · THE SLACK IS REAL AND THE FIRST MOVE IS SMALL

`cartograph/bake-ground-ao.js` writes the ground FX map and its own header says:
`R: lamp light pools · G: contact shadows`. **B and A are unused.** The AO lightmap is a
SEPARATE full texture carrying what is fundamentally one scalar.
⇒ **Packing AO into the FX map's free channel is one unit freed, from the same bake pass,
with no quality loss.** That is the obvious first cut and it is not the whole job.

⚠️ **Packing has a cost, and it is not free by assumption:** channels sharing a texture share
its compression and mip behaviour. That is exactly why the master atlas is excluded from
KTX2 transcoding (`arborist/ARCHITECTURE.md`). AO and contact shadows are both soft,
low-frequency data and *should* pack cleanly — ⛔ **measure it, do not assume it.**

## 3 · PREMISES TO CONFIRM BEFORE BUILDING — they are claims

1. **That the ground is the tightest receiver.** Not established. Nobody has counted the
   REAL per-program sampler total for any material.
2. **That AO + contact shadow pack without visible loss.** Not established.
3. **That 2 cascades link today.** ⛔ Untested — the operator was handed `?csm=1&cascades=2`
   and the session ended before a result. **Run this first; it may change the whole scope.**
4. **That freeing N units buys N cascades.** A cascade costs one sampler on EVERY receiver,
   so the TIGHTEST receiver sets the cap for the scene — not the average.

## 4 · ⛔ WHAT NOT TO DO — a dead end already walked, 2026-09-22

**A STATIC check that counts samplers by reading source files DOES NOT WORK.** One was
written and deleted the same hour. It reported `BakedGround: 2 samplers, 13 free ⇒ 13
cascades safe` — while three cascades demonstrably broke the link.

⛔ The reason is structural, not a patchable bug: **shader injection crosses files.**
`BakedGround` calls `applyWeatherToShader` from `lib/weather-uniforms.js`, which declares its
own samplers into the same program; `onBeforeCompile` composes at runtime, conditionally, and
a static reader cannot know which branches a given program took. Chasing imports does not
close it.

⭐ **A green check that is blind is worse than no check** — it is the plausible-looking
success Layer 0 forbids, inside the detector. Do not rebuild it.

## 5 · THE JOB

### A. THE INSTRUMENT FIRST — attribution, not detection
Detection already exists; three prints the error. What is missing is **which material**.
Wrap program compilation / link so a failure logs **the material's name, its sampler count,
and the ceiling**. ⛔ It must read the REAL program (`gl.getProgramParameter(LINK_STATUS)`,
`gl.getParameter(MAX_TEXTURE_IMAGE_UNITS)`), never a source estimate — §4.
⭐ This turns tonight's four-round mystery into one line, on every town and every device.

### B. THEN FREE THE UNITS
Start with AO → the FX map's free channel (§2). Then census the real totals with the
instrument from (A) and cut where the tightest receiver is.
⚠️ **Slab-format change**: touches the bake, the manifest, and every consumer. The existing
maps are cache-busted per bake, so a format bump must move `groundKey`/manifest together or
a stale artifact renders against new code — the failure `BakedGround`'s `groundKey` guard
already exists to catch.

### C. THE CASCADE SPIKE IS IN THE TREE, GATED OFF
`src/components/CascadedShadows.jsx` + mounts in Preview and Stage, all behind **`?csm=1`**
(`?cascades=N`, default 2). Absent the flag nothing changes. What it already solves, so it is
not re-derived:
- ⛔ `CSM.setupMaterial()` **assigns** `material.onBeforeCompile`. This scene puts custom
  ones on nearly every receiver. `attachCSM` **composes** instead — never call setupMaterial
  directly or the whole look silently collapses.
- ⛔ CSM creates **one full-intensity directional light per cascade** and is designed to BE
  the key. Left beside the existing key that is 1+N suns — huron at `dirSun 1.5` ran ~4.5×
  and the ground blew out white. The rig now carries the key's intensity/colour and
  `CelestialBodies` zeroes its own under the flag.
- ⛔ drei's `<SoftShadows>` (PCSS) and CSM both overwrite
  `THREE.ShaderChunk.shadowmap_pars_fragment` **globally**. Whichever lands second wins and
  the other's sampling silently disappears. PCSS stands down under the flag.
- ⚠️ **OWED:** trees, water, park and lamps are NOT attached to the rig — they render
  unshadowed. And cascades give up contact hardening, since PCSS is what provided it.

## 6 · ACCEPTANCE
1. A link failure **names its material** in the console. Mutation-test it: force a receiver
   over the ceiling on purpose, confirm the message identifies it, restore.
2. A number: **units free on the tightest receiver, measured from the compiled program.**
3. Cascades link and draw at N≥2 on **huron** (never LS — its ~900 m disc hides the
   staircase this is all for).
4. 👁️ Jacob's eye on the hero pan with cascades on: staircase gone, and **no wipe when the
   camera turns a corner** — the boundary artifact `fade` exists to solve.

## 7 · PREMISES DELIBERATELY NOT ESTABLISHED
- That cascades are the right answer at all. **The capped single map already killed the
  staircase** (`__maxMPerTexel`, default 0.25 ⇒ 512 m box). What it left was the boundary
  wipe. ⭐ **A shader-side fade toward the box edge on ONE map would address that and costs
  ZERO extra samplers** — it may be the better engineering answer here even though cascades
  is the textbook one. Cost it before committing to the format change.
- Whether the ground's baked AO should exist at all once buildings carry their own occlusion
  (`a937f196`). If the two converge, a texture may free itself.
