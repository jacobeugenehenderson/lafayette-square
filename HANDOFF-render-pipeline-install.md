# Handoff — The v1 Render-Pipeline Install Method (one pipeline, installed everywhere)

> **Status: DESIGN DRAFT (2026-06-27, Boz + Jacob). Standup + review BEFORE any code — high blast radius.**
> **Agent: design review with Jacob first; the build is a serialized FRESH dispatch after the manifest shape + mode-parameterization are signed off.**
>
> ⛔ **ROUTE FIRST** (`CLAUDE.md`): `ORIENTATION.md` → `README §⭐ START HERE` (Preview / Stage rows) →
> `cartograph/PREVIEW.md` (the parity keystone — read whole) → `HANDOFF-render-conformance.md` (the parity
> *principle*; Ph1–3 landed) → `HANDOFF-preview-measurement.md` (the inspection *instrument*; DRAFT) → this.
> This doc is the **foundation those two stand on** — not a third competing plan.

---

## Why this exists — the doctrine-vs-reality gap

The doctrine says Preview and the Slab already render the same pipeline:
- `cartograph/PREVIEW.md`: *"Preview is production's render tree, byte-for-byte."*
- `src/components/PostProcessing.jsx` header: *"ONE consumer — Production, Stage, and Preview mount this same file."*

The **code says post-FX is the exception** (verified 2026-06-27):
- **Production** `Scene.jsx:818` → `<PostProcessing>`. **Stage** `CartographApp.jsx:1001` → `<PostProcessing>` (the duplicate Preview mount was already removed — `:1059`).
- **Preview** `PreviewApp.jsx:965` → **`<PreviewPostFx>` — a FORK.** It rebuilds its own `EffectComposer` (`PreviewPostFx.jsx:161`) with each pass conditionally mounted (`{bloom && <CustomBloom>}`, `{dof && <RomanceDoF>}` …) so the **per-effect toggle matrix** works — and it re-implements the post-FX **driving**, which is where it rots. Concrete rot, found this session: its DoF driver is URL-param-based; it never got the per-frame `heroDist` view-Z, the look-down browse gate, or channel resolution. So Preview's DoF is silently wrong.

The fork exists for a **real reason** (the inspection toggles + per-pass cost gauges Preview needs). The bug is that the fork **duplicates the pipeline + the driver** and drifts. A shared driver-hook would patch the drift but leave two composers that can still diverge. **The proper v1 fix:** the pipeline is *declared once and installed identically everywhere*; inspection is a *parameter* on that one install, never a parallel composer.

## The principle

> **One pipeline manifest (the SSoT for *what ships*). One installer that consumes it, parameterized by mode. Inspection (toggles + gauges) is a uniform wrapper the installer applies — not a re-authored composer.** Production, Stage, and Preview render the same pipeline **by construction**: add a pass, fix a driver, change an order — it touches *one* place and all three inherit it. `PreviewPostFx` is **retired**, not maintained in parallel.

This is the "ONE consumer" doctrine made *structural* instead of asserted.

## The architecture (three pieces)

### 1. The manifest — the pipeline declared, not hand-wired JSX
An ordered list; each entry names its component, its channel, its order, and (later) its platform inclusion:

```
// renderPipeline.js  (illustrative shape — sign off before building)
export const POSTFX_PIPELINE = [
  { id:'ao',     pass: N8AO,            channel:'ao',     order:10, platform:'desktop' },
  { id:'pyramid',pass: DownsamplePyramid, order:20, dependsOn:['dof','bloom'] }, // shared resource
  { id:'dof',    pass: RomanceDoF,       channel:'dof',    order:30, platform:'desktop' },
  { id:'bloom',  pass: CustomBloom,      channel:'bloom',  order:40 },
  { id:'aerial', pass: AerialPerspective,channel:'halo',   order:50 },
  { id:'grade',  pass: FilmGrade,        channel:'grade',  order:60 },
  { id:'smaa',   pass: SMAA,             channel:'smaa',   order:70 },
  { id:'grain',  pass: FilmGrain,        channel:'grain',  order:80 },
]
```
This is the literal ship list. `platform` is the inclusion dimension `preview-measurement` wants — same manifest, one more field. (The SCENE tree — Ground/Buildings/Trees/Lamps/Arch/Sky/Neon — gets the same treatment as a Phase-4 follow-on; it's already 90% shared, Preview just wraps each layer with a toggle.)

### 2. The installer — consumes the manifest, parameterized by mode
One component (extend `PostProcessing` or a new `RenderPipeline` it delegates to):
- **`mode='production'`** (`Scene.jsx`): install every entry, channels from `scene.json`. No toggles → composer built once.
- **`mode='stage'`** (`CartographApp.jsx`): same install, channels from the live store overrides.
- **`inspect={…}`** (Preview): same install + wrap each entry with its **toggle visibility** + **cost-gauge probe**; toggle/gauge state flows from Preview's layer matrix. The composer `key` includes the toggled-pass set so it rebuilds on toggle (today's mechanism, generalized). Production's key is static.

### 3. The driving lives in the installer — so it can't fork
`usePostFxDriver(resolvedChannels, mode)` — one per-frame hook that resolves every channel → the module refs (`_dofRefs` incl. `heroDist`/view-Z/gates, `_postFxRefs`, bloom, grade, grain…) → uniforms. Written **once**, identical for all three modes. (This is the only "shared hook" — but it's *part of the one installer*, not a patch bolted onto two composers.)

## Build phases (each its own commit; serialize on the converging files)

- **Phase 0 — this doc + standup.** Sign off the manifest shape + the `inspect` param contract. (We are here.)
- **Phase 1 — extract `usePostFxDriver`.** Lift `PostProcessing`'s per-frame `useFrame` driving (channel resolution, `_dofRefs` incl. heroDist + gates, `_postFxRefs`, bloom) into one hook; `PostProcessing` calls it. **Refactor, zero behavior change** — verify production + Stage render byte-identical.
- **Phase 2 — manifest + installer.** Author `POSTFX_PIPELINE`; build the installer that mounts passes from it in order, parameterized by an optional `inspect` (toggle map + gauge callbacks). Production/Stage use it with no `inspect` (identical output to today).
- **Phase 3 — switch Preview, retire the fork.** `PreviewApp` mounts the one installer with `inspect={layerMatrix}`; **delete `PreviewPostFx`**. Verify: the toggle matrix + per-pass cost bars still work, AND Preview's DoF is now correct (heroDist/gates inherited). This is the parity win.
- **Phase 4 (follow-on) — the SCENE tree onto the same manifest.** Formalize Ground/Buildings/Trees/Lamps/Arch/Sky/Neon as manifest entries so the *whole* render tree is one declaration; Preview's `LayerRow` becomes the scene-side `inspect` wrapper. Now Preview == Slab is structural end-to-end.
- **Phase 5 — fold the loose arcs in.** `render-conformance` Ph6 (parity cleanups) and `preview-measurement`'s toggle/gauge + inclusion-manifest become *capabilities of the one installer* (the `platform` field + the `inspect` wrapper), not separate machinery.

## Verify (the gate, each phase)
- **Phase 1/2:** production + Stage are pixel-identical before/after (pure refactor). 
- **Phase 3:** in Preview — every toggle still mounts/unmounts its pass, every cost bar still reads, and the DoF hero pocket lands (the `window.__dofDebug` paint shows the same zones as Stage). Toggle DoF off → Bloom still correct (no coupling).
- **Drift test (the whole point):** add a throwaway pass to the manifest → it appears in production, Stage, AND Preview with no per-surface edits. That's the proof the fork is gone.

## Blast radius / coordination
`Scene.jsx`, `PostProcessing.jsx`, `PreviewApp.jsx`, **retiring `PreviewPostFx.jsx`**, the new `renderPipeline.js` manifest + installer, `GpuMonitor`/`LayerRow` (the gauge probes). **HIGH convergence** with `HANDOFF-render-conformance.md` (the production Canvas / camera) and `HANDOFF-preview-measurement.md` (the toggle matrix + inclusion manifest) — **serialize; surface to Boz before editing those files.** Canonical off-limits unless the dispatch says so: the slab contract, the one-tree-program bloom constraint.

## Open decisions (Jacob's — for the standup)
1. **Scope v1 to post-FX only** (the actual fork — Phases 1–3), then the scene tree as a clean follow-on (Phase 4)? Or design both manifests up front? *(Boz recommends post-FX first — it's where the rot is, and it proves the method on the smaller surface.)*
2. **The `inspect` contract** — installer takes a `{ toggles, onCost }` param and owns all the wrapping (Boz's recommendation), vs. Preview composes the manifest itself. The former keeps the one-installer invariant; the latter re-opens the fork door.
3. **Does this absorb `preview-measurement`'s inclusion manifest?** The per-platform "what ships to desktop vs mobile" is just the `platform` field per manifest entry — i.e. the *same* SSoT. If yes, `preview-measurement` narrows to the *gauges + device emulator*, and the inclusion-authoring becomes editing this manifest at the Preview gate. *(Boz leans yes — one manifest, not two.)*
4. **Naming** — extend `PostProcessing` into the installer, or a new `RenderPipeline` that `PostProcessing` becomes a thin mode of? *(Cosmetic; decide at build.)*

## Documentation deliverable (first-class, not an afterthought — Jacob, 2026-06-27)

The manifest is itself a **documentation artifact** — the recorded, readable SSoT of *what the product renders*. So this build is **also a doc effort**, and it must hit **every register** (the accord matrix, `BOZ §0`), never just one:
- **The manifest, recorded.** `renderPipeline.js` is the machine SSoT; its human-readable copy + the *why* live in `cartograph/ARCHITECTURE.md` (the install mechanism + a manifest table) and `PREVIEW.md` (the parity guarantee it makes structural).
- **FEATURES** (pitch) — the pipeline is a *feature*: "author one Look; it renders the same on every surface and every device, by construction." Each effect that earns a slot is a feature line (DoF = the romance + invisible-LoD cover; bloom = backlit hero + glowing lights).
- **OPERATIONS** (knobs) — each entry's channel + its Preview toggle/gauge.
- **ARCHITECTURE** (mechanism) — the manifest + installer + mode-parameterization; a Decisions entry.
- **NOTES** (narrative) — the arc + lessons on landing; this HANDOFF retires there.

⭐ **The rule:** a thing like DoF is *simultaneously* a FEATURE, an ARCHITECTURE decision, an OPERATIONS knob, and a manifest entry — landing it means **closing the per-touch gate across all of them in the same arc**, not just the doc you happened to edit. The same gate applies to the BACKLOG: it must always reflect the *real* current state, callable at a glance.

## Relationship to the existing plan docs (accord)
- **Supersedes** the loose "Preview out of sync" patch item in `cartograph/BACKLOG.md` (the DoF-arc bullet, follow-up #1) — that bug is *fixed as a side-effect* of Phase 3, not patched.
- **Foundation for** `render-conformance` (makes its "Preview == Production" principle structural) and `preview-measurement` (the toggle/gauge/inclusion become installer capabilities). Repoint both to this once the design is signed off.

*Filed 2026-06-27 (Boz). The Reference home for the settled method is `cartograph/ARCHITECTURE.md` (a Decisions entry) + `PREVIEW.md` on landing; this State doc retires to NOTES then.*
