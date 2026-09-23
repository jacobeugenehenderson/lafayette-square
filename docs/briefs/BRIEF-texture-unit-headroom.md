<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-22
evict-when: RULING — Jacob's eye on the hero pan with cascades on. (The other two
evict conditions were MET 2026-09-22: cascades link+draw at N=2 and N=3 on huron, and
a link failure names its material. What is left is the eye, and §7's open question of
whether cascades are the right answer at all.)
-->

# Every shadow receiver is one texture away from drawing nothing

> **The ask (Jacob, 2026-09-22):** freeing fragment texture units *"is a smart move anyway
> w/r/t the kit."* It is. Cascades are the occasion, not the reason.

⭐ **This is a headroom job, not a feature job.** ⛔ The premises were CLAIMS and **§3 is now
the measured record — three of the four did not survive.** §5A is built; §5B is the front.

---

## 1 · THE CEILING, AND WHY ITS FAILURE IS INVISIBLE

`MAX_TEXTURE_IMAGE_UNITS` is **16** — the GL ES *guaranteed minimum*, and what many phones
actually report. Cross it and the program **does not link**:

```
THREE.WebGLProgram: Shader Error 0 - VALIDATE_STATUS false
Program Info Log: FRAGMENT shader texture image units count exceeds MAX_TEXTURE_IMAGE_UNITS(16)
WebGL: INVALID_OPERATION: useProgram: program not valid
```

⛔ **There is no degraded mode. The surface draws NOTHING.** On 2026-09-22 a mount of 3
cascades produced a bright, shadowless ground and took **four round trips with the operator**
to identify, while the error sat in the console the entire time — because nothing about the
picture says *"a shader did not link,"* and the error did not name the material.
⚠️ **The CAUSE of that evening's blackout is NOT established.** "3 cascades overran the
ceiling" was the diagnosis and **it does not reproduce** — N=3 links and draws on huron with
zero dead programs (§3.3). The ceiling below is real; that night's attribution of it was not
measured. ⭐ Which is the case for §5A in one paragraph.

⚠️ **The project has hit the neighbouring ceiling with the same silent shape.** The tree
shader sat at exactly `MAX_VERTEX_ATTRIBS = 16`; one more attribute killed the link and
**every tree vanished** (`treeAtlasMaterial.js`, the `aWindRadialNorm` note). Same class,
different budget, same four-hours-to-find.

⭐ **Layer 0.** The ceiling is invisible on the town you developed against and catastrophic
on the next one: a town with more land-use classes, or one more authored map, crosses it with
no warning. **This is the kit's signature failure: fine on town #1, dead on town #2.**
⭐ On the DEVICE axis we got lucky — the dev M1 reports 16, not 32 (§3), so the cliff is
reproducible at the desk instead of only in the field.

## 2 · THE SLACK IS REAL AND THE FIRST MOVE IS SMALL

`cartograph/bake-ground-ao.js` writes the ground FX map — `R: lamp light pools ·
G: contact shadows` — and **B is genuinely free** (`fpx[i*4+2] = 0`). The AO lightmap is a
SEPARATE full texture carrying what is fundamentally one scalar. ⇒ **AO into B is one
fragment unit freed on the tightest receiver**, and it is the first cut.

⛔ **But it is a RE-BAKE, not a repack — the two maps are not co-registered.** The cost and
the coverage decision it forces are measured in **§3.2**; read that before scoping it.
⚠️ And channels sharing a texture share its compression and mip behaviour — the reason the
master atlas is excluded from KTX2 transcoding (`arborist/ARCHITECTURE.md`). AO and contact
shadow are both soft and low-frequency and *should* pack cleanly, ⛔ **but measure it.**

## 3 · THE PREMISES, MEASURED 2026-09-22 — and three of the four were wrong

▶ Reproduce any of this: open a scene, `window.__samplerCensus()`. Numbers are NOT
copied here beyond the two that carry a ruling; the census prints the current ones.

1. **"The ground is the tightest receiver."** ✅ **TRUE**, and now measured rather than
   assumed: the ground carries `uTerrainMap · uClipMap · uPoolMap · aoMap` on top of
   the shadow array — the most of any receiver.
2. **"AO + contact shadow pack without visible loss."** ⛔ **THE PREMISE IS MALFORMED,
   and §2 is wrong about why it's cheap.** It is not a compression question at all.
   **The two maps are not co-registered.** The AO lightmap is 1024² over
   `manifest.bbox` — the whole ground. The FX map has its **own** bbox
   (`union(tree extent, lamp extent) + margin`) and its **own** size, derived from
   `FX_TARGET_M_PER_TEXEL` and capped at 4096². ⇒ Packing AO into B is **not** "one
   unit freed from the same bake pass with no quality loss": it needs AO resampled
   into a different projection that **does not cover the whole ground**, so ground
   outside the tree/lamp extent would carry no AO at all. On a big town it also drags
   a 1024² scalar up to a 4096² grid for nothing. ⭐ Still worth doing — but it is a
   **re-bake into the FX projection plus a coverage decision**, not a repack.
   *(B is genuinely free: `bake-ground-ao.js` writes `fpx[i*4+2] = 0`.)*
3. **"2 cascades link today."** ✅ **TRUE — and so do 3.** Measured on huron: the scene
   draws, every program links, **zero dead programs at N=3**. ⛔⛔ **SO `7e46e512`'s COMMIT
   MESSAGE IS WRONG WHERE IT SAYS THREE CASCADES BREAK THE LINK — it does not reproduce.**
   Whatever went dark that evening was not N=3 overrunning the ceiling on huron's ground,
   and **the cause is not established**: the four-round-trip diagnosis named a culprit
   nobody had measured. ⚠️ That is the whole case for §5A, and it is the first thing the
   instrument caught — **its own brief.**
4. **"Freeing N units buys N cascades."** ✅ true in form, but ⭐ **the binding number
   is not what §1 implies.** A cascade costs a unit only on a **shadow receiver**; the
   tightest *program* in the scene is a fullscreen post pass (`EffectMaterial`, ~10
   samplers of bloom mips) which receives no shadow and is unaffected. The census
   separates the two and reports `min(free)` over receivers only.

### ⛔ AND THE ONE THAT NOBODY HAD CHECKED AT ALL
**`MAX_TEXTURE_IMAGE_UNITS` is 16 ON THE DEVELOPMENT MACHINE** — Apple M1 through
ANGLE Metal reports the GL ES guaranteed minimum, not 32. ⭐ **So §1's "a desktop with
32 units hides what a phone with 16 will not" is FALSE here, and that is good news:
the cliff is reproducible at the desk.** ⛔ It also means the headroom this job frees
is real headroom on the dev machine too — we are not developing with slack we will
lose in the field. (`MAX_COMBINED_TEXTURE_IMAGE_UNITS` is 32; the **fragment** limit
is the one that bites, and it is the one the census reads.)

## 4 · ⛔ WHAT NOT TO DO — a dead end already walked, 2026-09-22

**A STATIC check that counts samplers by reading source files DOES NOT WORK.** One was
written and deleted the same hour. It reported `BakedGround: 2 samplers, 13 free ⇒ 13
cascades safe` — a count the live census now shows is simply wrong about the ground, which
carries four scene samplers plus the shadow array.

⛔ The reason is structural, not a patchable bug: **shader injection crosses files.**
`BakedGround` calls `applyWeatherToShader` from `lib/weather-uniforms.js`, which declares its
own samplers into the same program; `onBeforeCompile` composes at runtime, conditionally, and
a static reader cannot know which branches a given program took. Chasing imports does not
close it.

⭐ **A green check that is blind is worse than no check** — it is the plausible-looking
success Layer 0 forbids, inside the detector. Do not rebuild it.

## 5 · THE JOB

### A. THE INSTRUMENT — ✅ BUILT 2026-09-22, `src/lib/shaderLinkGuard.jsx`
Mounted **ungated** in Stage and Preview; a detector behind a flag is off on exactly
the town where nobody thought to set it. Two paths, and **both are needed**:
- **`renderer.debug.onShaderError`** — three's own hook, at the same call site the
  unattributed error used to come from. Names the material, its `material.name`/`.type`,
  LINK/VALIDATE status, the declared fragment-sampler count and the ceiling. ⚠️ Fires
  only for a program that is **drawn** (three defers the check to `onFirstUse`).
- **`window.__samplerCensus()`** — every program three holds, **units counted from
  `ACTIVE_UNIFORMS` on the live program**, so every `#ifdef` is already resolved. Flags
  any program that did not link, whether or not it ever drew.
⭐ Two details that a naive census gets wrong, both load-bearing:
`directionalShadowMap[N]` is **one uniform worth N units** — count `info.size`, or N
cascades read as 1; and a **fullscreen post pass is not a receiver**, so it must not set
the cascade budget (the first cut's headline did exactly that).
⛔ It reads the **compiled program**, never source files — §4.
**Mutation-tested**: `?unitbomb=N` mounts a material declaring N samplers (default 20)
and the census must report it as a program that did not link. ⭐ Ship the proof, don't
just run it once — it re-verifies the detector on any town and any device.

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
1. ✅ A link failure **names its material**. Mutation-tested via `?unitbomb`.
   ⚠️ Proven on the **census** path; the `onShaderError` path was not directly
   witnessed — a bomb that DRAWS wedges the renderer (a failed `useProgram` every
   frame left the scene blank for ten minutes), so the fixture compiles it without
   drawing it. **Not established: that the hook fires on a real drawn receiver.**
2. ✅ A number, from the compiled program — ▶ `window.__samplerCensus()`.
3. ✅ Cascades link **and draw** on huron at N=2 **and N=3**, zero dead programs.
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
