<!-- BRIEF-STATE
status: PARKED
dispatched: no
written: 2026-09-20
evict-when: RULING: Jacob parked this as "only annoying and not blocking" — it leaves the roster when he says it is worth a session, or when the stale holder is named and cleared.
-->

# BRIEF — A SCENE SWITCH LEAVES THE PREVIOUS TOWN ON SCREEN

*Written 2026-09-20 by the coordinator seat. Reported by Jacob — twice.*

> ### ⭐ THE REPRO, IN HIS WORDS
> *"When I switch to LS in the extent tool and come back to the designer, huron persists over the LS
> map and opens in Section. When I purposefully go to survey and back into Section, it's fine."*
> *"I can get it to display correctly with refreshes and going in and out of bakes but it shouldn't
> require that."*

⚠️ **PRIORITY, FROM JACOB: LOW. Do not let this block the roster work.** *"I don't care about doing
that work presently as it's only annoying and not blocking."* ⛔ This brief exists so the finding is
not lost, not because the work is next. **If you were dispatched for something else, stop reading.**

> ### ⛔⛔ AND IT IS WORSE THAN "ANNOYING" IN ONE SPECIFIC WAY — SAY IT TO HIM BEFORE YOU AGREE IT IS COSMETIC
> The operator is looking at **town A's geometry over town B's map, with nothing on screen saying so.**
> That is `CLAUDE.md` Layer 0 question 2 — a **plausible-looking success**, the failure mode the kit
> treats as worst. ⭐ It is the state in which someone authors a width onto the wrong town. The
> *symptom* is cosmetic; the *class* is a correctness hazard, and those are different claims.

---

## 1. You are the dispatched agent. Name yourself — one word, yours.

⛔ Not "Boz". The coordinator never names you.

## 2. Agent: **FRESH**

⛔ **Do NOT warm-start from Circle.** Circle holds the fade/SSoT arc — a different region with its own
live rulings — and `boundary.js` / `CartographApp.jsx` are in ITS write bounds right now. **Two
sessions editing `CartographApp.jsx` is the shared-index hazard, not a collaboration.** Coordinate
through Boz before you touch that file; if Circle is still live, work the store and `MapLayers` first.

## 3. Read this canon, by section

- **`CLAUDE.md` Layer 0, question 2** — ⛔ NO FALLBACKS; the silent wrong state is the defect. It is
  the whole argument for why this is not merely cosmetic.
- **`cartograph/ARCHITECTURE.md §Extent`** — the palimpsest warning and the `src/data/*` name-import
  residue. ⚠️ **Related and NOT the same bug** — do not merge them.
- **`INTAKE-CATALOGUE §3.6 G5`** — bleed #5, an unregistered look falling back to LS. ⭐ **Check
  whether what you are seeing is G5 rather than a stale cache.** `A12` was closed as tautological on
  2026-09-20, so do not re-open that; but the *fallback-to-LS* shape is real and adjacent.

## 4. The code sites, by `file:line`

### The store CAN only clear what it owns
`src/cartograph/stores/useCartographStore.js:2070-2073`:
```js
setScene: (scene) => {
  if (!isValidMapId(scene)) return
  try { localStorage.setItem('cartograph-scene', scene) } catch { /* ignore */ }
  set({ scene, sceneRibbons: null, mapGeography: null, sceneBoundary: null })
},
```
**Three fields cleared.** That is the complete scene reset.

### ⭐ THE STRONGEST CANDIDATE — and it is a HYPOTHESIS, not a finding
`src/cartograph/MapLayers.jsx:464`:
```js
const [fetchedMap, setFetchedMap] = useState(null)   // ⛔ COMPONENT-LOCAL, not the store
```
`:476`:
```js
const mapData = isLS ? _lsMapData : (fetchedMap || _EMPTY_MAP)
```
⛔ **`setScene` cannot reach `fetchedMap`** — it is local React state. If `MapLayers` does not remount
or does not reset it on a `scene` change, **the previous town's map data survives the switch.**

⭐⭐ **AND `:476` EXPLAINS THE EXACT WORDING OF THE SYMPTOM.** Switching **to LS** takes the `isLS`
branch, which is a **static import** and therefore instant and correct — while any consumer still
holding huron renders on top. That is literally *"huron persists OVER the LS map"*: two layers from
two different sources, one fresh, one stale. ⛔ **This also means the bug may be INVISIBLE in the
other direction** (LS → huron), because there is no static import to arrive first. **Test both
directions before you believe any diagnosis.**

### The second surface — "opens in Section"
`useCartographStore.js:801` `openSections: {}` · `:475` its hydrator · `:1699` its setter.
⚠️ **`openSections` is PERSISTED** (it is in the hydrate list). A persisted tab state that is not
scene-keyed will restore the same section across a scene change. ⛔ Cause not established.

### The third surface — the worker, and why Survey→Section "fixes" it
`src/cartograph/BlockGeometryV2Debug.jsx:448-456` — the recompute keys on
`[liveRibbons, stencil, debouncedInputs, useRingBandEmitter, surveyActive, measureActive]`.
⭐ **`surveyActive` is in that dependency list.** Toggling Survey→Section changes it and forces a
recompute — which is **exactly the manual step Jacob found that clears the leak.** That is the
single best clue in this brief. ⚠️ It does not prove the worker is the *cause*; a debounced or
in-flight result delivered after the switch would look identical. **Measure which.**

### The prior art — a guard for this class already exists, one layer down
`useCartographStore.js:2236-2248`, `_clInFlight`:
```js
// Only clear if we're still the current in-flight — a scene switch may have
// replaced us, and clearing then would strand the newer load's dedupe.
```
⭐ **Somebody already met "a scene switch replaced us" and defended one loader against it.** The
defence is per-loader and local. **Ask whether the other async paths have the same guard — and if the
answer is "only this one does," you have found the class, not the instance.**

## 5. The chain — what this trusts, and what trusts this

**Upstream:** `setScene` is the one entry point (`:2070`); `activeLook` → scene at `:1812-1817`; the
`cartograph-scene` localStorage key at `:2072`. ⚠️ **The Extent tool and the Designer are two apps
over one store** — `ExtentApp.jsx` and `CartographApp.jsx`. The switch Jacob describes crosses that
seam, so reproduce it **across the seam**, never by calling `setScene` in one app.

**Downstream, by name:** `MapLayers` (map + buildings), `BlockGeometryV2Debug` (blocks/bands/ribbons),
`AerialTiles` (reads the active installation's geography), `DesignerTrees` / `DesignerLamps`.
⛔ **Each holds its own async or local state. Enumerate them before fixing one.**

⭐ **Convert it to a check, per `BOZ §3.5`** — this is a kit invariant, not a huron bug:
> **After `setScene(B)`, no consumer holds data sourced from scene A.**

## 6. ⛔ Can the instrument SEE the change?

⚠️⚠️ **THIS IS THE HARD PART OF THIS BRIEF AND YOU MUST SOLVE IT BEFORE YOU FIX ANYTHING.**
**There is no disk artifact.** The leak is live render state; nothing is written, so a `node` check
reading `data/` can never see it and **a green check would prove nothing.**

- ⭐ **The honest instrument is a store-level test**, not a render test: drive `setScene(A)` →
  `setScene(B)` and assert no consumer-visible state still sources A. That is checkable without a GPU.
- ⛔ **A render-level gate is Jacob's eye, and his eye is the gate** (`feedback_proxy_render_is_not_the_operator_eye` — proxy renders mislead on this map).
- ⭐ **Name the surface:** Survey renders **live**; Section renders from the frozen **`shape.json`**
  (⛔ **not** the baked slab — no Designer surface reads `baked/<look>/ground.json`). The repro crosses both,
  and `surveyActive` is in the recompute key — **say which surface you are showing him.**
- ⛔⛔ **MUTATION-TEST WHATEVER YOU BUILD.** `MEMORY §C`: a passing check proves nothing until it has
  been SEEN TO FAIL. Ground Layers shipped a check on 2026-09-20 that **passed for the wrong reason**
  — a lazy regex silently matched 3 of N and reported green. Make yours fail on purpose first.

## 7. Write/commit bounds

**In bounds:** `src/cartograph/stores/useCartographStore.js` · `src/cartograph/MapLayers.jsx` ·
the consumer components in §5 · a new check.

⛔ **OUT of bounds:** the fade / `boundary.js` / `streetFade` work — **Circle owns it, live.**
⛔ **`cartograph/ARCHITECTURE.md §Extent`'s `src/data/*` name-import residue is a DIFFERENT bug.**
Do not fold it in; surface it if you touch it.
⛔ **Do not "fix" this by remounting everything on every scene change** without saying what it costs.
A blanket remount is a fallback wearing a fix's clothes — it would hide the specific stale holder
rather than name it, and the next one to appear would be silent again.

⛔ **SURFACE SCOPE DRIFT, DO NOT ABSORB IT.**

## 8. The validation surface that already exists

⭐ **`toy` is the controlled fixture** — it is a real registered scene with a deliberate-false
boundary, so **A→toy→A is a legitimate scene-switch cycle that costs nothing and touches no
authored town.** Route your reproduction through it via the production path, per
`feedback_toy_is_the_construction_spike_surface`. ⛔ Do **not** build a parallel harness app.

⚠️ **But reproduce Jacob's ACTUAL repro at least once** — Extent→LS→Designer — because it crosses the
two-apps-one-store seam that a toy cycle inside one app does not.

---

## What "done" looks like

1. The stale holder is **named** — which state, in which component, sourced from which scene.
2. It is cleared at the scene boundary, **by the owner**, not by a blanket remount.
3. A check asserting "after `setScene(B)`, nothing holds A" — **seen to fail before it passes.**
4. Jacob's repro runs clean **without** a refresh, a bake round-trip, or a Survey→Section toggle.
5. Whether `openSections` should be scene-keyed is **answered out loud**, either way.
