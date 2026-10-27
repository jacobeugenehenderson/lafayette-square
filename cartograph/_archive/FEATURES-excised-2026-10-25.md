# FEATURES.md sentences excised 2026-10-25 (the coast moved from OSM to the lidar: BRIEF-the-shore-is-one-line step 1)

- "A town on the water": *This one reads the shoreline out of the same map data as the streets and treats it as what it is: **a real edge of the land.***
- *​**A lake and an open sea are read the same way even though the map records them differently** — a lake is drawn as a closed body, while an ocean coast is only ever a set of loose shore fragments with the land on one side, so the kit stitches those fragments back into one shore and takes the water from it.* (The stitching is coastline.mjs's, which is now only the lidar coast's verifier.)
- As-built pointer: *the shoreline module is `coastline.mjs`.*
