# Handoff — Authoring-Session Hardening: restore-where-you-left + a safe freeze/bake + one camera home

> **Status: DRAFT (2026-06-21, Boz) — investigated (3 Explore sweeps), forks decided, ready to phase.**
> The "side quest": a hard-refresh in any cartograph tool returns to the exact place left; the
> leave-a-tool freeze/bake chain is hardened against silent loss; Preview gets a real "Bake & Preview";
> and the scattered in-app camera state consolidates into one home. **Doc fortification is in-scope and
> explicitly wanted** (Jacob): ARCHITECTURE / FEATURES / OPERATIONS / BAKE / WALL.
>
> ⛔ **ROUTE FIRST** (`CLAUDE.md`): `ORIENTATION.md` → `README §⭐ START HERE` → `cartograph/OPERATIONS.md §Save → ship`
> + `cartograph/BAKE.md` + `cartograph/WALL.md` + `cartograph/STAGE.md §SC.5` (camera) before touching code.
>
> ⚠️ **HIGH blast radius / serialize:** Phase 4 (camera) touches `Scene.jsx` / `StageApp.jsx` /
> `CartographApp.jsx` / `PreviewApp.jsx` — the SAME files as `HANDOFF-render-conformance.md` and
> `HANDOFF-real-dof.md`. Do not edit those concurrently with either arc; surface to Boz.

## Decided (Jacob, 2026-06-21)
- **Reload restores the EXACT place** (tool + shot + camera) — not a cold-boot to Designer. The
  anti-black-screen guard is over-cautious: the **status modal card** covers any wait, and the
  dirty-skipping bake (`runIfDirty`, `serve.js:559`) is fast unless lots changed.
- **Consolidate the camera into ONE home** (`useCartographCamera`) + de-duplicate the CameraRig — not
  just document the scatter.

---

## Findings (grounded — 3 Explore sweeps, `file:line` verified)

### A. Reload lands on Survey — why
- The store `src/cartograph/stores/useCartographStore.js` has **no `persist` middleware**; `tool: 'surveyor'`
  is a hardcoded cold-boot default (`:1574`).
- `shot` is **written** to localStorage (`cartograph-shot`, `:1655`) but **never read back** on init
  (always `'designer'`, `:1580`) — half-built persistence.
- Already persisted (the pattern to mirror): `activeLookId` (`:46`), `lastStageShot` (`:1585`, read+write),
  `scene` (`:1599`), `activeStyles` (`:1633`), and the **2D pan/zoom** (`cartograph-camera`,
  `CartographApp.jsx:73,343`, written every frame).
- The deliberate cold-boot-to-Designer guard is `:1575-1579` (the "10–15s load" rationale Jacob overruled).

### B. The leave-a-tool freeze/bake chain is fragile
- Leaving Survey fires `freezeShape()` **async + UNAWAITED** (`BlockGeometryV2Debug.jsx:790-796`) → races a
  following bake (bake can read a half-written `shape.json`).
- `runBake` (`useCartographStore.js:1539-1563`) flushes the **design** debounce (`:1548`) but does **NOT**:
  await the shape freeze, flush the **overlay** (immediate-but-unawaited `_saveOverlay`), or check the
  `overlaySaveBlocked` hydration flag (`:1940-1957`) — so it can bake stale/un-hydrated state.
- Known loud signal already in place: `overlaySaveBlocked` red StatusBar banner (LANDED `8ed0534`, 2026-06-17).

### C. Preview — opens a window but does NOT bake
- The Preview button is `window.open('/preview', '_blank')` (`Toolbar.jsx:62`) — **new tab, no bake**; it
  loads the **last-baked** slab. ("Bake into Preview launches a new window" was half-true: window yes,
  bake no.) Jacob's "refresh bake in Preview" is the missing piece → a **"Bake & Preview"** action.
- **Undocumented today:** Preview-doesn't-bake; the freezeShape race.

### D. Camera homes — production clean, in-app scattered
- **Production/slab (clean):** `scene.json` `shots` (authored via `SHOTS_FLAT_DEFAULTS`,
  `skyLightChannels.js:220`) + shared resolvers `src/lib/heroSubject.js`, `src/lib/browseAltitude.js` +
  `Scene.jsx` CameraRig.
- **In-app authoring (scattered):** `shot` in the store; **2D pan/zoom in localStorage** (`cartograph-camera`);
  UI state (viewMode/panel/azimuth) in a **separate `useCamera` hook** (`src/hooks/useCamera.js`); and the
  **CameraRig duplicated** in `CartographApp.jsx` *and* `StageApp.jsx`; Preview `ShotCamera` bespoke + a
  legacy duplicated `SHOTS` const. **No single home.**

---

## The build (phased — each its own commit; ordered safe→risky)

### Phase 1 — Restore-where-you-left (the named bug; self-contained) — ✅ LANDED (uncommitted, 2026-06-21)
`useCartographStore.js`: `tool` now reads back from `localStorage` + `setTool` persists it ('design' =
neutral); `shot` reads back the already-written value; cold-boot-to-Designer guard dropped; coherence
guard forces `tool=null` for a restored Stage shot. **Eye-check pending (Jacob): refresh in each tool
lands back exactly; does the status card cover a restored Stage load or is it a black screen?**

Persist + read-back `tool` and `shot` (mirror the `lastStageShot` read+write pattern); 2D pan/zoom already
persists. **Drop/relax the cold-boot-to-Designer guard** — restore the exact tool+shot. Ensure the
**status/loading card** shows during the 3D slab load so a restored-into-Stage refresh is communicated, not
a black screen. **Verify:** refresh in each tool (Survey/Section/Stage/Designer/Preview) lands back exactly,
2D viewport + 3D shot preserved.

### Phase 2 — The settle-gate (harden freeze/bake against silent loss) — ✅ LANDED (uncommitted, 2026-06-21)
`runBake` now: (a) **refuses to bake** when `!_designHydrated || overlaySaveBlocked` (loud `bakeError` +
red banner instead of a stale slab); (b) **settles** the in-flight shape freeze (new `shapeFreezePending`
promise, tracked by `freezeShape`) + `_saveOverlay()` + the design debounce before baking. ⚠️ **Residual
(noted, not closed):** the gate awaits a freeze that's *in flight*; it does NOT close the sub-frame window
where the operator exits Survey and clicks bake before the Survey-exit *effect* has even fired
`freezeShape`. Fully closing it means triggering the freeze synchronously on tool-change rather than via a
React effect — a bigger change; do it if the race actually bites.

Before any bake/tool-transition: **await** the shape freeze (make `freezeShape` awaitable + track a pending
promise), **flush** `_saveOverlay` + `_saveDesignDebounced`, and **refuse to bake** when un-hydrated
(`overlaySaveBlocked` / `!_designHydrated`) with a loud message instead of a stale bake. **Verify:** a fast
"edit → Stage →" never bakes partial state; un-hydrated bake is blocked, not silent.

### Phase 3 — "Bake & Preview" (the refresh-bake Jacob wants; small, additive)
A new action: run the **hardened** bake (Phase 2) → then open/focus the Preview window with a fresh
cache-bust (`?t=bakedAt`). Keep the plain "Preview" (open last bake) too, but make Bake&Preview the
primary. **Verify:** edit Stage look → Bake&Preview → the new/refreshed window shows the just-baked slab.

### Phase 4 — One camera home (`useCartographCamera`) — the big refactor, LAST, serialize
Consolidate the in-app authoring camera: fold `shot` + 2D pan/zoom + the per-shot 3D camera into one
`useCartographCamera` store/hook; **de-duplicate the CameraRig** (one shared module consumed by
`CartographApp` + `StageApp`, and ideally Preview's `ShotCamera`). Keep the production/slab camera contract
(`scene.json` + shared resolvers) as the SSoT it already is. **⚠️ Touches the conformance/DoF files —
serialize.** **Verify:** all surfaces frame identically; no behavior change beyond the consolidation.

### Phase 5 — Doc fortification (throughout + close)
- **ARCHITECTURE** — a real **camera section**: production-slab vs in-app-authoring, the (now consolidated)
  home, the shared resolvers.
- **OPERATIONS** — Preview is read-only/last-baked; the **Bake & Preview** flow; the hardened
  save→leave→bake ceremony (§Save → ship).
- **BAKE / WALL** — the freeze-race + the await-before-bake settle-gate.
- **FEATURES** — user-facing "your work is where you left it" + "publish with confidence."

## Open / coordination
- Phase 4 **must serialize** with `HANDOFF-render-conformance.md` + `HANDOFF-real-dof.md` (shared files).
- Phases 1–3 are low-coupling and can land first.
- Mobile: keep a light guard option if the restored 3D load is genuinely painful on `phone-lo` (measure;
  default is restore-exact per Jacob).

*Filed 2026-06-21 (Boz) from the side-quest investigation. Reference home on landing: `cartograph/ARCHITECTURE.md`
(camera) + `cartograph/OPERATIONS.md` (the ceremony).*
