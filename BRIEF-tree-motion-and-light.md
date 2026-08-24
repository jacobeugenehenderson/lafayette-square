# BRIEF — the solo tree: motion, light, weight

**You are a FRESH agent.** Read `CLAUDE.md` (the routing gate) first. ⛔ Do **not** read
`BOZ.md`. Then read `arborist/ORIENTATION.md` — it is the front door and it was measured
against the code on 2026-08-23.

> ⚠️ **EVERY PREMISE BELOW IS A CLAIM.** Each carries the command that produced it. Confirm
> before building on it, and say what you found. Written by **Wren**, 2026-08-23, at the end
> of a long session on this surface — I am handing over because the context is long, not
> because the work is stuck.

---

## 0. THE SITUATION, AND THE ONE HARD CONSTRAINT

⛔⛔ **theward.online puts a SPOTLIGHT on this tree and Jacob must be able to show the site
at any moment.** The current commit (`5ef05604`) is **good and showable** — verified in the
browser at `127.0.0.1:8791`. **Do not leave the tree broken between commits.**
▶ Look before and after every change: `http://localhost:5173/arborist?view=fullmonte&at=13:00`
⚠️ **`127.0.0.1:8791` is a DIFFERENT REPO** (`~/Desktop/dev.nosync/theward-online`, a plain
python static server). Its tree is an `<iframe>` pointing at **`localhost:5173`** — this
repo's vite. So your edits ARE live there, but reloading the outer page does not reliably
refetch the inner frame. **Test on 5173 directly.**

**The surface:** `src/components/TreeDiorama.jsx` — one specimen, mounted at
`?view=fullmonte` (Arborist) and `?embed=tree` (the site). ⛔ Same component, two mounts.

⭐ **THE METHOD THAT KEEPS WORKING: the Salon already solves most of this.**
`src/arborist/SpecimenViewport.jsx` renders the same tree, beautifully, with no stutter.
Three of tonight's four fixes were "do what the Salon does." **Read it before inventing.**

---

## 1. ⭐ THE JOB — the wind tier is classified backwards

**This is the one Jacob most wants fixed.** His words: *"the branches are static… it's really
apparent the leaves are moving independent of the tree"* · *"we should make a **bunch** more
motion variation"* · *"overall much more subtle, but if it was realistic we would want wind
this big in a storm."*

**`src/components/treeAtlasMaterial.js:1528`** classifies every bark vertex by **distance
from the trunk AXIS**:
```js
const r = Math.sqrt(x*x + z*z)
if (r > 0.15 && y < 3.0) tier = 0   // trunk  → amplitude 0.05  (:555)
else if (r > 0.06)       tier = 1   // branch → 0.30
else                     tier = 2   // twig   → 0.60
                                    // leaves → 1.00 (flat, non-bark)
```
⛔ **That is backwards for a real tree.** An outer branch tip 5 m from the axis at 12 m up
is `r > 0.06` ⇒ **"branch", damped to 0.30**. The upper trunk core, within 6 cm of the axis,
is ⇒ **"twig" at 0.60**. So the whippiest parts move least, the bole moves more than they do,
and leaves at a flat 1.0 move **3× the branches they hang on.**
▶ `sed -n '1522,1541p' src/components/treeAtlasMaterial.js` · `sed -n '549,565p' src/components/treeAtlasMaterial.js`

**The shape of the fix (not a spec — confirm it against the code):**
- Tier should come from **height × radial distance**, not radius alone. Thin twigs are far
  out AND high. `aTreeHeightNorm` is already stamped per-vertex and available.
- ⭐ **Make it CONTINUOUS, not three buckets.** A smooth ramp from a near-still bole to
  whipping tips *is* the "much more motion variation" Jacob asked for, and it is the same
  edit. Buckets are why the canopy reads as two separate objects.
- Leaves should ride their branch: the leaf amplitude wants to be branch-motion **plus** a
  small independent flutter, not an unrelated 1.0.

⛔⛔ **THIS IS THE SHARED MATERIAL — IT MOVES EVERY TREE IN THE MAP.** Gate it on the
operator's eye on the **cinematic pan**, not on the diorama alone
(`project_smooth_pan_is_the_only_perf_target`). ⭐ **Strongly consider landing it as a
module-scoped knob defaulting to today's values**, the way `treeTrunkGround` and
`treeSwayUniforms` do — then the map is bit-identical until someone turns it.

⚠️ **Wind magnitude is already tuned and is NOT the problem.** `DioramaWind` floors the
breeze at **0.7 m/s** (the Grove's 3.0 read as a storm). Dial live with `?wind=` / `?gust=`.
⛔ Do not start by tuning the period — `BACKLOG.md` says that answers an older, narrower
complaint.

---

## 2. THE LIGHTING — measured, and it is authored state, not a bug

Jacob: *"the lighting looks terrible but I don't know **what** to do about that because it's
linked to the rest of the look."* **He is right that it is linked. Here is the measurement.**

| minute | `ambient` | `hemi` |
|---|---|---|
| 12:00 | 1.47 | **0.16** |
| 00:00 | **1.69** | 1.88 |

▶ `node --input-type=module -e "const m=await import('./src/cartograph/animatedParam.js');const d=(await import('./public/looks/lafayette-square/design.json',{with:{type:'json'}})).default;for(const min of [0,12*60])console.log(min, m.resolveGroupAtMinute(d.ambient,min,null,['value'],{value:1}).value, m.resolveGroupAtMinute(d.hemi,min,null,['value'],{value:1}).value)"`

`CelestialBodies.jsx:1324` makes the white ambient floor `0.45 × ambient` ⇒ **~0.76 white
ambient at midnight**, plus hemisphere ~1.9. Leaves have a bright albedo and show it; bark is
dark and hides it; the grass darkens itself in its own shader — **which is why only the
canopy reads as glowing.**

⭐ **Two DIFFERENT classes. Do not treat them alike:**
- `hemi` night = 2 is **explicitly authored** and is its maximum across the day. An operator
  decision, almost certainly for browse readability. ⛔ **Not a defect. Do not "fix" it.**
- `ambient` has **NO `night` key** — keys are noon/dawn/sunrise only — so 1.69 at midnight is
  **interpolation wrapping through the night**, landing *above* noon. **Nobody authored it.**

⛔⛔ **These are per-Look channels shared with the WHOLE MAP.** Changing them changes LS at
night everywhere. ⭐ The narrow, honest move is to **author an `ambient` night key so night
becomes a decision** — and to show Jacob the map and the tree side by side before committing.
**It is his call, not yours.**

---

## 3. THE WEIGHT — compression works, measured, and is now safe to re-land

Baked lod0 is heavy: **maple_sugar 20.7 MB, linden 25+ MB.** Jacob: *"I think 30mb is too
big, even for a single."* It is **not** the leaves — it is that the pipeline compresses
**textures only** (`EXT_texture_webp`) and ships raw float32 geometry.
▶ `python3 scratch/_wren-glbweight.py public/baked/lafayette-square/trees/maple_sugar/skeleton-1-lod0.glb`
Measured on the full-canopy linden lod0: **28.5 MB → 20.2 MB (quantize) → 10.9 MB
(quantize + meshopt)** — *smaller than the 15.7 MB it was when its canopy was cut to 20%.*

⚠️ **I tried this and it corrupted the render** (giant leaves, black shards) — **reverted in
`cca105c1`. The cause is now GONE:** the diorama used to bake `matrixWorld` into vertices
with `applyMatrix4`, which writes FLOATS into quantized integer buffers. `5ef05604` removed
that (it renders the graph, like the Salon). **So the blocker is fixed, but the compression
has not been retried since.**

**If you re-land it:**
- Put it in **`bake-look.js`** at the `io.write(dstFile, doc)` site, ⛔ **not** `publish-glb`
  — `public/trees/` is gitignored and never deploys; `public/baked/` is the slab and the LAST
  writer, so nothing downstream has to learn to decode.
- Decoders: drei's `useGLTF` wires `MeshoptDecoder` by default. The two **raw** `GLTFLoader`s
  (`OverheadBaker`, `HeroImpostorBaker` — which read these very files) already wire it
  explicitly as of `76394799`.
- ⛔ **ONE SPECIES, LOOK AT IT IN THE BROWSER, THEN THE REST.** That is exactly the step I
  skipped, and Jacob's eye caught it in a minute.

---

## 4. ⛔ TRAPS — each of these cost real time tonight

- ⛔⛔ **CHECK WHICH SPECIES IS ON SCREEN BEFORE DIAGNOSING ANYTHING.** The canary is in
  `localStorage`, not the URL. I spent a long stretch fixing `linden_american` while Jacob
  was looking at **`maple_sugar`**, so every fix was invisible to him. The console tells you:
  `[TreeDiorama] maple_sugar/skeleton-1-lod0.glb meshes=2 tris=347,711 height=21.1m`
- ⛔ **`bake-look` used to DELETE `baked/<look>/trees/hero-impostor/` and `…/overhead/`** —
  browser-GPU captures the CLI cannot regenerate. Fixed in `76394799`; a CLI bake now spares
  them. **Verify after any bake:** `git status --short public/baked/... | grep -c "^ D"` → 0.
- ⚠️ `heroImpostorBySpecies` is **7, not 9** — `oak_bur` and `oak_white` had records pointing
  at PNGs that exist neither on disk nor in git history. Honest cleanup, not loss. Re-shoot
  them in the Grove if wanted.
- ⛔ **A doc's editorial sentence is not a ruling.** I quoted `BACKLOG`'s *"the diorama
  looking worse is the system WORKING"* to Jacob as though it were his. It was not, and he
  rejects it. **A thin bake is a defect in the bake.**
- ⛔ `?embed=tree` is **framed-only** — a direct visit falls through by design. Use
  `?view=fullmonte`.
- ⛔ **The first screenshot after a navigate is routinely unpainted, and this tree takes
  ~10 s to load** (20+ MB). Take a second frame before believing a picture.
- ⛔ Comments are stripped from vite-served modules — grep the served module for **code
  identifiers**, not comment text, when checking whether an edit is live.

## 5. THE STANDING RULE FOR THIS SURFACE
⭐ **Nothing here may be a diorama-only hack.** Every gain is built as an **authored knob on
the shared material or channels, defaulting to today's value**, so the coming street view
inherits it by turning it up rather than reimplementing it. `treeTrunkGround` +
`setTrunkGround` (`treeAtlasMaterial.js`) is the pattern to copy.

*Ledger of everything else open on the Arborist: `arborist/LEDGER-exorcism-wren.md`.*
