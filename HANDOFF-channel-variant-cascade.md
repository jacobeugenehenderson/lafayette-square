# Handoff — The Channel Variant Cascade (per-shot + per-platform channel values)

> **Status: design/plan — NOT dispatch-ready yet (design-doc first).** Raised by Jacob 2026-06-22.
> The marquee unsolved axis of the channel system. **Lands last** — highest convergence of any arc
> (see `HANDOFF-mobile-profile.md §6`); the measurement regime is its instrument. Build only after the
> in-flight visual work (pool/trunk-blend) + the measurement regime + the Scene.jsx work settle.

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
