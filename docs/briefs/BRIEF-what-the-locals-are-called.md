<!-- BRIEF-STATE
status: OPEN
dispatched: yes (Tally, 2026-10-05) — built in both repos; owed: bake-scene + bake-manifest for every town (Boz's held pass), the pin move, Jacob's eye
rulings: (Jacob, 2026-10-05) only where the Ward NAMES the standing, never prose ("be a local") · Visitor HELD — no Ward text names visitors, so the field waits for the first that does · words shown as written, capitals and all
written: 2026-10-05
evict-when: every town's manifest carries look.locals after the bake pass and the pin move; Jacob has seen a town (e.g. Provincetown) call its locals the word he chose in Identity, and LS still say "Townie". (Built: the Identity field with the kit default Local / Locals · the Ward reads it wherever it names the standing · the Ward composes the not_townie refusal · theward checks/the-town-names-its-locals.mjs, mutation-tested · LS declares Townie. Visitor is held, see rulings.)
-->

# BRIEF — What a town calls its locals, and its visitors

**Boz the Younger drafted this 2026-10-05; Jacob dispatches.**

## Who you are, and the bounds

**You are the dispatched agent. Name yourself: one word, yours, not one a RUNNING session holds** (`ListAgents`; ask Jacob to
`/rename`). **Agent: FRESH.**
- Two repos: the kit (this one) and the Ward (`~/Desktop/dev.nosync/theward`). Ports 5173 / 5180; reuse the running servers.
- ⛔ **No bakes or pours.** A broad re-bake is held until every agent is finished; tell Boz when your change needs `bake-scene`, and it
  runs in that pass. A kit change reaches the Ward at the next pin move, which Jacob confirms.
- Commit only your paths. **Three-part fix.** Registers: `cartograph/OPERATIONS.md` (the Identity knobs) · `cartograph/FEATURES.md` ·
  the Ward's `FEATURES.md`.

## The ask (Jacob, 2026-10-05)

*"In the ID section of the cartograph … choose what the locals are called? 'Townies' could be 'Locals' and 'Visitors' could be
'Washashores'."* Ruled: **the kit default is Local / Visitor** (not "Townie", which is LS's voice).

## The path that already exists (read by Boz; confirm)

- **Kit:** the Identity panel `src/cartograph/IdentityPanel.jsx` authors the Look's `identity` (mark, accent, rating mark, lit tint)
  into `design.json` → `cartograph/bake-scene.js` (~:88, "how the town looks") → `cartograph/bake-manifest.mjs:19` (the manifest's
  `look` block) → the Ward reads `manifest.look` (`theward/src/town/accent.js:12`, `theward/src/content/ratingMark.js`).
  ⭐ Add the words on exactly that path: no second channel.
- **Ward, visible "Townie" text** (`git grep -n -i townie -- src` in theward): `src/place/Place.jsx:228` (rating line, with its own
  plural) · `src/society/PlaceList.jsx:74` · `src/you/You.jsx:31–41` · `src/you/standing.js:31` · `src/you/Vignettes.jsx:28`
  (`STANDING_NAMES`) · `src/arrival/CheckIn.jsx:36` · `src/place/Reviews.jsx:55`. "Visitor" visible text: find it by grep.
- **The server writes words too:** `apps-script/Code.js:630` returns *"Become a Townie to post reviews…"* with status `not_townie`, and
  `Reviews.jsx:55` shows `data.message`. ⇒ **the Ward composes that sentence itself from the status code** using the town's word; the
  server never learns what a town calls its people.

## Rules

- **Words, not identifiers.** `counts.townies`, `is_local`, `not_townie`, the `townie` standing key, the `--vig-townie-*` CSS tokens
  stay exactly as they are; only visible text changes.
- **Singular and plural are both authored** ("Washashore" / "Washashores"); never derive a plural by appending "s".
- **No fallback to LS:** an unset town shows Local / Visitor. ⚠️ **LS currently says "Townie"**: keep it by **declaring** Townie /
  Townies in LS's Look (as LS declares its Victorian lamp), and say so in the commit. Ask Jacob before declaring it on any other town.
- An empty field in the panel means "the kit default", shown as such, and ↺ returns to it.

## Done

1. The four fields in Identity, live in Stage, with defaults shown.
2. Baked into the manifest's `look` block; the Ward reads them on every visible string listed above.
3. The review refusal is composed by the Ward from `not_townie`.
4. A check reading the Ward source fails on hard-coded visible "Townie"/"Visitor"; mutation-tested.
5. Jacob sees Provincetown call its locals what he chooses (e.g. "Washashores" for visitors) after the bake pass and pin move.

**Confirm-then-build:** read the code sites, tell Jacob what you found, and stop if the code contradicts this brief.
