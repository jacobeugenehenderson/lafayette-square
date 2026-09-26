# Diary — the camera's hero subject, retired 2026-09-26

*Superseded by BRIEF-camera-regimes (commits 6e8a759d · 4bda693c · f16c42b8). The live
canon is `cartograph/OPERATIONS.md` › Camera / Shots and `cartograph/ARCHITECTURE.md` ›
Camera regimes. Kept verbatim as the record; ⛔ none of it describes the product now.*

## Removed from `cartograph/OPERATIONS.md`

- ⭐ **The Hero subject picker offers THIS town's own landmarks** *(2026-09-19)*. Survey ▸ Hero lists: the **Neighborhood Centroid** (always — the answer for any installation with no set-piece), the **Gateway Arch** only if this Look installed an `arch` channel, a **backdrop** only if this Look has a baked landscape, and **this installation's own listings**. ⛔ It used to list **Lafayette Square's 87 businesses in every town** — Square One Brewery, in Huron. ⚠️ **A town with no content of its own offers no landmarks**, which is correct: the centroid is the answer, never another town's building. *(A town whose listings exist but aren't reachable yet needs a manifest entry — `src/data/loadInstanceData.js`.)*

---

- **Hero shot** — an authored camera **bounce**: the camera sweeps a Catmull-Rom path Start → (mids) → End → back, looking at the resolved hero subject. **Start/End are permanent anchors**; insert optional **Mid** keyframes (only mids are deletable). **FOV** is a per-keyframe channel; **Period** sets the bounce duration and an **Ease** toggle (sine / triangle) shapes the sweep. Replays identically in Stage / Preview / production via `heroAnim.js`.
  - ⭐ **EVERY TOWN HAS A HERO CAMERA** *(2026-09-21)*. A town with no landmark still gets a camera path — the resolver answers "no landmark" with the hood centroid.
  - ⭐ **THE FIRST KEYFRAME IS THE ENTRY POSE — on every town, since 2026-09-22.** Landing in Hero puts you at the path start you authored, with its FOV; the fit-the-radius scaffold covers only a town with no keyframes (the kit stores no camera until you save one).

---

  - **Authoring vs. runtime controls** *(2026-06-24; the gate corrected 2026-09-21)*. ⭐ **The orbit controls are free whenever playback is NOT running**, and handed to the flight while it is — the gate is **playing vs. not**, never shot vs. shot. That is the workflow: **fly to a pose first, memorise it second.** ⚠️ The lock still exists and still has a job — `makeDefault` controls write the camera every frame, so if they stayed enabled during a take they would own the camera and the flight would have nothing left to move. On handover back, the controls re-aim their target at the point the camera is actually looking at, so the first drag after a take does not snap. **Click a keyframe dot** (on the timeline) to **author** it: playback pauses, the camera **jumps** to that keyframe, and you orbit freely to reposition — the camera **stays locked on the subject** (the Hero Lock; you're choosing the vantage, not the aim). **Save keyframe** captures the new position + FOV, **re-locks**, and **stays paused on the saved frame** (so you can click the next dot and keep going); press **▶** to watch the motion, or **Cancel / Esc** to discard the orbit. In a gap with playback paused, **+ Add keyframe here** inserts one at the playhead and drops you straight into authoring it. *(Only `{position, fov}` is stored; the subject-aim is applied at runtime — so the look-direction you orbit through is a framing aid, not saved.)*

---

- **Stage drag semantics** — Browse is a plan view: drag = pan, wheel = zoom, no orbit. Hero/Street: drag = orbit · **⌥-drag = grab the ground** (the spot under the pen stays under the pen, like dragging a map; height and look direction held) · **⌃/⌘-drag = pan** (right-drag pans too) · middle-drag = dolly · wheel = zoom, so a stylus can make all three moves. **Hero is the exception: its controls are handed to the flight while playback runs, and free the rest of the time** (above). Designer's "Stage →" lands on whichever Stage shot you were last in (`lastStageShot`), so bouncing between Designer and Stage returns you to the same place each time.

---

Camera drag in each shot mirrors Stage (Browse: LEFT = pan, RIGHT = orbit; Hero/Street: LEFT = orbit, RIGHT = pan); a deliberate drag during the Hero auto-pan interrupts it back to Browse, exactly as production does.

## Removed from `cartograph/ARCHITECTURE.md`

> Absent a designated hero object the opening view is **derived from the scene's own extent**
> (`Scene.jsx`'s `derivedHeroPose`).

### Map state preservation (Designer ↔ Browse)
Designer and Browse share the overhead view; pan/zoom carries across. Both write `localStorage[cartograph-camera]` every frame (Designer ortho `{x,z,zoom}`; Browse perspective via FOV math) and read the shared key on any shot transition into either. Hero/Street are independent shots, not part of the Designer↔Browse camera share. (If a round-trip starts losing state, check the `CameraRig` `useFrame` persist hook fires for both `'designer'` and `'browse'`.)

*(Also cut from the "OPEN BUG — 3D Browse framing" entry: "hero = a static scaled oblique
(HeroPreview correctly doesn't run — `genericSceneConfig hasHero:false`)". `hasHero` was
removed on 2026-09-21, and the static oblique was removed on 2026-09-26.)*

## Removed from `ROADMAP.md` (A11) — both verified closed in code on 2026-09-26

*The store hydrator is now `(d) => Array.isArray(d.heroKeyframes) ? d.heroKeyframes : [...HERO_KEYFRAMES_DEFAULT]` (no `get`), and PreviewApp derives its opening view from the disc (4bda693c).*

  - ⚠️ **THE BLEED CAN STILL RETURN THROUGH STAGE — `useCartographStore.js:341`:** `hydrate: (d, get) => d.heroKeyframes || get().heroKeyframes`. A Look whose field is **absent** (i.e. every Look A11-c just stripped) inherits **whatever the previously-opened Look left in the store**, and the next save writes it back to disk. The store's own default (`:715`) is another LS-tuned pair. **Production is safe today** — `bake-scene.js:126` reads `design.json` directly with `|| []` — **but Stage is a live re-bleed path**, and `absence-means-inherit` is a known trap (`feedback_absence_means_inherit_in_authored_blocks`). ⛔ Fix before anyone opens a stripped Look in Stage and saves. **S.**
  - ⚠️ **Parallel copy, unfixed:** `PreviewApp.jsx:157` falls back to its own `SHOTS.hero.position` literal — the same defect A11-c fixed in `Scene.jsx`, in a second file *(agent-reported, not independently verified)*.



---

## `STAGE.md` hero lines excised 2026-09-26 — the keyframe timeline

Rot by the time `BRIEF-keyframe-timeline` landed: the Hero-Lock-era two-mode UX (retired with the subject), the `hasHero` gate (retired — every town plays its keys), and "runtime motion beyond `period`/`easing`" (the motion is now `{ length, mode }` and the keys carry their times). Live home: `OPERATIONS.md` Camera / Shots.

>   - **Hero authoring/runtime control modes (2026-06-24).** The Hero shot is a deliberate two-mode UX: **runtime** (default) plays the bounce with the orbit controls **locked** (`OrbitControlsShot enabled={false}` in `CartographApp`), exactly as it ships; **clicking a keyframe dot** enters **authoring** — pause, jump to the pose, controls unlocked for free orbit, which pivots on the subject because `HeroPreview` pins `controls.target` to the subject centroid every frame (the **Hero Lock** holds for free). **Save keyframe** captures `{position, fov}` and re-locks, staying paused on the saved frame. The mode is an ephemeral module singleton (`heroAuthoring` / `useHeroAuthoring`, `StageApp.jsx`) on the same R3F⇄DOM rail as `heroScrub` — **not persisted, not baked**; the keyframe **data model is unchanged** (`{position, fov}`, subject-locked), so `bake-scene.js` / `SLAB-CONTRACT §4` are untouched. *(Eye-gate pending; `HANDOFF-hero-camera-authoring-mode.md`.)*
>     - **Per-scene hero keyframe authoring is still unbuilt** for poured scenes: hero is the static oblique above (genericSceneConfig sets `hasHero: false`, so `HeroPreview` correctly does **not** run for a generic scene — the static pose holds). Authoring real per-scene hero keyframes is future work.
> - ⬜ **Not yet captured:** SC.4 time defaults (a Look can't yet declare "open at dusk") and the Hero-keyframe *runtime motion* beyond `period`/`easing`. Tracked under "Slab completeness" (§5).
