<!-- BRIEF-STATE
status: DELIVERED
retired: 2026-09-21
landed: 3dcb5dd3 (both defects) · ff8cf53a (the flash the fix itself introduced)
-->

> # ✅ DELIVERED 2026-09-21 — retired for CURRENCY, not for truth.
> **Both defects closed.** ① every in-shader-displaced caster now carries a
> `customDepthMaterial`, so the shadow map holds the town where the town is —
> ⛔ and this was never a regression: the shadow pass had **never** been correct
> for a vertex-displaced caster, worst on the hilliest town and mildest on flat LS.
> ② the frustum, the bias pair and the softness unit are all read from the town.
>
> **Where the live doctrine went, so citations resolve forward:**
> · the four frustum decisions, including *"texel-snapping the position is only half
>   the job — the SIZE must be quantised too"* → **`cartograph/ARCHITECTURE.md §8 —
>   Cast shadows`**
> · the operator knob — **Penumbra (m)**, 1–60, and the ×(1800/4096) migration →
>   **`cartograph/OPERATIONS.md §Light & Shadow`**
> · the capability → **`cartograph/FEATURES.md`**, *"The sun casts real shadows, on a
>   town of any size"*
> · the two instrument failures in §"Instrument failures on the way" → **`docs/agents/
>   AGENT-VALIDATION-SURFACES.md §0`**, which is now the top of that document
>
> ⚠️ **STILL OWED AND BOARDED, NOT CLOSED HERE:** Jacob's eye on huron's shadows.
> `ROADMAP` H-14. The commit that landed this said *"FEATURES unchanged until this is
> eye-gated"* and FEATURES has since been written — on the strength of the measured
> fix, not of a verdict. That distinction is on the board.
>
> ✅ **THE "LOOSE END, UNRELATED" AT THE FOOT OF THIS FILE IS RESOLVED — it was ROT.**
> It read *"live `terrainExag` read 1.5 on huron, whose `scene.json` has no
> `terrainExag`; the runtime disagrees with the doc."* Re-measured 2026-09-21:
> huron's `scene.json` carries **`terrainExag: 1`** and LS carries **1.5**. The
> observation was taken before huron was re-baked through `9378acfb`. ⛔ No defect.
>
> ⛔ **The frame rate is NOT this and is still open — `ROADMAP` H-9.**

---

# BRIEF — Cast shadows: the shadow pass has never known where the buildings are

**Opened** 2026-09-20 · Jacob: *"I think our cast shadows might be not working?"* (huron, Hero)
**Status** ⭐ ROOT CAUSE FOUND AND MEASURED. Two defects, independent, both open.
**Layer 0 class** ① a pass that drops a vertex-shader transform · ② LS-sized capacity.

---

## ⭐⭐ ① THE CAUSE — buildings are rendered into the shadow map UN-LIFTED

`src/components/SlabBuildings.jsx:455`, inside the render material's `onBeforeCompile`:

    transformed.y += aCentroidY * uExag;

**A building's height off the ground is a per-vertex ATTRIBUTE, applied only in its own
vertex shader.** The baked `position` holds it un-lifted — that is the foundation riser, and
`aCentroidY` IS the riser height.

⛔ **The shadow pass does not use that material.** three substitutes its own
`MeshDepthMaterial`, which has never heard of `aCentroidY` or `uExag`.
⇒ **The shadow map holds a copy of the town with every building dropped back onto the baseline.**

    node -e 'const fs=require("fs");const j=JSON.parse(fs.readFileSync("public/baked/huron/buildings.json"));const b=fs.readFileSync("public/baked/huron/buildings.bin");const ab=b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);let mn=1e9,mx=-1e9;for(const g of j.groups){const a=new Float32Array(ab,g.centroidYByteOffset,g.vertexCount);for(const v of a){if(v<mn)mn=v;if(v>mx)mx=v}}console.log(mn,mx)'

| | huron |
|---|---|
| `aCentroidY` across all 198,738 vertices | **1.41 – 13.40 m** |
| × `uExag` (measured live: **1.5**) | **2.11 – 20.10 m of render lift** |
| raw geometry bbox y — *what the shadow pass sees* | −8 .. 21.94 |

⇒ **A 20 m vertical error on buildings ~22 m tall.** The shadow copies sit at or below the
terrain, and **a buried occluder cannot shadow the ground above it.** Every receiver looks up
its own depth, finds nothing that can occlude it, and reports "lit".

**Confirmed against the live shadow map** — depth histogram of the centre 256² patch, against a
ground that compares at z ≈ 0.25:

    depth 0.0   4,941 texels      (jammed at the near plane)
    depth 0.5   2,011 texels      (~2× the ground's distance)
    depth 1.0  58,584 texels      (empty)
    depth 0.25      NONE          ⛔ nothing is stored where the town actually is

⭐ Jacob saw this from the other side weeks earlier: *"when I pan the camera below the ground I
can see all the buildings are already there on their risers, but not lifted high enough."*

### ▶ The fix
`mesh.customDepthMaterial` — three renders it in the shadow pass instead of the stock depth
material. It needs **the same vertex displacement** as the render material.
⛔ **`customDepthMaterial` does not appear ANYWHERE in this repo** (`grep -rn customDepthMaterial src/`).
So this is not a regression; **the shadow pass has never been correct for any vertex-displaced caster.**
- **`SlabBuildings`** — the `aCentroidY * uExag` lift. The only real caster in Cartograph.
- **`CityModel.jsx:420`**, **`LafayetteScene.jsx:532/999`** — also `castShadow`; check each for
  vertex displacement and give it the same treatment.
- **Every `patchTerrain`ed caster** — the terrain lift has the identical problem, latent.
⭐ **The check is the deliverable:** a caster whose material rewrites `transformed` and has no
`customDepthMaterial` is statically detectable. Write it; it catches the class in town #3.

## ⭐ ② SECOND DEFECT, STILL OPEN AFTER ① — the shadow box is Lafayette Square, to the metre

`src/components/CelestialBodies.jsx:158-161`

    shadow-camera-left/right/top/bottom = ±900      far = 2400

    lafayette-square radius  892  → span 1784   ⇐ ±900 is LS's radius + 8 m
    huron            radius 3539  → span 7078   ⇐ 3.97× wider than the box

Measured live: the shadow matrix maps origin → uv (0.500, 0.500) and **x = 1500 m → OUT of the map**.
So even with ① fixed, **only the middle ~27% of huron can receive a shadow.**
`meteorologist/CanaryScene.jsx:106-108` says it out loud: *"sized for LS-scale ground … 1800 m frustum."*
`src/preview/PreviewApp.jsx:69-71` carries a second copy of the same ±900.

⛔ **Do not change ±900 to ±3600** — that is huron's number replacing LS's and Altadena reopens it.
Derive all four numbers from `makeBoundary(nb).radius` (the SSoT every other consumer reads), move
`LIGHT_RADIUS` out with the box, and set near/far to match. ⛔ No `?? 892`; a scene with no boundary
must fail loudly.
⚠️ **Name the cost:** 4096² over huron's 7078 m is **1.73 m/texel** vs LS's 0.44. A first naive widen
(box only, light left at 600 m) visibly destroyed the ground lighting — Jacob saw it. Cascades or a
camera-following frustum is an eye-gate call, not a number to pick quietly.

---

## Ruled out — each by measurement, so nobody re-walks this
| suspect | verdict | how |
|---|---|---|
| shadow pipeline off | ⛔ innocent | `<Canvas shadows="soft">` `CartographApp.jsx:1201`; live `gl.shadowMap.enabled true`, type 2 |
| `CelestialBodies` not mounted | ⛔ innocent | mounted `:1377` |
| drei `SoftShadows` / PCSS | ⛔ innocent | `?nopcss=1` A/B — no change |
| light `target` not in scene | ⛔ innocent | target at origin, identity matrix — correct aim |
| ortho + `logarithmicDepthBuffer` + soft | ⛔ innocent | 4-way standalone A/B: **all four configs cast shadows**, including this exact one |
| ground material type | ⛔ innocent | all `MeshStandardMaterial` (`BakedGround:268`, `grassMaterial:33`, `gravelPathMaterial:46`, `waterMaterial:115`) |
| ground shader surgery dropping shadow code | ⛔ innocent | `grassMaterial` appends only at `common` / `color_fragment` / `dithering_fragment` |
| `customProgramCacheKey` collapsing programs | ⛔ innocent | r160 APPENDS it to the standard key, which already carries the shadow flags |
| terrain displacement vs shadow coord | ⛔ innocent (receiving side) | both `project_vertex` snippets modify `transformed` BEFORE the include, so `worldpos_vertex` sees it |
| shadows drowned by ambient | ⛔ innocent | ambient+hemi zeroed live → still no shadow |

## ⚠️ Instrument failures on the way — both produced confident WRONG readings
1. **`?shadowmask=1` v1 called `getShadowMask()`**, which three defines in `shadowmask_pars_fragment`
   — included for Lambert/Phong, **NOT for MeshStandardMaterial** (physical calls `getShadow()` inline).
   Every ground shader died `VALIDATE_STATUS false`, which renders as a **uniform white scene** —
   indistinguishable from a legitimate "mask = 1.0 everywhere". ⭐ `index_render_slab` already says
   *"blank or black render? CHECK SHADER COMPILE FIRST."* Read the console before the pixels.
2. **A second browser tab does not run rAF when it isn't in front.** `gl.info.render.frame` advanced
   **0 in 1 s**. Every live mutation measured through that tab was measuring a frozen canvas.
   ⭐ **Check `info.render.frame` advances before trusting any live A/B.**
3. Sampling the shadow map's **centre 128²** read uniform 255 and nearly bought "the map is empty";
   a 5-spot sample showed real content. **One sample is not a measurement.**

## Debug seams left in the tree (deliberate, house convention — `window.__bldgXray` etc.)
- **`window.__r3f`** (`CartographApp.jsx`) — live R3F state. R3F v8 puts `__r3f` on THREE objects,
  never on DOM, so there was previously **no way to ask the scene anything** from the console.
- **`window.__terrainExag`** (`terrainShader.js:137`) — the shared exaggeration uniform.
- **`?shadowmask=1`** (`src/utils/shadowMaskDebug.js`) — corrected, compiles, carries its own warning.
*(`?nopcss=1` and `public/shadow-test.html` were temporary and are removed.)*

## Loose end, unrelated but found here
Live `terrainExag` read **1.5** on huron, whose `scene.json` has no `terrainExag`. `terrainShader.js:21`
says the LS-sized `V_EXAG = 1.5` constant was ruled out on 2026-09-20 in favour of a per-town authored
ceiling defaulting to 1. **The runtime disagrees with the doc.** Smell-detector: ROT, REGRESSION or
ASPIRATION not yet established.

## Registers (commit gate)
- `OPERATIONS.md` — the debug seams and what each one answers.
- `FEATURES.md` — reaches no register until shadows actually ship correct.
