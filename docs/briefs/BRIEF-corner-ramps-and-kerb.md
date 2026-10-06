# BRIEF — corners carry ramps and crosswalks, and the kerb is raised

**You are the dispatched agent. Name yourself** — one word, yours, not one a RUNNING session holds
(`ListAgents`, then `/rename`). **Agent: FRESH** — the corner canon is long and hard-won and must be read
whole, with no assumptions carried in from another window.

**Instruction: confirm-then-build.** Read the canon and code below, tell Boz what you found, and if the
code contradicts this brief — **stop and flag**. ⭐ This brief touches SECTION's ruled corner; the stop is
cheaper than a fifth reverted corner pass (`_archive/RIBBONS-history-2026-06-12.md §7`).

---

## 0. What this is — three rulings (Jacob, 2026-10-05)

Real corners have things ours do not: where the kerb actually DROPS (one diagonal ramp, a perpendicular
pair, or none), detectable-warning tiles at each ramp, crosswalks that meet the ramps across the street,
and a kerb with height. NYC records curb cuts (`CURB_CUT`, 2022 planimetrics), which made the gap
visible — but this is **kit-general**: every town gets it, evidence or no evidence.

1. ✅ **A ramp is a POSITION on the corner's arc; the pad is unchanged.** The ADA pad (SECTION §4, "the
   RAMP") stays exactly what it is — concrete from tangent to tangent, reaching the kerb. A corner now
   also carries a short list of **ramps**: where along its arc, how wide, whether it has a warning strip.
   A ramp marks where the kerb drops and where the warning tiles go. ⛔ It is a SLICE of the same band,
   never a constructed primitive (RIBBONS §1, invariant 1; SECTION §4 "the corner constructs nothing").
2. ✅ **Crosswalks live on the same arc** — a crosswalk runs from a ramp to the matching ramp across the
   street. Same object family, same corner record.
3. ✅ **The kerb is RAISED** — real height, dropping to zero at each ramp. ⚠️ Today the ground is one flat
   plane; nothing in `bake-ground.js` or `BakedGround.jsx` knows kerb height (grep, 2026-10-05). This is
   the largest part of the brief and is kit-wide.

### ⭐ THE LAYER, NAMED FIRST (`CLAUDE.md` route step 4)
- **Ramps, warning strips, crosswalks = FILL (Section).** They are slices and materials of the band
  stroked inward off the frozen curb; they never move the curb. A change that moves `iA` is out of bounds.
- **The raised kerb = a BAKE attribute of the curb strip, not a SHAPE change.** WHERE the kerb is stays
  SHAPE (① → ②, Survey, frozen in `shape.json`); this brief gives that frozen strip HEIGHT at the ground
  bake. ⛔ If raising it appears to need the curb re-drawn, that is a SHAPE question — stop and flag.

### Where each corner's ramps come from — the same layering as everything else
1. **Evidence where it exists:** a city curb-cut layer (NYC `CURB_CUT`, acquired by
   `BRIEF-nyc-adapter.md`), or OSM `kerb=lowered` / `highway=crossing` nodes (`ROADMAP A09` — those tags
   are currently DROPPED at ingest; fixing that is in scope if you need them).
2. **Otherwise a rule:** the town's or state's norm (NYC: a perpendicular pair per corner; an older
   town: one diagonal at the apex). ⛔ The norm is AUTHORED per town/state with a neutral default —
   never a constant that happens to be right for the first town (`CLAUDE.md` Layer 0, Class D).
3. **The operator overrides any corner** — a Section gesture (ramp style / positions).
Every ramp carries its source, exactly like widths (`ROADMAP A23`).

## 1. Read first — whole, not sampled

- `cartograph/SECTION.md` **§4 entire** (RAMP vs SLOPE, "the legs decide the corner", the TL↔TL blunt end)
  and **§6** (the corner construction + the "how to change the corners" guide).
- `cartograph/RIBBONS.md` **§1** (the invariants; "the corner is where ① TURNS").
- `cartograph/_archive/RIBBONS-history-2026-06-12.md` **§6.9** (AASHTO/ADA corner doctrine) and **§7**
  (every corner attempt and why it was reverted).
- `ROADMAP` **A7** (corners declined 17–63% by town — a ramp needs a corner that exists) and **A09**.
- `cartograph/ARCHITECTURE.md §8` (the single-plane ground; `flattenPaintStack`; coplanar groups).

## 2. Code sites

| what | where |
|---|---|
| the FILL construction, per tile | `src/lib/tileGround.js#sectionPassTile` |
| the ramp/slope edges | `tileGround.js` — grep `walkFromD`, `walkToD`, `rampLen` (read `rampLen` as the SLOPE's run) |
| corner arcs and their stamp | `tileGround.js` — grep `iaCorner`, `filletRing`, `cornerFillets` |
| the curb width | `tileGround.js#edgeDepth` (`curbWidth` is authored per Look) |
| the flattened ground plane | `cartograph/bake-ground.js#flattenPaintStack`; renderer `src/components/BakedGround.jsx` |
| ground conformance (anchors sit on the drawn ground) | `cartograph/ARCHITECTURE.md §8 "Ground conformance"` |

## 3. Sequence — three landings, each eye-gated

1. **Ramps on the arc, 2D.** The corner record gains its ramp list; Section paints the warning strips and
   marks the drop positions as material. Default = the rule; evidence overrides where present; operator
   overrides last. **Check:** every recorded curb cut (where a town has them) lands on an arc ramp of the
   right corner — per town, mutation-tested.
2. **Crosswalks.** Ramp-to-ramp striping across the street, on the asphalt. **Check:** every crosswalk
   ends at a ramp on both sides.
3. **The raised kerb.** The kerb strip gets height, dropping to zero across each ramp. ⚠️ Before
   building, **measure and report**: what the single-plane ground assumes, what height does to
   `flattenPaintStack`, the coplanar-overlap check, ground-AO, the lamp/tree anchors, and frame cost on
   phone-lo. ⛔ A kerb height is AUTHORED per town (a Look or town value) with a neutral default.
   **Stop after the measurement and bring Boz the cost before building it.**

## 4. The chain

- **Trusts:** ① and ②'s corner — a ramp needs a built corner arc; where A7 says a corner was declined,
  a ramp has nowhere to sit (report those, do not invent arcs). The frozen `shape.json` stamp (`iaCorner`).
- **Trusted by:** the bake (ground geometry), anchors, AO, and Preview's cost numbers.

## 5. Can the instrument see the change?

Section paints LIVE off the frozen shape (SECTION §4: the FILL is frozen nowhere) — a 2D ramp change is
visible on reload with no re-freeze. The raised kerb is a BAKE change: it shows only after a ground bake,
in Stage/Preview, never in the Designer. Name the surface on every eye-gate, and the scene.

## 6. Validation surface

Section in the Designer (2D), then Stage/Preview (the kerb). ⛔ No parallel renderer. First eye-gate on
**Lafayette Square** (the most authored town) and one other; Jackson Heights once poured.

## 7. Bounds

- Writes: `src/lib/tileGround.js` (Section corner), `cartograph/bake-ground.js` (kerb), checks under
  `checks/`. ⛔ No change to ①/② shape construction.
- ⛔ **Another work group is active (Boz the Elder).** Saves to `src/lib/` and `cartograph/` are bake
  inputs — confirm with Boz that no bake is running before each landing. Commit through explicit paths
  only (`BOZ §3.7`).
- Registers: `FEATURES` (the capability), `OPERATIONS` (ramp style, kerb height knobs). Name them in the
  commit.

## 8. Done when

Every corner shows its ramps and crosswalks by rule, evidence or override, each with its source; the
kerb stands up and drops at each ramp; the checks are mutation-tested; Jacob's eye in Section and Stage,
scene recorded.
