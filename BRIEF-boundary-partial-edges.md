# BRIEF — boundary streets as PARTIAL edges (the spine case)

**One subsystem, one defect.** The boundary-street picker resolves a ring correctly when every boundary street bounds the hood along its whole length. It cannot express a boundary where a street bounds it for only *part* of its length — which is the common case in a real city centre, and the case HPDM needs.

> ⛔ **Route first** (`CLAUDE.md`): `ORIENTATION.md` → `README §⭐ START HERE` → the topic canon. For this: **`cartograph/ARCHITECTURE.md §The Extent tool & the Pour`** (the procedure as-built, rewritten 2026-07-20) and **`cartograph/INTAKE.md §0.5`**. Note §0.5 was RETRACTED on 2026-07-20 — if you find any doc still claiming the excluder pen is settled, it's stale and you should say so.

---

## 1. The defect

`computeBoundaryFromSelection` (`cartograph/serve.js`) builds the ring like this:

- a **corner** = a degree-≥3 junction that TWO selected streets both touch;
- two streets are **adjacent** if they share a corner;
- a clean perimeter is a single cycle where **every street has exactly two boundary neighbours**;
- anything else is returned in `gaps` — `0 or 1 → dangling; 3+ → an interior street was picked`.

That model assumes **one named corridor = one ring edge.** It is right for Księży Młyn (four streets, four corners, 129 ha, closes with zero gaps) and wrong for anything shaped like a spine.

**Reproduce it:** open `centrum` (Łódź-Śródmieście, already fetched — 1,455 streets, 1,555 junctions), pick its boundary streets. `Piotrkowska` runs *through* the district, touches dozens of junctions, and is reported amber/interior. `Doktora Adama Próchnika` does the same. The ring never closes even though the operator's selection is correct.

## 2. What it should be

A ring is a **cycle through corners**, where each edge is a **run along one street between two corners**.

Consequences the current model can't represent:
- A street may contribute **more than one** run (bounds the north edge, goes interior, bounds again).
- A street touching many junctions is **not evidence of error** — it's a selection problem: *which two* of its junctions are the corners for this run.
- "Every street has exactly two neighbours" stops being the closure test. The test becomes: **is there a cycle over the selected streets' shared junctions that uses each selected street at least once?**

## 3. Constraints that must survive

- **Order-independence.** The operator clicks in any order; there are no cardinal slots. This was the explicit complaint that produced the current resolver ("the 'order' of the bands has been an issue… it reads as brittle"). The superseded ordered resolver was excised in `55df128a` — do not reintroduce it.
- **Whole roads, whole buildings.** Jacob: *"a neighborhood doesn't cut a house or block in half."* Every ring edge must lie along a street centerline and every corner be a real junction. Buildings resolve by centroid, so they're safe by construction — don't change that.
- **The gaps report is the feature, not a consolation.** When a ring doesn't close, the operator must be told *which street* and *why*, in terms they can act on. Preserve that quality; the current dangling-vs-interior distinction is good and should get better, not vanish.
- **Divided roads.** Names are corridor-collapsed server-side, so `Śmigłego-Rydza`'s two one-way carriageways read as one entry. But a divided×divided crossing yields **four** junctions in a ~26 m cluster (verified on Księży Młyn's SE corner) and the resolver currently picks the one nearest the origin — arbitrary within the cluster. Welding carriageway-pair crossings into one corridor junction is the honest fix and is the same doctrine as `SKELETON §5e`. In scope if it's cheap; flag it if not.

## 4. Test cases (all local, no network)

| scene | expectation |
|---|---|
| `ksi-y-m-yn` | **Must not regress.** Piłsudskiego · Śmigłego-Rydza · Milionowa · Kilińskiego → `closed: true`, 4 corners, 0 gaps, 129 ha. |
| `centrum` | The spine case. Should close with Piotrkowska selected. |
| `hipointe-demun` | Two neighborhoods stacked; carries the repo's only hand-authored polygon (4 pts) + 16 activates. **Do not overwrite them.** |
| `lafayette-square` | Coarse 26-pt gazetteer ring; a sanity check that the resolver isn't tuned to dense grids. |

`scratch/probe-ksiezy-boundary-ring.mjs` replicates the resolver read-only and prints per-corner verdicts — use and extend it rather than testing through the UI.

## 5. Where the code is

- `cartograph/serve.js` — `computeBoundaryFromSelection`, `streetNamesFor`, `streetsGeomFor`, `getStreetLookup`, `POST /:scene/boundary-from-streets`.
- `src/cartograph/ExtentApp.jsx` — `ExtentClickableStreets` (the map layer), the Boundary panel section, `adoptStreetRing` (ring → `polygonLL`, lon/lat).
- Pre-Bake the resolver reads `clean/street-index.json` (welded, **unsimplified**, named chains + junctions); post-Bake it reads `clean/skeleton.json`. Both go through `getStreetLookup`. Unsimplified is deliberate — the picker wants the road as digitized.

## 6. Deliver

1. The resolver handling partial edges, order-independent.
2. The four test cases above, with `ksi-y-m-yn` proven non-regressed.
3. Whatever the gaps report becomes — it must still name the street and the reason.
4. A short writeup: what the model is now, what it still can't express, and whether the divided-crossing weld landed or was deferred.

## 7. Rules

- **Confirm alignment with Jacob before writing code** (`CLAUDE.md §Standup before code`). Describe the model you intend in plain language first.
- Everything inside `lafayette-square.nosync/`. **Do not start a dev server** — one is running.
- ⚠️ **Do not dispatch yourself into a worktree** until the stale-worktree cleanup in `cartograph/BACKLOG.md §NEXT` is done — 25 stale trees, and an isolated dispatch on 2026-07-20 landed on a months-old branch and silently did nothing.
- Name yourself in the writeup.
