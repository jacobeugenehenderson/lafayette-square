# BRIEF — Runtime Continuity: trace the Ward from Designer to Player

<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-10-03
evict-when: the continuity map exists for every handoff (Designer → Stage → Bake → Preview → Player), every field is classed, every finding is either a check or a named item of Phase 2 work, and Jacob has read it
-->

**Boz drafted this 2026-10-03 at Jacob's request; Jacob dispatches. It is tomorrow's work.** It is the first tranche of
**Phase 2 — Stage / Preview: One Runtime**. Jacob wrote that spec deliberately away from the code and the docs so he could
approach the work fresh. **It is reproduced in full at the end of this brief, and it is the authority.**

## ⛔⛔ The frame, before anything else

**The spec says what the Ward SHOULD be. The code, and every existing doc, is evidence of what IS.** Use the spec's words:
*handoff · survives / is added / is baked / is discarded / remains live · authored Ward truth · baked world truth ·
deployment policy · runtime configuration · live data · silent substitution · duplicate authority*.

- **Where the code or a doc names something differently, the code or doc is the thing that moves.** Report the mismatch in
  the spec's terms.
- ⛔ **Do not reorganise the spec around existing structures.** `<Town>`, the parity census, `qualityProfile.js` and the
  measurement handoff are prior answers to some of these questions. Cite them as **evidence** for a row, never as the shape
  of the work.
- **A mismatch between spec and code names a question** (`CLAUDE.md`, the smell detector): the code drifted, the doc is
  out of date, or the spec describes something not yet built. Say which. ⛔ Never "correct" the spec toward the code.

## Who you are, and the bounds

**You are the dispatched agent. Name yourself: one word, yours, and not one a RUNNING session holds** (`ListAgents`, then
ask Jacob to `/rename`). **Agent: FRESH.** The spec was written fresh, so the trace should be read fresh too.

- **This tranche MEASURES AND BUILDS NOTHING.** ⛔ No edits to `src/`, `cartograph/*.js`, canon or scene data. ⛔ No pours,
  no bakes, no new dev servers. Reuse the running kit server on **:5173** and the Ward on **:5180**; ports are canonical
  per `cartograph/OPERATIONS.md`, Save/discard ceremony.
- **Allowed:** read anything, in both repos. Run existing checks. Write read-only probes in `scratch/runtime-continuity/`.
  Drive the running apps to observe.
- **Commit:** only your probes and your deliverable, by path (`git commit -- <paths>`). No stash, reset, rebase or branch
  switch.
- **Surface scope drift, don't absorb it.** If a fix is obvious, name it as a row; don't make it.

## The task

Phase 2's opening section, done literally. **Trace the actual artifact through Designer → Stage → Bake → Preview → Player.**
For **each handoff**, establish what **survives**, what **is added**, what **is baked**, what **is discarded**, and what
**remains live**. Along the way:

1. **Class every field.** Audit `design.json`, `scene.json`, `src/instance.js`, `src/instances/<map>.js`, the registry, and
   what the Player consumes. Put every field in one of the spec's five classes: **authored Ward truth · baked world truth ·
   deployment policy · runtime configuration · live data**. Every field also gets **one authority**, meaning the place it
   is written. A field written in more than one place is a **duplicate authority** and is a row.
2. **Find every reconstruction.** Wherever a stage rebuilds something it was handed instead of carrying the resolved value
   forward, name the site and say what it rebuilds from.
3. **Find every silent substitution.** Any default, fallback, inheritance or "absent ⇒ borrow" path, whether it borrows from
   another Ward, from LS's mould, or from a store's leftover state. ⛔ The spec: *"Unknown values remain explicitly unknown
   rather than borrowing defaults."*
4. **Answer the spec's own question:** does `src/instance.js` remain necessary, and if so, exactly what does it own?
5. **Camera / framing along the same trace:** where authored framing is written, where each stage reads it, and where a
   failed handoff falls back to whole-neighborhood framing.

## First exhibit: Preview copies a Player gesture into the technical-director surface (Preview → Player)

In Hero, **Preview drops to Browse on any drag over 6 px or any scroll** (`src/preview/PreviewApp.jsx`, `ShotCamera`,
`setShot('browse')`). It deliberately mirrors the old player (`src/components/Scene.jsx`, `onMove`/`onWheel` →
`cam.setMode('browse')`). **Stage has no such rule.** Its only lock is playback, which is Jacob's rule: *"full camera
control unless I am recording or playing back keyframes."* On 2026-10-03 Jacob, in Preview, read this as Stage
misbehaving. The two surfaces carry the same Hero / Browse / Street bar, so it is easy to be in one and believe you are in
the other.
✅ **RULED 2026-10-03 (Jacob), in two steps, and the second is the ruling.** First: *"ditch it… in their 'real runtime
environments' Hero doesn't have manipulable controls, and browse's are limited."* Then, sharpened: *"those things are
possible in a spectrum of outcomes; the things you just described might be different from map to map; there are
editable camera controls so depending on the design the system will have to reproduce it in Preview."*
⇒ **Preview reproduces the camera controls the town's design specifies, shot by shot.** ⛔ **No gesture is hard-coded in
Preview, in either direction:** not "drop to Browse", and not "Hero does nothing". The town's authored controls are the
**one authority**, and Preview and the Player both read it. This is the spec's *"one explicit authority for authored
framing"* extended to *how* the camera may be driven, not only *where* it points.
▶ **Trace, don't build:** does a per-town, per-shot camera-controls setting exist today as data (Look / `scene.json` /
instance), and who reads it? `RegimeControls`' regimes (`plan` / `orbit` / `street` / `playback`) are fixed per shot in
code today, read in source. If no authored setting exists, that is **unbuilt intent**: surface it as tranche-2 work, don't
patch it. Report what the Ward does on a touch in each shot.

## Second exhibit: machinery the Player still loads (Bake → Player)

HPDM's tree species all carry `meshTier: false` (no model trees), so once the hero impostors are captured no tree draws as a
mesh. **The Grove needs the bark, leaf and deformer data to capture the cards** (`HeroImpostorBaker`, `OverheadBaker`,
`Grove.jsx` read them). The runtime does not need them, yet it still loads the ~58 MB colour/normal mesh atlas
(`treeAtlasMaterial`; Stage logged `[treeAtlas] coverage mips … 4067×4240` on HPDM). `trees-atlas-{bark,leaves}-viz.png`
(~23 MB per town) have **no reader in `src/` at all**: only `arborist/bake-look.js` writes them. Whether they are uploaded
with the slab: not checked. This is the spec's *"bake the answer, not the machinery"* and *"don't load that yet"* with a
number on it.
**Related, measured the same night:** with no `heroImpostorBySpecies` baked, all 10,825 HPDM trees drew as full meshes, at
**~440M triangles/frame** and ~2 s frames, which froze Stage. Capturing the impostors (Grove) fixed it. The runtime
degraded to "draw every tree at full weight" without failing loudly (`ROADMAP B4`). Trace it as a silent substitution.

## Third exhibit: one instant, two weathers (live handoff)

At a scrubbed time the Ward's **label** reads that hour's forecast (`theward/src/almanac/weather.js`, via `useTownWeather`), while
the **sky** is fed Open-Meteo `current` (`src/hooks/useWeather.js#fetchWeather` → `useSkyState`). Measured 2026-10-04 00:15 on LS:
current 100% cloud, forecast noon 0%, so "Clear Sky" over an overcast sky (Jacob saw it on staging). Two authorities for weather
at one instant: the spec's *"live handoffs"* and *"one explicit authority"*. Trace who owns weather-at-a-time. ▶ `ROADMAP` Quick wins.

## Fourth exhibit: a slab that finds its files by a stamped name (Bake → Player)

Every baked JSON carries `"look": "<name>"`, and the renderer builds asset URLs from it (`BakedGround` → `slabUrl(manifest.look, …)`);
`trees-atlas.json` carries absolute `/baked/<name>/` paths. Moving HPDM's slab to its new name broke it until it was re-baked
(2026-10-04). That's the spec's *"bake the answer, not the machinery"*: classify the stamp, and say what a slab should address its
files by. ▶ `ROADMAP` Quick wins.

## Premises to confirm first (claims, not facts — say what you found)

1. ⭐ **There is no standalone Stage.** The spec asks that *"standalone Stage and Stage inside Cartograph operate against the
   same state/runtime."* Read in source: `StageCamera`, the standalone `/stage` page, was **excised 2026-09-26**
   (`CartographApp.jsx`, the comment above the CAMERA-card bridge). `vite.config.js` says *"/stage is intentionally absent —
   Stage is cartograph-hosted."* ⇒ **Today Stage is reachable only through a Bake** (Extent or the Designer's Stage →). There
   is no URL and no way in without baking (Jacob, 2026-10-03). **Confirm, then report it as the spec's first Stage row.** Do
   not decide whether a standalone Stage should come back; that is Jacob's.
2. ⭐ **The Player cannot currently be what Preview sees.** The Player is **the Ward**: `~/Desktop/dev.nosync/theward`,
   founding brief in its `README.md`. It builds against a **pinned kit worktree** (`theward/checks/kit.mjs`;
   `.claude/worktrees/ward-kit` at a committed revision). Preview mounts the kit at its working HEAD. Promote pins the
   player named by a town's staging record (`30bcd111`). ⇒ **Preview and Player can run different renderer code.**
   Establish exactly what differs at the Preview → Player handoff. ⛔ It is a gap against the spec, not a choice to
   re-litigate.
3. **Which "Player".** The old player (`src/components/Scene.jsx`, still serving production LS) and the Ward both play
   slabs. Trace **both** at the last handoff, and label every row with which one.
4. **Bake's input boundary.** A Bake may re-pour first (`cartograph/serve.js`, the bake route: it asks before a code-driven
   re-pour, but re-pours unasked when an authoring input is newer than the last pour). So "Stage → Bake" is not always a
   pure freeze. Record which handoff each artifact actually crosses.

## Evidence to read (cite it; don't adopt its frame)

**Code** (re-derive lines; cite symbols):
- **Designer + Stage:** `src/cartograph/CartographApp.jsx` · the store `src/cartograph/stores/useCartographStore.js`
  (`DESIGN_FIELDS`, `hydrateDesign`) · `public/looks/<id>/design.json` · `public/looks/index.json` (`default: kit-default`).
- **Bake:** `cartograph/serve.js` (the `/looks/<id>/bake` route and its step list) · `cartograph/bake-scene.js`
  (design → `scene.json`) · `public/baked/<look>/*`.
- **Preview:** `src/preview/PreviewApp.jsx` · `src/lib/useSceneJson.js` · `src/lib/slabUrl.js` · `src/preview/deviceProfiles.js`.
- **The shared renderer:** `src/components/Town.jsx` · `src/lib/qualityProfile.js` · `src/lib/renderTiers.js` ·
  `src/components/renderPipeline.jsx`.
- **Identity:** `src/instance.js` · `src/instances/registry.js` · `src/instances/{lafayette-square,hipointedemun,huron,provincetown}.js` · **each town's sealed opaque id** `cartograph/data/<map>/town-id.json` (`townId`, baked into `manifest.identity`; every backend keys by it since 2026-10-04, ▶ `node checks/claims-a-town-has-one-sealed-id.mjs`).
- **Player:** `src/components/Scene.jsx` (old) · `~/Desktop/dev.nosync/theward/src` and its `vite.config.js` (how it imports
  the kit) · its `OPERATIONS.md` ("The kit the Ward is built against").

**Prior measurements** (evidence only):
- `checks/claims-stage-preview-parity.mjs` — its three census snapshots are **stale** (they predate `Town.jsx`); it says so
  itself. Re-take them through its own browser probe before citing any divergence.
- `checks/claims-the-town-reads-no-player-store.mjs` (green) · `checks/claims-every-app-mounts-the-town.mjs` (red:
  `TreeDiorama`, `CanaryScene`) · `checks/claims-the-camera-has-one-definition.mjs` · `checks/claims-look-default-has-no-town.mjs`.
- `cartograph/PREVIEW.md §0.1, §2a, §3` — the desktop-only parity claim (mobile drops 5 passes), and the three visibility
  surfaces.
- `ROADMAP.md H-35` — `?scene=` vs `?look=`: a town can be driven with another town's sun, silently.

## The chain: what this trusts, what trusts this

- **Trusts:** nothing new; it is a read.
- **Trusted by:** tranche 2 (the authority fixes: camera, visibility, mobile pass inclusion, Stage entry). Every row here
  becomes either a check or a named fix there, so a row must name its site precisely enough to be acted on cold.
- ⭐ **Constraints that cross handoffs belong in a check, not prose.** Where a row can be stated as "X written at A must arrive
  unchanged at B", propose the check (name + what it reads). Don't build it.

## Can the instrument see it?

Say for every row whether the evidence came from **disk** (an artifact) or **live** (a running app), and **which app at which
commit**. The Ward runs a pinned kit, so "live in the Ward" and "live in Preview" are two different code bases until premise 2
is resolved. Record artifact timestamps. *(Since 2026-10-04: HPDM is `hipointedemun`, re-baked and live at hipointedemun.online; the Ward pins kit `c81f7bf6`; LS + HPDM baselines are committed.)*

## The validation surface

The running apps themselves: Designer/Stage at **:5173** (`cartograph.html`), Preview at `/preview.html?look=<id>`, the Ward
at **:5180**. Use the Ward's staging site (`staging.theward.online/<town>/`) only for what the deployed Player serves. ⛔ No
parallel harness that re-implements a stage.

## Deliverable

**One continuity map**, in chat to Jacob first (then a file only if he asks for one):
- **Per handoff:** a table with columns `item · survives / added / baked / discarded / live · authority (file#symbol) · class ·
  evidence (disk|live, app, commit)`.
- **Duplicate authorities, reconstructions and silent substitutions**, each with its site and which of the three causes
  (drifted code / out-of-date doc / unbuilt intent).
- **The `instance.js` answer.**
- **The camera trace.**
- **Proposed checks** (names and what each reads), and **proposed tranche-2 rows**, phrased against the spec's sections.

Write **"cause not established"** wherever it isn't. ⛔ No fixes.

## The instruction

**Read the spec below in full first, then the evidence. Confirm the four premises and tell Jacob what you found before tracing
further.** If the code contradicts this brief, stop and flag it. The stop is a deliverable.

---

## The spec — Phase 2, as Jacob wrote it (verbatim, 2026-10-03)

> **2 — STAGE / PREVIEW: ONE RUNTIME**
>
> **Runtime Continuity**
> Trace the actual artifact through Designer → Stage → Bake → Preview → Player.
> Ensure each stage carries the resolved artifact forward rather than reconstructing it.
> Identify and remove duplicate authorities, translations, bridges and silent substitutions.
> For each handoff, establish what survives, is added, is baked, is discarded and remains live.
> Preserve resolved semantics through bake where downstream runtime systems need them.
> Do not create parallel Stage, Preview or Player representations.
>
> **Stage**
> Make Stage the authoritative creative-director surface.
> Ensure standalone Stage and Stage inside Cartograph operate against the same state/runtime.
> Confirm Stage authors materials, color, visibility, sky, lighting, atmosphere, post treatment and framing.
> Preserve: Looks vary styling, never geometry.
> Ensure Stage changes survive Bake and reproduce identically in Preview/Player.
> Fix controls that currently work in one Stage context but not another.
>
> **Camera / Framing**
> Resolve the known Designer → Stage → Browse/Player camera discontinuity.
> Establish one explicit authority for authored framing.
> Remove silent fallback to whole-neighborhood framing where a handoff has failed.
> Ensure Preview sees the framing Player will actually use.
>
> **Identity / Instance Continuity**
> Audit design.json, scene.json, src/instance.js, src/instances/<map>.js, registry and Player consumption.
> Classify fields as: authored Ward truth; baked world truth; deployment policy; runtime configuration; live data.
> Remove unnecessary copied authorities.
> Eliminate accidental inheritance from another Ward.
> Unknown values remain explicitly unknown rather than borrowing defaults.
> Determine whether instance.js remains necessary and, if so, exactly what it owns.
>
> **Bake**
> Treat Bake as the boundary that freezes resolved authored truth.
> Bake the answer, not the machinery used to derive the answer.
> Remove authoring/construction state no longer required downstream.
> Preserve stable semantic identity required for runtime behavior and future live handoffs.
> Do not bake ephemeral/live information merely because Player may later request it.
>
> **Preview / Production Parity**
> Preview uses the shipping render tree, not a parallel renderer.
> Fix the current mobile discrepancy so phone profiles exercise the actual production-mobile pipeline.
> Preserve shared systems such as the unified post-FX pipeline.
> Ensure Preview measurements describe what the selected target actually ships.
>
> **Visibility**
> Keep these separate: Stage visibility — creative intent. Preview inspection visibility — temporary mute/solo/isolation.
> Deployment visibility/policy — what a target actually spends resources realizing.
> Inspection controls must not modify Stage intent.
> Deployment decisions must not masquerade as inspection toggles.
>
> **Preview Measurement**
> Add/firm measurement for: application/bootstrap; individual slab artifacts; secondary assets; transfer size; decode/parse
> time; decoded CPU size/residency; GPU residency; draw calls; triangles; frame cost; transition spikes; mobile behavior;
> startup requirement.
> Preserve the rule: trust the all-on total, not the sum of isolated layer deltas.
>
> **Cold Start / Time to Ward**
> Expose the actual startup sequence:
> HTML → application runtime → scene manifest → minimum ground → minimum buildings → FIRST TRUTHFUL FRAME → progressive
> assets/systems
> Identify WARD USABLE. Measure TIME TO WARD.
> Distinguish blocking startup requirements from things that can arrive afterward.
>
> **Residency / Activation**
> Stop treating exists in the Ward and must be resident now as equivalent.
> Preserve the progression: BAKED → VISIBLE → SELECTED → OPENED
> Allow increasingly specific engagement to justify increasingly expensive resources.
> Preserve the baked Ward as authoritative while allowing runtime working set to remain smaller.
>
> **Technical-Director Controls**
> Make Preview the technical-director surface, not merely a profiler.
> If a measured system can materially blow a budget, expose its legitimate remediation control where appropriate.
> Technical controls change realization/deployment, not Stage's creative intent.
> Tie controls to measured problems rather than manufacturing generic quality knobs.
>
> **Existing Detail / Downres Ladder**
> Locate and document the existing shared HI/LOW/detail/downres ladder contract before changing it.
> Do not create a second LOD/quality/device regime.
> Ensure Preview can exercise the existing ladder against the production runtime.
> Show both the visual and measured cost consequence of changing its state.
> Preserve its shared use for complex reduced-resolution effects such as DoF/Bloom where already intended.
> Extend it only where the existing architecture supports doing so.
>
> **Deployment / Mastering**
> Determine the smallest persistent output Preview needs for technical-director decisions.
> Do not create another slab.
> Keep creative/baked truth immutable.
> Persist only technical realization/deployment decisions that must survive into Player.
> Give those decisions one explicit authority.
>
> **Live Handoffs**
> Preserve stable IDs/references required to request live information later.
> Bake the ability to find live information, not the live information itself.
> Keep live systems out of slab weight unless they genuinely belong there.
>
> **Performance Rule**
> Measure before optimizing.
> Do not begin by cutting polygons, reducing textures, adding impostors/LOD, partitioning the slab or building streaming.
> Determine whether the actual problem is transfer, decode, CPU memory, GPU memory, draws, triangles, overdraw, shaders,
> post, startup dependency or unnecessary residency.
> Allow "don't load that yet" to be a legitimate solution.
>
> **Done**
> Stage authors the desired Ward.
> Bake freezes that Ward without reconstructing it.
> Preview sees and measures the actual production runtime.
> Preview can technically master the Ward without rewriting creative intent.
> Player executes the mastered Ward.
> Camera, identity, visibility and deployment state have explicit authorities.
> Mobile Preview reflects actual mobile production behavior.
> Time to Ward, residency and steady-state render cost are measurable.
> The existing detail/downres ladder is understood and correctly integrated.
> No second renderer, second Ward representation or parallel quality regime has been introduced.
