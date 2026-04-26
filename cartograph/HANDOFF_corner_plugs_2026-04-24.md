# Corner Plug Handoff — 2026-04-24 evening

You are picking up a partially-fixed problem. Read this top to bottom
**before** opening `StreetRibbons.jsx`. The previous session went deep
on this and reverted six attempted fixes — knowing what's been ruled
out will save you hours.

## Where to start in the code

- `src/components/StreetRibbons.jsx`, the corner-plug block ~lines
  680–803, inside the `meshes` useMemo. Specifically the per-quadrant
  loop `for (const sA of [1, -1]) { for (const sB of [1, -1]) { ... } }`.
- Cross-section data: `src/cartograph/streetProfiles.js`'s `refEdges()`
  and `sideToStripes()`.

## State of the code right now

Two changes from this session are kept and committed in spirit:

1. **IX-lookup fix.** Replaced the `i.ix === stA_ref.ix` constraint in
   the `find()` for `stA_data` / `stB_data` with point-proximity
   matching against `ix.point`. 99/183 → 183/183 cross-street pairs
   resolve. **Do not revert.**
2. **`plugSwWidth = treelawn + sidewalk`** (operator's option ii).
   Was sidewalk-stripe-only; now uses full outside-curb width per leg
   for narrower-wins. Reads at ADA scale at oblique IXes.

Everything else is the original parallelogram-overlap geometry. Nothing
else from this session survives in the code.

## What works

Right-angle IXes (the bulk of Lafayette Square's grid). Generation is
solid at every IX (was failing ~50% before the lookup fix).

## What doesn't — and what we know about why

**Mississippi × Park, IX at (229, −158.9), ~69°/111° interior — the
canonical test case.**

Two visible artifacts at oblique IXes:

- **Acute sectors** (~70° interior between bounding arms) render as a
  thin spike or tongue. The parallelogram is sheared; the curb arc
  bezier with control at `swA + swB − oo` (which equals `curbCornerPt`
  by parallelogram identity) ends up cramped.
- **Obtuse sectors** (~110° interior) had appeared "OK" earlier this
  session, but operator re-edited measure values and the obtuse corners
  also revealed fragility — a small tooth where plug curb meets leg
  curb. The geometry isn't robust; the previous OK appearance was
  coincidence at one set of values.

**The root cause**, traced numerically: the plug's leg-A end (segment
from `coA` to `swA`) sits on **leg A's sw-outer line** — a line
*parallel* to leg A. The leg A arm's terminal cross-section, by contrast,
sits on **leg A's perpendicular at the IX vertex** — at right angles
to leg A. These two lines coincide only at 90°. At every oblique angle
they diverge, and the visible mismatch grows as the angle gets sharper.

## Operator's mental model — verified, do not re-derive

- **Geometry per IX, no global formula.** Each IX measured independently;
  plug shape falls out of where the ribbon offset lines cross at that IX.
- **4 corners come from ribbon-overlap intersections.** Specifically (in
  the diagram operator drew, file: `current_lyfe/corners/Screenshot
  2026-04-13 at 2.51.50 PM.png`):
  - Point 1 = where leg A's outer edge meets leg B's outer edge.
  - Points 2 and 4 = extension of one ribbon width from point 1 along
    each leg's outer line.
  - Point 3 = bezier midpoint of the arc from 2 to 4.
- **The arc bows toward IX.**
- **"If the shape is squashed, the arc gets squashed."** Operator
  accepts that the parallelogram naturally shears at oblique IXes and
  the arc shears with it. That's the intended behavior, not a bug.
- **"Curb in the plug should exactly meet curb on both legs of the
  ribbons."** Flush merge.
- **"Plug outer corner = property-line corner; inner corner = asph
  corner."** Operator's stated geometry.
- **"No treelawn in the plug; treelawn butts up to sidewalk."** Treelawn
  doesn't exist as a band in the corner area — sidewalk material covers
  what would be treelawn radial level on each leg.

### Tension to be aware of

The "4 corners come from ribbon-overlap intersections" rule (operator's
foundational model) and the "outer corner = property-line corner" rule
are in tension at asymmetric IXes. Specifically, in the current code
`oo = lineX(P0o, edA, P1o, edB)` where `P0o` is at `curbOuter +
plugSwWidth` (NOT at propLine). For symmetric residential corners
where treelawn+sw is the same on both legs, `oo` happens to coincide
with the property-line corner. For asymmetric (Mississippi × Park has
significantly different widths on the four sides), they differ.

Several attempts to use the actual property-line corner as `oo` broke
acute sectors visually. Why isn't fully understood yet.

## Approaches tried this session — all reverted

Documented in `cartograph/NOTES.md` 2026-04-24 evening entry. Short
version, **do not blindly re-try**:

1. Property-line outer envelope (`swA_outer, swB_outer, propCorner`).
   Helped obtuse, broke acute.
2. Acute-only tangent push-out using `R · cot(θ/2)`. Curb width
   inconsistent.
3. Lockstep extension of `swA, swB, coA, coB, swA_outer, swB_outer`.
   Curb width fixed but plug shape still wrong.
4. Chord-midpoint apex at acute (drop propCorner when `θ < 90°`). No
   visible change.
5. Multiplicative clearance `R = 0.85 × min`. Operator: "Wrong approach.
   Please revert."
6. Concentric-arcs-with-control-at-IX rewrite. Resulted in zero plug
   visible at every corner. Reverted.

If you want to try a new approach, **read those entries first** to
understand exactly what each one did and what specifically failed,
then design something genuinely different.

## Suggested next direction (one operator-untested idea)

Per-IX **operator-authored** corner plugs. Instead of trying to derive
plug geometry from a formula that works at every angle, give the operator
4 draggable handles per IX (the 4 corners of each plug quadrant) and
persist them in `centerlines.json` or a new `corners.json`. The runtime
just reads the handle positions. Right-angle IXes default to the current
formula; oblique IXes get manual touch-up.

This is consistent with operator's earlier note "it pays to just
measure each intersection independently." The current code DOES compute
per-IX, but from a formula that doesn't generalize. Authored override
sidesteps the geometry problem entirely for the few oblique IXes that
need it.

If you go this route:
- Add `corners` to `centerlines.json` or new file.
- Survey/Measure tools get a "Corner" mode for placing handles.
- `StreetRibbons.jsx` plug code: if authored corners exist for this IX,
  use them; else fall back to the parallelogram formula.

Operator hasn't approved this — just one suggestion. Confirm before
building.

## Loose ends still from prior sessions

- `MapLayers.jsx:95` — `THREE.Material: parameter 'color' has value of
  undefined`. One-line fix when grepping.
- `BufferGeometry.computeBoundingSphere(): Computed radius is NaN` on
  `PlaneGeometry`. Likewise.

## Required reading before touching the plug code

1. This file.
2. `cartograph/NOTES.md` 2026-04-24 evening entry (full session log).
3. `cartograph/BACKLOG.md` 2026-04-24 evening entry.
4. The four corner memories at
   `~/.claude/projects/-Users-jacobhenderson-Desktop-lafayette-square/memory/`:
   - `feedback_corner_arc_rules.md`
   - `project_corner_plug_rules.md`
   - `project_corner_plug_open_problem.md`
   - `feedback_plug_is_angle_aware.md`
5. `feedback_no_global_fixes.md` — operator reminded next-session-me of
   this several times this session as I kept proposing global formulas.
   Pay attention.
