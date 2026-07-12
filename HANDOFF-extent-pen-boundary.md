# HANDOFF — Extent boundary: the EDITABLE PEN TOOL

> **Agent: FRESH.** Self-contained build against one surface (`ExtentApp.jsx` + a new pen component + the extent endpoints in `serve.js`/`api.js`). No warm context needed beyond this brief + the cited canon. Name yourself.
>
> **First reads (route before you touch anything — `CLAUDE.md` gate):** `ORIENTATION.md` (root) → `README.md §⭐ START HERE` + its feature index row "Extent / intake tool + the Pour" → `cartograph/NEIGHBORHOOD-INPUTS.md §5.1/§5.2` (membership = the boundary polygon, NOT the circle) → `cartograph/INTAKE.md` (the tool + the Pour) → this file. **Supersedes the "tap the corners" direction of `HANDOFF-extent-finish.md`** and every snap-route/official-ring idea before it. Its remaining punch-list (legible labels, end-at-corners) is subsumed and can be ignored.

---

## The one sentence: an Illustrator-style pen whose whole point is EDITABILITY

The boundary is a **living, first-class, endlessly-editable bezier path** that the operator authors and *keeps fixing forever, across sessions.* It is NOT a draw-once shape. The persisted artifact **is the editable path**; the closed polygon is just what we *derive* from it for building membership. Build a real pen editor, not a draw tool that freezes.

## Why this exists — read this or you'll rebuild the wrong thing

The Extent tool decides **which buildings are in the neighborhood** — residents, place-cards, types all fall out of membership. It is NOT about a pretty street-following polygon (that vanity cost days).

**What we deleted and why (settled 2026-07-12, do not re-open):** the prior session auto-derived the boundary — geocode the place name → official CDP admin ring → snap-and-route onto streets. It "worked" and was **the wrong answer**: an administrative polygon is not a neighborhood. Altadena's CDP is ~2× the real hood (16k buildings vs ~8k), reported at cross-purposes to what we mean. **We never geocode for geometry.** The **search stays** — but only as the **data bootstrap** (fetch skeleton + buildings for a deliberately-generous, throwaway envelope). The search result is NOT the boundary. The operator authors the boundary with the pen.

**Why a pen, specifically:**
- **Editability** (above) — the reason. Illustrator paths are the gold standard for come-back-and-refine; that's precisely the "keep fixing the legitimate bounds" need.
- **Zero fuzzy inference** — the path you draw *is* the boundary; membership is point-in-polygon. No stroke→chain matching, no routing, none of the machinery that produced the jumbled edge.
- **Decoupled from the skeleton** — needs nothing from it but node coordinates as optional snap targets. Honors "we don't need to polygonize for the boundary, only the silhouette."
- **Membership doesn't need centerline precision** — the line only has to separate inside buildings from outside. "Roughly down the street" is as correct as "on the centerline."

---

## The tool — an editable bezier pen on the aerial

**Drawing:**
- **Click** → drop a **corner anchor**. If it lands within snap-distance of a skeleton node (intersection), it **snaps to that node's position for crisp placement** — then that position is **frozen as a plain `lon/lat` coordinate.** ⚠️ Snap is a *placement assist only* — we store the coordinate, NEVER a node reference. No skeleton coupling after placement (a re-derived skeleton must not move an authored corner). Deterministic nearest-node lookup — this is the *reliable* kind of snap, unlike the fuzzy stroke/route matching we killed.
- **Click in open space** (the wash / landscape seam) → a free anchor where you put it. No node near = no snap; same tool, no special "landscape" mode.
- **Click-drag** → pull out **bezier handles** (a smooth anchor) for a curved run.
- Close the path back to the first anchor.

**Editing — the heart of the spec (all of this, and it all persists + reloads editable):**
- **Move** any anchor by dragging (re-applies snap-on-move: near a node → snaps crisp, else free; result re-frozen to `lon/lat`).
- **Insert** an anchor by clicking on a segment (add detail without redrawing).
- **Delete** an anchor (`⌃-click` proposed — ⚠️ VERIFY: Mac `⌃-click` = OS right-click, and the app already uses `⌃-click` for "revert to default"; if it collides use `⌥-click` or select-then-`Delete`, and say which). Segment heals across the gap.
- **Handles:** drag to bend a run; **corner** (independent/no handles) ↔ **smooth** (mirrored) toggle per anchor.
- **Reopen a hood → the full editable path returns** (not a frozen polygon). This is the "keep fixing across sessions" requirement — do not shortcut it.

**A pen path is inherently ordered by its own sequence** → the stamp model's angular-sort + reorderable-chips problem simply does not exist here. Don't build ordering.

**Downstream UNCHANGED:** flatten the path → membership polygon → point-in-polygon building membership (`defaultIn`, `ExtentApp.jsx:834`) → auto-radius circle → Pour. Per-building **fringe override** (`toggleBuilding`, already built) stays for the idiosyncratic margin (one side of a street, a few honorary buildings) — the second layer of forever-fixing.

**The circle is visible and operator-adjustable — required, not incidental.** The circle IS the slab disc; the operator must *see* it and will pull it out for comfortable **padding** around the hood. Auto-radius is only the **starting fit** (tight to the path's extent); then the operator enlarges it for slack. Make the circle edge an **in-scene draggable handle** (standing preference: `feedback_illustrator_handles_for_spatial_authoring`), not only a panel slider — reuses `radiusM`/`radiusTouched` pre-commit, `/rescope` post-commit.

**Derived street/loose list (`borderFeatures`) — LIVE, read-only, never authoring.** Classify each flattened path *segment* against the already-fetched skeleton: within threshold of a chain → tag `{name, cardinal}`; no street near → `loose` (an unnamed natural/non-street edge — the wash). Yields an ordered ring like *Lincoln (W) → ⟨loose⟩ → Loma Alta (N) → …*. **Derive it live** as the operator draws/edits (a "you're on Lincoln" QC affordance + the auto-blurb), and **persist a snapshot at commit** (replaces the old commit-time `borderStreets` — same consumer: the SEO/description blurb). A mislabel is cosmetic — it never touches geometry or membership, so this keeps the deterministic invariant. Streets are free (skeleton in hand); *naming* the loose features (Eaton Wash, foothills, rail) needs extra OSM layers intake doesn't pull today → deferred follow-on; `loose` stays unnamed for now.

**The freeze + editing lanes (get this right — verified against `serve.js`):**
- The **fetch** (`/fetch-extent`) lays down the frame at the bbox center + the raw building manifest — the *establishing* write, not the destructive one.
- The **commit** (`/commit-extent`) is the flagged-**destructive** step: it re-centers geography to the boundary centroid → `reproject-raw` + skeleton (`.prebak` rollback). This is what puts the hood **centered in the circle** — non-negotiable (the circle IS the slab disc). It can only happen post-draw (you don't know the centroid until the path exists).
- **Post-commit, non-destructive lanes already exist and stay:** radius → `/rescope` (rewrites the circle, **preserves** the polygon, re-clips); buildings → `toggleBuilding` (`activate`/`hide` override at clip time).
- **Editing the pen path post-commit:** just **re-commit** — it re-centers, so the hood stays perfectly centered (cost: the re-pour). This is the whole story for editing; small fixes re-commit, a big variance means restart/re-commit the map (Jacob, 2026-07-12: large post-commit swings won't happen in practice).
- **NOT needed (do not build):** an *instant* re-membership lane that re-clips against the frozen frame with no re-center — it would drift the hood off-center to save the re-pour. Since big swings don't happen and re-commit keeps it centered, this is YAGNI. Left here only so nobody re-invents it thinking it's missing.

---

## Persistence — the editable path IS the first-class data

Store the **path**, frame-independently, so it survives commit's re-center/reproject (mirror how `official.ring` is stored as `lon/lat`):

```
boundaryPath: {
  closed: true,
  anchors: [
    { lon, lat, type: 'corner'|'smooth', handleIn?: {lon,lat}, handleOut?: {lon,lat} },
    ...
  ]
}
```

- Home it in `neighborhood.json` (alongside name/blurb/radius). Autosave it — extend the existing name/blurb/sides autosave, **minding the scene-gate + reset-on-switch** that fixed the cross-contamination clobber (`ExtentApp.jsx:877`).
- Project `lon/lat` → live frame via `wgs84ToLocal` for display/editing (see `officialCorners`, `ExtentApp.jsx:776`).
- **Membership polygon = flatten the beziers** (adaptive/​fixed tolerance) → point-in-polygon.

---

## Where it plugs in — the exact code

**Client (`src/cartograph/ExtentApp.jsx`):**
- Boundary today resolves via `corners` (~825-830): `committedCorners → streetCorners → officialCorners`. **Replace the non-committed source with the flattened pen path.** `committedCorners` (reads `sceneBoundary.polygon`, line 806) stays for an already-committed hood.
- **DELETE the geocode-for-geometry path:** `officialCorners` useMemo (776-799), the `official`/`useOfficial` state + the open-time geocode that fills it (the `nb && !nb.committed` block ~916+), and the `if (officialCorners) return officialCorners` fallback (828).
- New **pen component/overlay** — the editable path (anchors, handles, segments) rendered on the aerial. Reuse `MarkerOverlay.jsx:52 screenToWorld` (camera-frustum unproject) for click→world. Gate pan while the pen is active: `enablePan={!penActive}` (cf. `markerActive`, line 1265). The freehand `MarkerOverlay`/`MarkerFAB` stays exactly as-is (annotation), untouched. Render doctrine: `feedback_overlay_meshes_must_be_transparent`, `feedback_troika_outline_world_units`.
- **Snap targets:** `fetchSkeleton(scene)` (`api.js:245`) returns `{ junctions:[{x,z,degree}] }` — use the junction coordinates as the nearest-node snap set (a simple nearest-point lookup; a grid like `snapRouteBoundary`'s is optional at this node count). **You do NOT need the street graph or any routing** — that whole apparatus is gone.

**Server (`cartograph/serve.js`):**
- **DELETE** `snapRouteBoundary` (431-466) entirely.
- **commit-extent** (~1377-1400): the healed process re-resolves the boundary in the now-re-centered frame. **Swap** `computeBoundaryFromSelection(scene, sides)` (1380) for: project the stored `boundaryPath` anchors/handles into the re-centered frame → flatten → that's `boundary.polygon`. **DELETE** the `else if` official-ring branch (1385-1400) and `polygonSource: 'official-snapped'`. (Border-street names for the SEO blurb: derive post-hoc by sampling the flattened path against the skeleton if wanted, or leave to the typed blurb — do not reintroduce routing for it.)

**Leave dormant, don't rip out this arc** (flag as a follow-on cleanup so scope doesn't sprawl): the street-selection resolver (`computeBoundaryFromSelection`, `sides`, clickable-streets UI). Superseded, not harmful.

---

## Build order (prove the editing loop first — editability is the risk)
1. **De-risk editability:** render a hardcoded 3-anchor closed path; prove move / insert-on-segment / delete / corner↔smooth / handle-drag all work and re-render live. This is the hard part — get it solid before anything else.
2. Drawing: click = corner anchor (with snap-on-placement → frozen `lon/lat`); open-space click = free anchor; click-drag = handles; close path.
3. Flatten → membership (`defaultIn`) → live building ghost/include as the path edits.
4. Persist `boundaryPath` → `neighborhood.json`; rehydrate the **editable** path on open (prove a full round-trip: draw → reload → keep editing).
5. Commit: project + flatten `boundaryPath` → `boundary.polygon`; DELETE the geocode-for-geometry path.
6. Confirm downstream unchanged: membership → auto-radius → Pour. Editing a committed hood's path = re-Pour to apply (a lighter re-membership-only path is a flagged follow-on — don't build it now).

## Invariants (binding — violate one and STOP and flag Boz)
- **The boundary is always an enclosed polygon** — never an open/"doesn't close" state.
- **Never geocode for geometry.** Search = fetch bootstrap only; the operator's eye + pen author the boundary.
- **The editable path is the first-class persisted artifact** (`lon/lat` anchors + handles), reloaded fully editable across sessions. Snap freezes to a coordinate; it never stores a node reference (no skeleton re-coupling).
- **Deterministic, no fuzzy inference** — no chain matching, no routing. The drawn path is the boundary.
- **Divided roads weld in the skeleton, not here** (`project_extent_altadena_divided_road_weld`, `feedback_fix_at_source_never_hack_the_symptom`).
- **LS stays byte-identical** — don't touch LS's committed boundary/data; frame `north=−z` (`config.js`).

## Write / commit boundaries
- **Yours:** `src/cartograph/ExtentApp.jsx`, a new pen component, `cartograph/serve.js` (extent endpoints only), `src/cartograph/api.js` helpers, any new client util. Work in a **worktree**; commit to trunk `curb-offset-draw`.
- **Off-limits (Boz folds these):** `README.md`, `ORIENTATION.md`, `NEIGHBORHOOD-INPUTS.md`, `PIPELINE.md`, `INTAKE.md`, this HANDOFF. If the canon contradicts the build, **stop and flag Boz** — don't edit canon or silently diverge.
- **Surface scope drift** (`feedback_baby_must_surface_scope_drift`): if the editable-path editor, the street-selection retirement, or the committed-hood re-membership turns bigger than scoped, flag it — don't absorb it.
