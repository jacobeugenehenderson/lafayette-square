# Phase 4b.3 — CloudDome retirement, production swap to <Atmosphere />

**From:** Meteorologist orchestrator
**To:** baby (fresh agent)
**Date:** 2026-05-20

---

## You are the baby. Start by naming yourself.

If you're reading this, **you are the dispatched agent** — not the orchestrator who wrote it. Jacob pasted this brief into your window. Your job is to execute it.

**Before you begin:** pick a name for yourself. Anything — a word, a symbol, a string of sounds, something in another language, something invented. Whatever feels like you. Tell Jacob your name in your first message back; sign your commits + final report with it.

(If you find yourself starting to draft a brief for ANOTHER agent to do this work — stop. That's the orchestrator-confusion failure mode. You're the one doing the work.)

Prior Meteorologist babies: Wren (sky pivot Phase A+B, Phase 4b.2 TodChannel binding, sky-light amendment), Nimbus (Cloud Specialist seed), Stratus (Phase Seed UI + seeding). You're following their commits in the same arc.

---

## What you're shipping

Production LS stops using `CloudDome` and starts using `<Atmosphere />`. This is the moment Meteorologist's volumetric raymarched cloud system becomes the runtime renderer everywhere. Phase 4b.1 built the shader; 4b.2 wired authoring to it; this commit retires the v1 procedural cloud shipper and flips production forward.

After this commit:

- Production (`/index.html`) renders Atmosphere
- Cartograph Stage renders Atmosphere
- Preview renders Atmosphere
- CanaryScene already renders Atmosphere (no change)
- `CloudDome.jsx` + `SpriteClouds.jsx` are deleted from the repo

The swap is mechanical but visually significant. Treat the verification carefully — you're changing what users see in three independent surfaces.

---

## Read first

1. `meteorologist/STAGE_MIGRATION.md` — the cleanup-commit spec (lines 50–98 are most relevant; the "Add to Stage" section at top is stale and already shipped under Meteorologist's standalone shell)
2. `meteorologist/ARCHITECTURE.md §8` — relationship to v1 CloudDome
3. `src/components/Atmosphere.jsx` — the swap-in component; accepts optional `lookId` prop (falls back to `INSTANCE.lookId` if omitted)
4. `src/components/CloudDome.jsx` — the swap-out component you're retiring
5. `src/meteorologist/CanaryScene.jsx:110` — reference for how Atmosphere mounts; `<Atmosphere lookId={activeLookId} />`

---

## Mount sites — verified at brief time

Three actual mounts + one orphan import. Each needs to flip.

### 1. `src/components/Scene.jsx:683` — production runtime

```jsx
// Before
import CloudDome from './CloudDome'         // line 12
...
<CloudDome />                                // line 683

// After
import Atmosphere from './Atmosphere'
...
<Atmosphere />                               // lookId omitted; defaults to INSTANCE.lookId
```

This is the production LS. Big visible change.

### 2. `src/cartograph/CartographApp.jsx:956` — Cartograph Stage

```jsx
// Before
import CloudDome from '../components/CloudDome'        // line 28
import SpriteClouds from '../components/SpriteClouds'  // line 29 — also delete (only referenced in commented-out block)
...
<R3FErrorBoundary name="CloudDome"><CloudDome /></R3FErrorBoundary>   // line 956
{/* SpriteClouds parked 2026-05-03 ... */}                            // lines 957–964 — delete the commented block too

// After
import Atmosphere from '../components/Atmosphere'
...
<R3FErrorBoundary name="Atmosphere"><Atmosphere /></R3FErrorBoundary>
```

Drop the SpriteClouds import + commented-out parked block (lines 957–964). They were a 2026-05-03 dead-end direction; no need to carry the history in code.

### 3. `src/preview/PreviewApp.jsx:574` — Preview

```jsx
// Before
import CloudDome from '../components/CloudDome'                                          // line 17
...
{layers.clouds && <R3FErrorBoundary name="CloudDome"><CloudDome /></R3FErrorBoundary>}   // line 574

// After
import Atmosphere from '../components/Atmosphere'
...
{layers.clouds && <R3FErrorBoundary name="Atmosphere"><Atmosphere /></R3FErrorBoundary>}
```

The `layers.clouds` toggle stays — Preview's layer-mask UX is unchanged.

### 4. `src/stage/StageApp.jsx:26` — orphan import (no mount)

Just delete the import line; no mount to swap.

```jsx
// Before
import CloudDome from '../components/CloudDome'   // line 26 — unused

// After
// (line removed)
```

---

## Files to delete

```
src/components/CloudDome.jsx
src/components/SpriteClouds.jsx
HANDOFF-clouds-day3-clouddome-v2.md
```

That's it. Other files listed in STAGE_MIGRATION.md (CloudDomeV2/V3, CloudsActive, CloudsSandbox, clouds-sandbox.html, HANDOFF-clouds-day2.md) don't currently exist in the tree — verified at brief time. Don't try to delete files that aren't there.

---

## What NOT to change

- `src/meteorologist/CanaryScene.jsx` — already uses `<Atmosphere />` from Phase 4b.1; untouched
- `src/components/Atmosphere.jsx`, `src/components/atmosphere-materials.js` — the shader is the shader; don't tune
- `src/components/CelestialBodies.jsx` — sky + sun + moon are a separate concern
- `src/components/WeatherPoller.jsx` — weather polling stays; the Almanac evaluator hot-mount is Phase 5
- `src/cartograph/CartographSkyLight.jsx` — the Clouds TodChannel row is for a different (parked) authoring flow; leave alone
- `useCartographStore.js` `clouds` channel state — leave; consumed downstream eventually

This commit is **renderer swap only**. Atmosphere already has two source paths wired (post-Phase 5a, commit `e9936f8`):

- **Authoring path** — `useMeteorologistStore.activePreset` (Phase 4b.2 binding). Used in Meteorologist sessions.
- **Production path** — live directive from `useAtmosphere.tweenedDirective`, driven by the Almanac evaluator against today's open-meteo state (Phase 5a). Used everywhere else.

Both paths exist in `Atmosphere.jsx` today. Your job is **only** to mount Atmosphere at the three production sites. The production path activates automatically when there's no active preset — production immediately renders today's actual atmospheric directive once 4b.3 lands. No bridge state, no `cumulus_humilis` fallback interval, no Phase 5 wait. Phase 5a already shipped that.

---

## Verification

After your edits:

- `npm run dev`
  - Open `/` (production) — sky + clouds render via Atmosphere. Clouds visibly match today's weather (overcast / scattered / clear distinguishable). Open DevTools → `useAtmosphere.getState()` to confirm a tweenedDirective is populated.
  - Open `/cartograph.html` — Stage's main viewport shows Atmosphere clouds, same directive-driven behavior.
  - Open `/preview.html` — Preview shows Atmosphere; toggling `layers.clouds` off hides them.
  - Open `/meteorologist.html` — CanaryScene unchanged; Teacup slider drags still affect the cloud (Phase 4b.2 wiring intact).
- `npm run build`
  - Should transform cleanly. (Note: there's a pre-existing broken symlink `public/photos/lafayette-square/other → ../../../photos-wikimedia/other` that fails `prepareOutDir` — NOT a regression from this commit. If `npm run build` fails AT THAT STEP only, it's the pre-existing issue. JSX should compile through all modules cleanly.)
- `grep -rn "CloudDome\|SpriteClouds" src/` — should return ZERO matches (other than comments in NOTES.md / docs)

If production looks visually wrong (clouds missing, scene black, etc.), don't ship — debug. The expected production behavior is **directive-driven clouds matching today's weather** (Cirrus's Phase 5a wired the directive path). If you see hardcoded-looking cumulus, the directive path isn't activating — most likely cause is the `AtmosphereDirectiveDriver` not being mounted in `Scene.jsx` yet (verify with `grep -n AtmosphereDirectiveDriver src/components/Scene.jsx`). If it's missing, mount it.

---

## Doc updates

`meteorologist/BACKLOG.md` — convert `### Phase 4b.3 — CloudDome retirement` to a shipped entry:

```markdown
### ✅ Phase 4b.3 — CloudDome retirement (shipped 2026-05-20, commit <yours>)

Production LS, Cartograph Stage, and Preview all flipped from `<CloudDome />` to `<Atmosphere />`. CanaryScene unchanged (already on Atmosphere from 4b.1). Deleted `CloudDome.jsx`, `SpriteClouds.jsx`, `HANDOFF-clouds-day3-clouddome-v2.md`. With Phase 5a's directive path already live (commit `e9936f8`), production now renders today's actual atmospheric directive smoothly tweened — no bridge interval. This is the "live LS" beat.
```

`meteorologist/NOTES.md` — add a 2026-05-20 entry below the most recent one:

```markdown
## 2026-05-20 — Phase 4b.3 shipped — production swap

Meteorologist's volumetric raymarched cloud renderer is now the runtime everywhere. Three mounts flipped (`Scene.jsx:683`, `CartographApp.jsx:956`, `PreviewApp.jsx:574`); orphan import dropped from `StageApp.jsx`; `CloudDome.jsx` + `SpriteClouds.jsx` deleted along with `HANDOFF-clouds-day3-clouddome-v2.md`.

Phase 5a (commit `e9936f8`) already wired the directive path into Atmosphere. With 4b.3 mounting Atmosphere at the three production sites, production now renders today's actual atmospheric directive smoothly tweened against live weather. The two consumer paths (authoring via `useMeteorologistStore.activePreset`, production via `useAtmosphere.tweenedDirective`) both exist in `Atmosphere.jsx`; this commit just gets the component mounted where users will see it.
```

`meteorologist/ARCHITECTURE.md` — find §8 ("Relationship to v1 CloudDome") and update the language:

- "It is the **v1 production renderer** until v3 `<Atmosphere />` ships." → "It WAS the v1 production renderer; retired 2026-05-20 in Phase 4b.3 (commit <yours>). `<Atmosphere />` is the production renderer now."
- The "v1 ships LS today with CloudDome" line becomes historical context.

`meteorologist/README.md` — update the status table to move "Phase 4b.3" from "Not yet" to "Done."

`meteorologist/STAGE_MIGRATION.md` — this doc is now mostly historical. Add a header line at the top:

```markdown
> **Historical.** This was the cleanup-commit spec for retiring CloudDome. Phase 4b.3 (2026-05-20, commit <yours>) executed the relevant portions. The "Add to Stage" section is stale — Meteorologist ships as a standalone shell at `/meteorologist.html`, not as a right-panel takeover. Kept for archive value.
```

---

## Disclosure expectations

Commit body:

- Whether the directive path activated cleanly in production after the swap (clouds tracking today's actual weather) or whether the `AtmosphereDirectiveDriver` needed mounting in `Scene.jsx` (Cirrus's 5a commit may or may not have included that mount; verify)
- Whether `npm run build` succeeded or hit the pre-existing symlink issue
- Any of the three production mounts that needed more than the literal swap shown above (different prop pass, different conditional gating, etc.)
- Anything in `Scene.jsx` (the production runtime) that looked surprising — that file is the load-bearing one and worth a careful read before/after

---

## Stash isolate

`git status --short` before commit. Stage only:

- `src/components/Scene.jsx`
- `src/cartograph/CartographApp.jsx`
- `src/preview/PreviewApp.jsx`
- `src/stage/StageApp.jsx`
- `src/components/CloudDome.jsx` (deletion)
- `src/components/SpriteClouds.jsx` (deletion)
- `HANDOFF-clouds-day3-clouddome-v2.md` (deletion)
- `meteorologist/BACKLOG.md`, `NOTES.md`, `ARCHITECTURE.md`, `README.md`, `STAGE_MIGRATION.md`

Anything else gets stashed.

---

## Why this matters

Phase 4b.1 built the shader. Phase 4b.2 made the operator's authoring affect it. Phase Seed populated the library. Phase 5a wired the live directive path. **Phase 4b.3 makes it production.** From this commit forward, every user opening Lafayette Square sees Meteorologist's clouds responding to today's actual weather, smoothly tweened. The remaining v1 arc (Phase 6 modulators + Phase 7 atmospheric consumers) adds atmospheric phenomena and visible rain/snow/wind on top of this base.

— Claude (Meteorologist orchestrator)
