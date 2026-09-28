# BRIEF — Each town's colours are its own

**For:** a fresh agent, in the kit. **Written:** 2026-09-27. **Works under:**
`BRIEF-ls-bleed-excision.md` — this is one instance of that class; read it first.
**Spec it serves:** The Ward's `README.md` §5, "Two palettes, never mixed".

## The rule (Jacob, 2026-09-27)
*"The color scheme for the hood comes from the decor of its buildings and the vibe. Neon /
categories in particular. The neon is meant to convey things about the neighborhood, not the
portal."* And: the CSS must be generic.

## Premises — confirm, and say what you found
1. **One global palette serves every town.** `src/tokens/categories.js` declares a "Victorian
   palette" (Claret · Antique Gold · Aubergine · Verdigris · Mauve · Prussian Blue · Terra Cotta ·
   Sage), exported as `CATEGORY_HEX` and consumed by the neon (`SceneNeon.jsx`, `NeonBands.jsx`),
   `LafayetteScene.jsx`, `src/cartograph/CartographSurfaces.jsx`, and the old player's own
   panels. ▶ `grep -rln "CATEGORY_HEX\|COLOR_CLASSES" src`
2. **Styles are keyed by the colour's own name** (`COLOR_CLASSES`, "keyed by Victorian color
   name"), so a town whose dining neon is teal would still be styled `claret`.
3. `UNKNOWN_HEX` (slate, for unclassified buildings) exists to make "unknown" visible. That is
   correct and stays.

## The work
- **The palette becomes the town's authored value**, carried with its look (authored in Stage,
  baked into `scene.json` like every other look channel — confirm the channel pattern in
  `cartograph/STAGE.md` before adding one).
- **A neutral default that reads as unauthored** — visibly, never another town's decor.
- **Tokens named by role**: a category's colour is `category.<id>`, never `claret`.
- **The taxonomy's own text is generic too.** `categories.js` subtitles name one town's places
  (the parks subtitle names its park). Subtitles come from the town's data or say nothing.
- Lafayette Square keeps exactly its current look, now as **its** authored palette.

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

## Checks
- No colour literal in `categories.js` or any neon consumer; every category colour is read from
  the look.
- A town with no authored palette renders the neutral default (render it, don't assume it).
- No token or class is named after a colour.

## Docs
The Ward's `README.md` §5 already states the rule. Rewrite `cartograph/STAGE.md` for the new
channel and `cartograph/FEATURES.md` for the capability ("each neighbourhood's neon is its own").
