# HANDOFF — Hero camera authoring/runtime control modes (the Stage)

> **State / dispatch-ready brief.** A controls upgrade for the **Stage → Camera / Shots → Hero** shot: clicking a keyframe drops the operator into a **free authoring camera**; **Save keyframe** returns to the locked runtime preview. Planned with Jacob 2026-06-24 (every decision below is his call, recorded). Branch `curb-offset-draw`.

**Agent: FRESH.** Self-contained Stage (Look) UX change — no cross-arc continuity needed; this brief carries every verified file:line. Name yourself when you pick it up.

**First reads (universal path):** `ORIENTATION.md` (root) → `README.md §⭐ START HERE` (the Stage row) → the topic canon **`cartograph/STAGE.md §1` (the SC channel families) + `§5` (SC.5 camera status)**. This task touches **SC.5 camera only**.

---

## The want (Jacob, verbatim intent)

In the Stage, when the user **clicks a Camera keyframe**, the camera should **jump to that spot** *and the on-screen controls become authoring, generic 3D interface controls* — which **turn back to runtime controls when the user clicks "Save keyframe."** **Keep the Hero Lock** (camera stays aimed at the subject) — authoring only lets the user **reposition**.

## Decisions locked (do not re-litigate)

1. **Pose model: `{ position, fov }`, subject-locked — NO model change.** The keyframe stays `{ position, fov }` (`useCartographStore.js:550`). Hero Lock is preserved by making the authoring orbit **pivot on the subject centroid** (set `OrbitControls.target` = subject centroid on entry), so free orbit/dolly repositions the camera but it always looks at the subject. **No store / bake / `SLAB-CONTRACT.md §4` change.**
2. **Runtime = controls LOCKED** (can be playing *or* paused). **Authoring = controls FREE** (orbit around subject).
3. **Default on entering the Hero shot = runtime, PLAYING** (the bounce plays, controls inert — what ships).
4. **Click a keyframe dot →** pause playback + jump to its pose + go to **authoring** (free orbit around subject) + show **Save keyframe** + an "✎ Authoring keyframe N" affordance.
5. **Save keyframe →** capture `{ position, fov }` from the live camera → **re-lock, stay PAUSED on the saved frame** ("✓ Keyframe set"). Do **NOT** auto-resume play (selection is disabled during playback — auto-play fights the common batch-edit-the-next-keyframe flow). From the saved frame the operator presses ▶ to play, or clicks another dot to keep editing.
6. **Cancel / Esc →** exit authoring without saving, re-lock paused.
7. **Scope: Hero shot only.** Browse (heading) and Street (eye-height/FOV) are untouched.

---

## The code, as it is today (all verified this session — `src/stage/StageApp.jsx` unless noted)

- **`StageCamera` (287–411)** — the R3F camera rig. Renders **`OrbitControls makeDefault`** that is **always enabled**; per-shot button/touch maps (Browse = planar pan; Hero/Street = orbit). The panel ⇄ rig talk through **module-level singletons**: `cameraPush`/`pushCamera` (push a pose into the rig — the `useFrame` at 328–349 applies `position`/`fov`/`up`/`target`, and **already sets `ctl.target` when `u.target` is provided**, 335), `cameraState`/`notifyCameraListeners` (rig → panel broadcast ~6 Hz), `heroScrub`/`notifyHeroScrub`/`useHeroScrub` (playhead position).
- **`captureCameraSnapshot()` (267–285)** — reads the live camera; returns `{ position, target, fov, up }` (rounded). The capture side already grabs target+up; today only `{ position, fov }` is stored.
- **`HeroCamera` (602–921)** — the Hero authoring panel.
  - **Selection is derived** from playhead proximity: `selectedKf` = the dot within `SNAP_TOLERANCE` (0.02) of `scrubT`, **null while `heroMotion.preview` is true** (630–638).
  - `scrubTo` (662–683) snaps the playhead to a nearby dot and `pushCamera`s the interpolated pose. `selectKeyframe(i)` (685–691) jumps to dot *i*.
  - **Capture buttons (836–867):** gap → **"+ Add Keyframe"** (`addKeyframeFromView`, 693–714, inserts at playhead); on a dot → **"Update Keyframe"** (`setSelectedFromView`, 715–723) which is **match-aware** via `liveOnKf` (648–652) → shows steady "✓ Keyframe set" while the live camera matches.
  - **Dots (798–814) have `pointer-events: none`** — the rail wrapper (767–789) owns all gestures; clicking near a dot selects via the snap in `scrubTo`.
  - Per-keyframe **FOV slider** (870–879); **Delete** (mid only, 859–865); Period/Ease motion params (884–918).
- **`HeroPreview` (~969–1041, rendered in `CartographApp.jsx` Canvas)** — animates the camera along the keyframes when `motion.preview`; **`camera.lookAt(subjectCentroid)` every frame** (the Hero Lock; the `tgt` it computes is the resolved subject centroid). Gated on `motion.preview`, so it does NOT drive the camera while paused.
- **Store:** `useCartographStore.js` — `heroKeyframes` (550, shape `{ position:[x,y,z], fov }`), `heroSubject` (the descriptor), `heroMotion` (`{ period, easing, preview, speed }`); setters `setHeroKeyframes` (1345), `setHeroMotion` (1350).

---

## Build plan

1. **New ephemeral mode flag — module singleton, mirroring `heroScrub`.** `heroAuthoring` + `setHeroAuthoring()` + `useHeroAuthoring()` in `StageApp.jsx`. **Not stored, not baked** — transient authoring intent. (This is how the panel tells the out-of-tree `StageCamera` rig which mode it's in.)

2. **Broadcast the subject centroid** so the rig can pivot on it. `HeroPreview` already computes `tgt` (the resolved subject centroid) each frame — write it to a new singleton `heroSubjectPoint` (cheap; same pattern as `cameraState`). The panel reads it on authoring-entry.

3. **`StageCamera` — gate controls on the mode (Hero only).** `OrbitControls enabled={shot !== 'hero' || authoring}`. Hero + not-authoring → **disabled** (locked; the bounce plays cleanly without orbit fighting it — today they're always live and playback just overwrites them). Browse/Street → enabled as today. On entry the panel pushes `target = heroSubjectPoint` (the existing `cameraPush` path at 335 sets `ctl.target`), so orbit pivots the subject = Hero Lock.

4. **`HeroCamera` — the state machine + UI.**
   - **Dots become clickable:** give each dot its own `onPointerDown` → `enterAuthoring(i)` with `stopPropagation` so it does NOT also trigger the rail's scrub. Keep rail drag-to-scrub for previewing.
   - `enterAuthoring(i)`: `setHeroMotion(m => ({ ...m, preview:false }))` → `setHeroAuthoring(true)` → park playhead on dot *i* → `pushCamera({ position: kf.position, fov: kf.fov, target: heroSubjectPoint })`.
   - `saveKeyframe()` = today's `setSelectedFromView` (capture `{position, fov}` into the selected kf), **relabeled "Save keyframe"**, then `setHeroAuthoring(false)` and **leave `preview:false`** (stay paused on the saved frame). `liveOnKf` "✓ Keyframe set" still reads true right after.
   - `cancelAuthoring()` (Esc / click empty rail): `setHeroAuthoring(false)`, leave paused, no capture.
   - **Add** (gap → "+ Add Keyframe") routes through `enterAuthoring` on the freshly-inserted dot so add + edit share one loop.
   - **Two UI states:** *runtime* = play/speed + timeline-as-scrubber + hint "click a keyframe to edit," no Save button. *authoring* = **Save keyframe** (primary), Delete (mid only), FOV slider, **"✎ Authoring keyframe N — orbit to reposition"** badge.

5. **Doc-close on land (mandatory — the Stage Close ritual, `BOZ.md §3`):**
   - `cartograph/STAGE.md §5` SC.5 — note the authoring/runtime control modes (data model **unchanged**: still `{position, fov}`, subject-locked; SLAB-CONTRACT/bake untouched).
   - `cartograph/NOTES.md` — a dated narrative line.
   - `README.md §⭐ START HERE` Preview/Stage rows only if a conclusion changed (likely just STAGE.md).

## Write / commit boundaries

- **Edit:** `src/stage/StageApp.jsx` (the whole change lives here); the doc-close files above on land.
- **Off-limits unless this brief says otherwise:** the canon docs beyond the §5 doc-close note; the **keyframe data model / `bake-scene.js` / `SLAB-CONTRACT.md`** (locked decision #1 — NO model change); Browse/Street controls (scope = Hero).
- **Commit only your own files** (selective `git add`); the working tree has unrelated in-flight work (Preview, Linden trees) — leave it untouched.

## Verify (the gate is the operator's eye — `feedback_proxy_render_is_not_the_operator_eye`)

In `/cartograph` Stage → Camera/Shots → Hero: opens playing & locked; click a dot → pauses, jumps, free orbit that **stays aimed at the subject**; reposition; **Save keyframe** → re-locks, stays paused, "✓ Keyframe set"; ▶ resumes; another dot → straight back to authoring. Confirm Browse/Street unchanged. Then Jacob eye-gates in the lit app.
