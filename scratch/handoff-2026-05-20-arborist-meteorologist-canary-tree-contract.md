# Cross-helper handoff: Arborist canary-tree picker for Meteorologist

**From:** Meteorologist orchestrator
**To:** Arborist coordinator
**Date:** 2026-05-20
**Scope:** Coordinator-to-coordinator handoff. You'll translate this into your own baby brief; I'm just establishing the contract + context.

---

## The ask

Add a "Use as Meteorologist canary" affordance to Arborist's UI. When clicked, it sets the tree that Meteorologist's `CanaryScene` displays in its GROUND slot (currently hardcoded to `platanus_acerifolia/skeleton-1-lod0.glb`).

This is small + low-risk + parallel. The Meteorologist half (CanaryScene reads from the agreed key, swaps URL) is being handled directly by the Meteorologist orchestrator — no baby — so your baby only owns the Arborist UI side.

---

## The contract (what both sides agree to)

**Mechanism:** `localStorage` with cross-tab `storage` events. Origin-scoped, both helper apps run at the same Vite origin so this works without ceremony.

**Key:** `meteorologist-canary-tree`

**Payload:** JSON-stringified object:

```js
{
  species: string,     // e.g. "acer_saccharum" — matches arborist's species id
  variantId: number,   // e.g. 3 — the skeleton-N variant; Arborist's manifest carries these
  lookId: string,      // the active Look at write time; Meteorologist resolves GLB url from this
}
```

**Resolved URL** (Meteorologist will compute this on its side):

```
${BASE_URL}baked/${lookId}/trees/${species}/skeleton-${variantId}-lod0.glb
```

**Write semantics:**
- `localStorage.setItem('meteorologist-canary-tree', JSON.stringify(payload))`
- Browser fires `storage` event in any other open tab on the same origin automatically. Meteorologist's CanaryScene listens.

**Read semantics (Meteorologist's side, FYI):**
- On mount: `JSON.parse(localStorage.getItem('meteorologist-canary-tree') ?? 'null')`
- If null OR if the resolved GLB 404s → fall back to current hardcoded `platanus_acerifolia/skeleton-1` from the active Look
- Listen to `storage` events; re-fetch on change

**No backend endpoint.** This is a per-operator UI preference, not authored slab data. localStorage is correct per `project_kit_helpers_pattern` — helpers publish authored artifacts; this isn't authored.

---

## Why this seam, not something else

Considered + rejected:

- **Per-Look field in `design.json`** → that's the parked "per-Look primary tree species" idea in `meteorologist/BACKLOG.md`. Different feature (climatic identity per Look, affects production placements). The canary-tree is "what tree do I want in MY authoring scene" — per-operator UI preference, not per-Look climate. Don't conflate.
- **New `meteorologist/serve.js` endpoint** → backend ceremony for a UI preference. Adds a JSON file, an endpoint, a schema, validation. localStorage gets us the same correctness with zero ceremony.
- **In-memory store (shared zustand)** → doesn't survive reload, doesn't sync across tabs. Operator's tab arrangement is "Arborist in tab A, Meteorologist in tab B"; the cross-tab story matters.

---

## Where the UI button goes (your baby's call to make)

Two natural homes in Arborist; both fit the contract. Your baby picks based on the existing UX:

| Surface | Fit | Notes |
|---|---|---|
| **Grove** (`src/arborist/Grove.jsx`) — per-tile action | Most likely best | The Grove already has per-tile toggle actions (In-Look). Adding a small "set as Meteorologist canary" button (icon, on hover or always visible in tile chrome) reads as a natural extension. Operator browses variants → sees one they like → clicks the button → confirms in Meteorologist tab. |
| **Workstage** (`src/arborist/Workstage.jsx` or `ProceduralWorkstage.jsx`) — per-specimen action | Secondary path | When an operator is examining one tree variant in depth, a button at the bottom of the panel "Use this as Meteorologist canary" fits the "I just adopted this variant" flow. |
| **Both** | Acceptable | The Grove button is the browse-and-pick path; the Workstage button is the dive-in path. Operator can use whichever matches their current task. |

Recommendation: start with the Grove tile button (cheapest, highest-traffic surface). Workstage can come later if useful.

**Affordance details (your baby's call):**

- Visual: icon button (a cloud? a small "M"?) in the tile chrome. Or a context-menu item if the Grove already has one. Style consistent with the existing In-Look toggle.
- Confirmation: a transient toast / status line saying "Set as Meteorologist canary" — operator gets feedback without leaving Arborist.
- Optional: a "→ open meteorologist" link after setting, opens `/meteorologist` in a new tab. Nice but not required.

---

## Variant + lookId resolution

The payload needs `species`, `variantId`, and `lookId`. Where they come from in Arborist:

- **`species`** — from the tile's data (Grove tiles already carry `speciesId` per `Grove.jsx`).
- **`variantId`** — from the tile's data (`variantId` already part of the Grove variant shape).
- **`lookId`** — from the Arborist store's active Look (`useArboristStore.activeLookId`). Per the kit pattern, the operator's currently-curating Look is the canonical "current Look" within Arborist.

If the operator switches Looks in Arborist after setting the canary, the payload's `lookId` becomes stale. Two options:
- **Option A (simplest):** Don't auto-update. Operator can re-click to refresh with the new Look.
- **Option B:** Watch `activeLookId` and auto-rewrite when the operator changes Looks AFTER having set a canary. More magical; could surprise.

Recommend Option A for v1. If Meteorologist resolves the GLB and 404s (because the species isn't in this Look's bake), Meteorologist falls back gracefully.

---

## Out of scope for this baby

- **Don't write to design.json or any per-Look authored file.** This is localStorage only.
- **Don't add a `serve.js` endpoint.** No backend.
- **Don't touch Meteorologist files.** That side is being handled separately.
- **Don't add UI affordances in Cartograph or Preview.** Arborist surface only.
- **Don't gate behind a feature flag.** Just ship it.

---

## Verification

Your baby's verification should include:

1. Open `/arborist`, navigate to Grove (or wherever the button lands).
2. Click the button on a tile.
3. Open browser DevTools → Application → Local Storage → confirm `meteorologist-canary-tree` is set with `{species, variantId, lookId}` matching the clicked tile.
4. Open `/meteorologist` in a new tab → Teapot mode → click any cloud → Teacup mounts → GROUND slot → hero tree is the one just selected. (NOTE: the Meteorologist side may not be shipped yet by the time your baby finishes. Verification 4 only succeeds after BOTH halves land. If yours lands first, the localStorage write succeeds + persists; Meteorologist still renders default. That's a clean partial state.)
5. Re-click on a different tile → `storage` event fires → if Meteorologist tab is open, it re-renders with the new tree (verification on this is only meaningful once Meteorologist's reader lands).

---

## Coordination

- **The Meteorologist orchestrator is shipping the reader directly** — no baby, no brief, just a small CanaryScene patch.
- **You drive the timing.** Either side can land first; the contract holds. If your baby ships first, just report back when done; I'll do the Meteorologist patch immediately after.
- **The key + payload shape are frozen** in this brief. If your baby finds a reason to change them (e.g. needs an extra field), surface back to Jacob before changing — he'll route it through both coordinators.

---

## Memories worth flagging to your baby

- `feedback_stash_isolate_per_file` (amended 2026-05-19) — check both working-tree AND staged state before commit.
- `feedback_baby_must_surface_scope_drift` — disclose anything added beyond the brief in commit body.
- `project_kit_helpers_pattern` — Arborist owns trees; cross-helper writes go through agreed contracts (this localStorage key), not direct imports.

---

## Report shape (back to Jacob)

When your baby reports done:

- Commit hash + files changed
- Where the button landed (Grove / Workstage / both)
- localStorage key write verified in DevTools
- Scope-drift disclosures
- Thumbs-up

Jacob forwards to me; I ship the Meteorologist reader immediately after.
