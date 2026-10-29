# OPERATIONS lines retired 2026-10-28 (BRIEF-the-arch-stands-where-it-is)

Superseded by the live `cartograph/OPERATIONS.md` Horizon card ("Arch").

## Arch placement (retired: the Distance is derived from the Arch's real geographic spot)

> - **Arch placement** (non-TOD) — the Gateway Arch's **Distance**, **Scale**, **Rotation**, **Y-offset**, and **Foot-fade** (where the legs dissolve into the ground).

The distance and bearing were hand-set (LS: 1690 m at (0.9487, −0.3163); the real Arch is 2866.5 m out at (0.9426, −0.3340)),
and the kit's defaults were LS's. Scale, Rotation, Y-offset and Foot-fade stay (Jacob, 2026-10-28).

## The Survey Hero picker (retired: focus lives only on the keyframes)

> - ⭐ **The Hero subject picker offers THIS town's own landmarks** *(2026-09-19)*. Survey ▸ Hero lists: the **Neighborhood Centroid**, the **Gateway Arch** only if this Look installed an `arch` channel, a **backdrop** only if this Look has a baked landscape, and **this installation's own listings** — never another town's (`node checks/claims-hero-subject-resolves-in-its-own-slab.mjs`). ⚠️ **The camera does not read this designation** (2026-09-26 — shots are your keyframes, below); today it only chooses which knobs the Stage **Horizon** card shows (the backdrop's, else the Arch's).

> **Focus** (as it read): "… the town's hero (Survey › Hero), the Arch, or a building / set-piece … the first key is the hero … else the hero … **No hero and no key focus ⇒ the blur is the TOWN's**".

`heroSubject` was a town-wide designation; a key with no focus inherited it ('hero' was a focus id) and the Horizon card chose
its knobs by its kind. `scripts/migrate-arch-stands.mjs` moved each Look's object hero onto its first key (LS 'arch', PTown
'osm-164024699'). The Horizon card now shows the knobs of what the Look has (a baked backdrop, an `arch` block, or both).
