# OPERATIONS excisions — 2026-10-04 (Compass, Phase 2 A: Stage by URL)

Superseded entries, kept verbatim for the record. Live home: `cartograph/OPERATIONS.md` (*Stage — the look tool* ›
**Open Stage by URL** · *Camera / Shots* · *Bake*). Why: the address now names the shot and follows you (Jacob's ruling,
2026-10-04: the URL's shot, then the saved shot, outrank "a reload lands in Hero"); entering Stage measures the slab's
age from the bake's own plan; "Stage →" bakes first and navigates after, which the code always did.
▶ `node checks/claims-a-stage-entry-knows-its-slab-age.mjs`

- **Open a town by link:** `cartograph.html?look=<id>` opens that Look and its town (or `?scene=<town>`). A link naming no Look, or a `?look=` whose town disagrees with `?scene=`, opens **no** town and says why — it never falls back to the default one. With no link and no town last open, Stage opens **no** town: the Look menu reads **Choose a town**, lists every town, and opens itself. ▶ `node checks/claims-a-look-link-opens-that-town.mjs`

Stage opens on the **opening keyframe**: Designer's "Stage →" and a reload in any Stage shot both land in Hero, on the first key, paused.

- **Bake buttons** — Designer's **"Stage →"** = navigate to Stage on the opening keyframe immediately, bake async in the background (the slab refreshes when done).
