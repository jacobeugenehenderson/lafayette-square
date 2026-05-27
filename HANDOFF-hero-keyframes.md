# Handoff — Hero Camera Keyframe Authoring: a timeline that tells the truth

> ✅ **SHIPPED (Détente, `3ebf510`, 2026-05-26).** Landed as one coherent rework rather than the
> original L1–L5 levers, which collapsed through operator iteration: **(L1) path-honest playhead** —
> `HeroPreview` publishes the post-wave path position, not the period phase; **two-anchor bounce** —
> Start + End are permanent extremes, only Mids are deletable (this also killed a hang from the old
> degenerate sub-2-keyframe state); **single capture button keyed off the playhead** — gap → Add
> (inserts a Mid *at* the playhead, capturing the live camera), on a dot → Update; **match-aware
> confirmation** — the Update button reads a steady "✓ Keyframe set" while the live camera matches the
> stored pose and only lights up "Update Keyframe" once the operator moves, never reverting on a timer
> (this replaced the original flash-ack, which read as "it didn't stick"). FOV stays per-keyframe.
> Touched only `HeroCamera` + `HeroPreview` (+ a pulse keyframe in `cartograph.css`); the shared
> `resolveHeroSubject` re-export and `heroAnim.js` motion model were left untouched. Operator authored
> 3 keyframes and re-baked the slab. FEATURES updated: `cartograph/FEATURES.md` (Stage) + `ls/FEATURES.md`
> (production Hero mode). **Not done: L5** (sawtooth prune / "Wave"→"Ease" relabel) — pending operator's
> sine-only-vs-keep-both call. Original brief preserved below.

> Dispatch-ready brief. Stage's Hero-shot keyframe authoring is unintuitive and, worse, *lies*: the
> timeline playhead means one thing while scrubbing and another while playing, so adding a keyframe drops
> it in the middle of the path and the motion mirrors around it. Captures give no confirmation they took.
> Fix the authoring surface so the timeline is honest, Add builds the path, and every capture acknowledges.

**You are the dispatched agent. Name yourself** — novel, not already used (check `arborist/NOTES.md`,
`cartograph/BACKLOG.md`, commits; retired names in memory). You own this end-to-end. **Recommended:**
someone fluent in `src/stage/StageApp.jsx` (the `HeroCamera` panel + `HeroPreview`) and the hero motion
model in `src/preview/heroAnim.js`.

This is **Stage authoring-UX** work — distinct from (but adjacent to) the render-conformance camera fix
that just landed (Vernier, production `CameraRig` resolving the slab). Don't touch that; see scope.

---

## Why this exists (the stakes)

The hero shot is the operator's signature framing — the first thing every visitor sees. The operator
just re-pointed the hero look-at to the Gateway Arch (the authored subject), and the **camera motion read
wrong**, which exposed that the keyframe authoring tool itself is the problem, not just the content:

1. **The timeline lies.** `heroScrub.t` is used as a **path position** while scrubbing (`scrubTo` →
   `catmullRom(positions, heroScrub.t)`) but as a **wave phase** while playing (`HeroPreview` sets
   `heroScrub.t = t01`, then the camera is at `catmullRom(positions, wave(t01))`). With the bounce,
   phase `0.5` maps to path-position `1.0` — so during playback the playhead sits at center while the
   camera is at the *far end* of the path. Playhead, dots, and camera are in different coordinate systems.
2. **Add drops in the center + mirrors.** `addKeyframeFromView` inserts at `round(scrubT × keyframes.length)`
   — treating that phase value as a path index. Pause near center → keyframe inserts mid-path → the
   bounce ping-pongs through it → "mirrors around the center." The operator expected to *extend* the path.
3. **Captures are silent.** `addKeyframeFromView` / `setSelectedFromView` / the FOV slider all write with
   **no acknowledgment** — the operator can't tell a capture "took." This is the core reason it feels
   broken/unintuitive even though the capture logic works.

## Decisions (settled with the operator — implement these, don't relitigate)

- **Motion is a BOUNCE. There is no loop.** `sine` and `sawtooth` are both bounce *styles*, not
  bounce-vs-loop — `sawtooth` is a one-way sweep that **snaps** at the end (a broken loop, not a real
  one). A true loop (smooth cyclic) would be a separate future mode (cyclic spline); **not in scope.**
- **The timeline is PATH-space, always.** `heroScrub.t` is the path position `s ∈ [0,1]`. During playback
  the playhead reflects the *actual* path position, so it visibly sweeps out-and-back (showing the bounce)
  and stays aligned with the dots and the camera.
- **Add Keyframe APPENDS** (extends the path / new far point of the sweep), never center-inserts. Keyframes
  remain **evenly spaced by order** (no per-keyframe free-time — that's a deliberate non-goal; the playhead
  selects which keyframe to edit, it doesn't place keyframes in time).
- **Labels + acknowledgment.** Off-keyframe → `+ Add Keyframe`. On-keyframe → `Update Keyframe` with a
  sub-caption "captures current view" (NOT "Edit" — it adopts the live camera, it doesn't open an editor).
  Every capture (Add / Update / FOV) **confirms it took**: the keyframe dot pulses, and the button flashes
  `✓ Set` for ~1s.
- **FOV is already a per-keyframe animated channel — keep it, just make it legible.** `{position, fov}` is
  captured together (`captureCameraSnapshot`) and interpolated together (`lerpFov`) across all three
  environments. The FOV slider edits the selected keyframe's fov; it just needs the same confirmation and
  to read as part of the one per-keyframe edit (scrub → land on a dot → tune position + fov → Update).

---

## Levers (all in `src/stage/StageApp.jsx` unless noted)

### L1 — Path-honest playhead (the root fix)
`HeroPreview` useFrame (~`:899-907`): it computes `t = wave(t01)` then `catmullRom(positions, t)` but
publishes `heroScrub.t = t01`. **Publish the path position instead: `heroScrub.t = t`.** Now scrub and
playback agree (`scrubTo` already treats `heroScrub.t` as the path position). The playhead visibly bounces
and the dots/camera/playhead are one coordinate system. (No `heroAnim.js` change.)

### L2 — Add appends; Edit recaptures
- `addKeyframeFromView` (~`:633`): replace the `insertAt = round(scrubT × length)` insert with an
  **append**: `const next = [...keyframes, newKf]`. Land the playhead on the new last keyframe
  (`heroScrub.t = next.length <= 1 ? 0 : 1`).
- `setSelectedFromView` (~`:648`) stays (overwrites the selected keyframe with the live pose) — it's the
  Update path. `deleteSelected` (~`:656`) stays.
- Mid-path insertion / reordering is **out of scope** (even-spacing makes it ambiguous; append + delete +
  re-capture covers the authoring loop).

### L3 — Labels + capture acknowledgment
- Button label (~`:755-774`): `+ Add Keyframe` (no selection) / `Update Keyframe` (selection) with the
  "captures current view" sub-caption. Drop the word "Edit."
- Confirmation: on Add / Update / FOV-change, set a transient `flash` (index + timestamp via `useState` +
  `setTimeout` ~1s). While flashing: the target keyframe **dot pulses** (CSS scale+glow, ~600ms) and the
  button text flips to `✓ Set`. Keep it lightweight; no toast system needed.
- **Stabilize the button during playback:** `selectedKf` snaps to a dot whenever the playhead passes within
  `SNAP_TOLERANCE` — during playback the bouncing playhead would flicker the button Add↔Update. Gate
  `selectedKf` (and the dot-snap) on **paused** (`!motion.preview`), so the Add/Update control is stable
  while previewing.

### L4 — FOV confirmation
FOV slider (~`:778`) already writes to the selected keyframe + pushes to camera. Add the same `flash`
acknowledgment so a fov edit reads as "took" on its keyframe. No structural change.

### L5 — Wave selector (one flagged micro-decision)
The panel exposes three waves: `sine`, `triangle`, `sawtooth` (~`:797-803`). Since there's no loop:
**recommend removing `sawtooth`** (the snap that masqueraded as a loop) and keeping `sine` (smooth bounce)
+ `triangle` (constant-speed bounce) as the two bounce easings — relabel the group from "Wave" to "Ease".
Leave `WAVES.sawtooth` in `heroAnim.js` for back-compat so any in-flight `design.json` still renders;
just remove it from the picker (optionally migrate `easing:'sawtooth' → 'sine'` on load).
**Confirm with the operator** whether to keep both bounce easings or collapse to `sine`-only (zero-config).

---

## Verify (by eye, in Stage `/cartograph.html` Hero shot)
- Scrub the playhead: the camera moves along the path and the playhead lands exactly on each dot; press
  play and the playhead **bounces** (sweeps to the far dot and back) staying glued to the camera.
- Pose the camera, hit **Add Keyframe** → a new dot appears at the **end** of the path (the sweep extends
  outward), the dot **pulses**, the button flashes `✓ Set`. No center-insert, no mirror.
- Land on a dot → button reads **Update Keyframe**; re-pose → Update → that dot pulses + `✓ Set`.
- Tune **FOV** on a selected keyframe → confirms; play → fov animates across the sweep (push/pull zoom).
- Button doesn't flicker Add↔Update while playing.

## Out of scope
The render-conformance camera work (production `CameraRig` / Preview `ShotCamera` resolving the slab — just
landed; the shared resolver `src/lib/heroSubject.js` and its StageApp re-export must stay untouched). A real
smooth **loop** mode. **Per-keyframe free-time** (keep even-spacing). Production/Preview render changes —
this is the Stage authoring panel only (the motion model in `heroAnim.js` is shared and correct; only L1's
one-line publish-fix and L5's optional picker prune touch shared code).

## Commit boundaries
One commit per lever (L1 root-fix, L2 append, L3 labels+ack, L4 fov-ack, L5 wave prune) or sensibly grouped —
each independently revertible. **Convergence:** `StageApp.jsx` is shared. The render-conformance arc (Vernier)
re-exports `resolveHeroSubject` + `FALLBACK_HERO_SUBJECT` near the top of `StageApp.jsx` and resolves the hero
subject — **do not alter those**; you own `HeroCamera` (the panel) + `HeroPreview` (the in-Canvas previewer).
Azimuth's tree arc touches `Scene.jsx`/`PreviewApp.jsx`, not `HeroCamera` — low collision, but surface to Boz
before landing. Check in with Jacob after L1–L3 (the timeline-honesty + capture-feedback core) before L5.

**Surface anything not in this brief** (extra files, schema/`design.json` shape changes, migration needs) in
your status + commit bodies.
