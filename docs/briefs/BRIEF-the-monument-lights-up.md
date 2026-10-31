# BRIEF: the monument lights up (H-36's first effect)

<!-- BRIEF-STATE
status: OPEN
dispatched: Jacob starts a FRESH session on it (2026-10-30: "I feel it should be someone with new context")
evict-when: a light show plays on Provincetown's Pilgrim Monument, the same moment for every viewer from the town's clock;
its patterns are authored data on a kit effect primitive (no Provincetown code); Jacob has watched it on his phone on
staging, from above and from the street beneath; checks prove the clock rule and the no-per-town-code rule. Then this
moves to cartograph/_archive/ dated, and ROADMAP H-36 is rewritten to what shipped.
-->

**You are the dispatched agent. Agent: FRESH.** Name yourself one word that no running session holds (`ListAgents`),
and ask Jacob to `/rename` you. **Report to Boz** (SendMessage "Boz"). Code facts get Zob's review before merge.
Read `CLAUDE.md` Layer 0 first: this is a KIT effect that Provincetown is first to use, never a Provincetown patch.

## 0. The ask, in Jacob's words

- 2026-09-25: *"Something the real pilgrim monument does every year is put christmas lights down from the top in a
  conical shape like a big christmas tree… We could even program a light show with different patterns and animations.
  We could play it in times when people would have to be watching… we could create must-see internet."*
- 2026-09-26: *"A TOTAL opportunity to do something beautiful and sweet."* · *"the user could watch the display from
  beneath."*
- The design notes he approved are in `ROADMAP.md` H-36. Read them whole; they're the spec, not background.

## 1. What the record says. Every line is a claim: confirm it in the code, by symbol, and say what you found.

- **The strands:** lines from the monument's crown to a ground ring, in a cone. They should work on today's placeholder
  set-piece and carry over to the artist's model later (`src/setpieces/pilgrimMonument.js`).
- **The season:** a dated event on the town's calendar (`content/events.json`, ROADMAP H-31) turns the lights on when the
  real ones are on.
- ⭐ **"Must-see": every show is a pure function of the TOWN's clock**, so every viewer sees the same moment with no
  server. Patterns (chase, twinkle, colour wave, a New Year's countdown) are data. Appointment viewing, e.g. "the
  monument's show at the top of every hour in December".
- **Kit shape:** an effect is a kit primitive with authored data: where it attaches (a set-piece, a place, a point),
  when it plays (an event), which pattern. The lights ride on the set-piece's own lighting channel
  (`setPieceLight`, `SetPieceUplights.jsx`; `docs/briefs/BRIEF-set-piece-contract.md` item 3, landed `dfef20a0`).
- **Watched from beneath:** the viewer stands in the Street view and looks up. An effect is judged from the ground, not
  only from above, and may author its own **viewing spots** (where the Street camera stands and faces for that show).
- **Out of scope here:** fireworks (H-36's second effect), and the set-piece contract's open items 1 and 2 (building id,
  2D). Design so fireworks can reuse the same primitive, and say where they would plug in.

## 2. Confirm before you plan (and stop and tell Boz if any is false)

1. **Does the Ward draw the set-piece today?** Production plays the Ward player (`theward`, pinned kit bundle), not the
   kit player. Find where the monument actually renders for a visitor on provincetown.online, and whether
   `SetPieceUplights` is in that path. An effect the Ward never mounts reaches nobody.
2. **The town's clock:** find the one reader the sky and open hours already use ("the TOWN's clock, not the viewer's",
   ROADMAP 2026-09-29). The show reads that, never `Date.now()` directly in a second place.
3. **Events:** what `content/events.json` holds for Provincetown today, and how a dated event reaches the player.
4. **The Street view:** how a viewer gets beneath the monument now, and whether a camera can be authored to stand there.

## 3. Standup before code

Bring Jacob, through Boz, a short plan in plain words: what a viewer sees and when; the first two or three patterns; how
someone finds the show (the appointment); and the one-sentence kit shape. Include a still or short capture from the
dev stack (`:5173` is the kit; ask Boz before starting any server). ⛔ No build before his yes.

## 4. Gates

- Two renders at the same town-clock instant produce the same light state (a check that reads the clock source, with a
  mutant using the viewer's clock → RED).
- No Provincetown name, id or coordinate in effect code: a check reads the effect sources, with a mutant.
- Patterns are data, read from one authored place; a missing or unknown pattern refuses by name (no silent default).
- Phone frame time with the show running, measured against the same scene with it off.
- Jacob's eye on staging, on his phone, at night, from above and from the street.

## 5. Bounds

Work in a worktree under `.claude/worktrees/`, branching from `integration/2026-10-20` (kit) and, if the Ward needs a
change, from the Ward's current pin. `git commit -- <paths>`. ⛔ No publish, Promote, upload or deploy: those are Jacob's.
No new dev server without Boz's word. Registers: FEATURES (the show, in a marketer's words) and OPERATIONS (how a town
authors an effect).
