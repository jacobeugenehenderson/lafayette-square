# Note — render-Boz → docs-Boz (2026-06-22 evening)

Hi. I ran a **render/Stage session** in parallel with your docs work. This note says **what we did**, **which docs I already touched** (so we don't collide / so you can trust the accord), and **what to look out for**. All my changes are `src/` + `cartograph/bake-*.js` code + the render-side Reference docs; I deliberately **stayed off BACKLOG.md** (yours — I only left one pointer, see below) and the pipeline/skeleton canon.

## What landed (all eye-verified or parse-clean; needs a re-bake + hard-refresh to *see*)
1. **Animation widget (`TodChannel.jsx`)** — "Revert" → **Clear**; chip-click **scrubs only** (no keyframe); keyframe is born on **edit**; the **clicked chip is the sticky edit target**. Applies to every channel.
2. **Arch Lighting (`archLight`)** — uplights split off `arch` into their own TOD channel (Hero & Horizon card). Fixed: shader face-term zeroed in daylight (softened); **stale-bake** (baked uplights were 0 vs authored L2.15/R3) → `migrateArchLight` carries them. ⚠️ **production needs a re-bake.**
3. **Lamps card (Stage)** — new **`lantern`** channel (Brightness + Glow, the lamp's own light source). **`lampGlow` now carries only Canopy** (`trees`). **The ground POOL follows the Lantern** — `StreetLights` writes `poolUniform = Lantern Brightness × the dusk→night ramp` (the pool *is* the lantern's light on the ground; one control, off by day, no separate `lampGlow.pool` field). Lamp *colour* = the Surfaces `layerColors.lamp` swatch (one source) — tints the lantern **and** the pool. *(This resolved a "pool slider doesn't control brightness / flashes full then disappears" bug — the old `lampGlow.pool` was TOD-animated + the uniform defaulted to 1.0.)*
4. **Ground-contact trio — baked into the ground, sampled by the ground shaders:**
   - **Lamp light pools** → **R** channel of `ground.poolmap.png` (the "ground FX map"), tinted by the lamp colour, × the Lantern's output (see #3). Floating disc retired.
   - **Contact shadows** (tree + lamp bases) → **G** channel of the same map, **multiplied into the diffuse directly** (visible in daytime; `aoMap` was ambient-only → invisible by day). Always-on (night hides it naturally). Floating `baseMat` disc retired.
   - **Trunk-base ground blend** → `ground.colormap.png` (per-Look albedo raster); trunk shader samples it at world-XZ → trunk base takes on the ground beneath it. LS-driven via `BakedGround` → `groundColorState` (Salon = off). *Eye-verified ("looks great").*
5. **Crash fix:** `GroundMeshes` keyed by the cache token (conditional `useLoader`s would otherwise change hook order on first re-bake).

## Docs I already updated (please don't redo; trust these are in accord)
- **`cartograph/STAGE.md`** — SC.7 row (+`archLight`), the Lamps note (`lantern` + `lampGlow {pool,trees}` + pool-colour link), the TodChannel behaviour.
- **`SLAB-CONTRACT.md`** — §1 dir layout + §3 (AO = building-AO only now) + **§3.1 (the RG ground FX map)** + **§3.2 (ground-color map)** + scene.json gains `lantern`/`archLight`.
- **`cartograph/BAKE.md`** — step 8 (ground-ao emits 3 textures) + the slab map.
- **`cartograph/OPERATIONS.md`** — Stage knobs (Clear/keyframe behaviour, Lamps card, Arch Lighting, ground-contact effects) + **the bake/shader knob locations** (Jacob asked these be recorded for later panel promotion).
- **`cartograph/NOTES.md`** — the full evening Diary entry (the narrative + the lesson + knob map).

## What to look out for / still to polish (yours if you want them)
- **`cartograph/FEATURES.md`** — no render entry yet for the ground-contact trio / arch lighting / the lantern. The *pitch* ("the neighbourhood's lamps and trees marry into the ground; everything's a time-of-day curve") is unwritten — your domain.
- **`README.md` cross-cutting feature index** — could use a row for "ground-contact effects (pools / contact shadows / trunk blend)" → home `SLAB-CONTRACT §3.1/§3.2`, `BAKE §2`. I didn't touch README.
- **`cartograph/PREVIEW.md`** — the pool/shadow register under the **ground** layer (parity is automatic); a line on that + the per-platform inclusion candidacy would be accurate. Untouched.
- **BACKLOG.md (yours):** I added **one** pointer — the **Channel Variant Cascade** (new `HANDOFF-channel-variant-cascade.md`, the per-shot + per-platform channel-value arc, lands last). Also still-queued: **lamp-placement authoring** (placement is hardwired to `street_lamps.json`). Both are render/Stage arcs; fold into your index however you like.
- **Re-bake reality:** I ran `bake-ground-ao` standalone (so the rings/pool/colormap exist in the `lafayette-square` slab) but did **not** bump the scene cache token — the app needs a hard-refresh, and a normal Bake re-runs everything cleanly. The `public/baked/*` diffs are mine (regenerable).

— render-Boz
