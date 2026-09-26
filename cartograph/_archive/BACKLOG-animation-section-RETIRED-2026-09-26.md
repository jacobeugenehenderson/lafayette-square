# RETIRED 2026-09-26 — the "separate animation section" (Stage camera restructure)

**Retired by Jacob, 2026-09-26:** *"NO separate animation panel, and we should get rid of any words about it
from the corpus because we're cleaning out."* What it asked for is covered by `BRIEF-camera-regimes`
(commits `6e8a759d`, `4bda693c`, `f16c42b8`, `ba7c5777`): the viewport is free whenever nothing is playing,
playback owns the camera while it plays, and no camera reads a hero subject. Kept here as the Diary record;
the live home for camera behaviour is `cartograph/OPERATIONS.md` (Camera / Shots) and `ARCHITECTURE`.

The entry as it stood in `cartograph/BACKLOG.md`:

- **🎥 SPLIT the animation out of the editing viewport (Stage camera restructure).** *(Jacob, 2026-07-20 night.)* **The decision:** *"we need to set aside a section for the animation. It's just separate from 'looking at the scene' as we edit."* Today the Hero shot **conflates two jobs in one camera** — the view you inspect your work through, and the hero animation being previewed — so the same drag means different things depending on invisible state.
  - **Why it reads as broken today:** `HeroPreview` (`StageApp.jsx:1162`) re-aims **every frame, unconditionally** — *"Always aim at the subject (every frame, animating or not)"* — `camera.lookAt(tgt)` + `controls.target.set(tgt)`. OrbitControls *do* receive input; the camera is simply re-pinned before you see it. Compounded by `HeroCamera` mounting with `setHeroAuthoring(false)` + `preview:true` (*"Hero opens in RUNTIME, PLAYING"*), and `CartographApp.jsx:483` gating `enabled={shot !== 'hero' || heroAuthoring}`. **All three are deliberate** — this is a design change, not a repair; don't "fix" it and lose why it existed (opening on the shipped shot means what you see first is what ships).
  - **The target model:** the viewport is **always free** ("easy to move in 3D space"); the animation is its **own section** with its own preview. Jacob's pin rule for that section: **keep the subject pin during preview playback; with no hero object it is truly free.**
  - ⚠️ **Rejected mid-design:** a single tri-state camera (free / at-keyframe / previewing) with a subject check. Manages the ambiguity instead of removing it.
  - ⚠️ **Adjacent bleed spotted, not filed:** `FALLBACK_HERO_SUBJECT = [400, 45, -100]` (`src/lib/heroSubject.js:32`) is an **LS-frame literal** its own comment calls "stale" — a meaningless point in any other town's frame. Fold into `docs/briefs/BRIEF-ls-bleed-excision.md` when that arc runs.
  - **Not dispatchable yet** — wants a design pass on what the animation section *is* (panel? mode? separate surface?) and Jacob's eye. **Do not code from this entry alone.** M–L.
