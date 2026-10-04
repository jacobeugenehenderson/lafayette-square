# STAGE §5.1 — "The Browse frame is not remembered" (retired 2026-10-04, Lens, Phase 2 B)

Kept verbatim for the record. Live home: `cartograph/STAGE.md §5.1` and `cartograph/OPERATIONS.md` *Camera / Shots* › **Browse camera**.
Why retired: its open decision ("should an authored frame OUTRANK the Designer→Browse hand-off?") was ruled by Jacob on
2026-10-04 — neither outranks the other, because they are two things. The FRAME is what playback opens on, authored only by
the Camera card's **Set as Browse frame**; Stage's camera stays where the operator works (the hand-off, plus a per-tab working
view). The settle recorder it describes is gone. ▶ `node checks/claims-browse-frame.mjs` · `node checks/claims-authored-framing-reaches-the-player.mjs`

## 5.1. The Browse frame is not remembered — ⛔ OPEN (2026-09-09)

**The symptom (operator):** *"I want a series of screenshots which are exactly
the same from shot to shot; when I render to Stage the frame gets messed up and
resets the camera."* The reset is on the Designer **"Stage →"** path, into
**Browse**.

### What is MEASURED

1. **No Browse camera pose is persisted anywhere.** `design.json`'s
   `shots.values.browse` carries `{fov, padding, bounds}` — no position, no
   target. The only persisted camera is the Designer's ortho `{x,z,zoom}` in
   `localStorage['cartograph-camera']`, written only while `shot==='designer'`.
2. **So the Browse frame is re-derived on every entry** (`CartographApp.jsx`,
   the browse branch of the shot-apply effect): hand-off from the Designer's
   live ortho pan/zoom if `prevShot.current === 'designer'`, **else** fit to
   `SHOTS.browse` — the whole-neighbourhood overview. ⛔ That `else` is a
   **silent substitution**: the frame is wrong and nothing says so. Layer 0 q2,
   in the camera.
3. **The hand-off's gate is fragile by construction.** `prevShot.current` is
   assigned only inside `applyTarget`, which runs inside a
   `requestAnimationFrame`; `appliedShot.current = key` is claimed *before* that
   rAF is scheduled, and the effect's cleanup can `cancelAnimationFrame` it. If
   that cancel lands, the re-entry guard refuses to retry and the apply is
   dropped for good. A `CANCEL applyTarget` with no matching fire was observed.
4. **The Stage CAMERA card was inert in Cartograph.** `cameraState`/`cameraPush`
   were module-private to `StageApp.jsx`, so only the standalone `/stage` page
   filled them. With Browse live at `[95, 1299.1, −158]` fov 45, the card read
   `Center 0 / 0 · Altitude 0 m · FOV 22°` — the module's initial constants —
   and every number typed into it went into a `pending` nobody drained.

### What is NOT established

⛔ **Which event on the "Stage →" path drops the camera apply.** The repro tab
ran backgrounded, which suspends `requestAnimationFrame`, so that A/B could not
separate the app's race from the environment's throttling. **Cause not
established.** It needs the bake run in a foreground window.

### The attempt in the tree — ⛔ IT DOES NOT WORK

`browseFrame` (top-level design field, `{center:[x,z], altitude}`), the shared
`src/stage/cameraBridge.js`, and `CameraRig`'s drain/publish/record loop.
Rationale for the shape is sound and worth keeping if the arc resumes: it is a
PLACE not a style (hence top-level, and strip-declared in `serve.js` so it
cannot travel into another town's seeded Look — that guard's residue check walks
object **keys** for street names and structurally cannot catch a numeric
coordinate); `center`+`altitude` not a position/target pair, because Browse is a
plan view with three degrees of freedom; **no default**, because a kit default
would be LS's coordinates handed to every town; and it deliberately does **not**
outrank the Designer→Browse hand-off (2026-09-05).

⛔⛔ **The operator tried it and the frame still did not hold** — but the halves
have now separated, and the split is evidence, not guesswork:

- ✅ **The RECORD half works.** After the operator's attempt,
  `public/looks/lafayette-square/design.json` carries
  `browseFrame {"center":[243,-285],"altitude":544}` — written by the settle
  recorder, plausible values (a zoomed corner, not the overview). So the bridge,
  the `useFrame` loop, the store action and the autosave all ran.
- ⛔ **The APPLY half does not deliver on the operator's actual path.**
  ⭐ **Leading suspect, and it is a design error of mine, not a bug:** the
  precedence was deliberately set **hand-off → authored frame → fit-to-bounds**,
  to avoid overriding the 2026-09-05 Designer→Browse decision. But the operator's
  loop is Designer → **"Stage →"** → Browse, which is *always* `prevShot ===
  'designer'`, so the hand-off branch always wins and **the authored frame is
  never consulted on the one path that matters.** The feature is inert exactly
  where it was asked for.
- ⚠️ That does not yet explain the reset itself: if the hand-off ran, it should
  have delivered the Designer's own pan. So either the hand-off is being dropped
  (§5.1 measurement 3) *and* the authored frame failed to catch it, or a third
  thing. ⛔ **Cause not established.**

⭐ **The open decision for the operator: should an authored frame OUTRANK the
Designer→Browse hand-off?** Saying yes makes the feature work for the screenshot
loop and costs the "frame a corner in 2D, step into 3D" gesture its primacy.
That is a product call, not a code call.

▶ Data path only: `node checks/claims-browse-frame.mjs` (20/20). The live half
was never exercised *in the agent's session* — a frame counter in `CameraRig`'s
`useFrame` returned `undefined`, because that tab was backgrounded and Chrome
suspends `requestAnimationFrame` there.

⚠️ **LOCAL-ONLY, AND THE BRANCH NAME IS NOW CLAIMED (2026-09-09).**
`origin/screenshot-framing` exists as of the A21 session's first push, and it
carries that session's commits and **none of this work** — the nine files below
are uncommitted on one machine and exist nowhere else. A fetch of that branch on
a second machine gets the retraction arc and no camera work at all.
Modified: `src/cartograph/CartographApp.jsx` · `src/cartograph/stores/useCartographStore.js` ·
`src/stage/StageApp.jsx` · `cartograph/bake-scene.js` · `cartograph/serve.js` (1 line) ·
`cartograph/STAGE.md` · `cartograph/OPERATIONS.md` · `SLAB-CONTRACT.md`.
New: `src/stage/cameraBridge.js` · `checks/claims-browse-frame.mjs`.
⛔ Uncommitted **deliberately** — the feature does not work and the precedence
question above is unruled — not because it is scratch. A hard reset destroys it.

⚠️ **Related, pre-existing, undeclared:** `shots.values.browse.bounds` is
`{cx:95, cz:-158, …}` — an LS-absolute coordinate that already travels into
every seeded Look. Same class as the one the strip list exists to stop.

