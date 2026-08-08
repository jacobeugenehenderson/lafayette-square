# A14 WITHDRAWN + the LS-substitution triage that produced it — retired 2026-08-08

**Why this is here.** Three things were retired from live docs on 2026-08-08. None was deleted; all
three are below with what replaced them. Live homes: `ROADMAP.md` (A11 · A12 · A13 · the two orderings) · `EXTENT-DESIGN.md §2.1/§3.3/§6` · `BOZ.md §5` ·
`[[feedback_layer_toggles_are_troubleshooting_not_drift]]`.

---

## 1. A14, as filed 2026-08-07 — WITHDRAWN, it was never a defect

> **⛔ A14 · LS's committed `scene.json` DISAGREES WITH ITS OWN `design.json`** *(NEW 2026-08-07)* —
> re-baking LS's `scene.json` from its **unchanged** design source flips `layerVis` **building ·
> parking_lot · garden · tree_row · tree · lamp** from `true` → `false`. Shipping that rebake would
> switch LS's buildings, trees and lamps **off**. The agent reverted it and hand-edited
> `lafayette-square-staging` (which carries the identical drift) rather than re-baking. ⭐ **A live
> instance of `A01`'s class on the flagship scene: the committed artifact is not what the current code
> builds** — and here the two disagree *visibly*. ⛔ **Do not re-bake LS's `scene.json` until it is
> settled which side is right.** ⚠️ This blocks any A11-c-style change that needs a scene re-bake on
> LS. S · → `A01`.

**What it actually was (Jacob, 2026-08-08):** turning buildings / lamps / trees off is **one toggle**,
and he flips them constantly — *"when we're troubleshooting sidewalks it's easier to turn off all that
other stuff to make seeing what we're doing easier."* The design file records **whatever was switched
off last**. A working state, not a decision, not drift.

**And the poured overlays are DISPOSABLE** until the real republish (Extent tool + repaired sidewalks +
fixed nomenclatures). ⇒ **the claimed re-bake blocker on A06 never existed.** Residue: a publish
checklist line (don't *ship* a troubleshooting state), not an investigation.

⭐⭐ **The lesson, which is why the memory exists:** this is `CLAUDE.md` Layer 0 q3 in a **new surface**
— not a measurement taken without authoring loaded, but a **transient authoring gesture read as a
durable artifact fault.** The tell was the familiar one: it looked worst on the most worked-on scene.

---

## 2. The 2026-08-08 standup's LS-substitution plan — SUPERSEDED

Proposed off `ROADMAP` alone: close A11-tail → A12 → A13 as a three-item "LS-substitution family,"
LS-first, treating altadena/centrum/ksi-y-m-yn values as live blocking defects.

**Superseded by `EXTENT-DESIGN`, on three counts** — all of which were already ruled and none of which
the board pointed at:

1. **The class has a ratified root cure** — `§2.1`/`§6` step 4 (retire the `src/data/*` name-imports;
   LS is not a scene, it is the shared default). The plan was site-by-site patching of it.
2. **The ordering is inverted for MOVING a town onto the Extent tool** — `§6`: HPDM first, **LS last** (LS is live production
   and has never been poured). The plan was LS-first.
3. **The scope ruling bounds what counts as a defect** — v1 hardens the MSBF path (LS + HPDM);
   altadena/ksi/centrum *"stay working but unpolished."* An LS-shaped value there is usually **"not
   gotten to,"** not a bug.

**Structural fix, so the next read-in cannot repeat it:** `ROADMAP`'s ordering block now carries **both
orderings** (fix-the-geometry = LS first; move-onto-Extent = LS last) and the scope ruling; `BOZ §5` step 4 now makes `EXTENT-DESIGN` a required read before any
cross-town proposal. *(The board already warned that the Extent migration was co-existent — but it
named no doc and no ruling, so the warning could not be acted on.)*

---

## 3. The "the hood's soft edge is LS's number in 7 of 8 towns" claim — WRONG, retracted same session

Claimed from a grep of `scene.json`: `horizon {radius:2500, fadeInner:940, fadeOuter:3150}`, identical
in 7 of 8 scenes **including HPDM**, reported as the neighborhood's edge being LS-sized everywhere.

**False — two different things are called `radius` + `fade`:**

| | what it is | where |
|---|---|---|
| `scene.json` → `horizon` | **SKY / atmosphere look channel** | `HORIZON_FLAT_DEFAULTS`, `src/cartograph/skyLightChannels.js:335` |
| `neighborhood_boundary.json` → `radius` + `fade{inner,outer}` | **the neighborhood disc — the actual soft gradient edge** | read by `src/cartograph/boundary.js` |

The disc is **correctly per-town**: LS `892` · HPDM `1251` · ksi `1530`. Nothing bled.

⭐ **What survives as true, and is now A11's:** the *sky* `horizon` **is** identical across the six real
Looks, and it is **not** the store default (`3750/900/3750`, carried only by `default` + `toy`) — i.e.
an authored LS sky propagated by the Look seed, the same clone family as `heroKeyframes`/`shots`/`trees`.

⭐⭐ **The transferable rule** (now inline at `ROADMAP` A13): **check `neighborhood_boundary.json`
before reporting any hood-size finding.** Grepping the baked scene for a fade-shaped number finds the
sky and looks exactly like a smoking gun. Related: `[[feedback_it_already_exists_find_what_broke_it]]`
— the disc's design was ratified 2026-07-22 and answered this before it was asked.
