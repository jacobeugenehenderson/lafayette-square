> ⛔ **RETIRED 2026-08-23, same day it was written.** Its §2 — `uLeafTransmission` —
> is BUILT (`5446d84b`), and its §3 traps are folded into
> `BRIEF-arborist-exorcism.md §5` alongside the four more this session found.
> ⭐ Kept for the record of what was RULED OUT: the alpha was measured sound, so
> nobody need re-derive that. Live state is `arborist/BACKLOG.md`.

# BRIEF — the diorama's lighting: leaf transmission first

**You are a fresh agent.** Read `CLAUDE.md` (the gate). Do **not** read `BOZ.md`.
Then read this, then the code sites named below, **before forming a plan**.

> ⚠️ **Every premise here is a CLAIM, not a fact.** They were measured on
> 2026-08-22/23, and several claims made during that session were measured FALSE
> within the hour — including two of mine that reached Jacob as fact. **Confirm
> against the code and say what you found before you build.** If the code
> contradicts this brief, the code is right and the contradiction is the work.

---

## 1. What exists (confirm each)

`src/components/TreeDiorama.jsx` — one specimen on ground, under the real sky,
mounted **twice**: `?embed=tree` (framed, live in the marketing site's sky band)
and the Arborist's `?view=fullmonte`. Both follow **the canary**
(`src/lib/canaryTree.js`), which is also what the Meteorologist's `CanaryScene`
reads. Currently `linden_american`, and Jacob has confirmed that is right.

⭐ **The full state, with what is already measured about each item, is
`arborist/BACKLOG.md` → the 2026-08-23 entry. Read it before anything else.**
It is the live home; this brief only sequences it.

---

## 2. YOUR FIRST TASK — `uLeafTransmission`

Jacob approved it explicitly: *"add the leaf transmission uniform tomorrow."*

**The finding it answers.** Alpha is **sound** — `trees-atlas.json#atlas` carries
`alphaMode "MASK" · alphaCutoff 0.5 · alphaTest 0.5 · doubleSided true`, and
distance erosion is already solved by the coverage-preserving mip chain. ⛔ The
canopy goes flat at golden hour **not** because of alpha but because a leaf has
no way to transmit light: `grep -i "transmission|translucen|subsurface|wrap"`
over `treeAtlasMaterial.js` returns nothing, so a double-sided opaque leaf lit
from behind shows an unlit back face.

**The spec, already decided — do not re-litigate:**
- `uLeafTransmission` on the **shared** material, wired in `injectFoliageSway`
  beside the sway uniforms, with a module-scoped `{ value }` object so one write
  drives every mounted tree — the `treeSwayUniforms` / `treeBarkTierUniform`
  pattern exactly.
- ⛔ **A UNIFORM BRANCH, NEVER A SHADER VARIANT.** The single-program constraint
  is load-bearing for Bloom. A second compiled program is the one outcome to
  avoid.
- The leaf gate **already exists**: `vBark` is interpolated to the fragment
  shader from the `aBark` attribute. No new attribute, no re-bake, GLBs stay
  byte-identical.
- Backlight from the view/light geometry, **tinted by the sampled leaf albedo**
  so a lit leaf glows its own colour rather than a uniform wash.
- ⭐ **DEFAULT 0** → the map renders bit-identical the moment it lands. Author
  the value per Look afterwards.

⭐⭐ **AND THE CONSTRAINT THAT GOVERNS EVERYTHING ELSE ON THE LIST** (Jacob):
*"we will be able to use all these settings and features when we elaborate the
street view of the trees."* ⛔ **So nothing may be a diorama-only hack.** Every
lighting gain is an authored knob on the shared material/channels, defaulting to
today's value, so street view inherits it by turning it up. (`ShadowFocus` in
`TreeDiorama.jsx` is the deliberate exception and says so at its code site.)

---

## 3. ⛔ TRAPS THAT COST THIS SESSION HOURS. Read before you debug anything.

- **The first screenshot after a navigate is routinely UNPAINTED.** I read blank
  frames as black renders repeatedly and bisected innocent subsystems. **Always
  take a second frame before believing a picture.**
- **`memo()` on `TreeDiorama` is LOAD-BEARING, not an optimisation.** `App`
  re-renders every store tick → the Canvas re-renders → R3F re-runs
  `root.render()` under a fresh context Bridge → the whole scene subtree remounts
  before React commits an effect. Measured: geometry rebuilt ~46×/s, measure
  effect committing **zero** times. ⛔ Do not remove it because "it takes no
  props so it cannot re-render" — taking no props is what makes memo total.
- ⭐ **Ask Jacob "did it never appear, or appear and then vanish?"** before
  touching code. That one sentence is what identified the remount; an hour of
  bisecting was the price of not asking.
- **`canvas.getContext()` CREATES a context** — it can never report one missing.
  Read `style.width` instead: empty means `gl.setSize` never ran.
- **Canvas pixel readback returns all zeros** here (no `preserveDrawingBuffer`).
  That is the method failing, not a black render. Do not report those numbers.
- **Certify the dev server before certifying a render.** `:5173` died mid-session
  and a dead origin is indistinguishable from the defect it mimics.

## 4. ⛔ DO NOT TOUCH

- **The leaves.** 174,136 verts / 83,377 tris ≈ 42,000 alpha cards. Jacob: *"the
  tree you already had with the leaves it already had were already great."*
- **The authored bark treatment.** Binding the raw `Bark007` kit was tried and
  **reverted** — it discards `tintBase` / `tintJitterRange` /
  `roughnessOverride` and the gradient/detail/posterized slots
  `applyBarkUniforms` carries. The trunk is **not** low-poly (115,123 tris); it
  reads smooth because its bark is a slice of a 1824×1032 sheet shared across
  every species. Any fix belongs **inside** that path.
- **The canary value.** It is per-operator state; the previous one was destroyed
  once already by a test write.

## 5. After the uniform

The rest of Jacob's punch list, in his words, with measurements attached, is in
the `arborist/BACKLOG.md` 2026-08-23 entry: wind motion (⚠️ its period is a
*shared* constant, and wind is still unauthored at source — `ls/OPERATIONS.md
§5`), trunk + ground shading, a real grass texture, the site's now-hidden time
slider, moonlight (⭐ already plumbed and authored — `scene.json#dirMoon`, night
×2), saturation. Plus the `ls/FEATURES.md` reuse write-up Jacob asked for — and
⛔ its counterweight is part of the task, not an afterthought.
