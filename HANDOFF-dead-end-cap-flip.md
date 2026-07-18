# HANDOFF — dead-end cap as a flippable frontage element (the "dip-in") + the governing rule

**Agent: WARM → whoever built the flip fix (`049fc5de`), else FRESH.** Route via `CLAUDE.md`; read
`SECTION.md §6` (corner construction) first. This closes the corner/cap class Jacob calls "the whole
ballgame." Design ratified with Jacob 2026-07-17.

---

## ✅ STATUS — CAP FLIP + DIP-IN SLOPE LANDED & EYE-CONFIRMED (2026-07-18, Cade). NEXT: flippable LEGS.

**All eye-gated with Jacob on the lit app + a render harness. The cap CLASS works; one open thread.**

**Landed (commits on trunk `curb-offset-draw`):**
- **Piece 1 — synthetic cap-segOrd identity** (`5a0eecc8`). Re-homed off `buildBlockGeometryV2` to
  **PREBAKE** (Jacob's call): a dead-end cap is a FACE-topology fact (same-skelId-both-sides adjacency
  = the pendant out-and-back). `feCustomKey.js`: `CAP_SEGORD {start:-1,end:-2}` + `makeCapFe` (one key
  formula). `derive.js` stamps `ribbons.tiles[].caps=[{vertexIdx,skelId,capEnd}]`; `tileGround
  .detectTileCaps`/`chainEndpointKeys`. **Parity gate: `scratch/cap-segord-parity-verify.mjs`** — 50
  caps 1:1 with rendered tips, disjoint from leg slots. `ribbons.json` stamped (`8d8e3323`).
- **Pieces 2+3 — flip gesture + render** (`f78cf011`). Cap is a **toggle-SWAP** (`{capFlip:true}` on the
  cap slot) so it ALWAYS flips regardless of default; round-only (blunt = ineligible, set in Survey);
  cache-safe (`tileSliceKey` folds cap customs). Bug caught: macOS Ctrl+click **double-fired** the
  handler (pointerdown + contextmenu) → net no-op; fixed in `onContextMenu` (`8a8093ae`).
- **Piece 4 — the dip-in slope** (`330004ec`). Two-part, per Jacob's eye: **(a) semicircle swap** — the
  flip is masked to the tip disk ∩ far half-plane so it stops at the diameter, no bleed down the legs
  ("it's only a semicircle"). **(b) legs BEND to meet the cap** — across a short transition the bands
  cross so the **SIDEWALK stays CONTIGUOUS** (ADA walk path can't break): walk = one unbroken quad
  outer(cap)→inner(leg), treelawn = complement. NO mitre (corners don't mitre).

**⚠️ OPEN — the cul-de-sac LEGS aren't flippable (Jacob, 2026-07-18):** a material flip on a dead-end
leg renders **Δ=0.0** (`blockCustoms[skelId][side][segOrd].materials` doesn't reach the strip for the
terminal legs). tile#10 (south-18th-street-3) legs carry `left|segOrd 5`, `right|segOrd 6`. Diagnose:
does the leg custom reach `emitStrip` for the dead-end legs, and does the crossing-band transition
zone override a flipped leg? The legs must flip independently of the cap.

**Verify tooling (both in `scratch/`):** `cap-viz.mjs [skelId:capEnd] [flip|noflip]` renders the cap
region to an SVG→PNG (use `sharp` to rasterize) so geometry can be SEEN before Jacob's eye — this broke
a blind-iteration cycle on the slope. `cap-segord-parity-verify.mjs` is the piece-1 gate.

**Artifact state (UNCOMMITTED, Jacob's working copy):** `public/baked/lafayette-square/shape.json`
re-baked with cap identity (Measure reads the FROZEN shape, so the identity must be in it — the in-app
Survey-exit freeze did NOT persist it; regenerated via `scratch/rebake-shape.mjs`). `design.json` has 3
force-flipped caps (mackay/south-18th/preston) from testing — Jacob's to keep or reset. A real prod
bake (`bake-ground.js`) regenerates shape.json + the slab. **Minor polish deferred:** a small kink at
the bend crossing (straight diagonals vs a curve).

---

---

## ⭐ THE GOVERNING RULE (lock this — it's the doctrine, capture in SECTION.md canon)
**The frontage is ONE uninterrupted chain from real-corner to real-corner. Bends within it don't
break it — the sidewalk/treelawn flow through. A "transition treatment" (the ADA slope/ramp) fires
ONLY where the arrangement *changes* between two abutting pieces — leg↔leg at a real corner, or
cap↔leg at a dead-end. One rule covers corners and caps alike.**

- **Real corner** = where this frontage's **block-edge ends and meets another street** (an
  intersection / block corner = an fe boundary). Gets corner treatment.
- **Bend** = the frontage's own geometry turning *within a single block-edge* (same fe). Flows
  through, uninterrupted — no break, no pad. (Jacob's L/R at Kennett×18th: the L runs to a real
  corner and is treated; the R's 90° is a within-edge bend and must run unbroken to the next real
  corner.)

The flip fix (`049fc5de`, `expandCustomsAcrossFeSegOrds`) already embodies this for the *arrangement*
(continuous across segments within an fe). The geometry side (only break/slope at a real corner, not
at a bend/segment) is the open completion — and this cap work is the last piece of it.

## THE CAP SPEC (Jacob, 2026-07-17)
1. **The cap is a flippable frontage element** — a round/blunt dead-end cap can be **sidewalk or
   treelawn**, flipped exactly like a leg (Ctrl-click).
2. **Default = inherit the abutting leg** → cap == leg → the continuous wrap we already render (the
   good current behavior). Flipping is opt-in; nothing regresses by default.
3. **Cap↔leg slope on difference** — when the cap's arrangement DIFFERS from the leg it abuts, apply
   the transition slope (the "dip in") — the SAME ADA slope/deep-leg-slide a real corner uses.
4. Done = this works "roundly" for asymmetrical dead-ends (cul-de-sacs like image #9) — all
   eventualities covered.

## IDENTITY DECISION — (a) synthetic cap segOrd (ratified)
The cap gets a **reserved segOrd on the leg's chain** so it flows through the *existing*
`feCustomKey` = `[skelId, side, segOrd]` machinery — the flip, the store writes, and
`expandCustomsAcrossFeSegOrds` all work unchanged. NOT a separate `blockCustoms[skelId].cap` slot
(that would fork the machinery). A cap is "the leg's frontage, wrapped past the tip."

---

## THE BUILD — 4 pieces, sequenced (verify each on Jacob's eye + the FROZEN render)
> ⚠️ **Tonight's hard lesson (2026-07-16): the proxy/sliver-count lied — verify on the actual
> `sectionOpen` (frozen) render + Jacob's eye, NEVER a live-path metric.** The clean wins were
> verifiable data-keying (the flip fix); the losses were rushed geometry. Build deliberately.

1. **Cap identity (plumbing — lowest risk, do first).** Give each dead-end cap a reserved cap-segOrd
   on its leg's fe so it can carry a `blockCustoms` slot via `feCustomKey`. Where fes/segOrds are
   built: `src/lib/buildBlockGeometryV2.js` (`assignSegOrdsToFes`) + `feCustomKey.js` (§storage
   shape). The cap vertex today is `roundTips`/`bluntTips` + `capAt(i)` (`tileGround.js:75,937,1097`).
   **Prove key parity** (the T3 hazard): the cap slot the flip writes == the slot the cap render
   reads. Reuse `scratch/thrunode-frozen-verify.mjs` style checks.
2. **Cap flip (UI).** Extend `tryFlipStripMaterial` (`src/cartograph/MeasureOverlay.jsx:698`) to
   recognize a Ctrl-click on the cap and write the cap-segOrd custom (through the same store path).
3. **Cap render by arrangement.** In `sectionPassTile` the round cap currently wraps with the leg's
   rings (`tileGround.js:1155-1160`, `tipped` suppresses the bid at `:1097/1120`). Read the cap
   custom (`hasTL` for the cap) and render the cap band as SW or TL accordingly. Default (no custom)
   = inherit the leg → byte-identical to today (guard this).
4. **Cap↔leg slope.** When cap.hasTL ≠ leg.hasTL, un-suppress a transition at the cap-leg junction
   and reuse the corner slope machinery — the deep-leg slide / ADA ramp (`tileGround.js:1189`,
   `arcSectorPoly:461`, `conD:1126`). Same "arrangement-difference → slope" as a corner.

## DoD
- Cap flips SW↔TL on the eye at a real cul-de-sac (e.g. image #9's bulb); default (unflipped) is
  byte-identical to today's wrap; when cap≠leg the dip-in slope renders like a corner; verified on
  the FROZEN `sectionOpen` render (not a live metric) + Jacob's eye. Then: bake persistence (the
  same `expandCustomsAcrossFeSegOrds` gap in `bake-ground.js` — see `049fc5de` follow-up).

*Prereqs already landed: the flip-orphan fix (`049fc5de`, `expandCustomsAcrossFeSegOrds`); thruTNode
shelved (`1d39f343`) — its suppressor was eating corner pads. This cap work + the "only-break-at-a-
real-corner" geometry pass are what remain of the corner/cap class.*
