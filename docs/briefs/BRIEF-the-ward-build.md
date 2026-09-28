# BRIEF — Build The Ward, steps 1–6

**For:** a fresh coding agent. **You build in:** `~/Desktop/dev.nosync/theward` (the new app).
**You read, never write:** this repo (the kit) — except that your own scratch work, probes and notes
go **here**, under `scratch/`, never in `theward/`.
**Written:** 2026-09-27. **Status:** ready after Jacob reads it.

---

## 0. Before anything

1. **Read `theward/README.md` in full.** It is the signed specification. This brief is only the
   order of work and the facts you need to start; where the two disagree, the README wins — and
   you stop and say so.
2. **Run `npm run check` in `theward/`.** Every check is red, each with its reason. Your job is
   to turn them green by building what the README says, never by editing a check to agree with
   the code. A check changes only when the README changes, in the same commit.
3. **Premises are claims, not facts.** Every fact below was true when written. Confirm each
   against the code before relying on it, and say what you found.

## 1. The rules you will be held to

These are in the README; they are here because they are the ones a rewrite breaks first.
- **The scene can be touched, but never takes you anywhere. Only controls take you places.**
  (README §3.) Check every interaction against that sentence before you build it.
- **Nothing is copied from the old player.** Read its code to learn what a feature does; then
  write it fresh, for the Ward. Copying brings its palimpsest with it.
- **No fallbacks.** Something that cannot be resolved fails loudly. ⚠️ The old player boots
  Lafayette Square when it cannot tell which town it is (`src/instance.js`, `DEFAULT_LOOK`). The
  Ward resolves its town from its domain (and a staging path prefix), and an unknown town is an
  error screen that says so — never another town.
- **Nothing tuned for one town.** Every number that would differ between towns comes from the
  town's data or is a named product value (README §10) — never a constant that happens to look
  right on Lafayette Square.
- **All CSS lives in CSS files** (README §5): no inline styles, no `<style>` blocks, no styles set
  from JavaScript. A value that comes from data crosses as a CSS custom property and nothing else.
  The old player is full of inline styles; none of them come across.
- **No town is named in the Ward** — `checks/no-town-names.mjs`. The words are correct or gone.
- **Accessibility is the baseline** (README §6): `rem` sizes, 44 px targets, a control for every
  gesture, proper dialogs and tab lists, reduced motion honoured. Not a pass at the end.
- **A fix deletes what it replaces**, and every commit message names the register it reached
  (README §10), or says "reaches no register".

## 2. Stack — match the kit, because you import its renderer

The renderer is React Three Fiber code from the kit, so the Ward must run the same majors. Read
the kit's `package.json` for the exact ranges; at writing: React 18 · three 0.160 ·
@react-three/fiber 8 · drei 9 · @react-three/postprocessing 2 · zustand 4 · Vite 5 ·
@supabase/supabase-js 2 · suncalc 1.
- Tailwind is **not** required. Style from tokens named by role (README §5).
- **Tokens are shared with `theward-online`** (`~/Desktop/dev.nosync/theward-online/css/tokens.css`).
  Import that file; never copy its values. Where the Ward needs a token the site lacks, add it
  **there**, following that repo's rules (`theward-online/README.md` §3).

## 3. What waits on the kit

**The town itself** — the movie, Society's map, Street — is drawn by the kit's one town assembly,
which does not exist yet: `docs/briefs/BRIEF-one-town-assembly.md` (in this repo) creates it, run
by a separate agent. Until it lands:
- Build everything that is not the 3D scene. Where the scene belongs, show a **labelled,
  obvious** placeholder — "The town is drawn here once the renderer entry lands" — never a
  picture that could pass for the real thing.
- When it lands, set `theward/checks/renderer-entry.json` to its path, and replace the
  placeholders.

## 4. The backends — unchanged, and all already running

Read, don't guess: the kit's `src/lib/api.js` (Apps Script actions; every call carries `action`
and `look`), `src/lib/supabase*` and the Cary code (Supabase tables and functions), and
`ls/reference/INVENTORY-API.md`. The check `endpoints-called-or-retired` lists every endpoint the
old player calls; each must end up called by the Ward or retired **with a reason** in
`checks/retired-endpoints.json`.
- ⚠️ The old player's import graph also reaches the kit's **authoring** backends
  (`/api/cartograph/looks`, `/api/meteorologist/*`). Those are authoring, not the Ward's to call —
  retire each with that reason, unless you find a real player need, in which case stop and ask.
- The old player falls back to mock data in development when no API URL is set
  (`USE_MOCKS`). The Ward does not: no API URL is an error that says so.

## 5. The order of work

Each step ends with its checks green (or red only for what a later step owns), the three
registers rewritten for what shipped (README §10), and a commit that says what it reached.

### Step 1 — Shell, addresses, Leisure
- `src/main.jsx`, `src/screens.js` (`SCREENS`), `src/routes.js` (`ROUTES`) — exactly README §2.
  `screens-and-addresses` goes green here.
- Town resolution from the domain (§1 above).
- The two fixed corners: ◉ top-right always; back top-left when there is somewhere to go.
- **Leisure:** the ticker with its Society handle, ◉, the Almanac line, the movie's placeholder;
  **awake and resting** (README §2); the first touch only wakes. The resting delay is a named
  product value, written into `OPERATIONS.md` when you create it.
- `/display` opens Leisure and asks for full screen.
- Browser history: screen changes push; choices within a screen replace (README §2).

### Step 2 — Society
- The paper opens at Society: ticker, the **Society · Bulletin** switch, search, category row,
  type row, the list; the map half (placeholder until §3).
- Search is the list narrowing (README §3): no pop-over, keyboard only on tap, count announced.
- Categories and types are **read from the town's data**, never typed into the Ward. Colours
  come from the town (README §5) — ⚠️ the kit hard-wires one global palette today; see the
  palette brief. Until it lands, use the neutral "unauthored" treatment, visibly.
- Selection: one piece of state; tap a row → building lit; tap a building → row to the front;
  the → opens the card. Choosing a category (or committing a search) is the only camera move.
- The ticker's layer in Society: Happening now, the announcement on a row, the amber live mark.

### Step 3 — Place, and the working parts that live in it
- The card, full page, nothing behind it; no camera move on open or close.
- Hours with open/closed, photos, menu, reviews, events, contact.
- **Guardian tools** for its Guardian and Keyholders: edit, post to the ticker, reply to reviews,
  manage keyholders, the QR Studio. The QR Studio prints only addresses from README §2.
- **The Lobby**, for that building's verified residents.
- "Stand here" appears, and is disabled with its reason until Street exists.

### Step 4 — Bulletin
- One page on from Society; the whole page. Groups and sections, posts, comments, anonymity by
  section, private threads. Posting, commenting and threads gated by standing (the server
  enforces it; the Ward shows why an act is unavailable).
- Its front doors are their own design session (README §11): build the board as it is today,
  cleanly, and leave the doors for that session.

### Step 5 — Almanac, standing and identity, arrival pages
- **Almanac line** and its turned-over face: time, weather, the day strip with glyphs at true
  times (README §4), sky and moon. Tide appears only when a tide source exists (its own brief);
  until then an inland and a tidal town look the same — say so in `FEATURES.md`, don't fake it.
- **Now** control after scrubbing.
- **◉:** you (handle, avatar, standing, link a device), contact, about (Sources, privacy, terms,
  Trail Guide). Browser-stored identity under names that say what they are — not `lsq_` (README
  §8).
- **Arrival pages:** check in, claim, verify a home, link a device. Each completes its act and
  hands off to Leisure.
- **Cary** and **admin** surfaces behind ◉, for couriers and the operator.

### Step 6 — The credit, the weight, the audit
- The `© OpenStreetMap · Sources` credit on Leisure and in Society's map corner, opening this
  town's generated Sources. Read OpenStreetMap's current attribution guideline first.
- Replace the three remaining entries in `checks/not-yet-built.mjs` with real checks: the
  accessibility audit, the first-visit and return-visit weight, and (with the QR Studio from step
  3) every printable address resolves. Contrast over the rendered scene waits on the renderer.
- Delete `not-yet-built.mjs` when it is empty.

## 6. Out of this brief

- **Street and walking tours** — later, after steps 1–6 (README §2a). Nothing adequate is built.
- The town assembly itself (its own brief), the tree cross-fade, each town's palette, tide
  data, the map legibility floor — each its own brief.
- The Bulletin's front doors — a design session.
- Cutover — when all of the above is done (README §9).

## 7. When you are unsure

Stop and ask. A question that the README or this brief already answers costs Jacob a re-teach;
a question they don't answer is the work. Say which it is.
