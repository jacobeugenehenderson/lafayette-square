<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-29
evict-when: §A and §C are live on staging and eye-gated by Jacob, and §B has shipped against the approved v4 mock
-->

# BRIEF — The Ward, Society pass: Explore flies to Browse, the counter goes, one emoji per town

**Agent: Warden, FRESH on the consumer look** (this window did not build `b6d6ab1`; it holds the
migration, staging and kitUrl work). The look's record: `b6d6ab1`'s message, README §5, the v3 mock.

**Asked by Jacob, 2026-09-29**, reviewing Provincetown and Huron on the Ward on staging
(`staging.theward.online/{provincetown,huron}/`, Ward `18263ff`, kit `c8e6719b`).
**Confirm, then build:** read the code named, report what you found to Boz, and if it contradicts this
brief, **stop and flag it.** Three sections; **§B waits on the v4 mock** (`BRIEF-ward-after-dark-v4.md`).

---

## §A — now

**A1. Explore flies Hero → Browse, and Browse is all overhead impostors.** Jacob: pressing Explore is
*supposed to* run the transition from the movie to the plan, and on staging it doesn't do what he expects.
⛔ **Cause not established** — measure what happens first, on staging, and say which of these it is:
- the flight itself (`src/scene/Scene.jsx` `SHOTS`, `:88–108`: `shot` → `<Town shot>`; README §2 *"the camera
  flies from the movie down to the plan and the list rises on the same curve"*) — a **regression** if it doesn't fly;
- the trees: README §11 *"Trees change drawing only between shots… Restore the Grove's pattern; don't
  build a new one"* — listed **open**, so side-on cards in the plan shot are an **unbuilt** thing, not a bug.
  The swap is the kit's (`<Town>`); if it needs a kit change, that is **Lintel's**, and you say so.
- The view Jacob gets on arrival is A3's.

**A2. The counter goes.** `HAPPENING NOW · N` reads as an age. Remove the count from the ticker's kicker
(`src/app/Ticker.jsx:89`) and from the Happening now chip (`src/society/CategoryRows.jsx:74`,
`chip__count`). Keep the label until v4 decides whether it stays.

**A3. Society opens framed on what's happening now.** Today the plan opens on the town's densest places
(`d26039d`). Ruled: it opens framed on the places Happening now lights, **by the same move** a chosen
category makes (`Society.jsx` `frame()`, `:52–53`) — so README §3's *"the only camera move the app makes
for you"* gains one occasion, arrival, and you write that line. The user then zooms and drags. ⭐ Nothing
happening now is its own case — say what the plan frames then, loudly, not a silent fallback to densest.
Flattening the terrain on arrival is **not** wanted back (Jacob: he doesn't care now).

## §B — after Jacob approves v4 (don't start before)
The header (one arrangement on every screen: ticker · search · ◉; the search field is Leisure's door;
no pills), **the peek** (a tap on a building, in Society and in the Leisure movie, shows its row lifted,
pinned to the screen, **dot-coordinated with its building**), and compact Society rows.
- ⭐ **Confirm now, so §B isn't blocked later:** does `<Town>` report a building tap on the **movie** shot,
  and can it put a mark **on** a building the camera is moving past (for the peek's dot)? README says the
  movie *"cannot be touched at all"*, so probably not. If either is missing it is a **kit** change — name it
  for Lintel, with the prop you'd want.
- **README edits land with the build:** §2's *"⌕ Explore"* door (replaced, Jacob 2026-09-29), §2's
  *"the movie itself cannot be touched"*, §3's *"the map never launches anything"*, §3's blockquote *"the movie itself cannot be touched at all"*,
  `src/leisure/Leisure.jsx`'s must-never, and §2's "absent from the first commit: map pins" (the peek's dot is
  the exception: on the roof, no stem, only while selected — Nocturne's framing) — the ruling's purpose
  was **no unwanted navigation**; the peek keeps it, because only its → goes anywhere.

## §C — one emoji per town: its map ID **and** its rating (ruled, Jacob 2026-09-29)
*"Emojis are supposed to be the ratings and the map vis ID."* **One value, `look.mark`.**
- **Today there are two channels:** the kit's `src/lib/townIdentity.js:20` `IDENTITY_CHANNELS = ['mark',
  'accent', 'ratingMark', 'litTint']`, with `ratingMark` defaulting to ⭐; the Ward's
  `src/content/ratingMark.js:62` reads `look.ratingMark`, `src/you/townMark.js` reads `look.mark`.
  ⇒ **Ward half (yours):** ratings draw `look.mark`; an unauthored mark is reported, as `townMark.js` does
  now, ⛔ never a silent ⭐. **Kit half (Lintel's):** the operator already picks the emoji in the cartograph —
  **Stage toolbar → Identity** (`src/cartograph/IdentityPanel.jsx`, `ROWS` `:29–31`), which today has
  **two** emoji rows, *Mark* and *Rating mark*. Retire the *Rating mark* row and the `ratingMark` channel
  (`townIdentity`, `bake-manifest`) in the same change, and let *Mark*'s hint say it is also what places
  are rated in. ⛔ Nothing is hard-wired per town, and nothing may become so.
- ⚠️ **Why Provincetown shows no 🦞 today (measured):** its staged manifest was written
  **2026-09-28 06:20** and has **no `look` block at all** (`identity.branding.mark` = ⚓); the 🦞 was
  authored in `public/looks/provincetown/design.json` (`1dc1e553`) after it. Huron's, re-baked today,
  carries `look.mark ⚓, markAuthored: true`. **A manifest re-bake + Publish to Staging for Provincetown
  fixes the mark — Jacob's button, no code.**

## Chain
- **Trusts:** the kit's `<Town>` (shots, the tree swap, picks) at the pinned kit sha; the manifest's `look`.
- **Trusted by:** Promote — production copies exactly what staging serves (`30bcd111`), so nothing here
  reaches provincetown.online until Jacob promotes it.

## Bounds
Ward repo only; kit changes are named for Lintel, not made. No deploy, no Promote; publish to staging
only on Jacob's go. Registers: the Ward's `README` (the rulings above), `FEATURES`, `OPERATIONS`.
**Checks:** extend the Ward's `npm run check` where a rule can be checked (no counter in the kicker; one
mark source) — mutation-test each. **DoD: Jacob's eye on staging,** with the town and URL recorded.
