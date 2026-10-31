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
- **Setups belong to the town's instance**, not a cross-town library. The section lets the operator see, create, edit and
  delete them; Provincetown expects 20+ with transitions (`r-a-displays-setups-belong-to-its-town`).
- **A show is what a display MAY do, not what it is.** The Light Show glows all season and plays timed shows; arches play
  none (`r-a-show-is-what-a-display-may-do-not-what-it-is`).
- **A setup only combines the plugin's built-in motions** (and its transitions); no hand-drawn motion
  (`r-a-setup-composes-its-plugins-motions`).

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

## 3. Standup before code

Bring Jacob, through Boz: the plugin seam in one paragraph; the Displays section in Stage (a sketch); what a viewer sees
and when; the first motions and transitions; how someone finds the show (the appointment, through the ticker's season
entry); and a still from `:5173`. ⛔ No build before his yes.

## 4. Gates

- Same town-clock instant → same light state (a check that reads the clock source; a mutant on the viewer's clock → RED).
- No town name, id or coordinate in plugin code: a check reads the plugin sources, with a mutant.
- Setups are read from one authored place; an unknown motion, transition or season refuses by name (no silent default).
- The calendar prop is fed from the published calendar, never the merged set (Ward's check, with a mutant feeding
  `events`).
- Phone frame time with the show running vs the same scene with it off.
- Jacob's eye on staging, on his phone, at night.

## 5. Bounds

Worktree `.claude/worktrees/tinsel`, branch `tinsel/displays` from `integration/2026-10-20`; merge integration in
before handing it to Boz. `git commit -- <paths>`. ⛔ No publish, Promote, upload or deploy: those are Jacob's. No new
dev server without Boz's word. Registers: FEATURES (Displays, in a marketer's words) and OPERATIONS (how a town adds a
display and authors its setups).
