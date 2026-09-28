<!-- BRIEF-STATE
status: HOLD
dispatched: Tamp
written: 2026-09-27
evict-when: RULING: Jacob confirms the 9 known baked/toy objects are deleted from R2 (the rest landed: 40d59e12…e539a34a)
-->
# BRIEF — Remove Toy

**For:** a fresh agent, in the kit. **Written:** 2026-09-27 (Warden). **Report to:** Warden.
**Ruled by Jacob, 2026-09-27:** *"I am inclined to rip out Toy, as it's not useful and it's always
something we have to work around."*

## 1. Why
Toy was a small synthetic scene for building simple geometry (street corners, tree placement). It has no
real underlying data, so its usefulness faded and work in it stopped — but the code still carries it
everywhere as a special case. Every `scene === 'toy'` branch, every "toy freezes a bare array" guard, every
fixture path is a workaround kept alive for a scene nobody uses. Removing it removes those branches too.

⛔ **Do not designate a replacement test town.** Jacob set that aside explicitly: *"let's not even go there
yet."* Nothing in this brief promotes Lafayette Square, or anything else, into Toy's role.

## 2. Mostly mechanical — these are the places that need judgment
Stop and tell Warden at any of these if the answer is not obvious from the code.
1. **A branch beside a generic path.** Many `scene === 'toy'` arms sit next to the path every other town
   takes (e.g. `useCartographStore`'s ribbons: `BUNDLED_MAPS` holds `'toy'`, beside the `fetchRibbons`
   path for poured towns). **Delete the Toy arm; never the generic one.**
2. **The bare-array tile format.** Several checks read tiles as *"a bare array (toy)"* or `.tiles`. Before
   deleting the bare-array branch, confirm **no other town** writes that format (read the writers, and
   the frozen files on disk). If one does, it stays, and the comment stops naming Toy.
3. **A comment that records a bug Toy exposed.** The lesson moves to the Diary
   (`cartograph/_archive/`, dated) before the code that carries it goes.
4. **"toy" meaning something else.** A word match is not proof. Hits already seen that are not the scene:
   words inside Huron's and Provincetown's content (listing text, a photo path). Read each hit.
5. **`src/toy/ToyBuildings.jsx`** imports `Building` / `Foundations` / `loadBuildingTextures` from
   `LafayetteScene`. Those are deleted by `BRIEF-live-building-palette.md`; removing Toy first removes
   that coupling for it. Say which lands first.

## 3. The footprint — re-derive it, don't trust a list
- **Its own directories:** `src/toy/`, `src/data/toy/`, `cartograph/data/toy/`, `public/looks/toy/`,
  `public/baked/toy/` (ignored, on disk only), `cartograph/derive-toy.js`, `cartograph/TOY_AUTHORING_PLAN.md`.
- **Its entry** in `public/looks/index.json` (the `toy` look).
- **Code outside those:** ▶ `git grep -l -i -w toy -- src cartograph arborist meteorologist scripts workers ':!src/toy' ':!src/data/toy' ':!cartograph/data/toy'`
- **Checks:** ▶ `git grep -l -i -w toy -- checks` — each mention is an accommodation (bare arrays, "toy has
  no fadeBand", the Stage-controls block, the portability patterns). Remove the accommodation, keep the check.
- **Docs:** ▶ `git grep -l -i -w toy -- '*.md' ':!cartograph/_archive'` — rewrite each live doc so it no
  longer describes Toy (never annotate "removed"). The Diary (`_archive/`) is left as it is: it is history.
- `claims-no-town-rides-in-the-bundle` reads the town ids from `cartograph/data/` and the looks index,
  so it follows automatically. Run it.

## 4. Coordination
**Mortise** is reworking `src/cartograph/CartographApp.jsx` (the town assembly), which holds Toy's
`MAP_REGISTRY` entry and `toyLamps`. **Do not touch `CartographApp.jsx` until Warden says Mortise has
landed**, then take it. Everything else can go first.

## 5. Done means
- No scene, look, directory, fixture or branch called Toy, and no check accommodation for it.
- Every check that was green is still green; any that changes, say why.
- The app builds (`npx vite build`), and Stage opens on a real town with no Toy in its town list.
- Commits name what they removed and the register each reached; your own paths only; no push.
