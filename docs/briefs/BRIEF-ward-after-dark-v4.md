<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-29
evict-when: Jacob approves "The Ward, After Dark" v4 and Warden's build brief (BRIEF-ward-society-pass §B) can start
-->

# BRIEF — "The Ward, After Dark" v4: one header, the peek, compact rows

**You are the dispatched agent. Name yourself** — one word, yours, not one a running session holds
(check with `ListAgents`, then `/rename`). **Agent: FRESH** — no live session drew v3, and this is a
design pass, not a build.

**Asked by Jacob, 2026-09-29**, reviewing Provincetown and Huron on the Ward on staging. The consumer side
must be *"very attractive and feel very established"*; **readability and access are the touchstones.**

## Read first — confirm, then design
- **The reference:** the mock **"The Ward, After Dark" (v3)**, https://claude.ai/artifact/4cp1o7pkZWaAd3BEiiAcSM
  (read it with the Artifact tool's `read`). **v4 is a revision of it, published to the same URL** — not a
  new artifact.
- **The Ward's README** (`~/Desktop/dev.nosync/theward/README.md`): **§2** (the screens, Leisure, the
  doors), **§3** (the calm rule, Society act by act, the categories), **§5** (how it looks), **§6**
  (accessibility: 14 px, 7:1, 44 px targets). ⛔ §6 is a floor, not a style.
- **What ships now:** `staging.theward.online/provincetown/` and `/huron/`. Look at it on a phone width.
- **The old header, for the hybrid:** the old player's header is the one Jacob calls *"more elegant, and
  it sat better next to ◉."* Find it in the kit's legacy player (`src/` in `lafayette-square.nosync`;
  it is what `provincetown.online` serves today) and put it side by side with v3's.
- Code the design will land in: `src/app/Ticker.jsx` (the ticker, the Explore door at `:32–36`, the kicker at
  `:89`), `src/app/Corners.jsx` (◉), `src/society/SearchRow.jsx`, `src/society/PlaceList.jsx`,
  `src/styles/{ticker,categories,tokens}.css`.

Report what you found to Boz before drawing. If the code or README contradicts this brief, **stop and flag it.**

## Rulings in hand (Jacob, 2026-09-29) — design to these, don't reopen them
1. **The Explore ruling is replaced.** README §2's *"a grip labelled ⌕ Explore"* goes. The header is the
   **same arrangement on every screen**: ticker · search · ◉. **On Leisure the search field is the door** —
   tapping it opens Society with the field focused. The oversized Explore button disappears, it is not shrunk.
2. **No pills in the header.** The space should read as one composed bar, not chopped into capsules. A
   hybrid: the old player's calm, v3's type and tokens.
3. **The ticker's counter goes** (`HAPPENING NOW · N` reads like an age). Whether the "Happening now" label
   earns its place at all is **your** call to propose — Jacob doesn't love it.
4. **The peek.** The calm rule's purpose is *no unwanted navigation*, not *no touch*. So:
   - Tapping a building — **in Society, and in the Leisure movie** — shows a small **peek**: that place's
     list row, lifted, with the → to its place card. The tap only selects; the → is the one control that goes.
   - **It is pinned to the screen, not to the building** (the movie moves; a bubble on the building would chase it).
   - ⭐ **The peek is DOT-COORDINATED with its building:** the peek carries a dot, and its building carries
     the matching dot on the map/movie, so the eye pairs them without a leader line. Design the pair —
     colour source (the category's `detail` colour is the obvious one — §5's "neighbourhood's colours"),
     size, how the building's dot reads over neon and at night, and under reduced motion.
   - In Society, where the row already comes to the front of the list on a tap, say when the peek is
     needed at all (e.g. only when that row is scrolled out of view).
   - ⛔ Keep: the first touch on a **resting** Leisure only wakes it.
5. **Society rows take too much space.** Jacob's idea, not binding: three rows visible, the first and last
   shortened to one line, the middle two lines with a full-size (coloured?) icon. **Boz's counsel, also not
   binding:** let **selection**, not position, expand — every row compact (dot · name · status, one line,
   44 px), the selected row two lines with the full icon. A fixed wheel fights scrolling and screen
   readers. Weigh both and propose one.

## Not in this pass
- **Ratings — ruled (Jacob, 2026-09-29): the town's emoji IS its rating mark AND its map ID** — one value,
  `look.mark` (Provincetown 🦞). Draw ratings with a placeholder town emoji; ⛔ never a specific town's mark
  baked into the Ward's design. The wiring is Warden's and Lintel's (BRIEF-ward-society-pass §C).
- Explore's camera move and framing (Warden's build brief, §A).

## Deliverable and bounds
- v4 at the same artifact URL: Leisure (awake + resting), Society (nothing chosen, a category chosen,
  a building tapped → peek), Place's header, Bulletin's header — **phone first, then wide.**
- Every text and control in it passes §6; where a v3 value fails, say so beside it (as v3's tokens did).
- A short note to Boz: what changed from v3, and **which README lines v4 supersedes** (§2's Explore, §3's
  "the map never launches anything"). ⛔ You don't edit the README; Warden does, with the build.
- **No code, no commits** in either repo. **DoD is Jacob's eye on the mock.**
