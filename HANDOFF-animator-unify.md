# HANDOFF — Unify the TOD animator: drop "animate", always show the chips

**Quick dispatch brief.** Rework the TOD-channel authoring UX so there's **no "animate/animated" toggle** — every animatable channel just shows the 7 ToD slot chips, and the chip the **playhead** is parked on is the live edit target. Conform it across the **whole Stage Tool Panel** (every animatable tool).

## Agent: FRESH
**Name yourself.** Self-contained UI/store rework on a shared component; fresh eyes are ideal. *(Why fresh: no warm context needed; the change is bounded to `TodChannel` + the channel-action factory.)*

### First reads (in order)
1. `ORIENTATION.md` (root) → `README.md §⭐ START HERE`.
2. **`cartograph/OPERATIONS.md §"How to operate any TOD channel (the universal mechanic)"`** — the CURRENT mechanic you're replacing (animate to arm → click chip → edit). Update this section to the new model when done.
3. **The data model:** `cartograph/STAGE.md §1` (channel inventory) + `src/cartograph/animatedParam.js` (`todSlotAtMinute` — slots are the 7 SunCalc waypoints, each live within `TOD_SLOT_TOLERANCE_MIN = 30` min; `resolveGroupAtMinute`; `NAMED_TOD_SLOTS`).
4. **⚠️ Recent context — build on it, don't undo it:** the 2026-06-27 "stamped-slot write" fix already landed — `createGroupChannelActions` `set${cap}(key, value, slotId)` writes a value to an **explicit slot** (no playhead scrub). `TodChannel.onFieldChange` already passes the target slot. You're extending that, not redoing it.

## The new model (Jacob, 2026-06-27)
- **Every animatable channel ALWAYS shows the 7 ToD chips** (dawn · sunrise · noon · golden · sunset · dusk · night). No "animate" button, no `intendAnimate`, no `showRow` gating.
- **The edit target is the slot the PLAYHEAD is on** (`todSlotAtMinute(currentTime)` → `playheadSlotId`). The active chip *is* that slot (highlight it).
- **On a slot → sliders LIVE.** Edit a value → write/update that slot's keyframe (via the existing `set${cap}(key,value,slotId)`), auto-converting a still-flat channel to slot-keyed on the first edit (the existing `animate(slotId)` seed path — just fire it automatically, no toggle).
- **Off a slot (in a gap, `playheadSlotId == null`) → sliders READ-ONLY.** The operator clicks a chip (scrubs the playhead onto that slot) to author. *(This supersedes the sticky-`selectedSlot` from the timeline fix — edit target is now purely the playhead's slot, no stickiness.)*
- **Clear → deletes the keyframe at the playhead's slot** (value falls back to the tween between neighbours); removing the last keyframe returns the channel to its flat value.
- **"animate/animated" disappears from the UI entirely.** Keep the internal data model (flat `{values:{field:…}}` vs slot-keyed `{animated:'tod', values:{dawn:…}}`) and the resolver UNCHANGED — `animated` becomes an invisible implementation detail (set automatically), never a button. **Do NOT change the resolver or the bake/scene.json shape** — existing baked Looks must resolve byte-identically.

## Where to change it
- **`src/cartograph/TodChannel.jsx`** — THE one shared component. This is where conformance comes from: every animatable card (`CartographPost`, `CartographSkyLight`, `CartographSurfaces`, `StageApp` ArchLight/Lantern) renders through it, so the rework lands everywhere at once. Remove `onToggleAnimate` / the animate button / `intendAnimate` / `showRow`; always render the chip row; set `editTarget = playheadSlotId`; gate `editable` on `playheadSlotId != null`; wire Clear to remove the playhead slot.
- **`src/cartograph/stores/useCartographStore.js`** `createGroupChannelActions` — the first edit at a slot should auto-`animate` (seed slot-keyed from the flat values) instead of requiring a toggle. `unanimate` may become reachable only via "Clear last keyframe." Keep `set${cap}(key,value,slotId)` / `add${cap}Slot` / `remove${cap}Slot` as-is.
- **Hosts** (`CartographPost.jsx` · `CartographSkyLight.jsx` · `CartographSurfaces.jsx` · `StageApp.jsx`) — verify each card now shows chips + behaves; **delete any host-side `onUnanimate`/animate wiring** that's now dead. No per-host logic should remain — it's all in the shared component.
- **`cartograph/OPERATIONS.md`** — rewrite the "How to operate any TOD channel" section to the new model (chips always on · playhead-slot is live · Clear deletes · no animate toggle).

## ⚠️ Keep OUT of scope
- **Non-TOD knobs stay as-is:** Arch placement, Horizon, SMAA on/off, the alley-cap dial, per-layer Color/Visible swatches — these aren't ToD-animatable; don't add chips to them. Only the channels that currently have the animate toggle.
- Don't touch the resolver, `bake-scene.js`, or the scene.json/`design.json` byte format. Authoring UX only; the artifact is unchanged.

## Eye-gate (Jacob, lit app)
- Every animatable card (Bloom, Exposure, DoF, Sky Gain, Ambient, Lantern, ArchLight, …) shows the 7 chips with no animate button; the playhead's slot is highlighted; editing on a slot writes that slot; scrubbing to a gap greys the sliders; Clear deletes the slot's keyframe.
- **An existing authored Look (LS) resolves byte-identically** — the data model + bake didn't move.

## Boundaries
Code + the one OPERATIONS section are yours; other canon docs are READ-ONLY (note doctrine deltas in `scratch/`, Boz folds them in). Commit your own files on `curb-offset-draw`, selective `git add`. **Stop and flag Boz** if the resolver or scene.json shape seems to need changing — it shouldn't; if it does, that's a design decision, not a silent change.
