# Handoff — The Channel Variant Cascade (per-shot + per-platform channel values)

> **Status: DESIGN LOCKED 2026-06-29 (Jacob + Boz) — build-ready.** Raised 2026-06-22; design reviewed +
> locked 2026-06-29. The marquee unsolved axis of the channel system. Still the **highest convergence of
> any arc** — surface to Boz before touching the channel store / `Scene.jsx` / the slab schema.

## Agent: FRESH

**Name yourself** (one word, joins the name-trail). Clean, self-contained arc on a now-locked design — no warm agent holds prior context; the design lives in this doc.

### First reads (in order — hard gate, `CLAUDE.md`)
1. **`ORIENTATION.md`** (root) — the mental model + settled doctrine.
2. **`README.md §⭐ START HERE`** + its cross-cutting feature index (where-X-lives).
3. **This whole doc** — especially "⭐ LOCKED DESIGN" + "Build phases" below. Build to the locked **whole-look fork** model, NOT the superseded sparse per-channel cascade in the "Original design notes" section.
4. The channel-system canon in the **Read-list** at the bottom — **read the cited file/section before editing it.**

### Write / commit boundaries
- **Code + `cartograph/bake-scene.js` + the slab schema are yours** — but ⛔ **surface to Boz/Jacob before the Phase-2 store change** (the highest-convergence edit: `useCartographStore.createGroupChannelActions` + every panel read site). Stand up the Phase-2 approach first; don't barrel the store.
- **Verify each phase against the lit app** (Jacob's eye, not a proxy — `feedback_proxy_render_is_not_the_operator_eye`). Migration must be **byte-identical** with no `shotLooks` (no fork = today's behavior exactly).
- **Canon docs are READ-ONLY for you** (`ARCHITECTURE` · `STAGE` · `SLAB-CONTRACT` · `PREVIEW` · `README` · `ORIENTATION`). Note doctrine deltas in a `scratch/` journal; **Boz folds them into canon** after the arc lands (per-touch gate + accord sweep). The one exception: when the schema lands, `SLAB-CONTRACT` gains the `shotLooks` note — flag Boz to add it.
- Commit your own files on `curb-offset-draw` with **selective `git add`**; don't sweep unrelated dirty files (there may be an uncommitted AO/soft-circles fix + slab edits — leave them).

---

## ⭐ LOCKED DESIGN (2026-06-29) — whole-look fork per shot ("duplicate the interface")

Jacob chose the **simpler-to-build** model over the original sparse per-channel/per-field cascade below: a
shot is either **following base** or **forked** — a *full independent copy of the whole channel set*, authored
with the **exact same Stage panel** bound to the active shot. **No per-field inherit badges, no per-channel
cascade-merge** — the front-end is today's interface, duplicated per shot. (Per-field granularity comes free:
a fork is a full copy, so every field can differ.)

- **Schema (sparse):** `design.json`/`scene.json` gain `shotLooks: { browse?: {<all channels>}, street?: {…} }`.
  Present only for forked shots → migration byte-identical (no fork = today's behavior exactly); no 3× bloat
  until a shot is opted in. Base stays the top-level channels (Hero uses base — Hero IS the default look).
- **Resolve (one point, NOT per-consumer):** the active look = `shotLooks[shot] ?? base`, merged channel-wise:
  `effectiveScene = { ...base, ...(shotLooks[shot] || {}) }`. Production resolves ONCE off the CameraRig's
  `viewMode` and passes the effective scene down — **consumers read `scene.<channel>` unchanged** (this is the
  blast-radius win of whole-look-fork over per-consumer `resolveChannel(shot)`). Stage resolves off the active
  shot selector.
- **Decisions settled:** granularity = whole-look fork (Jacob); specificity = `shotLooks[shot] ?? base`
  (platform layer slots in later as `shotLooks[shot]?.[platform] ?? shotLooks[shot] ?? base` — same shape,
  UI deferred); host = Stage (shot selector already there); fork seeded by duplicating base.
- **Authoring UX:** in a shot, a **"make this shot its own look / reset to base"** toggle. Forked → the panel
  edits `shotLooks[shot]` (the store's channel actions target the active shot's block instead of `s[name]`);
  reset → delete `shotLooks[shot]`. Switching shots swaps the whole panel to that shot's look.

### Build phases (sequential, verify each)
1. **Schema + production render** (lower-risk foundation): bake emits `shotLooks`; production resolves
   `effectiveScene = {...base, ...shotLooks[viewMode]}` ONCE (a `useShotResolvedScene(scene, viewMode)` at the
   scene-provision point) → consumers unchanged → per-shot looks RENDER. (Authoring not yet possible; verify a
   hand-edited `shotLooks` in scene.json renders per shot.)
2. **Stage authoring** (the bulk): the store's channel target follows the active shot (fork/reset actions);
   the panel binds to the active shot's block; the fork/reset toggle. This is where the read-site convergence
   lives — go carefully, verify a forked Browse channel edits independently of Hero.
3. **Bake** (`bake-scene.js`): emit `shotLooks` into `scene.json`; `SLAB-CONTRACT` schema note.
4. **(Later) platform axis:** add the platform layer to the fork (Stage Mobile|Desktop tab) — same mechanism.

### Blast-radius read sites (Phase 2 audit)
The channel store (`useCartographStore.createGroupChannelActions`, ~14 channels + hand-rolled lampGlow/clouds)
+ every panel selector `s.<channel>` + every render consumer (`PostProcessing`, `NeonBands`, `CelestialBodies`,
`GatewayArch`, `BakedGround`/grass pool, `StreetLights` lantern, clouds). Phase-1's single-resolve keeps
consumers unchanged; Phase-2 makes the STORE shot-aware (the authoring side).

---

### Original design notes (the sparse per-channel cascade — superseded by the whole-look fork above, kept for rationale)

## The problem

Every per-Look channel today (Bloom, AO, Grade, Exposure, Sky, Neon, Lamp Glow, Arch Lighting, Pool,
the cloud params, …) authors **one value (or one TOD curve) per Look**. Two contexts need *different*
values of the same channel:

1. **Per shot** — the lighting for the **Browse** overhead shot should differ from **Hero** (and Street).
   *Same channel, different value per shot.* (Jacob, 2026-06-22.)
2. **Per platform** — channels that must differ mobile vs desktop (e.g. brighter neon to compensate for
   no bloom on mobile). This is **axis #3 of `HANDOFF-mobile-profile.md §2`** ("Authored-value variants —
   slab channel, per-profile"), **not yet built.**

⭐ **These are the SAME kind of thing** — "the same channel, a different *value* in a different context."
So they are **one mechanism**, not two. Do not build per-shot plumbing and then per-platform plumbing
separately.

## What this is NOT (keep the axes clean — `HANDOFF-mobile-profile.md §2`)

The platform story is **three axes with three homes**; this cascade is **only the value-variant axis**:

| Axis | Home | This arc? |
|---|---|---|
| **Inclusion** (which *layers* mount per platform) | per-Look slab, **Preview-authored** (publish gate) | ❌ separate (layer-mount gating, not channel values) |
| **Global quality** (depth regime / dpr / AA / shadows / post-fx tier) | `INSTANCE.mobileQuality`, product-wide, **synchronous** | ❌ separate (device capability, Canvas-construction) |
| **Authored-value variants** (channel values that differ) | **slab channel, per-profile** | ✅ **this** — generalized to also key on *shot* |

Shot maps cleanly onto the value-variant axis: you are not mounting/unmounting channels per shot, and shot
is not a device-capability knob. (Open question, lifted from `mobile-profile §7 prompt #1`: the `:138`
"no Hero on mobile" case is a *shot × platform inclusion* call — that belongs to the **inclusion** axis,
not here, but it shows shot and platform interact there too.)

## The design — a sparse override cascade, resolved most-specific-wins (CSS-style)

```
base channel  →  + shot override  →  + platform override  →  evaluate the TOD curve at the minute
```

- A channel keeps its **base** (exactly today's shape: flat `{values}` or `{animated:'tod', values:{slot:…}}`).
- **Overrides are stored only where a context differs**, keyed by a selector `{ shot?, platform? }`.
- Resolution is **most-specific-wins**: an override keyed `{shot:'hero', platform:'mobile'}` beats
  `{shot:'hero'}` beats `{platform:'mobile'}` beats base. This yields shared / Hero-only / mobile-only /
  Hero-on-mobile **all sparse — no shot×platform matrix blowup.**
- The resolved channel-def is then evaluated at the current TOD minute by the existing resolver.

The common case (a channel the same across all shots+platforms) stays a single base — **no tri/Nx
authoring, no day-one change.** The operator opts into a variant only where they want a difference.

## Blast radius (why it's a dedicated late arc)

Same surface as the channel system itself — serialize against the other channel/Scene.jsx work:

- **Schema** (`design.json` / `SLAB-CONTRACT.md`): channels gain an optional sparse `overrides` keyed by
  selector. Migration: existing channels become the `base`, `overrides` empty → byte-identical.
- **Store** (`src/cartograph/stores/useCartographStore.js`): `createGroupChannelActions` +
  the hand-rolled `lampGlow`/`clouds` actions all gain a **context target** (active shot + active
  platform-tab) so set/animate/addSlot/removeSlot/revert write to the right override layer.
- **Resolver** (`src/cartograph/animatedParam.js`): a `resolveChannel(channel, {shot, platform, minute})`
  that picks the most-specific override, then runs `resolveGroupAtMinute` on it. **Every consumer** that
  resolves a channel passes the active shot (+ platform) — `PostProcessing` (LampGlowDriver), `GatewayArch`
  (archLight), `NeonBands`, `CelestialBodies`, `BakedGround` (pool via the uniforms), etc.
- **UI** (`src/cartograph/TodChannel.jsx`): an **"inheriting from base / overriding for <Hero>"** indicator
  + a **clear-override** affordance (mirrors the keyframe Clear), driven by the **Stage shot selector** and
  the **Stage Mobile|Desktop tab** (`mobile-profile §2` axis #3). This is a third+fourth layer on top of the
  existing flat-base→TOD-keyframe model — keep the panel legible (show only the active context's value;
  badge when it's an override vs inherited).
- **Bake** (`cartograph/bake-scene.js`): emit the base + overrides so the slab carries them; runtime
  resolves per active shot.
- **Runtime "active shot"**: production already knows its shot (CameraRig). Resolution must read it.

## Key decisions to settle in the design doc

1. **Override granularity** — *whole-channel* override per context (recommended: the channel is the unit,
   far less UI) vs per-field.
2. **Selector specificity** order (recommended: `{shot,platform}` > `{shot}` > `{platform}` > base).
3. **Authoring host** — shot variants authored in **Stage** (shot selector is there); platform variants
   per `mobile-profile` axis #3 are the **Stage Mobile|Desktop tab**. Confirm both live in Stage (inclusion
   is the one that moved to Preview — reversal B; value-variants did NOT move).
4. **Does any consumer resolve a channel without a shot in scope?** (audit — e.g. a non-shot context).

## Sequencing

After: pool/trunk-blend (in flight) → the **measurement regime** (`HANDOFF-preview-measurement.md`, its
instrument) → the Scene.jsx buildings/trees settle. Then: **design doc → review with Jacob → build.**
Per `mobile-profile §6`, surface to Boz before touching `Scene.jsx` / `PreviewApp.jsx` / the slab schema so
it sequences behind the others.

## Read-list for the agent who takes this
- **`HANDOFF-mobile-profile.md §2`** (the three axes — this arc is axis #3, generalized to shot) + `§6` (sequencing).
- **`HANDOFF-preview-measurement.md`** (the per-platform editorial surface + device profiles — the instrument).
- **`cartograph/PREVIEW.md §0.2`** (deployment policy vs Look-art; inclusion ≠ value-variants).
- **The channel system:** `src/cartograph/skyLightChannels.js` (field schemas) · `animatedParam.js`
  (`resolveGroupAtMinute`, the TOD resolver) · `TodChannel.jsx` (the authoring primitive) ·
  `useCartographStore.js` `createGroupChannelActions` (the store factory) · `cartograph/bake-scene.js` (emit).
- **`SLAB-CONTRACT.md`** (the schema home).
