<!-- BRIEF-STATE
status: LANDED 2026-09-26 — the camera reads no hero subject, one controls definition per regime (6e8a759d · 4bda693c · f16c42b8), Stage Hero opens paused with the orbit pivoting on the ground under screen centre and wheel zoom by delta (8fb25329); Jacob flew Stage and released Sill. Open: ▶ resumes from the motion clock, not the playhead.
dispatched: Sill, 2026-09-26 — built in 6e8a759d · 4bda693c · f16c42b8 + the docs commit; OPEN on Jacob's eye (fly Stage on Huron)
written: 2026-09-26
evict-when: the camera is never aimed by a hero subject; one controls definition per regime is used by every runtime; Jacob can fly Stage on Huron to any angle; checks prove all three.
-->

# Camera regimes — 2D, 3D, and playback; no hero subject on the camera, once and for all

**You are the dispatched agent. Name yourself — one word, not a name another RUNNING session holds** (check
`ListAgents`; ask Jacob to `/rename`). **Agent: FRESH.**

## The ask (Jacob, 2026-09-26)

*"I am actually having trouble getting the camera to an angle to actually check the stage in Huron. I think
it's possible this is connected to the old wiring for the 'hero object' — even as the hero object paradigm has
been removed it might still be latently attached to the camera. We have already worked on this a lot, we need to
fix it once and for all and we need to make sure the action is the same across runtimes with orbit controls."*

**The regimes, as he defined them:**
1. **2D** — flattened (or not-yet-extruded) 3D, no perspective, straight overhead.
2. **3D** — Stage and everything beyond it: orbit controls that behave **the same in every runtime**.
3. **3D.1 — playback** — the camera plays authored keyframes; **no authoring control** while it plays.

## ⭐ The ruling this finishes — `ROADMAP H-7` (Jacob, 2026-09-25)

*"HERO" is only the set-piece; the camera is not tied to it.* **The camera does not orbit or orient to it** —
shots are the operator's keyframes. ▶ H-7 recorded the removal as **owed**: `src/lib/heroSubject.js` and the
playback driver. **This brief is that removal.**

## What Boz found in the code (2026-09-26 — confirm it, don't inherit it)

- `src/cartograph/CartographApp.jsx` — entering the Stage **hero shot** aims the camera and the orbit target at
  `resolveHeroSubject(...)` (grep `Hero framing is AUTHORED as keyframes + a designated subject`), and mounts
  `<HeroPreview … subject={resolveHeroSubject(...)} />`.
- `src/stage/StageApp.jsx#HeroPreview` — `const tgt = subject || FALLBACK_HERO_SUBJECT`; during playback
  *"target = subject"*.
- `src/lib/heroSubject.js` — with no designation it resolves to the **Arch** (`archPoint`), else the hood
  centroid; an unresolved building resolves to **`FALLBACK_HERO_SUBJECT = [400, 45, -100]` — a Lafayette Square
  coordinate**, meaningless in any other town's frame (`BACKLOG` already flagged it as an LS-frame literal).
  ⇒ **Likely, not established:** on Huron the orbit pivots around a subject point, not where Jacob is looking,
  which is exactly "I can't get the camera to the angle I want."
- **Browse is pan + zoom only** — `BrowseControls`, `enableRotate={false}` (ruled 2026-09-05: *"only hero gets
  true 3D controls"*). So in Stage the ONLY orbit is inside the hero shot, which is the hero-coupled one.
- **Orbit controls are defined separately in each runtime:** `CartographApp.jsx` (Designer `MapControls`, Stage
  `OrbitControlsShot` + `BrowseControls`), `StageApp.jsx`, `PreviewApp.jsx`, `Scene.jsx` (production),
  `src/harness/lab/main.jsx`. ▶ `grep -rn "<OrbitControls\|<MapControls" src`. That is why the action differs.

## Read first (the record — this has been worked on a lot; do not re-derive it)

- `ROADMAP` **H-7**, **A13** (Browse framing), **H-26** (near-level views).
- `_handoffs/HANDOFF-authoring-session-hardening.md` Ph4 (*"one camera home `useCartographCamera` + de-dup
  CameraRig"*) and `_handoffs/HANDOFF-hero-camera-authoring-mode.md`.
- The long comment in `CartographApp.jsx#Controls` — the history of gating orbit on PLAYING vs SHOT. Keep that
  rule: **free whenever not playing; handed to playback while playing.**

## The shape to build, confirm-then-build

1. **One controls definition per regime**, in one module, used by every runtime — 2D (overhead ortho: pan +
   zoom), 3D (orbit, the same buttons, keys and limits everywhere), 3D.1 (no input; the playback driver owns
   the camera). A runtime chooses a regime; it never defines controls itself.
2. **The camera never reads a hero subject.** The orbit target is wherever the operator is looking (the ground
   under screen centre, or the keyframe's own authored target). Keyframes carry position + target + fov;
   playback interpolates **those**. `resolveHeroSubject` keeps only its set-piece job, if any, and
   `FALLBACK_HERO_SUBJECT` goes. ⛔ No town-specific point anywhere in the camera path.
3. **The opening view with no keyframes** derives from the scene's own extent (H-7: a starting suggestion,
   not a rule).
4. ⭐ **LS's authored Arch shots must play back unchanged** — that is the acceptance for removing the subject
   (H-7). Those keyframes carry targets; a pre-target keyframe that relied on the subject needs its target
   written once, from what it resolves to today, as a migration — name how many.

## ✅ Browse — answered (Jacob, 2026-09-26): *"Browse is already correct, so however it is now is how I want it."*
Browse stays exactly as it is: overhead, perspective, pan + zoom, no orbit (`BrowseControls`). ⛔ Do not change
its behaviour; it may move into the shared controls module only if it comes out byte-for-byte the same. The three
regimes above are Jacob's distinction for the work, not a reclassification of Browse.

## The chain

Upstream: authored keyframes in `design.json` / `scene.json#shots`, the scene extent. Downstream: Stage,
Preview, production, the lab — every runtime's camera. A change in one runtime only is a new disagreement.

## Can the instrument see it?

Checks: (a) no camera/controls code reads `resolveHeroSubject` or `FALLBACK_HERO_SUBJECT` (mutation: put one back);
(b) every runtime's controls come from the one module (grep for stray `<OrbitControls`/`<MapControls`);
(c) LS's hero playback samples are identical before/after at fixed times. Then Jacob's eye: fly Stage on Huron,
and the same drag does the same thing in Preview and production.

## Bounds

- Write in the camera/controls code of all runtimes, `heroSubject.js`, `StageApp.jsx`, and a keyframe migration
  if needed. No bake, no pour. Canon: `ARCHITECTURE` (the regime rule), `OPERATIONS` (the controls, per
  regime), `ROADMAP H-7` closed. Commit messages name the register reached.

**The instruction is confirm-then-build:** read the record and the code, tell Jacob what you found, and if the code contradicts this brief — stop and flag him.
