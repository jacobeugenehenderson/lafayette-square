# BRIEF: the monument lights up (the first Displays plugin, H-36)

<!-- BRIEF-STATE
status: OPEN — premises checked; reshaped by Jacob's rulings 2026-10-30; plan owed before code
dispatched: Tinsel (fresh, 2026-10-30: "I feel it should be someone with new context"), reporting to Boz
evict-when: Provincetown's Stage has a Displays section holding a Light Show plugin on the Pilgrim Monument; its setups
and running order are authored there, in the town's data (no Provincetown code); the show plays the same moment for every
viewer from the town's clock, on in the town's season from its published calendar; Jacob has watched it on his phone on
staging, at night, in the views a visitor has today; checks prove the clock rule, the no-per-town-code rule and the
calendar route. Then this moves to cartograph/_archive/ dated, and ROADMAP H-36 is rewritten to what shipped.
-->

**Agent: Tinsel.** Report to Boz; code gets Zob's review before merge. `CLAUDE.md` Layer 0 first: a KIT plugin that
Provincetown is first to use, never a Provincetown patch.

## 0. The ask, in Jacob's words

- 2026-09-25: *"Something the real pilgrim monument does every year is put christmas lights down from the top in a
  conical shape like a big christmas tree… We could even program a light show with different patterns and animations.
  We could play it in times when people would have to be watching… we could create must-see internet."*
- 2026-09-26: *"A TOTAL opportunity to do something beautiful and sweet."* · *"the user could watch the display from
  beneath."*
- 2026-10-30, the shape: *"like 20+light setups with transitions"* · *"a section called … "displays" and inside that
  it's like plugins in aftereffects"* · *"everybody gets fireworks"*. Filed as rulings, with his full words:
  `references/registry.json` → `q-how-a-town-authors-a-display`.
- The design notes in `ROADMAP.md` H-36 still hold where the rulings don't supersede them.

## 1. The shape (ruled 2026-10-30)

- **Displays** is a Stage section in every town, with no descriptive text under it. Its contents vary by town: what that
  town has added (`r-displays-is-a-stage-section-of-plugins`).
- **Each display is a plugin**, like an After Effects effect. The plugin is kit code (its motions and transitions); every
  town may add any plugin. The first three: **Light Show** (this brief), **Fireworks**, **Street Arches**.
- **A show is LOOKS separated by TRANSITIONS** (`r-a-show-is-looks-separated-by-transitions`). Two drawers, both the
  town's, not a cross-town library (`r-a-displays-setups-belong-to-its-town`):
  - **Looks:** named SVGs at the display's FRAME resolution, one pixel = one bulb. The frame is the cone unrolled: the top
    edge is the crown's four sides, the bottom edge the ground circle; columns are strands, rows are bulbs. Each look
    carries one built-in motion: still · fall · rise · spin · twinkle · pulse · strobe (`r-a-look-carries-one-motion`).
    ⛔ No per-bulb editor in the panel; a look is drawn in a vector app on a template with the grid marked.
  - **Transitions:** kit code, and they should be cool. At least: cascade from the crown · rising spiral · iris · curtain
    sweep · sparkle dissolve · melt · twirl · strobe flash · blackout-and-bloom · shatter to twinkle · rising stripes ·
    expanding stripes · drop-in stripes with a bounce. **Strobe is also an accent** a transition carries at its dynamic
    moment (the leading edge of a melt, a stripe's landing).
  - **The system creates the initial set:** 20+ looks and the transitions above.
- **Looks are abstractions, never pictures** (`r-looks-are-abstractions`): colour-blocked and conceptual. Santa, bottom
  to top: white (boot tops) · red (pants) · white (coat trim) · red (coat) · black belt with gold buckles · red · white to
  the crown. Motifs: snow, snowflakes, gifts, Frosty, Santa, Rudolph, Hanukkah, Kwanzaa, candy, peace, holly, bells,
  stars, plaids, bows, and more. Jacob reviews them as a contact sheet before they go on the tree.
- **The tree glows WHITE; the show is COLOUR** (`r-the-tree-glows-white-and-the-show-is-colour`). The glow is a white
  Christmas tree; a show opens with a magical transformation into 2–3× as many full-colour strands, and reverses at
  the end. The real tree is 20 strands, 5 a side, ~3,000 bulbs, hanging from the BALCONY RIDGE; the pinnacle above it
  carries the show too (`r-the-strands-hang-from-the-ridge-and-the-pinnacle-carries-the-show`). The show has **60 colour strands** (3× real).
  A look is layers, each with one motion (`r-a-look-is-layers-each-with-one-motion`). Season: from **November 11**,
  authored, not sourced (`r-provincetown-light-season-is-authored`). ⚠️ Open: the ground ring's radius. Bulbs are always bright
  and visible from all around the town (Jacob: like 120 W bulbs), and one average glow of their colour washes
  everything around them; where they are too close to tell apart, their glows merge into a smooth image. ⛔ No switch to a flat
  image at distance; a far bulb keeps a minimum size and glow so it never drops out.
- **A show is what a display MAY do, not what it is.** The Light Show glows all season and plays timed shows; arches play
  none (`r-a-show-is-what-a-display-may-do-not-what-it-is`).
- Look names are drawer labels; visitors never see them. A glyph that must be seen from every side (Santa's buckle)
  repeats on every face.

## 2. What the code says (checked 2026-10-30; confirm again at build, by symbol)

- **The Ward draws the slot.** The Ward's `Scene.jsx` mounts the kit's `<Town>`, which mounts `<SetPiece>` in
  `town:setPieces`. `SetPiece` mounts `<SetPieceUplights>` as the renderer's child, in its base frame. The renderer's
  `extent` (`topM`, `halfWidthM`) and `children` are where a set-piece display attaches, so it is model-agnostic and
  works with the artist's .glb.
- **The clock is live; read it, never write it.** `<Town>` mounts `TimeTicker` (`SkyTickers.jsx`) whenever `time` is not a
  Date, and it ticks `useTimeOfDay` every frame. Ward measured provincetown.online, so this is not just read in the
  source. A show reads `useTimeOfDay.currentTime` (live, or the visitor's scrubbed instant) through `townClockOf`.
- **The season comes from the published calendar.** Agreed with Ward: `<Town calendar>` receives the town's published
  `events.json` rows alone, not the merged set (an announcement must not switch a display), and `null` until it has
  answered (display off, no refusal). The kit reads `id`, `start_date`, `end_date` (absent = `start_date`), as dates on
  the town's clock. An unknown season id refuses by name. Provincetown has no `events.json` yet. The real lighting dates
  are researched with a source; if there is none, the operator authors them and they are labelled as authored (H-31).
  Ward wires `Scene.jsx` once the prop exists.
- **The Street view is not v1** (Boz: Ward's band; the Ward has no street screen). v1 is judged in Hero and Browse. A
  display's data keeps `viewingSpots` for the street screen later.
- **No plugin concept exists in the kit.** The nearest pattern is `SetPiece.jsx`'s `kind → renderer` table. Build a
  narrow seam for the Light Show first; Fireworks and Arches test it. ⛔ No framework designed in advance.
- **Arches attach across a street:** their span reads the street's authored width at that spot, never a constant
  (Layer 0).

## 2a. Owed (Zob's review, 2026-10-31)

- **In the next LightShow commit:** `tmp.v` and `tmp.w` are left over from the removed terrain re-seat; delete them.
- **Before Stage writes the record:** `placed` is a one-shot boolean. Key the bulb placement on the strand ends and
  counts, so a changed record lays the bulbs again (today a new instancedMesh would sit every bulb at the origin).

## 3. Standup before code

Held 2026-10-30 (the plan to Boz; the rulings above are its outcome). Before the tree: the looks as a contact sheet for
Jacob. Order: the pure core and its checks → the bulbs in the slot, in Stage → the bake carries `displays` → the
Displays panel (two drawers and the show strip) → `<Town calendar>` with Ward → phone frame time → PTown's season dates.
Later: the ticker's next showtime (Ward) · the Street view · Fireworks (closed-form sparks, a camera flight with the show).

## 4. Gates

- Same town-clock instant → same light state (a check that reads the clock source; a mutant on the viewer's clock → RED).
- No town name, id or coordinate in plugin code: a check reads the plugin sources, with a mutant.
- Looks and the show are read from one authored place; an unknown look, motion, transition or season, or a look not at
  the frame's resolution, refuses by name (no silent default).
- The calendar prop is fed from the published calendar, never the merged set (Ward's check, with a mutant feeding
  `events`).
- Phone frame time with the show running vs the same scene with it off.
- Jacob's eye on staging, on his phone, at night.

## 5. Bounds

Worktree `.claude/worktrees/tinsel`, branch `tinsel/displays` from `integration/2026-10-20`; merge integration in
before handing it to Boz. `git commit -- <paths>`. ⛔ No publish, Promote, upload or deploy: those are Jacob's. No new
dev server without Boz's word. Registers: FEATURES (Displays, in a marketer's words) and OPERATIONS (how a town adds a
display, draws a look and builds a show).
