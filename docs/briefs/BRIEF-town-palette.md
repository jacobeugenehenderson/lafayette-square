<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-27
evict-when: RULING: every town's neon, categories and rating mark come from its Look, and Jacob approves the rating-mark shortlist
-->
# BRIEF — Each town's colours are its own

**For:** a fresh agent, in the kit. **Written:** 2026-09-27. **Works under:**
`BRIEF-ls-bleed-excision.md` — this is one instance of that class; read it first.
**Spec it serves:** The Ward's `README.md` §5, "Two palettes, never mixed".

## The rule (Jacob, 2026-09-27)
*"The color scheme for the hood comes from the decor of its buildings and the vibe. Neon /
categories in particular. The neon is meant to convey things about the neighborhood, not the
portal."* And: the CSS must be generic.

## Premises — confirm, and say what you found
1. **One global palette served every town** — CONFIRMED 2026-09-28 (Mortise): `CATEGORY_HEX` (the Victorian palette,
   i.e. Lafayette Square's decor) fed the neon's fallback, `SceneNeon`'s gate, Stage's swatch defaults, and the old
   player's panels. (`LafayetteScene.jsx` no longer read it — stale here.)
2. **Styles are keyed by the colour's own name** (`COLOR_CLASSES`, "keyed by Victorian color
   name"), so a town whose dining neon is teal would still be styled `claret`.
3. `UNKNOWN_HEX` (slate, for unclassified buildings) exists to make "unknown" visible. That is
   correct and stays.

## The work
- ⚠️ **FALSE PREMISE, corrected 2026-09-28: the channel ALREADY EXISTED** — the Look's `materialColors.neon_<category>`
  (Stage › Surfaces › Neon, baked into `scene.json`, read by NeonBands). No town had authored it. It IS the palette; no
  second channel was added. **Built:** `src/lib/categoryColor.js` decides a category's colour (the Look's, else the
  kit's neutral default) for the neon, Stage's swatches and the manifest (`19c10388`, and the bake side). LS's current
  look was written into its Look as its own (`072990bb`). ▶ `node checks/claims-a-towns-colours-are-its-own.mjs`
- **A neutral default that reads as unauthored** — visibly, never another town's decor.
- **Tokens named by role**: a category's colour is `category.<id>`, never `claret`.
- **The taxonomy's own text is generic too.** `categories.js` subtitles name one town's places
  (the parks subtitle names its park). Subtitles come from the town's data or say nothing.
- Lafayette Square keeps exactly its current look, now as **its** authored palette.
- **The manifest carries it:** `taxonomy.categories[].color` (hex), one per category, from the same Look the map
  reads. The Ward's chips read that key and nothing else; a category without it is reported, never drawn.

### And the town's categories and types (added 2026-09-27)
The same rule covers the taxonomy's **words**, not just its colours. The town manifest
(`cartograph/bake-manifest.mjs`, v0) carries `taxonomy: { authored, categories[{id,label,types}] }`;
today every town gets the kit's list with `authored: false`. ⚠️ **Open, for Jacob:** who authors a town's
own list (a Host through Operations, or the operator in Stage), and where it lives before the bake reads
it. Whoever authors it, the manifest carries it and `authored` turns true.

### Finding (Quire, 2026-09-27): a town's content uses ids its taxonomy doesn't have
Huron's published listings and roster carry category/type pairs the kit's taxonomy lacks
(`services/automotive`, `shopping/retail` — `retail` exists only under `commercial`), null types in parks,
services and dining, and 13 listings + 345 roster buildings with no category at all. Lafayette Square's
content adds `parks/pavilions`, `services/hotels` and `services/wellness`. The Ward shows them
under a plain "Not in a category" heading and reports the unknown ids — it never guesses a home.
⚠️ The producer (`cartograph/bake-content.js`) emits ids the taxonomy it ships beside does not define.
**Check to add:** every category and type id in a town's published content exists in that town's manifest
taxonomy, or the bake fails naming them.

### And the town's rating mark (Jacob, 2026-09-28) — part of the Look, not yet planned in
*"The town picks whatever they want and we put it in a vignette"* · *"the town can choose and change any time"* ·
*"the emoji is another part of the town's Look."* Lafayette Square's is ⚜️; the kit's neutral default is ⭐.
- A **Look channel** (`ratingMark`, one emoji), authored in Stage beside the palette, saved in the Look's
  `design.json`, baked into `scene.json`, and surfaced in the town's manifest so the player reads it without
  the authoring file. Changing it is re-authoring the Look.
- The PLAYER draws it: a round vignette whose field is chosen at runtime by measuring the glyph's legible ink
  on the device (never derived from the emoji's colours), and half-cut (full colour | desaturated) for halves.
  That half is the Ward's (Quire); this brief carries only the channel.

### And the town's lit tint (Warden → Jacob, 2026-09-28) — the RENDERER half is built, the channel is not
- A **Look channel** `litTint` = `{ color, strength }`: the roof tint a lit set (<Town litIds>, a chosen category or
  a search) and the selected building take, day and night (`SlabBuildings.jsx` litUniforms, 92a68e41). Read from
  `scene.litTint`; absent, the kit's neutral `LIT_TINT_DEFAULT` (#f2c14e at 0.45 — no town's). ⛔ Not yet authored
  in Stage nor carried through the bake: same path as the palette and the rating mark. Jacob's eye picks the default.

## Checks
- No colour literal in `categories.js` or any neon consumer; every category colour is read from
  the look.
- A town with no authored palette renders the neutral default (render it, don't assume it).
- No token or class is named after a colour.

## Docs
The Ward's `README.md` §5 already states the rule. Rewrite `cartograph/STAGE.md` for the new
channel and `cartograph/FEATURES.md` for the capability ("each neighbourhood's neon is its own").
