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

## 1. ⭐ THE MOTION — ✅ BUILT (`e4158056`), ◻ DEFAULT STILL OFF, pending the eye

**Jacob's words, which are the acceptance:** *"the branches are static… it's really apparent the
leaves are moving independent of the tree"* · *"we should make a **bunch** more motion variation"*
· *"overall much more subtle, but if it was realistic we would want wind this big in a storm."*

**The defect, confirmed exactly as reported.** The classifier bucketed every bark vertex by
distance from the trunk **AXIS**, so an outer branch tip 5 m out at 12 m up read `r > 0.06` ⇒
"branch" at **0.30**, while the upper trunk core within 6 cm of the axis read "twig" at **0.60** —
the whippiest parts moved least, the bole moved more than they did, and leaves at a flat **1.00**
moved 3× the branches they hang on.

**What landed.** One continuous ramp replacing the four buckets:
`whip = pow(wH·aTreeHeightNorm + wR·aWindRadialNorm, gamma)` — near-still bole to whipping tips,
which is the same edit as the "much more motion variation," since the buckets are why the canopy
read as two objects. A leaf now takes the whip of the wood it hangs on and adds its **own** flutter
on top, instead of moving at an unrelated amplitude.

⛔⛔ **IT IS THE SHARED MATERIAL — IT MOVES EVERY TREE IN THE MAP.** So it landed as
`treeWindTiering` + `setWindTiering`, module-scoped, **defaulting to today's values**:
`uWhipBlend = 0` keeps the legacy buckets verbatim and the map is **bit-identical** until someone
turns it. Verified: `?whip=0` matches `5ef05604`; `?whip=1` renders clean.
- ◻ **THE ONE THING STILL OWED: the operator's eye on the CINEMATIC PAN**, not the diorama alone
  (`project_smooth_pan_is_the_only_perf_target`). The default flips only after that.
- ⭐ **A second classifier existed** in `InstancedTrees.jsx`, byte-identical and hand-kept in step;
  fixing one and not the other would have split the diorama from the map. Now one `stampWindTier`.
- ▶ `node scratch/claims-wind-tier-extraction.mjs` — parses the OLD thresholds out of git rather
  than restating them, and asserts the extraction is behaviour-identical.
- Dials: `?whip=` `?whipGamma=` `?whipAmpMax=` `?whipLeaf=` `?whipH=` `?whipR=`. Full list in
  `arborist/FEATURES.md`.

⚠️ **Wind MAGNITUDE was already tuned and was never the problem.** `DioramaWind` floors the breeze
at 0.7 m/s. ⛔ Do not start by tuning the period — `BACKLOG.md` says that answers an older,
narrower complaint.

---

## 2. THE LIGHTING — ✅ DONE (`22e5e0c3`). Read the trap, not the history.

**Wren's original numbers were right and they stand:** the Look's `ambient` has **no `night`
key**, so midnight resolves by interpolation *wrapping through* the night and lands **above
noon** (1.69 vs 1.47) — nobody authored that. `hemi` night = 2 **is** explicitly authored and
does reach the tree; it is a live operator decision, not a defect.
▶ `node --input-type=module -e "const m=await import('./src/cartograph/animatedParam.js');const fs=await import('node:fs');const d=JSON.parse(fs.readFileSync('./public/baked/lafayette-square/scene.json','utf8'));for(const t of [0,720])console.log(t,m.resolveGroupAtMinute(d.ambient,t,null,['value'],{value:1}).value,m.resolveGroupAtMinute(d.hemi,t,null,['value'],{value:1}).value)"`

### ⛔⛔ THE TRAP, AND IT COST HALF A SESSION: `design.json` IS NOT `scene.json`.
**`CelestialBodies` reads the BAKED `scene.json`, never the authored `design.json`.** Editing
`design.json` and reloading changes **nothing** — the authored source only reaches the slab
through a bake. ⭐ **An experiment on a Look must be run against `public/baked/<look>/scene.json`,
or the instrument is not connected and every null result is a false negative.**
⚠️ **Rook lost a stretch to exactly this**, then compounded it by explaining the null result with
a *second* wrong claim — that the diorama fell through to `AMBIENT_DEFAULT_CHANNEL`'s flat 1.0
"because no `scene` prop is passed." **`scene` is not a prop.** It comes from
`useSceneJson(resolveLookId(lookId))`, and `resolveLookId` falls back to `INSTANCE.lookId`
(`CelestialBodies.jsx:48-53`) — so the Look's channels were reaching the diorama all along.
⭐ **The measurement was sound; the sentence laid on top of it was the error** — `CLAUDE.md`'s
"never write the EXPLANATION of a number, only the number," committed twice in one hour.

### THE RULING *(Jacob, 2026-08-24)*
> **"We don't want to move night everywhere. This is a tiny adjunct function bolted on to a
> giant operation; the Diorama should have no impact on the larger product."**

⇒ `ambient` / `hemi` are per-Look channels the **whole map** reads, so the night key is **never**
authored into the Look. The diorama overlays it onto an **in-memory copy** and passes it through
`CelestialBodies`' existing `ambientOverride` / `hemiOverride` props — the same seam the Stage
drives (`CartographApp:1226`). **Nothing is written; `public/looks/**` and `public/baked/**` stay
untouched.** Portable by construction: it reads *this* Look's own channels and overlays only
`night`. Dial by eye with `?nightAmbient=` / `?nightHemi=` (the **key** value — the tod curve
smooths between keys, so the resolved midnight value is not the key).

⛔ **A Look with no baked `scene.json` keeps today's lighting and says so by name** — legitimate,
but it must never *look* like the override ran.

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
  `[TreeDiorama] maple_sugar/skeleton-1-lod0.glb meshes=2 tris=347,711 height=21.1m whip=[…]`
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
  30-40 s to appear** (20+ MB) — longer than the "~10 s" this brief used to claim, which is
  itself a trap: a black frame reads as *"I broke it"* and invites a revert of a working change.
  **Take a second and third frame before believing a picture**, and confirm against the mount
  log rather than the pixels.
- ⛔ **A stale TAB will keep serving the OLD module** even after vite has rebuilt. Confirm the
  edit is live by grepping the SERVED module for a code identifier
  (`curl -s localhost:5173/src/…​ | grep -c <ident>`), and if the tab is stale, open a new one —
  reloading is not always enough.
- ⛔ Comments are stripped from vite-served modules — grep the served module for **code
  identifiers**, not comment text, when checking whether an edit is live.

## 5. THE STANDING RULE FOR THIS SURFACE — ⚠️ AMENDED 2026-08-24 BY A RULING

**It used to read:** *"every gain is built as an authored knob on the shared material **or
channels**."* ⛔ **The "or channels" half is struck.** Jacob, 2026-08-24: *"the Diorama should
have no impact on the larger product."*

⭐ **The rule as it now stands, and the distinction is the whole point:**
- **SHARED MACHINERY — yes.** A gain goes in as a module-scoped knob on the shared material,
  **defaulting to today's value**, so the map is bit-identical until someone turns it and the
  coming street view inherits it by turning it up. `treeTrunkGround` / `treeWindTiering` in
  `treeAtlasMaterial.js` are the pattern.
- ⛔ **SHARED AUTHORED STATE — never.** `ambient` / `hemi` / the Look's `design.json` are read by
  the whole map. The diorama may **drive** them through an existing override **seam**
  (`ambientOverride` / `hemiOverride`, in memory) but may **never write** to them. A solo adjunct
  surface does not get to move LS at night.

⇒ **"Not a diorama-only hack" means REUSABLE, not GLOBAL.** The test is no longer *"does the map
inherit it?"* but *"could town #2 turn this on without me having looked at this street — and does
the map stay bit-identical until someone chooses otherwise?"*

*Ledger of everything else open on the Arborist: `arborist/LEDGER-exorcism-wren.md`.*
