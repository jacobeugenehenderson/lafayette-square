# DISPATCH BRIEF — the hero canopy impostor as the FOUNDATION (+ streamed geometry, Stage-dialed)

**Status: DESIGN LOCKED at standup (Jacob + Scrim, 2026-07-17, standup #2). Dispatch-ready.**
**Trunk:** `curb-offset-draw`.
**Supersedes** the *runtime-split + load framing* of [`HANDOFF-hero-impostor-and-startup-weight.md`](HANDOFF-hero-impostor-and-startup-weight.md) (front-row-prominence → **height-foundation**). **Inherits from it, still binding:** the cold-load weight audit (`?loadAudit`: ~73 MB is trees; `lod1` 39.3 MB + atlas 27.6 MB), the overhead pipeline-mirror table, and the prereq/trap list. Read that file for those; this file is the operative build.

> **Route first** (CLAUDE.md): `ORIENTATION.md` → `README §⭐ START HERE` → `arborist/README §⭐ START HERE` → `SALON-INTERFACE.md` → `[[project_overhead_impostor_capture_fix]]` (the pattern we mirror) → this. Read the cited canon **to the section** before touching code — the model is written down; do not re-derive it from grep.

---

## Who you are + the call

You are the agent dispatched to build the hero canopy impostor. **Name yourself** (one word, joins the trail) and answer to it. **Agent: FRESH** — self-contained build against a locked design + precise anchors; a fresh context builds to the brief without inheriting the parked-arc assumptions that kept this dying.

**You OWN** `src/components/InstancedTrees.jsx` for the duration — Boz serializes the overhead/density arcs behind you. **⛔ If the overhead pattern doesn't transfer to the hero (low, side-on) view, STOP and flag Boz** rather than widening silently.

---

## The reframe that drives this (why the design changed since standup #1)

The old brief chased **"delete 39 MB of `lod1` download."** That was never the real goal, because **street view needs the geometry models anyway** — so it's *when* they load, not *if*. What actually hurts:

1. **The cold-load spike** — all ~15 species' GLBs loading at once → the WebKit "page cannot be opened" kill (page dies, forces a reload).
2. **Sustained GPU** — full-mesh canopies every frame → heat, battery drain, fan, user discomfort.

So the levers are **stage the load** and **cut the steady-state draw cost** — not shave permanent bytes. (This also dissolves the standup-#1 weight-math worry: it no longer matters how many species keep geometry, since street view loads them all regardless.)

---

## The design — LOCKED (do not reopen)

**The impostor is the FOUNDATION, not the fallback.** Every tree paints as a canopy-only impostor by default; **geometry is an enhancement layered onto the tallest trees**, streamed in during the pan.

1. **All-impostor default; tallest trees → geometry, sprinkled throughout.** Not a front-row cluster — a *height* rank, so real parallax + articulated branch-motion appear across the whole depth of the scene as truth-anchors, while the flat impostor sea between them just "breathes." The two together sell the aliveness. Tallest trees are also where geometry earns its cost (crowns break the skyline; most parallax against the sky; worst to fake) and it's a **scene-generic** rule (ports to town #2/#3), unlike a hero-pan-prominence classifier.

2. **The split is a runtime, LOAD-TIME selection driven by a slab-carried threshold** — *not* baked-per-instance-prominence. Bake produces **both reps for every tree** (canopy impostor always; geometry streamable) + stamps each instance's **height**; the runtime buckets by *height ≥ threshold* when it loads. This is squarely inside doctrine (**"the LOD *ladder* is baked; *selection* is runtime"**) and is a **stable** selection (a tree's height never changes → no thrash, nothing like the banned per-frame camera-distance geometry-LOD swap — say so in a code comment).

3. **The threshold is a STAGE KNOB** — *"how much geometry,"* ranking trees **tallest-first**, keeping geometry for the top slice. The operator drags it while watching the **real pan + the device frame-ms** and ships whatever looks/runs right for that town. (Pine forest = 300× one instanced GLB = cheap either way, don't care; diverse deciduous = where geometry cost + heat live, impostors buy the most. The right split is scene-dependent → it's a knob, not a constant. `[[feedback-no-hardcoded-ramps-use-knobs]]`.) The slider writes the threshold into the slab; the runtime re-buckets **live** so the operator sees the change without a rebake.

4. **Load story = impostor-first paint, then stream geometry along the fixed pan.** First frame: the whole neighborhood paints as impostors (light — the overhead bundle is ~5 MB for 10 species — no OOM, no crash). During the pan: geometry GLBs load **ordered by when each species first enters frame**, swapping impostor→mesh per tree as its GLB lands (crossfade already exists). **Species-locality keeps concurrency at ~1–2 GLBs at any instant** (Jacob: only a couple species are ever in frame at once) → the spike flattens into a rolling background fill. **This is the same streaming machinery street view needs** — build it once (the "stream the slab as it happens along the fixed pan" direction, `ccb115e9`).

5. **Wind on impostors: YES — base-anchored canopy sway off the shared `treeSwayUniforms`** (already proven by the overhead disc: fractal flutter advected downwind + gusts + phase-lagged band hula, wind-only/no-floor). The whole canopy sea leans + gusts *together* → you see the weather move across the mass. Honest limit: a flat card's wind reads as *"the mass breathes,"* not articulated branches — which is exactly why the tall geometry anchors (#1) carry the articulated truth.

6. **The impostor geometry is NEW: a canopy-only, side-on, azimuthal nested-band billboard.** It is **NOT** the overhead disc (top-down; `buildOverheadBandDisc`) and **NOT** the killed whole-tree octahedral cross (`impostorBySpecies` / `buildImpostorGeometry` — "floating dark leaf-slabs + a stone trunk," operator 2026-06-25; **do not revive**). New manifest key: **`heroImpostorBySpecies`**. The *pipeline* mirrors overhead exactly; the *carrier geometry + capture aim* are re-derived for the hero's low side-angle.

### The three live dials (tune on the real pan — do NOT lock now)
- **Geometry budget** — start **~top 15% tallest** as geometry; tune by eye + device frame-ms.
- **Nesting depth** — side-on canopy depth-slices; start **2** (front shell + darker back shell for parallax), 3 if the pan reveals more volume.
- **Azimuth count** — **coupled to sprinkle-density + the hero-move.** Because impostors are now *everywhere* (not just a distant sea), they're seen closer + across more angle → they want **more azimuths** than the old "far sea" assumption; the geometry anchors mask flatness, so budget ↔ azimuth trade off. Tune both live against each other on the pan.

---

## Mirror the overhead pipeline (four seams)

Use the built, mastered overhead path as the template (`[[project_overhead_impostor_capture_fix]]`; the mirror table in the prior brief). Files to model on:
- `src/components/captureImpostor.js` — RTT capture (`prepareOverheadBands` / `captureOverheadBand`). **Re-aim low + side-on, canopy-only, per azimuth.**
- `src/arborist/OverheadBaker.jsx` — rides Bake→Slab, browser-GPU RTT → POST → manifest. **Build `HeroImpostorBaker` on the same seam.**
- `src/arborist/SpecimenViewport.jsx` — the Salon per-species eye-gate (Browse view). **Add a Hero view** (low side-angle) as the eye-gate.
- `src/components/OverheadTrees.jsx` — the runtime reader (`OverheadSpecies`, `useOverheadAssets`). **Model the runtime hero reader on it** (side-on band geometry; reads `heroImpostorBySpecies`; NO GLB).
- `arborist/bake-look.js` — **must carry `heroImpostorBySpecies` forward** (browser-authored, can't be CLI-regenerated) — the exact trapdoor overhead had (`c195f64e`); wire it the same way.

---

## Prereqs / traps (violating any is how this died before)

- ⚠️ **FIRST: fix the armed Matrix4 aliasing bug.** `InstancedTrees.jsx:442`, `ImpostorSpecies` — `arr[i] = T.multiply(R)` aliases the one reused `T`, collapsing every placement onto the last. Fix = clone per instance; the correct idiom is two files over: `OverheadTrees.jsx:246` (`…multiply(S).clone()`). Dormant today only because `PROM_THRESHOLD:0` → zero impostor-role instances. **Fix before any tree becomes an impostor** or all impostors stack on one point.
- **The prominence classifier is being replaced, not tuned.** `bake-trees.js#classifyHeroTiers` scored `mesh/opaque/impostor` from hero-pan prominence with `PROM_THRESHOLD:0` (all-mesh). The new split is **runtime height-vs-threshold**, so bake's job shrinks to: stamp each instance's height (canopy dims already resolved) + ensure both reps exist. Keep `cull` for trees never in frame the whole pan (still a real hero-shot win). Retire/park the prominence mesh/opaque/impostor bands — **don't** try to route the height split through `PROM_THRESHOLD` (note: `m ≥ 0` always, so with `PROM_OPAQUE:0` everything-below-threshold falls to `opaque`, never `impostor` — a landmine if you reuse that path).
- **eye-gate on the REAL render + a real device — never the GPU gauge** (`arborist/ARCHITECTURE.md` L73; the gauge is count-vs-fake-budget, red even with no trees). `[[feedback_proxy_render_is_not_the_operator_eye]]`.
- **Don't revive** `impostorBySpecies` (killed whole-tree cross) or `lod2` (dead cut-trunk, floating-trunk forensic).
- **Optical parity** — the impostor rides the shared atlas material / relights from the shared weather uniforms (`overheadLightUniforms`), so it fogs/DoFs/grades/wind-syncs with the mesh trees. One shader program.

**Adjacent, guaranteed lever (flag, likely a separate dispatch):** KTX2/Basis-compress the tree atlas (27.6 → ~5 MB, smaller on wire AND in VRAM), independent of impostors. Don't fold it into this build unless Jacob asks — note it in your build log.

---

## Build order (phased — CHECKPOINT + eye-gate after each; commit per phase)

- **Phase 0 — prereq.** Fix the `InstancedTrees.jsx:442` aliasing bug.
- **Phase 1 — the Hero editorial surface.** Re-aim the capture (low, side-on, canopy-only, N azimuths × M nesting bands) + a **Hero view** eye-gate in the Salon (mirror `SpecimenViewport` Browse) + **`HeroImpostorBaker`** on Bake→Slab → **`heroImpostorBySpecies`** + `bake-look` carry. **CHECKPOINT:** eye-gate the captured billboards on a neutral surface — *do they read as the tree from the hero's low angle, and do they breathe with the wind?* The snapshot is the deliverable; Jacob's eye gates it.
- **Phase 2 — runtime split.** Build the side-on band geometry; the hero runtime reader consumes `heroImpostorBySpecies` (**no GLB**); impostor-foundation paints all trees; the slab-carried **height threshold** buckets geometry-vs-impostor at load. **CHECKPOINT:** eye-gate the split on the real LS pan.
- **Phase 3 — streaming.** Order geometry GLB loads by pan-appearance; per-tree impostor→mesh crossfade as each GLB lands; confirm ~1–2 GLB concurrency via species-locality; confirm the cold-load spike is gone (page never crashes/reloads).
- **Phase 4 — the Stage knob.** Geometry-budget slider (tallest-first) writes the slab threshold; runtime re-buckets live. Eye-gate + device frame-ms; land the LS default.
- Tune the **three dials** (budget / nesting / azimuth) live across Phases 2–4; bring the final settings to Jacob, don't guess them.

---

## Commit boundaries + hygiene

- **Work in a git worktree** off `curb-offset-draw` (under `.claude/worktrees/`, never the Desktop) on a feature branch (e.g. `hero-impostor-foundation`). **Commit per phase**, clear messages.
- **Code you own:** `src/components/{InstancedTrees.jsx, impostorGeometry.js, captureImpostor.js, treeAtlasMaterial.js}`, a runtime hero reader (model on `OverheadTrees.jsx`), `src/arborist/{SpecimenViewport.jsx, Grove.jsx}` + a `HeroImpostorBaker`, `arborist/{bake-trees.js, bake-look.js, serve.js}` (bake/persist side), and the Stage geometry-budget knob wiring.
- **Do NOT** change LS's current look when zoomed in until the eye-gate passes — the impostor-foundation must be at least parity, ideally invisible-swap.
- **Canonical docs are OFF-LIMITS.** Keep your journal in **this file** (append a "Build log" section) or a `scratch/` co-journal. **Surface scope drift / doctrine conflict to Boz/Jacob immediately** (`[[feedback_baby_must_surface_scope_drift]]`). Boz folds this into canon on trunk when it lands (the prior two hero-impostor briefs get archived then).
- Worktree env gotchas (from the overhead marathon): symlink the gitignored data (`public/trees`, per-species `arborist/state/*/compositions.json`) **before** vite boots (publicDir listing is cached at boot; missing GLBs → 404 → black WebGL screen); launch backends via detached subshell, not `run_in_background`.

## Definition of done

LS hero pan: **the whole neighborhood paints as canopy impostors on the first frame (no OOM, no forced reload)**; tall trees **stream in as geometry during the pan** with a clean per-tree swap; the canopy **breathes with the neighborhood wind** and the tall anchors give real parallax; the **Stage geometry-budget knob dials the split live**; **device frame-ms drops materially** vs all-mesh (measured on a real device, not the gauge); and **Jacob's eye passes** the look, the motion, and the transition.

---

## Dispatch baton (paste this to launch the agent)

> Condensed launch note — the full detail + rationale is the brief above.

```
Column B — the hero canopy impostor (arborist/render). Name yourself (one word,
joins the trail) and answer to it. Agent: FRESH.

Route first (CLAUDE.md, to the section): ORIENTATION.md → README §⭐ START HERE →
arborist/README §⭐ START HERE → SALON-INTERFACE.md → the memory
project_overhead_impostor_capture_fix (the pattern you mirror). Then read
HANDOFF-hero-impostor-foundation.md in full — it is your dispatch brief and your
journal home. Don't re-derive the model from grep; it's written down.

The design is LOCKED (do not reopen — full detail + why in the brief):
- The impostor is the FOUNDATION, not the fallback. Every tree paints as a
  canopy-only impostor by default; geometry is an enhancement layered onto the
  TALLEST trees, sprinkled through the scene for real parallax + articulated
  motion, while the flat impostor sea between them breathes.
- The split is a runtime, load-time selection on a slab-carried height threshold
  ("ladder baked, selection runtime" — stable, not the banned per-frame
  camera-distance swap). Bake stamps each tree's height + both reps; runtime
  buckets by height ≥ threshold.
- That threshold is a Stage knob ("how much geometry," tallest-first, live re-bucket).
- Load = impostor-first paint, then stream geometry along the fixed pan, ordered
  by when each species enters frame; species-locality keeps concurrency ~1–2 GLBs
  → no cold-load crash. Same machinery street view needs.
- Wind on impostors = yes (shared treeSwayUniforms, base-anchored). New manifest
  key heroImpostorBySpecies; the geometry is a NEW side-on azimuthal canopy-band
  billboard — not the overhead disc, not the killed whole-tree cross
  (impostorBySpecies — do not revive).

Prereqs / traps (the brief has the list):
- Phase 0, do this first: fix the armed Matrix4 aliasing bug at
  InstancedTrees.jsx:442 (clone per instance — idiom at OverheadTrees.jsx:246)
  before any tree turns impostor.
- eye-gate on the REAL render + a real device, never the GPU gauge. The captured
  billboard IS the deliverable — Jacob's eye gates it. Checkpoint + flag me after
  each phase.

Dials — bring them to me, don't guess: geometry budget (start ~top 15% tallest),
nesting depth (start 2), azimuth count (coupled to budget + hero-move). Tune live
on the pan.

Bounds: worktree off curb-offset-draw (under .claude/worktrees/, branch
hero-impostor-foundation); commit per phase. You OWN InstancedTrees.jsx for now —
I serialize the overhead/density arcs behind you. Canonical docs are off-limits —
journal in the brief's Build-log section. Surface any scope drift or doctrine
conflict to me immediately; if the overhead pattern doesn't transfer to the low
side-on hero view, STOP and flag me.
```

---

## Build log
*(append as you go — this is your journal home)*

### Slat (agent) — the trail name
Named myself **Slat** (nested flat strips stacked to fake canopy volume — the carrier geometry, and it joins Boz/Pip/Scrim). Fresh agent. Worktree `.claude/worktrees/hero-impostor-foundation`, branch `hero-impostor-foundation`, off `curb-offset-draw` (@ `cd8a8d40`, which already carries this brief committed). I own `InstancedTrees.jsx` for the duration.

### Phase 0 — Matrix4 aliasing fix (DONE, `5a06ed5d`)
Fixed `InstancedTrees.jsx:442` (`ImpostorSpecies`): `arr[i] = T.multiply(R)` aliased the one reused scratch `T` (`multiply()` mutates + returns the receiver), so every impostor placement collapsed onto the last. Fix = `.clone()` per instance, mirroring the `OverheadSpecies` idiom (`OverheadTrees.jsx:246`) + a comment naming why. **Not live-observable yet** — dormant because `PROM_THRESHOLD:0` leaves zero impostor-role instances; it can only be eye-gated once the foundation turns trees impostor (Phase 2). Committed as a standalone prereq so it's off the board before any tree flips.

### The pattern-map (how overhead → hero; Jacob blessed the pitch 2026-07-17)
The pipeline mirrors the overhead path exactly; the capture-aim + carrier geometry re-derive. Overhead looks DOWN and clips HEIGHT bands → flat disc; hero looks HORIZONTAL and clips DEPTH shells → vertical card. Azimuth = orbit the camera about Y (new axis; overhead had none). `injectOverheadStamp` gives relight + base-anchored wind for free. **Capture pitch = pure horizontal side-on** (Jacob's call — cleanest side elevation, no foreshortening). No STOP-flag: the mechanism transfers.

### Phase 1a — capture re-aim + carrier + Salon eye-gate (DONE, `62310eb2`)
Three seams, all parse-clean (esbuild), all mirroring the overhead path:
- **`captureImpostor.js`** — `sideOn` branch in `renderTreeToTexture` (horizontal cam orbited by azimuth, canopy-only vertical frame `[canopyBaseY, maxY]`, depth-shell near/far clip along the view axis). `prepareHeroBands`/`captureHeroBand` = the `prepareOverheadBands`/`captureOverheadBand` twins: azimuths×shells shot list, two relight channels (albedo 512² + AO 256²), one-shot-per-frame. Back shells bake darker for free (full-crown shadow → lower AO).
- **`impostorGeometry.js`** — `buildHeroImpostorCard`: vertical tessellated card, canopy-only, per-shell local-Z depth offset, carries `aOverhead`+`aTreeHeightNorm` (ground-anchored → base-anchored sway).
- **`SpecimenViewport.jsx`** — a **`Hero Imp`** preset (side-on, level with the canopy). Captures az=0 × `heroShells` one-per-frame, skins the cards, renders the shell stack. Front shell bright → back shell darker. Wind slider drives the breathe.

**Dials as shipped (start values, to tune live):** Salon preview azimuths=1 (front only — full N rides the baker), shells=2 (nesting).

**⏳ EYE-GATE PENDING (Jacob's eye, the gate):** open `/arborist` → pick a species → **Hero Imp** preset → does the leaf mass read as the tree from the side, and does it breathe with the Wind slider? Can't self-verify (proxy ≠ eye). Logistics: the running dev server serves the MAIN dir (trunk), not this worktree — eye-gate mechanism is Jacob's call (worktree Salon server, or pull the branch).

### Eye-gate #1 (Jacob, 2026-07-17) → restructure (DONE, `82279211`)
Jacob's read on the first Salon capture: (1) the trunk/woody structure **can't be depth-sliced like the canopy**; (2) mirror overhead's layering — **parallax in the leaves, ONE trunk/branch layer** (not sliced); (3) **resolution too low** (512²) — don't summarily trade quality. Also blessed: the one branch layer = **captured bark-only** (matches the real species), not procedural.
Restructure landed:
- **`uCaptureMask`** — a guarded uniform in `injectFoliageSway` (0 off → LS bit-identical; 1 leaf-only discard, 2 bark-only discard), set/reset per-pass in `renderTreeToTexture` like `toneMapping`. Both runtime + Salon-preview materials carry it.
- **`prepareHeroBands`** — per azimuth: N **leaf-only** depth shells (parallax) + **one bark-only, full-depth, un-sliced** woody layer (center depth, behind the leaves).
- **Resolution 512→1024** albedo, 256→512 AO. Weight answer = KTX2, not a starved capture.
- Cards carry `kind`; leaf shells ramp front-bright→back-dark, bark mid-bright.
- ⚠️ **Framing note for the next eye-gate:** the bark layer is **canopy-only** (in-crown branches), no full trunk-to-ground — consistent with a canopy billboard. If Jacob wants the trunk extending down, that's a frame extension (drop the vertical `canopyBaseY` floor).
- **Needs a HARD reload** (shader recompile) to eye-gate. Salon server still on **:5273**.

### Eye-gate #2 (Jacob, 2026-07-17) → trunk-in-rear + variety reframe (DONE, `9f530d9e`)
- **Resolution** 1024→**2048** albedo (still short of native at 1024). KTX2 carries weight.
- **"2 split trunks"** = woody leaking into BOTH leaf shells. Isolation now belt-and-suspenders: **per-mesh visibility by `atlasKind`** (recompile-independent — works without a hard reload) **+** the per-vertex `uCaptureMask` discard.
- **"Ditch the trunk on the near slice, leave it in the rear"** → the bark card's POSITION is decoupled from its full-depth capture: `cardDepthFrac=1` puts the one woody layer at the REAR, behind every leaf shell. Near slices are leaf-only.
- **Lighting** — the RELIGHT slider now shows in Hero-Imp; the card already relights through the SAME `overheadLightUniforms` + `injectOverheadStamp` path as the overhead disc (Jacob: "wire like the overhead trees"). ⚠️ Phase 2 LS-runtime TODO: mount an `OverheadLightDriver`-equivalent so the hero impostors relight from the atmosphere even OUTSIDE browse.

### ⭐ AZIMUTH REFRAME (Jacob, 2026-07-17) — LOCKED, affects Phase 2
The N radial captures are **per-instance VARIETY**, not a view-dependent (octahedral) swap. **88 sugar maples must not be 88 identical cards** → assign each instance ONE of the N azimuths **by hash**, fixed at load (stable — no per-frame swap, inside doctrine). The **view-dependent swap is deferred** — "wasted bulk for current requirements" (Jacob). Phase 2 runtime: hash instance→azimuth, billboard about Y to face camera, show that azimuth's leaf-shells + rear bark layer. (The overhead disc's per-instance-rotY anti-stamping is the precedent.)

### Eye-gate PASSED (Jacob, 2026-07-17): "Looks great (really kind of unbelievable how convincing it is!)"
Phase 1 editorial surface eye-gated + approved (trunk-in-rear, 2048, lighting, breathe).

### Phase 1b — durability plumbing (DONE, `0b88e1bf`)
The side-on twin of the overhead persistence path:
- **`serve.js`** POST `/hero-impostor/:look/:species` — writes azimuth×layer PNGs under `trees/hero-impostor/<species>/` + merges `heroImpostorBySpecies` into `trees-atlas.json`.
- **`bake-look.js`** carries `heroImpostorBySpecies` forward on EVERY bake (same trapdoor as overhead).
- **`HeroImpostorBaker.jsx`** rides Bake→Slab, captures each species' **all-N-azimuth variety pool** (leaf shells + rear woody layer), one shot/frame, POSTs. Chained AFTER the overhead bake (one GPU loop at a time).
- **`Grove.jsx`** wired + progress UI (`Hero n/total…` · `hero ✓`).
- Manifest schema: `heroImpostorBySpecies[sp] = { heightM, canopyRadiusM, canopyBaseNorm, azimuths, shells, layers:[{ azIdx, azimuthDeg, kind, shellIdx, cardDepthFrac, albedo, ao }] }`.
- All parse-clean (esbuild + `node --check`).
- ✅ **Endpoint persist SMOKE-VERIFIED** (2026-07-17): synthetic POST → wrote all PNGs (clean names `az{deg}_{kind}{shellIdx}.{albedo,ao}.png`) + a correct `heroImpostorBySpecies` manifest entry. Throwaway look, cleaned up. Bake-look carry = verified-by-mirror (proven overhead carry), truly exercised at the real Bake→Slab.
- **Bake dials settled (Jacob):** N=**6** azimuths, shells=**2**, persist **1024²** (supersampled from 2048² capture), AO 256². (= baker defaults.)

**⏳ NEXT — run the first bake (needs Jacob):** (1) the DIALS — azimuth count (variety pool), shells (nesting), persist resolution (quality↔weight); (2) test infra — the worktree needs its OWN arborist backend on a spare port + vite repointed (`ARB_API`) so the POST lands on the endpoint I added (the running :3334 backend is the MAIN dir's, no endpoint). Then Phase 2 (runtime: hash instance→azimuth, mount hero cards on LS, height-threshold split), Phase 3 (streaming), Phase 4 (Stage budget knob).

⚠️ **Weight honesty:** the variety pool is per-SPECIES (shared across instances) but N azimuths × 3 layers × 2 channels adds up. Levers = azimuth count, persist resolution, and KTX2 (the real compressor). Pick on the real pan + a device.
