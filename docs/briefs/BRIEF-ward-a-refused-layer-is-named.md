# BRIEF — a refused layer is named to the visitor (the Ward)

**Owner:** Ward. **Reviewer:** Zob (co-sign below). **Repo:** `~/Desktop/dev.nosync/theward` only.

1. **You are the dispatched agent. Name yourself:** one word, yours, and not one a running session holds (check with
   `ListAgents`, then `/rename`).
2. **Agent: FRESH.**

## The premise (read in source by Ward, 2026-11-01, at theward `d71662d` and ward-kit `a72ea019`; confirm it)

- The kit has ONE failure sink: `src/lib/failures.js` (`useFailures`, `failuresFor`, `reasonOf`). Its writers are
  `R3FErrorBoundary.jsx` (a layer's Refusal, or a Transient it gave up retrying) and `displays/DisplayBoundary.js`
  (one display). An entry is `{ lookId, layer, kind: 'refusal'|'gave-up', reason }`, keyed `<lookId>/<layer>`, and
  is cleared when the layer mounts cleanly again. Its header: *"The Ward reads `useFailures` and decides how a visitor
  sees it."*
- **The Ward reads it nowhere** (`grep -rn "useFailures\|failures" src` finds 0). So a refused layer shows as a
  silent absence on screen, with the console the only witness. Stage shows the sink (`StageApp.jsx#FailuresBanner`);
  the Ward doesn't.
- A real instance today: a town whose published manifest has no drawer for its display refuses inside the display's
  boundary (`displays/drawerUrl.js`: "the town's published manifest carries no drawer for display …"). PTown's
  staging slab was in that state until it was republished on 2026-11-01. A visitor would have seen no Light Show
  and no reason.
- What SceneBroken (`src/scene/SceneBroken.jsx`) covers is different: a throw that takes the whole canvas down.
  The sink is the partial case, where the map still works and one piece is missing.

## The work

1. **Read the sink, for this town:** `failuresFor(failed, lookId)`, imported through `Town.jsx` (which re-exports
   `useFailures, failuresFor`), never by a deep path into `lib/`: Town.jsx is the kit's public surface, and it gives one
   module and one store. ⛔ No second store. ⛔ Another town's entry never shows. Entries with `lookId: null`
   ("pieces outside any town") DO show, by the kit's design.
2. **Show it in the Ward's register:** the error's own words, as `Broken` and `TownError` do. One quiet notice
   that names each missing piece by its `layer` exactly as the kit gives it, plus its `reason`, in the Ward's existing look (`unbuilt.css` or
   `town-error.css`; ⛔ not a third look). It must not block the map: the town still works.
   - `role="status"` (polite), rendered OUTSIDE Scene's `aria-hidden="true"` root, so a screen reader hears it.
   - It goes when the kit clears the entry (the layer drew), and comes back at once if the refusal recurs.
   - `refusal` → "isn't drawn: <reason>"; `gave-up` → "didn't draw: <reason>" (gave-up covers ANY non-Refusal
     throw, so it never names a cause). A gave-up may add that reloading the page tries again; a refusal recurs, so
     it doesn't. A sentence, never a retry.
   - ⛔ **No Ward table mapping `layer` → a friendly name** (a per-layer exception table). If a human label is wanted,
     it is kit work (the boundary carries one): surface it, don't build it.
   - ⛔ **NO FALLBACK:** never a placeholder layer, a retry, or a hidden entry. ⛔ Never a dismiss that forgets
     the entry while it stands: if a close control is wanted, it collapses the notice to a persistent marker.
3. **The check** (`checks/`, wired into `run.mjs`): a browser check that produces a REAL refusal by a route the check
   controls (not by editing src). For example, intercept the town's `manifest.json` and drop the `displays` block, on
   a town that declares a display. Assert the notice names the layer and the kit's own reason, with
   `role="status"` outside the aria-hidden root, and that a second town's planted entry doesn't show.
   - **Prove the refusal happened first.** A display loads nothing while it's off, so the check reads the console line
     (`[Displays] ⛔ display <id> failed: …carries no drawer…`). Refusal seen and no notice → RED. No refusal seen →
     exit 2 with words (NOT CHECKED), never red or green.
   - **Fresh page load only:** in dev, an HMR re-evaluation of failures.js makes a second store.
   - **Plant the other town's entry through the same module URL:** `page.evaluate` of `import('<the /@fs/ URL of
     ward-kit/src/lib/failures.js>')`, then `.default.getState().report({...})`, with ANOTHER town's lookId (not
     null). ⛔ No test hook in src.
   - **A real clear:** either drop the intercept and remount (another town and back) and assert the notice is gone
     (this tests the kit's clear), or call the same module's `clear(lookId, 'display:<id>')` (this tests the
     reader's subscription). Say which one.
   **Mutation-test:** remove the reader; drop the lookId filter; render the notice inside the aria-hidden root; keep
   showing an entry after it is cleared. Each must turn the check RED. Report the runs.

## Bounds

- A branch `ward/a-refused-layer-is-named` off `ward-pin/2026-11-01`; `git commit -- <paths>`. ⛔ No kit edits.
  ⛔ No publish, no pin move.
- The commit names its register (`FEATURES`: a visitor is told when part of the town didn't draw) or says
  "Reaches no register." README is conformed in the same commit.
- The heavy slot is Boz's to grant: ask before the full `npm run check`, which runs in the MAIN checkout (no Ward
  worktree can build).
- **Out of bounds, surface it:** throws in `useFrame`, event handlers and async loaders that no boundary sees (the
  sink only knows what a boundary reports).

**Confirm, then build:** read the kit's sink and its writers at the pin, and the Ward's code, then tell Ward what you
found. If they contradict this brief, stop and flag.

## Zob's co-sign

Zob, 2026-11-01: co-signed, read at ward-kit a72ea019 and theward d71662d (premise confirmed in source; one store
through Town.jsx's re-export). Conditions: 1 (layer shown as the kit gives it; no Ward name table), 2 (the check proves
the refusal happened, else NOT CHECKED), 3 (plant through the same module URL, another town's lookId; null entries
show), 4 (a real clear, and say which). Wording: "isn't drawn" / "didn't draw".
