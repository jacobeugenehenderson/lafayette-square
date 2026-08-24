# BRIEF — the Arborist: the join, the geometry budget, and the tree

**You are a FRESH agent.** Read `CLAUDE.md` (the routing gate) first. ⛔ Do **not** read
`BOZ.md`. Then `arborist/ORIENTATION.md` — the front door.

> ⚠️ **EVERY PREMISE BELOW IS A CLAIM, INCLUDING ITS NUMBERS.** Each carries the command
> that produced it. Confirm before building on it and say what you found.
> Written by **Rook**, 2026-08-24, end of a long day shift. Handing to the night shift.

---

## 0. THE HARD CONSTRAINT, AND THE STATE YOU INHERIT

⛔⛔ **theward.online has a spotlight on the solo tree and Jacob must be able to show the
site at any moment.** ▶ Look before and after every change:
`http://localhost:5173/arborist?view=fullmonte&at=13:00`
Servers: **5173** vite · **3334** arborist API · **3333** cartograph API · 8791 the site
(a different repo; its tree is an iframe on 5173 — test on 5173 directly).

**Uncommitted and deliberately left for Jacob:** the freshly baked slab
(`public/baked/**`, `cartograph/data/lafayette-square/clean/map.json`) and his `layerVis`
in `public/looks/lafayette-square/design.json`. ⛔ **Do not commit or revert either without
asking.** The slab carries the first land-use pour (`unknown`→`underived`, ground groups
22→29) — a real change to what the neighbourhood IS, and an eye-gate Jacob has not given.

---

## 0a. 🔥 START HERE — HERO IS BAD ON THE LIVE SITE. THIS IS THE JOB.

**Jacob, 2026-08-24 evening: *"The trees on the live site are small and sparse."*** Browse is
fine. **Hero is the whole problem.** Treat this as the only ticket until it is closed.

### ⛔ WHAT IS ALREADY PUSHED — so do not "fix" it twice
`origin/land-use-derivation` is at **`57e811f3`**, in sync. It ALREADY contains **`cb14c29c`**,
which put my geometry band behind `?heroBand=1` (default OFF). ⚠️ **So if the site is still
bad, the band is NOT the remaining cause** — either the deploy has not rebuilt since
`cb14c29c`, or something else is doing it. ▶ **First move: read the console on the live site.**
- `role=legacy-dbh` → the band is off; you are seeing something else. **Keep reading below.**
- `role=band` → the build predates `cb14c29c`. **Redeploy, then re-look.** Nothing to debug yet.

### ⭐⭐ THREE THINGS CHANGED HERO TODAY. Only one was mine, and it is already off.
| # | change | effect on hero | status |
|---|---|---|---|
| 1 | my pan-distance band (`b01fdffb`) | 2323 mesh → **403** | ✅ **OFF** by default (`cb14c29c`) |
| 2 | **Jacob's oak capture in the Grove** | **747 trees moved MESH → CANOPY CARD** | ⚠️ **LIVE, and nobody has looked at it** |
| 3 | the land-use pour (`29955e46`) | +126 trees, ground rebuilt | ⚠️ live |

⭐⭐⭐ **#2 IS THE ONE I WOULD LOOK AT FIRST, AND I RECOMMENDED IT.** `oak_bur` (389) and
`oak_white` (358) had **no hero impostor record**, so they leaked to **full lod1 geometry** —
48,415 tris each. Shooting them gave them records, which is *correct* and removed ~47M tris —
**and in the same stroke turned 747 big foreground oaks into flat canopy cards.** That is a
textbook "smaller and sparser", it is live, and **no eye has been on it.** ⛔ It is not a bug —
it is the impostor foundation doing exactly what it says — but it was never eye-gated.
▶ `node -e "const t=require('./public/baked/lafayette-square/trees.json').instances;const b={};for(const i of t)b[i.species]=(b[i.species]||0)+1;console.log(b.oak_bur,b.oak_white)"`

### 🔧 THE FAST LEVERS — URL only, no re-bake, use these to find it in minutes
- **`?heroGeom=0.5`** ⭐ the single most useful dial. It is the legacy fraction that decides
  how many trees keep REAL GEOMETRY (default **0.15** = only the tallest 15%). Raising it puts
  mesh back immediately. **If `?heroGeom=0.6` makes hero look right, the answer is that the
  impostor foundation is simply too aggressive for this shot** — and that is a number to
  author, not a bug to chase.
- **`?treeDebug=noHeroImpostor`** — kills the impostor foundation entirely; EVERY tree renders
  as mesh. Slow, but it tells you in one reload whether "small and sparse" is the impostors.
- **`?heroBand=1`** — turns my band back on. ⛔ Expect it to look WORSE; it is here so you can
  confirm it is off, not to use.

### ⚠️ AND THE THING THAT MAKES ANY OF THIS LOOK LIKE DAMAGE
`ground.colormap` bakes a contact shadow for **all 5127 placements**, whether or not a tree
draws there. **A tree that becomes an impostor still leaves its full-size trunk shadow.** So a
smaller canopy card sits inside a shadow sized for the mesh tree it replaced — which reads as
*"dark spots for trees that aren't there."* ⭐ **This is very likely why Jacob's description
led with the shadows.** Nothing about the impostor split can be judged honestly until the
shadow and the drawn tree agree.

### ⛔ ② WHITE BANDS AROUND TRUNK BASES — a REGRESSION of a fix that already landed
Jacob: *"The trunks also have white bands around their bases, a problem we already fixed."*
**CAUSE NOT ESTABLISHED — I ran out of session before measuring. Do not trust the lead below.**
1. The trunk base blends toward the ground colour sampled at the tree's world-XZ
   (`treeAtlasMaterial.js:356-375` — `uTrunkBlend`, `uTrunkBlendTop`, `uGroundColorMap` +
   `uGroundColorMin/Span`, plus the FX map so it blends toward the COMBINED colour). Fed by
   `BakedGround.jsx:157,176`.
2. ⭐ **MY FIRST SUSPECT, UNVERIFIED:** the land-use pour regenerated
   **`ground.colormap.png`, `ground.poolmap.png` and `ground.json`** — which carries the
   `min`/`span` decode meta. If that encoding moved, the decoded ground colour is wrong and the
   trunk blends toward it. ▶ **Diff `ground.json`'s colormap/poolmap meta across `29955e46`
   and decide from the numbers, not from this sentence.**
3. `treeTrunkGround` is a **shared** knob and the Diorama writes it on mount / restores map
   defaults on unmount (diorama 0.8/0.75/0.95 vs map 0.55/1.5/0.5). Cheap to rule out.
4. **Find the ORIGINAL fix before rebuilding one** — Jacob says it was solved, so something
   un-did it. `git log -S uTrunkBlend`, and `c7c00d41` / `8473a29c`.

⚠️ **These two may be the same event.** Both trunk-blend and the contact shadow read the same
regenerated ground maps. If ② turns out to be the colormap meta, check ① against it before
concluding anything about impostors.

---

## 1. ⭐⭐ THE FRONT: THE JOIN IS THE WHOLE GAME

`ORIENTATION §2` has said for months that the join — a dossier per species, a ratified habit
per chassis — is *"the app's real backlog; everything else is downstream of it."* **Today
proved that empirically.** Every defect chased turned out to be a symptom of it.

### ⭐ Jacob's model, in his words (2026-08-24) — build to THIS
> A demand list arrives (parks service, etc). We look at what we have. **What we
> affirmatively have shows GREEN; what we don't shows RED.** Species are listed **in demand
> order**, so the most-placed species are prioritised. A **"gold bar"** decides what becomes
> an impostor. Each species is then two things: **(1) using the parts we have · (2) knowing
> what I need to go get to add to the library and finish the species.**

⭐⭐ **AND THE DOCTRINE THAT GOVERNS ALL OF IT** *(Jacob, and it is `CLAUDE.md` Layer 0 Q3,
`NEIGHBORHOOD-INPUTS §0.0`, `SECTION §3.1`)*: **"best effort / best guess / overrideable."**
The kit machine-pours a strong first draft from the botanical description and the operator
overrides any of it. ⛔ **The absence of an override is NOT a defect.**
⚠️ **I violated this and reverted myself the same day** — the pair was squashed out of
history, so the lesson lives here and nowhere else: I made `have` require a **ratified** tag
in `readiness.js`. That treats an un-overridden best guess as invalid, flattens the whole
readiness board to identical `stretch` rows (nothing is ratified — 4 of 239 chassis, **0 of 9
bark, 0 of 18 leaf**), and destroys the one thing the board is for: telling you what to go
get. ⛔ **Do not re-land it.** Ratification is a FLAG on the answer, never the answer.

### ⭐ THE FIVE / FOUR SPLIT — how much the system can carry
Dossiers require **9 axes**; parts carry only **5**. The other four are *system knobs*, not
things to procure — they are the multiplier on a finite library.
▶ `node -e "const fs=require('fs');const ax={};for(const f of fs.readdirSync('arborist/dossiers').filter(f=>f.endsWith('.json'))){const d=JSON.parse(fs.readFileSync('arborist/dossiers/'+f,'utf8'));for(const k of Object.keys(d.required||{}))ax[k]=(ax[k]||0)+1}console.log(ax)"`

| procurement (a part must exist) | system (applied, no part needed) |
|---|---|
| `chassis.habit` · `chassis.size` · `bark.type` · `leaf.silhouette` · `leaf.size` | `leaf.ways` · `leaf.face` · `leaf.season` · `overlay.type` |

### ⭐⭐⭐ THE NEXT MOVE, AND IT IS ONE AUTHORED FIELD WIDE
**The bark gradient-map pipeline is fully built and has never been fed.** A gradient MAP —
not a blend — is a LUT indexed by the texture's **Rec.601 luminance**, so striation/furrows
survive while the palette is restyled. **One greyscale bark × N gradient maps = N species.**

```
composition.bark.gradientStops → compileGradientLUT → barkGradient atlas tile
   ⛔ NEVER AUTHORED               ✅ bake-look.js:908    ✅ bake-look.js:229
   → barkGradientByVariant → uBarkGradientTileOffset/Scale → luminance lookup
        ✅ :1084                        ✅ treeAtlasMaterial:403      ✅
```
▶ `node -e "const a=require('./public/baked/lafayette-square/trees-atlas.json');const by={};for(const t of a.tiles)by[t.classification]=(by[t.classification]||0)+1;console.log(by,'gradientEntries',Object.keys(a.barkGradientByVariant||{}).length)"`
→ today: `{bark:4, leaf:5}`, **0 barkGradient tiles, 0 gradient entries.** Every composition's
bark is `{"uvScale":[6,4]}` — a UV tweak, no stops. **That is why the bark selector does
nothing**: a control with no authored field, feeding a producer that correctly emits nothing,
into a shader that correctly falls back to the legacy single-tint path.

▶ **THE STEP JACOB AND I AGREED ON: hand-author `gradientStops` on ONE species'
composition, re-bake, and look at the bark.** No UI, no derivation, no botanical mapping.
It proves the chain end to end. ⛔ Only after that does "derive stops from the dossier's bark
description" become a real question. Botanical bark terms are finite and standardised
(smooth · striate · furrowed · ridged · plated · scaly · shaggy · exfoliating · lenticellate),
which is what makes the whole approach tractable — even bamboo.

---

## 2. THE FALSE GREEN — measured, open, and the reason nothing is trustworthy

**A species can be admitted by one gate and rejected by the next**, because each gate asks a
weaker question than the one after it. Three live instances:

| gate | admits on | should ask |
|---|---|---|
| roster promotion | ~~has published geometry~~ **FIXED `be5e4cba`** | is it composed |
| `composed` | **only that a CHASSIS is set** (`roster-coverage.js:220`) | chassis **and** bark **and** leaf |
| `covering` (the yellow light) | name/routing only — **habit NEVER consulted** | do we hold a chassis of the required habit |

▶ `node -e "const fs=require('fs');const d=fs.readdirSync('arborist/state').filter(x=>!x.startsWith('_')&&fs.existsSync('arborist/state/'+x+'/compositions.json'));let n=0;for(const s of d){const c=JSON.parse(fs.readFileSync('arborist/state/'+s+'/compositions.json','utf8'));const a=(Array.isArray(c)?c:Object.values(c)).find(x=>x&&x.chassis)||{};if(a.chassis&&(a.bark?.ref||a.bark?.band)&&a.leaves?.pack)n++}console.log(n+' of '+d.length+' have all three chosen')"`
→ **0 of 14.** `maple_sugar` — the canary on theward.online — has **no authored bark**.
That is `ORIENTATION §7`'s owed *"completeness state"*: an untouched species and a finished
one look identical on every surface.

⭐ **Jacob's ruling on the promotion button (2026-08-24): NO BUTTON. Composition IS
promotion.** *"If a tree has a chassis, leaf and bark selected it's done."* ⛔ A button is a
manual override for a fact the data can already state — and that is exactly how an ungreen
species got in. **Open question he left for the night shift: does `complete / started /
not started` replace the binary `composed`?** (I recommended yes — it tells the truth without
emptying the Grove overnight.)

⚠️ **Ratification counts:** 4 of 239 chassis · **0 of 9 bark · 0 of 18 leaf**. There is **no
bark/leaf approval store at all** — `arborist/state/` holds only `_chassis-curation.json`.
An approve gesture on the Shelves is unbuilt work, not a check you can add.

---

## 3. THE GEOMETRY BUDGET — landed today, and it works

**`b01fdffb` + `arborist/hero-band.mjs`.** Who keeps mesh in the hero shot is now decided at
BAKE by distance to the authored camera path, spending a **triangle budget** (`heroTriangleBudget`
default 15e6, `heroBandMaxM` default 250). This closes `LEDGER §E1`'s *"wire it to geometry
weight, or remove it."*

```
before  2323 mesh, ~86M tris, chosen by ASSET PRESENCE
after    403 mesh,  15.0M tris, cutoff 181m
```
⛔ `role-at-bake` is preserved — no live swap, so **no pop**. ⛔ Three no-fallback paths: no
pan → no `heroRole` emitted + warn; unweighable lod1 → left impostor, never given free
budget; runtime prints `role=band|legacy-dbh`.

⚠️ **THE BAND MASKS THE LEAK, IT CANNOT CLOSE IT.** `20c05ce3` made the leak loud:
```
mesh=430earned+1893leaked
⛔ N placements kept MESH because their species has NO baked hero impostor
```
Jacob shot the two oaks (hero species 7→9, ~47M of ~51.6M leaked tris gone).
**Remaining: `platanus_acerifolia`, 921 placements, ~4.6M — and it CANNOT be baked.** It is
in the roster with **no composition**, so the capture correctly refuses
(`HeroImpostorBaker.jsx:93` *"refusing to ship an invisible species"*). ▶ **Re-run
`Bake → Slab` once** so `trees.json` re-derives with the oaks impostor-eligible.

**Impostors, for the record:** they are NOT flat billboards — cards sit at real local-Z
offsets (`impostorGeometry.js:359`, `z=(1−2d)·R`), 6 azimuths × 2 shells, and they **sway and
relight off the shared wind/atmosphere** (`HeroImpostorTrees.jsx:118`). Going all-impostor
costs parallax and silhouette, **not** weather.

### ◻ OWED, designed with Jacob, not built
- **The card re-stack.** Shipped order is `leaf(0.25) leaf(0.75) bark(1.0)` — trunk behind
  EVERYTHING. Jacob's design is **canopy ↔ trunk ↔ canopy**. Placement is decoupled from
  capture, so **no re-shoot**: `?barkDepth=0.5`. ⛔ **Eye-gate not given.** The BAKER
  (`captureImpostor.js:602`) is unchanged and cites an older note, *"ditch the trunk on the
  near slice, leave it in the rear"* (Jacob 2026-07-17) — bark at 0.5 honours it.
- **Handoff captures (Jacob's idea, and it is good).** Bake TWO extra impostors per mesh
  tree at the exact azimuths where the mesh is **picked up** and **set down** — captured *at*
  the handoff, so card and mesh are the same image and the swap is invisible. Only one is
  ever on screen. ⚠️ Must key on **effective azimuth = bearing − rotY**: the mesh honours
  `rotY` (`InstancedTrees.jsx:242`), the impostor does not (translation+scale only).
  Measured: 84% of trees sweep <60° across the whole pan; only 828 exceed one azimuth bin.
  Sizing at a 150m band: ~187 (species × azimuth) captures at 30° bins vs 42 today.
  ⛔ Needs §3's band to exist first — you cannot capture a handoff azimuth until the band
  decides where the handoff is. ⛔ And it couples the impostor bake to the camera path: a
  stale-capture check that fails loudly when `heroKeyframes` change must ship WITH it.

---

## 4. ⭐ THE MOTION AND THE LIGHT — built, default-off, awaiting one eye each

- **Wind ramp** (`e4158056`, `dc408316`). The tier classifier bucketed by distance from the
  trunk AXIS, so branch tips damped to 0.30 while the upper trunk core read "twig" at 0.60
  and leaves moved 3× the branches they hang on. Replaced by a continuous ramp over
  height × radial; leaves now ride their branch + own flutter. **Shared material — landed as
  `treeWindTiering` defaulting to today's values; the map is bit-identical until turned.**
  ▶ **`/preview?whip=1`** — the pan, which is the gate, not the diorama.
  Shaping: `?whipGamma=` `?whipAmpMax=` `?whipLeaf=`.
- **Night lighting** (`22e5e0c3`). The Look's `ambient` has no `night` key, so midnight
  interpolates *through* the night to **above noon** (1.69 vs 1.47). ⭐ **Jacob's ruling:
  "the Diorama should have no impact on the larger product."** So the diorama overlays the
  night key on an **in-memory copy** via `ambientOverride`/`hemiOverride` — the Look on disk
  is untouched. Dials `?nightAmbient=` `?nightHemi=`.
- ◻ **Geometry compression — UNTOUCHED, still open.** Baked lod0 is 20.71 MB
  (POSITION 6.27 · NORMAL 6.27 · TEXCOORD_0 4.18 · INDICES 3.98, all float32/uint32; the GLB
  has **zero images**). Quantize+meshopt measured 28.5→10.9 MB. Land in **`bake-look.js`** at
  `io.write(dstFile, doc)`, ⛔ **one species, look at it, then the rest.**
  ⚠️ `scratch/_wren-glbweight.py` mis-attributes interleaved bufferViews to the first
  claiming semantic — the total is right, the breakdown is not.
  ⭐ **lod0 only ever reaches the DIORAMA** — `lodForRole` is hardcoded `'lod1'`
  (`InstancedTrees.jsx:735`), so this is a solo-tree win, not a map win.

---

## 5. ⛔⛔ TRAPS — every one of these cost real time TODAY

- ⭐⭐⭐ **BLACK/BLANK RENDER? READ THE SHADER LOG FIRST.** `VALIDATE_STATUS false`.
  **The tree program sits AT `MAX_VERTEX_ATTRIBS`=16** — `instanceMatrix` alone eats **4
  slots**. I added ONE attribute and the program failed to **link**, so every tree drew during
  load then vanished. I blamed the bake, the terrain, the ground, land-use, and A/B'd the
  whole slab before reading the log my own memory told me to read.
  ⇒ **Prefer DERIVING over stamping** — the value was `length(position.xz)/uRadius` all along.
- ⭐⭐ **`design.json` IS NOT `scene.json`.** `CelestialBodies` reads the BAKED slab. An
  experiment edited into the authored source changes nothing → every null result is a **false
  negative**. I then explained that null with a second wrong claim.
- ⭐⭐ **"IT TRANSFORMS" IS NOT "IT RUNS."** Vite's per-module transform passes a duplicate
  top-level declaration; only the browser fails it. **Reload the app and LOOK.**
- ⭐⭐ **DO NOT HAND-SLICE `treeAtlasMaterial.js` WITH INDEX ARITHMETIC.** I did it three
  times; two broke the build (a backtick inside a GLSL comment *inside a JS template literal*
  closed the string; a bad slice left a duplicate function). Narrow anchored edits, reload
  each time.
- ⛔ **A MODIFIED FILE IS A CLAIM ABOUT WHO WROTE IT.** I saw `design.json` dirty, assumed my
  bake did it, ran `git checkout --` and **destroyed Jacob's live `layerVis` toggles**. It was
  the Stage autosaving HIS edits. `git checkout --` on authored state is a DELETE.
- ⛔ **CHECK WHICH SPECIES IS ON SCREEN.** Canary is in `localStorage`, not the URL.
  The mount log names it: `[TreeDiorama] maple_sugar/… whip=[…]`.
- ⛔ **The tree takes 30–40s to appear** (20+MB) and the first frames are black. Take a
  second and third frame; confirm against the mount log, not the pixels.
- ⛔ **A stale TAB serves the OLD module** after vite rebuilds. Grep the SERVED module for a
  code identifier; open a new tab if needed.
- ⛔ **Verify after any bake:** `git status --short public/baked/ | grep -c "^ D"` → **0**.

---

## 6. THE STANDING RULE FOR THIS SURFACE *(amended today by ruling)*
⭐ **REUSABLE, NOT GLOBAL.**
- **Shared MACHINERY — yes.** Module-scoped knob **defaulting to today's value**, so the map
  is bit-identical until turned (`treeTrunkGround`, `treeWindTiering`).
- ⛔ **Shared AUTHORED STATE — never.** Drive it through an override **seam** in memory
  (`ambientOverride`/`hemiOverride`), never write to `public/looks/**` or `public/baked/**`.

**The test:** *could town #2 turn this on without having looked at this street — and does the
map stay bit-identical until someone chooses otherwise?*

---

## 7. WHERE I WOULD START, IF I WERE YOU
1. **Ask Jacob about the uncommitted slab + `layerVis`** before anything else.
2. **Re-run `Bake → Slab`** so the oaks land in `trees.json`; confirm `leaked` drops to ~921.
3. **Hand-author `gradientStops` on one species** (§1) — the highest-value bounded step on
   the board, and the one Jacob is most interested in.
4. Get the two eye-gates: **`?barkDepth=0.5`** and **`/preview?whip=1`**.

⭐ **AND THE META-LESSON, WHICH COST MORE THAN ANY BUG TODAY:** my *measurements* were sound
and nearly every *sentence I laid on top of them* was wrong — a cause inferred from timing, a
prop that was a hook, a field that did not exist. `CLAUDE.md`: **never write the EXPLANATION
of a number, only the number. If the mechanism is not measured, write "cause not established"
and stop.** Jacob caught every one of them; that is not a workflow, it is a tax on him.

*Ledger of everything else open on the Arborist: `arborist/LEDGER-exorcism-wren.md`.*
