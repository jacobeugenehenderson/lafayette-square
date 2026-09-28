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

## Checks
- No colour literal in `categories.js` or any neon consumer; every category colour is read from
  the look.
- A town with no authored palette renders the neutral default (render it, don't assume it).
- No token or class is named after a colour.

## Docs
The Ward's `README.md` §5 already states the rule. Rewrite `cartograph/STAGE.md` for the new
channel and `cartograph/FEATURES.md` for the capability ("each neighbourhood's neon is its own").
