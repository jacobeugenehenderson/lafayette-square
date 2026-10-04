# OPERATIONS excisions — 2026-10-04 (Compass, Phase 2 A: Stage by URL)

Superseded entries, kept verbatim for the record. Live home: `cartograph/OPERATIONS.md` (*Stage — the look tool* ›
**Open Stage by URL** · *Camera / Shots* · *Bake*). Why: the address now names the shot and follows you (Jacob's ruling,
2026-10-04: the URL's shot, then the saved shot, outrank "a reload lands in Hero"); entering Stage measures the slab's
age from the bake's own plan; "Stage →" bakes first and navigates after, which the code always did.
▶ `node checks/claims-a-stage-entry-knows-its-slab-age.mjs`

- **Open a town by link:** `cartograph.html?look=<id>` opens that Look and its town (or `?scene=<town>`). A link naming no Look, or a `?look=` whose town disagrees with `?scene=`, opens **no** town and says why — it never falls back to the default one. With no link and no town last open, Stage opens **no** town: the Look menu reads **Choose a town**, lists every town, and opens itself. ▶ `node checks/claims-a-look-link-opens-that-town.mjs`

Stage opens on the **opening keyframe**: Designer's "Stage →" and a reload in any Stage shot both land in Hero, on the first key, paused.

- **Bake buttons** — Designer's **"Stage →"** = navigate to Stage on the opening keyframe immediately, bake async in the background (the slab refreshes when done).


## Lens, Phase 2 B: the Browse frame (2026-10-04)

Superseded *Camera / Shots* › **Browse camera**, verbatim. Live home: the same entry. Why: the frame is authored by a button and
read by every runtime; the "not remembered" arc closed (`_archive/STAGE-browse-frame-5.1-2026-10-04.md`).

- **Browse camera** — the overhead default: **Center X / Center Z** (the look-at point; numeric inputs, click-to-edit or drag-to-scrub), **Altitude** (the slider reaches twice the town's own overhead fit, `townRange.js#browseFitAltitude`), **FOV**, and **Heading** (screen orientation — the one fully-baked camera channel today). ⛔⛔ **THE FRAME IS NOT REMEMBERED, AND AN ATTEMPT TO FIX THAT IS IN THE TREE UNPROVEN (2026-09-09).** Browse's pose is *derived* every time you enter it — handed off from the Designer's live pan/zoom, else fitted to the whole neighbourhood — so **a series of screenshots cannot be made to line up**, and any entry the hand-off does not cover silently gives you the whole-neighbourhood overview with no error. ⚠️ A `browseFrame` design field + the wiring is in the tree: **it DOES record** (the frame lands in `design.json`), but it **does not apply on the Designer → "Stage →" → Browse path**, which is the only path that matters here — the hand-off outranks it by design. Do not rely on it and do not cite it as shipped — `STAGE.md §5.1`.
