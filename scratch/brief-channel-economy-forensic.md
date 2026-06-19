# Brief — The Channel Economy: a render/bake channel forensic (read-only, no code)

> **Agent: FRESH.** A forensic inventory wants fresh, skeptical eyes and a clean read of the
> as-built — no warm agent holds the render/post-process surface in context. This mirrors the
> Increment tree-pipeline audit (`scratch/audit-arborist.md`): read-only, evidence-backed,
> classify-before-recommending. *Why fresh: the value is an unbiased census of every channel and
> what's genuinely shareable — not a confirmation of a hypothesis we already hold.*

**You are the dispatched agent. Name yourself** — one word, novel, not on the project's
name-trail (check `arborist/NOTES.md` + recent commits before choosing). The name is yours.

**This is READ-ONLY FORENSIC. Write no code. Change no pipeline.** Your single deliverable is an
inventory + analysis document. You may spawn `Explore` sub-agents for breadth, but **you
re-verify every load-bearing claim yourself before recording it** — an Explore over-fired in the
Increment audit and mislabeled a live file as vestigial (`scratch/audit-arborist.md §6`). Verify
the artifact; never trust a summary.

---

## Why this exists — the question, in one line

We're designing tree perf (DoF-gated detail-LOD, leaf overdraw, the "calm canopy" — see context
below) and keep hitting the same wall: **we don't have a map of the whole channel economy.** We
keep reasoning about *one pair* of effects at a time (can Bloom and DoF share a blur pyramid?) and
guessing. Jacob's call: **stop guessing — inventory ALL the channels from the code and determine
what's actually "on the table"** to stack, share, repurpose, cut, or split by time-of-day. There
are many channels; there are likely several reuse/repurpose opportunities we can't see without the
full census.

**A hard constraint that frames every recommendation:** the operator has deliberately built a
**per-channel measurement + toggle regime** (gauges in Preview; toggles in the authoring panels
*and* in Preview that both hide a channel *and* remove it from the bake). This regime is how cost
is transacted honestly — measure a channel's cost, decide if it earns its slot. **Therefore any
"fuse these two effects" recommendation that COUPLES them and destroys clean per-channel
measurement is a NON-STARTER** (operator ruling, 2026-06-18: "fusing two effects couples them —
that negates the point"). Sharing is only valuable if the shared part stays **independently
measurable** (e.g. a shared resource as its own gauge line-item, with each consumer a cheap
measurable delta on top). Carry this as your acceptance test for every opportunity you surface.

---

## Read first — the canon + the as-built (HARD GATE: read before you inventory)

1. `ORIENTATION.md` (root) + `SLAB-CONTRACT.md` — what the bake carries vs. what the runtime
   reconstructs; "if it isn't baked, the public never sees it."
2. **The measurement/toggle regime — read these closely, they define "channel":**
   - `src/preview/deviceProfiles.js` — the device-profile SSoT (recent: commit `c1cc244`
     "device-profile SSoT — collapse the duplicated gauge budgets"). The per-device budgets.
   - `src/preview/GpuMonitor.jsx` + `src/preview/StripChart.jsx` — the gauges (what's measured,
     how per-channel attribution works, the `measureToggle` mechanism).
   - `src/preview/PreviewApp.jsx` + `src/preview/PreviewPostFx.jsx` — the Preview channel toggles
     (hide + remove-from-bake) and the post-fx wiring.
   - `HANDOFF-preview-measurement.md` (if present at root) — the non-destructive `.visible`-gating
     doctrine (toggles must gate visibility, not mount/unmount, for a clean per-frame delta).
3. **The render/post-process surface:**
   - `src/components/PostProcessing.jsx` — the production post stack (Bloom et al.).
   - `src/cartograph/CartographPost.jsx` + `src/cartograph/TodChannel.jsx` — the Stage post stack +
     the **time-of-day channel** (the natural home of the Day/Night idea below).
   - `src/components/Scene.jsx`, `src/stage/StageApp.jsx`, `src/cartograph/CartographApp.jsx` — the
     three render hosts (prod / stage / preview) — confirm parity or divergence in their channels.
   - Channel consumers: `src/components/StreetLights.jsx`, `src/components/NeonBands.jsx`
     (bloom-driven night channels), `src/components/treeAtlasMaterial.js` (the tree material's
     bloom-stability constraint), `src/components/InstancedTrees.jsx`.
   - `HANDOFF-render-conformance.md` (root) — the render-pipeline conformance arc (Vernier's depth/
     camera work; what's already been normalized across the three hosts).
4. **Reuse, don't re-derive:** `scratch/audit-arborist.md` (Increment) already inventoried the
   *tree* channels (atlas/bark/leaf/detail/posterized/gradient/wind/lampGlow/heroTier) with cost
   notes + cruft classes — **absorb its tree rows; don't re-audit them.** Use `AUDIT-MATRIX.md` for
   the classification method (real / duct-tape / vestigial; classify-before-cutting).

If anything contradicts this brief, flag Boz before building the analysis around it.

---

## What to produce

### Part 1 — The channel census (the inventory matrix)

**Scope anchor (operator ruling, 2026-06-18): "whole app's channel economy, but in practice it's
the channels we are building the Slab with."** So the census is whole-app in *reach* but
**slab-anchored** in *focus*: every channel that **constitutes or configures the shipped Slab** —
the baked content (ground/buildings/trees/AO/scene) AND the baked render/effect *configuration* a
Look carries (bloom params, TOD curve, post-fx settings that travel through the bake into the
runtime). The measurement/toggle regime (gauges, device profiles) is your **lens for measuring**
these channels — it is *not itself* a census target. **Exclude** pure authoring/dev scaffolding
that never ships (debug overlays, QC tints, the gauges themselves). If a channel is runtime-only
but its parameters are baked into the Look/slab (Bloom, a future DoF), it's **in** — that's the
heart of the question. The test for inclusion: *does this channel end up in, or shape, what the
public's slab renders?*

Enumerate every such channel. For each, a row:

| Field | What to capture |
|---|---|
| **Channel** | name + what it is (one line) |
| **Kind** | bake-channel (in the slab) · runtime-render · post-process · material-feature |
| **Authored where** | the panel/knob that controls it (or "derived, no knob") |
| **Toggle home(s)** | authoring-panel toggle? Preview hide? Preview remove-from-bake? (which exist) |
| **Cost** | measured if the gauge attributes it; else estimated + how (overdraw / passes / bandwidth / draws / tris). Note mobile-thermal weight specifically. |
| **Depends on / shares** | what other channel(s) it reads, writes, or shares machinery with (e.g. a downsample/blur pyramid, a depth buffer, a render target, the master atlas) |
| **TOD relevance** | day-dominant · night-dominant · both · neutral (the Day/Night axis) |
| **Host parity** | same across prod/stage/preview, or divergent? |
| **Class** | real / duct-tape / vestigial (per AUDIT-MATRIX), with evidence |

Cover at least: Bloom (+ its blur pyramid), any DoF/depth pass (confirm it EXISTS or is only
planned — the Azimuth "fake-blur-via-impostor" plan vs a real post DoF), tone-mapping / color
grade, fog, the sky / planetarium / constellations, lamp-glow, neon bands, AO / ground lightmap,
shadows, wind, the tree material sub-channels (cite Increment), ground, buildings, water if any.

### Part 2 — What's "on the table" (the opportunity analysis — the payoff)

This is why we're doing it. A **ranked** list of concrete opportunities, each with: the mechanism,
the estimated win (cost/thermal), the risk, and — mandatory — **how it preserves independent
per-channel measurement** (the non-coupling acceptance test above). Categories to hunt:

- **Shared resources (not fused effects).** Where two+ channels independently need the same
  expensive primitive — the seed hypothesis is a **downsampled blur pyramid** that Bloom builds and
  DoF could *sample from* (NOT pipe-through; bloom blurs bright-pass + adds, DoF blurs full-scene +
  CoC-lerps — they share the pyramid, not the result). Confirm or kill this from the actual Bloom
  implementation: does our Bloom expose/produce a reusable mip chain, or is it a sealed black box?
  Same scan for any other shared render target / depth buffer / atlas. **The shared resource must
  be its own gauge line-item; each consumer a measurable delta — else it's coupling, reject it.**
- **Day/Night channel sets.** Which channels are TOD-asymmetric (night: bloom/lamp-glow/neon/
  constellations; day: DoF/leaf-detail/sky)? Could a channel be *off the budget entirely* in the
  half-day it doesn't earn its keep? `TodChannel.jsx` is the existing TOD spine — does it already
  gate any channels, and could it gate budget? This is the operator's "Day/Night versions" instinct
  — evaluate it concretely: which channels, what's the saving, does it stay measurable.
- **Repurpose / stack.** A channel's output usable by another for free (e.g. a depth buffer already
  computed for X, reused by Y; an AO pass feeding fog; the bloom pyramid smothering far-canopy leaf
  shimmer as a side-benefit). List every two-for-one you find.
- **Cut / vestigial.** Channels that don't earn their slot — measured cost high vs. visual payoff,
  or duplicated across hosts, or dead. (Cross-ref Increment's tree cruft.)

### Part 3 — Implications for the tree DoF/LOD design (the immediate consumer)

A short section answering the three questions blocking the Espalier design revision:
1. **Is there a real DoF pass today, or only the fake-blur plan?**
2. **Can DoF ride Bloom's blur pyramid as a shared (measurable, uncoupled) resource — or is that a
   refactor?** This decides whether DoF-gated tree LOD is a knob-wire or a build.
3. **How do the tree/leaf/bloom/DoF channels sit in the toggle+gauge regime today** — what's
   already measurable per-channel, what isn't.

---

## Deliverable

A single doc: **`scratch/CHANNEL-ECONOMY-FORENSIC.md`** (or a better name you pick, in `scratch/`).
Commit it (untracked otherwise = lost). **Nothing else** — no code, no pipeline, no canon edits.
End with a **"For the Boz/Jacob review"** section: the top 3–5 opportunities as lean
recommendations + the one tradeoff each (prose, not a checklist —
`feedback_design_via_prose_discussion`), each passing the non-coupling/measurability test.

## Context — the design conversation this serves (don't re-derive; this is the frame)

The active arborist design (`cartograph/_archive/FOREST-BUILDER-DESIGN-v1-superseded-2026-06-18.md`, Espalier) is being revised around:
deep catalog of whole de-leafed cores × a deformer envelope (no limb modules); a "calm coherent
canopy" (legible static leaf clusters + one shared green-band gradient ramp); and **DoF-gated
detail-LOD** (real depth-of-field for romance AND as the cover that lets leaf detail taper
*invisibly* in blurred zones — trees never disappear / cull stays vetoed; popping dissolves in the
blur). The open question that spawned THIS forensic: the post-process/channel economy that
DoF-gated LOD must live inside — what's shareable, what's TOD-splittable, what earns its slot — all
measured through the regime, never coupled.

**Check in with Boz** if: a channel's cost can't be read from the gauge regime (note it as a
measurement gap, don't guess a number); the Bloom implementation makes the shared-pyramid question
genuinely undecidable without running code (flag it as "needs a spike," don't speculate); or the
census surfaces something that contradicts the tree-design frame above.
