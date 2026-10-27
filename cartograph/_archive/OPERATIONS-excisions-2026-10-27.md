# OPERATIONS excisions — 2026-10-27 (Kerf, the staged ground)

Superseded entries, kept verbatim for the record. Live home: `cartograph/OPERATIONS.md` (*Bake — committing the look to the slab*).
Why: the history of how the impostor pages' shipping was enforced; the live line keeps the rule and its command.
▶ `node scripts/verify-baked-in-r2.mjs`

⛔ **The pages must SHIP, and how that is enforced INVERTED on 2026-09-01.** This used to read *"do not gitignore the .ktx2 pages — the deploy is an actions/checkout, so an ignored page is a 404 in the canopy."* The whole baked tree is gitignored now and the pages ship from R2, so tracking has nothing to do with whether the canopy gets them. **The requirement is unchanged; the enforcement moved** — ▶ `node scripts/verify-baked-in-r2.mjs` reads the bucket and names any page that is absent.
