# Brief 8 — Salon canary setter

**You are the baby executing this brief.** Not the orchestrator, not a router. The work is yours to do directly. Name yourself however feels right — pick whatever lands when you read this — and use that name in your status updates and commit body. Boz (coordinator) drafted this; Jacob (operator) dispatched it.

This brief runs in **parallel with Brief 7** (Birch is on that). Zero file-surface overlap with Brief 7's work — your changes live in `SalonWorkstage.jsx` UI affordance + store; Brief 7 lives in `SpecimenViewport.jsx` + a new server endpoint. Independent ship paths.

## Where you are in the Salon arc

You're joining the **Salon arc** in the Arborist helper — the operator's compose-not-synthesize authoring surface for trees. Salon mode (Brief 1 + 1.5*) is shipped: operator picks chassis + bark + leaves per species, adopts, re-publishes. Briefs 2, 2.1, 2.1a, 2.1c, 5 all expanded the Salon's authoring depth across barks and leaves.

**Recent shipped briefs:**

| Brief | Baby | What |
|---|---|---|
| Brief 0–1.5e | Various | Chassis library, Salon workstage, completion passes, leaf packs |
| Brief 2 / 2.1 | Holm / Birch | Multi-stop gradient bark + luminance REPLACE pivot |
| Brief 2.1a | Cinder | Bark detail-texturing Overlay composite |
| Brief 2.1c | Sorrel | leafAttachmentTags world-space contract |
| Brief 5 | Tendril | Vendor-leaf preservation + cousin-swap pivot |
| Brief 7 (in flight) | Birch | Salon Preview Atlas — retires interim chunk-replication |

**Doctrine you're operating within:**
- **Cross-helper contracts are frozen seams** — no helper-to-helper imports, no shared stores. Helpers talk through localStorage + storage events + scene.json artifacts. The canary contract is one of these frozen seams; you're extending the WRITER side, not modifying the contract.
- **Salon is the operator's authoring surface** — affordances that aid the authoring loop belong here.

## What's broken — the workflow gap

Today, the Arborist↔Meteorologist canary contract is shipped:

- **Mechanism**: `localStorage` key `meteorologist-canary-tree`, origin-scoped, cross-tab via `storage` event.
- **Payload**: `{species, variantId, lookId}` JSON.
- **Writer (today)**: Arborist **Grove**'s per-tile hover-card affordance ("→ Set as Meteorologist canary"). Per-Look roster curation surface.
- **Reader**: Meteorologist `CanaryScene` subscribes to `storage` events, swaps hero tree to match.

**The gap**: the operator's authoring surface is now the Salon, not the Grove. After Adopt-and-Republish in the Salon, the operator can't set canary on the fresh composition without navigating to Grove. That breaks the iteration loop — "I just authored Sugar Maple, let me storm-test it" requires a context switch.

Your brief closes the gap: add the same canary-setter affordance to each Salon composition, so the operator can canary a Salon variant the moment they republish it.

## Mission

Add a **"→ Set as Meteorologist canary" affordance** to each Salon composition tile in `SalonWorkstage.jsx`. Writes the same `localStorage` payload Grove writes (`{species, variantId, lookId}`). Meteorologist's reader is unchanged.

The contract is frozen — you write the same shape Grove writes, period. The Meteorologist `CanaryScene` subscribes to `storage` events from any same-origin tab; clicking your affordance fires the storage event; CanaryScene swaps the hero tree. No coordination needed with Meteorologist-side code.

## Files you'll touch

| File | Change | ~LOC |
|---|---|---|
| `src/arborist/SalonWorkstage.jsx` | Add canary-setter button to each slot's footer (alongside Reset + Adopt + Name input) | +25 |
| `src/arborist/stores/useArboristStore.js` | New store action `setSalonCanary(species, slot, lookId)` — writes localStorage payload, fires storage event explicitly if needed (browser fires it for OTHER tabs; for cross-component reactivity within the same tab, manual `dispatchEvent` may be needed — verify) | +15 |
| `arborist/FEATURES.md` | Mention the affordance in Salon mode's tile-footer description | +5 |
| `arborist/ARCHITECTURE.md` | Update the "Arborist ↔ Meteorologist canary contract" section to reflect Salon-side writer (Grove's writer stays unchanged; both can write) | +5 |
| `arborist/BACKLOG.md` | Mark Brief 8 shipped | +3 |
| `arborist/NOTES.md` | Dated session entry | ~30 |

Total: ~80 new LOC. Half a baby day.

## The variantId question

The canary payload includes `variantId`. For Grove, that's the per-tile variant index in `public/baked/<look>/trees/<species>/...`. For Salon, the operator authors composition slots (1, 2, 3...); each slot becomes a variant at republish time.

**Mapping**: composition slot N → variantId N (1-indexed). This matches `publish-glb.js`'s emission order (per Brief 2's documentation: "composition[i] → variantId i+1, matching publish-glb's emission order").

So `setSalonCanary(species, slot, lookId)` writes:
```js
localStorage.setItem('meteorologist-canary-tree', JSON.stringify({
  species,           // composition's species id
  variantId: slot,   // composition slot number
  lookId,            // active look id from store
}))
```

## Enablement conditions (UX)

The canary action should be enabled only when the composition is **published** (variants exist in the LS roster). If the operator clicks canary on a dirty or unpublished composition, Meteorologist's `CanaryScene` would point at a non-existent variant and fail silently.

Enablement check:
- `composition.dirty === false` (not pending Adopt)
- `species + variantId` exists in `public/trees/<species>/manifest.json#variants` (post-publish; can check via the species manifest fetched by the store)
- `activeLookId !== null` (need a Look context)

If any condition fails, render the button disabled with a tooltip explaining what's needed. Don't hide the affordance — operator needs to see what's possible.

**Tooltip precedence** when multiple conditions fail (most actionable first):
1. **No active Look** — "Open a Look in the cartograph first" (operator must take action elsewhere)
2. **Composition is dirty** — "Adopt the composition first" (operator action in Salon)
3. **Composition not yet published** — "Re-publish species first" (operator action in Salon footer)

Show only the highest-precedence message that applies.

## Acceptance criteria

1. **Canary button visible in each Salon slot's footer.** Same row as Reset / Adopt / Name input. Labeled with the canary glyph + concise text (e.g., "🎯 Canary" or "Set canary").
2. **Click writes correct payload.** localStorage key `meteorologist-canary-tree` updated with `{species, variantId: slot, lookId}` after click. Verify via DevTools.
3. **Meteorologist CanaryScene swaps tree.** Open Meteorologist in a sibling tab; click canary in Salon; CanaryScene's hero tree changes within the storage-event tick (~immediate).
4. **Disabled state on unpublished composition.** Adopt-pending or never-republished compositions show button disabled with tooltip.
5. **Grove's existing canary writer unchanged.** Grove's "Set as Meteorologist canary" affordance continues to work identically (no regression).
6. **Active visual indicator.** The composition that's currently set as canary shows a subtle marker (e.g., a small "canary" chip on the slot tab) so the operator knows which composition is feeding Meteorologist. Read from localStorage on mount; subscribe to `storage` events to update if another tab changes it.
7. **No store touches to canary state.** Per the contract — canary is per-operator UI preference, NOT authored state. Don't add it to Look design.json or compositions.json. localStorage only.

## Approach guidance

- **Mirror Grove's writer.** Find Grove's existing affordance (likely in `src/arborist/Grove.jsx` or a sibling component) — copy the shape, paste into SalonWorkstage's slot footer. Same code, two callsites.
- **Cross-tab storage event semantics.** The browser fires `storage` events on OTHER tabs (not the writer's own). For within-tab reactivity (your active-canary visual indicator), either manually `dispatchEvent(new StorageEvent('storage', ...))` or use a small store action that updates a local `salonCanaryRef` alongside the localStorage write. Latter is cleaner.
- **Style consistency.** Match the visual style of the existing slot footer buttons (Reset / Adopt). Use the same DraftButton or similar pattern.
- **Tooltip language.** When disabled, say specifically WHY: "Adopt the composition first" or "Re-publish species first" or "No active Look — open a Look in the cartograph first." Don't generic-fail.

## Surface anything not in this brief

Per [[feedback_baby_must_surface_scope_drift]] — if you find:
- Grove's canary writer signature/shape differs from your new Salon writer (they MUST match the contract; surface and reconcile)
- The variantId mapping isn't quite slot→i+1 (check publish-glb's actual emission for edge cases — e.g., bundle-decomposed chassis)
- Meteorologist's `CanaryScene` expects a payload field your writer doesn't supply
- The "no store touches" rule conflicts with how the active-canary visual indicator needs to be wired

Surface in status update AND commit body.

## Out of scope

- **Meteorologist-side changes.** Reader is frozen; don't touch `src/meteorologist/CanaryScene.jsx` or the storage-event subscription.
- **The canary contract shape itself.** Payload is `{species, variantId, lookId}`. Don't add fields. If a field is missing for your needs, surface — but don't extend unilaterally.
- **Auto-canary-on-republish.** Operator clicks the button; don't auto-fire canary when a republish completes. Operator-controlled affordance.
- **Multi-canary.** One canary at a time per the contract.
- **Canary persistence across operator machines.** localStorage is per-machine by design.
- **Cross-helper bake artifacts.** Salon's bake → LS path unchanged.
- **Anything in Brief 7's file surface** (`SpecimenViewport.jsx`, the new server endpoint, treeAtlasMaterial mounting). Birch owns that.

## Memory refs

Read at session start:
- `feedback_baby_briefs_need_identity_framing` (identity first)
- `feedback_baby_must_surface_scope_drift` (see above)
- `project_kit_helpers_pattern` — frozen-seam discipline
- The "Arborist ↔ Meteorologist canary contract" section in `arborist/ARCHITECTURE.md` — the contract you're extending the writer side of

## After you ship

Commit body should:
- Lead with one sentence summarizing what changed
- Reference Brief 8 (this doc)
- List files touched + LOC delta per file
- Acceptance-criteria checklist with status per item
- Surface any scope drift in a "Doesn't fix / open follow-ups" section
- Co-author: `Claude` (you)

Status update to Jacob and Boz should be ≤300 words, lead with the most surprising finding.

After this lands, the Salon authoring loop closes one more workflow gap: author → republish → canary → storm-test in Meteorologist, all without leaving the Salon's authoring rhythm. Half a baby day; small but real.

Welcome to the Salon arc.
