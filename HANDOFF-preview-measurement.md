# Handoff — Preview Measurement Regime: Trustworthy Per-Layer GPU Attribution

> Dispatch-ready brief. The Preview layer toggles are meant to do double duty: hide/show a layer
> AND turn its GPU cost on/off so the panel attributes load per layer. Right now they don't measure
> reliably — every toggle conditionally *mounts/unmounts* (destructive churn), and the buildings
> toggle gates the wrong path. This makes Preview "a scene that rebuilds itself as you poke it"
> instead of "production's render tree + a non-destructive inspection overlay." Fix the regime.

**You are the dispatched agent. Name yourself** — novel + NOT already used in this project (check
`arborist/NOTES.md` / `cartograph/BACKLOG.md` / commits). No theme suggestions. You own this
end-to-end. **Recommended dispatch:** someone fluent in `src/preview/PreviewApp.jsx` + the
`GpuMonitor` + the layer system.

**Diagnostic-first.** Phase 0 is an audit with NO code change. Do not start converting toggles until
the audit confirms what "all on" actually renders vs production and how the meter behaves.

---

## Why this exists (the stakes — don't under-weight this)

Preview is the **GPU-proving ground before slab handoff** (`cartograph/FEATURES.md`): "if a layer's
cost is unexpectedly high in Preview, the panel surfaces it before mobile users feel it." **The whole
mobile-perf arc runs on this meter** — the hero-tree LOD/impostor work (`HANDOFF-tree-hero-lod.md`,
Azimuth) has a Phase-0 baseline and a Phase-D success gate that are *literally* "draw-call / overdraw
drop in the Preview GPU panel." If the meter is churny or miswired, **we cannot trust the number
that's supposed to prove the impostors were worth building.** A trustworthy measurement regime is
*upstream* of validating that win — that's why this is being done now.

**The doctrine being restored** (`project_preview_equals_ls_literally`): Preview and production LS are
two consumers of the same slab with **identical render trees**; Preview adds inspection bolt-ons *over
the top*. A toggle that changes the **mount** (rather than visibility) forks Preview from production
and contaminates the measurement with mount/unmount transients.

**The full parity chain — measurement only matters if it traces back to Stage.** Per `cartograph/
FEATURES.md`: **"the product is what the operator sees in Stage."** The chain is **Stage authors
(live) → bake → slab → Preview measures it == Production ships it.** So "all on == production" is the
*tail* of the chain, not the whole of it: the thing you measure in Preview is only legitimate if it's
the faithful bake of what **Stage displays**. Verifying only Preview↔Production can miss that *both*
diverge from Stage — e.g., an authored layer that didn't bake through (a slab gap; the "Stage dark
but Preview fine = half-baked slab" failure mode). Your audit cross-checks against Stage and **flags**
divergence; it does **not fix** slab-completeness gaps (that's SLAB-CONTRACT territory — see scope).

## Current state (verified 2026-05-26)

- **All geometry layers conditional-MOUNT:** `{layers.fog && …}`, `ground`, `slabBuildings`, `trees`,
  `park`, `lights`, `arch`, `celestial`, `clouds` (`PreviewApp.jsx:686–723`). Toggling off unmounts →
  disposes geometry/textures; toggling on re-uploads + re-compiles. Destructive churn; `renderer.info`
  right after a remount is unstable.
- **Buildings double-toggle is miswired:** `buildings` gates the *live* (already-hidden) LafayetteScene
  buildings via `hiddenLayers`; `slabBuildings` mounts the slab (`:707`, `:715`). So toggling "Buildings"
  off does nothing to the *rendered* (slab) cost — the "meter doesn't move as expected" symptom.
- **PostFX toggles are prop-gated** (`ao/bloom/aerial/grade/grain` as props, `:730`) — a different,
  already-non-destructive mechanism (effect inclusion in the composer). Likely fine; confirm in audit.
- **GpuMonitor reads `renderer.info`** (draws/tris/ms) + a per-layer `measureToggle`. Note: **no
  overdraw field** — overdraw only manifests as frame-ms under a fill-bound profile.

---

## Phase 0 — Audit (NO code change; mandatory first)

1. **Inventory** every layer toggle and exactly how it gates cost (conditional-mount / `hiddenLayers`
   prop / PostFX prop / `SHOT_SKIP`). Table it.
2. **"All on" == production?** Compare the Preview render tree with all toggles on against production
   `src/components/Scene.jsx`'s mount list. Enumerate every divergence (the live-vs-slab buildings
   path, any Preview-only mounts, prop differences). The target end-state: all-on Preview is production's
   exact render tree.
2b. **And == Stage?** Cross-check the measured layer set against what **Stage** (`/cartograph.html` in
   shot modes) displays — Stage is the authored source of truth ("the product is what the operator sees
   in Stage"). A layer Stage shows but Preview doesn't measure = a candidate **slab gap** (authored-but-
   not-baked); a layer Preview/production renders that Stage doesn't = **drift**. **Flag these as
   findings — do NOT fix them here** (slab-completeness is SLAB-CONTRACT territory). The point is to
   confirm the meter measures the faithful bake of the authored product, and to surface it if it doesn't.
3. **Sanity-test the meter empirically.** On a fixed shot/TOD, toggle each layer and record the
   draws/tris/ms delta. Flag any toggle whose delta is implausible (buildings ≈ 0 today). Establish
   whether there's a fixed **baseline** cost (everything off) that should be subtracted, and whether
   `renderer.info` is read after it stabilizes (not mid-remount).
4. **Pin the intent: render cost vs memory.** Per-frame *render* cost (draws/tris/fill — the mobile
   bomb) is measured cleanly by `.visible=false` (skips the draw, no churn). GPU *memory* needs
   disposal. Confirm the regime's goal is render cost (recommend: yes) — that decides the gating
   mechanism. If memory attribution is also wanted, that's a separate explicit mode, not the default.
5. **Note CPU vs GPU:** an invisible component's `useFrame`/uniform updates still run (CPU). Fine for
   GPU attribution; flag any layer where that materially skews `ms`.

Write a findings note in this brief before Phase 1. **Surface anything that contradicts this brief**
— especially if the audit shows conditional-mount was intentional for a reason this brief missed.

## Phase 1 — Non-destructive `.visible` gating (geometry layers)

Mount every production layer **exactly as `Scene.jsx` does** (same components, props, baked assets),
unconditionally; toggles flip `visible` (or a layer mask), not the mount.

- **"All on" becomes production's literal render tree** — verify against the Phase-0 divergence list.
- Each toggle **cleanly zeroes that layer's per-frame draws/tris when off**, with no dispose/re-upload
  and instant re-enable.
- PostFX toggles: keep their prop/composer mechanism (already non-destructive) unless the audit says
  otherwise.

- **Fixes:** the meter delta per toggle is a clean steady-state per-frame cost; "all on" reads true
  production load.
- **Verify:** toggle each layer repeatedly — meter moves by a stable, repeatable amount, no transient
  spikes, instant re-enable. "All on" draws/tris match a production (`index.html`) reading of the same
  shot.

## Phase 2 — Collapse the buildings double-toggle + set the convention

- **One "Buildings" toggle** gating the *slab* buildings' visibility (live path stays hidden, exactly
  like production). Remove `slabBuildings`. Migrate the persisted layer key (`preview.layers.v*`).
- **Document the toggle convention** (in `PreviewApp` + wherever Preview's contract is noted): toggles
  gate `.visible`, never the mount; **migration A/B flags are temporary** — collapse to a single layer
  toggle once the new path is operator-confirmed. This is the convention **Azimuth's tree-impostor
  Preview flag (Phase C) must follow** — coordinate so it lands as a temporary flag, not a permanent
  second toggle.
- **Panel honesty:** surface the two inherent caveats so readings aren't misread — (a) per-layer deltas
  are **non-additive** (overdraw: toggling trees off lowers buildings' fill cost too), so always show
  the true "all-on" production anchor; (b) the meter is **render cost, not memory**.

- **Verify:** one buildings toggle that actually moves the meter; convention documented; no double
  toggles remain.

---

## Explicitly out of scope

Editing `src/components/Scene.jsx` (production render tree is the reference, not the target — only read
it); the GpuMonitor's internals beyond what's needed to trust the reading (no new overdraw-capture
instrumentation unless the audit proves it necessary — surface as a decision); the neon and tree feature
arcs (you set the toggle convention they follow; you don't implement their layers). Memory-attribution
mode is out unless the audit elevates it. **Fixing Stage↔Preview↔Production parity / slab-completeness
gaps is OUT — flag them as findings only;** closing a slab gap is SLAB-CONTRACT work. **That fix is the
designated NEXT arc (operator, 2026-05-26)** — so make your flagged divergence inventory clean and
complete; it's the input that scopes the next arc (it feeds `cartograph/BACKLOG.md`'s "Slab completeness"
track). Enumerating well here is part of the job even though fixing isn't.

## Commit boundaries

One commit per phase, each independently revertible. Phase 0 is findings-only (no code). Canonical
off-limits: `Scene.jsx` (read-only reference), the neon glow doctrine, the slab contract. **Convergence:**
this touches `PreviewApp.jsx`, which Azimuth's tree arc will also touch at its Phase C (impostor flag) —
**surface to Boz before landing Phase 2** so we sequence against Azimuth's PreviewApp edits and his flag
adopts your convention. Check in with Jacob after **Phase 0** (does the audit match his read of the
meter misbehavior?) and after **Phase 2** (one-toggle + convention). Surface anything not in this brief
in your status + commit bodies.
