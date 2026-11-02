# FOUNDRY.md text excised 2026-10-25 (the terrain's water became the lidar's coast: BRIEF-the-shore-is-one-line step 2)

> `bake-terrain` asks `coastline.mjs` where the water is and takes **the sea as y = 0** when the town
> has a coast; with no coast the datum is the **local minimum**. ⛔ **So the terrain depends on the
> SHORELINE as much as on the raster**, and that is not an implementation detail — every
> height-above-water in the town is measured from it. ▶ the datum a town actually got:
> `cat cartograph/data/<scene>/clean/terrain.json`

> - ⚠️ **A COAST THAT MOVES RE-BAKES THE TERRAIN.** ⛔ The dirty set is a **computed import closure**
>   of `bake-terrain.js` — which reaches `coastline.mjs` — plus the town's `raw/osm.json`, never a
>   hand-listed file: a town's shore can move because the kit learned to read a shape it could not
>   read before, and a data-only list misses exactly that. (It did, once: a town kept a
>   `local minimum` datum for hours after its coast closed, and only `bake-revetment` noticed.)
