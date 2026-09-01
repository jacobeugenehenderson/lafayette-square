# REPORT 04 — `src/` + the `ls/` doc set

Branch `land-use-derivation`, audited 2026-08-31. **Zero edits made.** Every number carries its
command.

---

## 0 · Two brief premises the code contradicts

1. **"6 `.ts` files in `src/`" — there are none.** `find src -name '*.ts' -o -name '*.tsx' | wc -l`
   → **0**. The six TS files are Supabase edge functions in `cary/supabase/functions/`. **`src/` is
   100% untyped JS: 119 `.js`, 143 `.jsx`.**
2. `src/` is **265 files / 88,161 lines** (262 code + 3 CSS), not 262.

---

## 1 · Architecture map

**Five built HTML entries + one non-route app** (`vite.config.js:118-126`):

| App | HTML | Root | Dev URL |
|---|---|---|---|
| **The Ward** (public player) | `index.html` | `src/main.jsx` → `App.jsx` (953 ln, URL-prefix routing, no router lib) | `/` |
| **Cartograph / Extent / Stage** | `cartograph.html` | `CartographApp.jsx` 1,313 ln, `ExtentApp.jsx` 2,169 ln | `/cartograph` |
| **Arborist / Salon** | `arborist.html` | `src/arborist/main.jsx` | `/arborist` |
| **Meteorologist** | `meteorologist.html` | `src/meteorologist/main.jsx` | `/meteorologist` |
| **Preview** | `preview.html` | `src/preview/main.jsx` → 1,256 ln | `/preview` |
| **Stage** | — | `StageApp.jsx` (1,624 ln) imported by `CartographApp.jsx:45` | not a route — `vite.config.js:11-12`: *"`/stage` is intentionally absent — Stage is cartograph-hosted"* |
| **Toy** | — | `src/toy/*` mounted at `CartographApp.jsx:748` | a scene, not an app |
| `debug-map.html` | root, 22 KB | — | **not a build entry** (`grep -n debug-map vite.config.js package.json` → 0 hits); orphaned |

⚠️ **The costly seam:** `ls/ARCHITECTURE.md:115` — `BakedGround`, `BakedLamps`, `InstancedTrees`,
`LafayetteScene`, `LafayettePark`, `StreetLights` all import `useCartographStore` (2,811 ln) from
`src/cartograph/stores/`. **The authoring bundle ships to production** (~4.5 MB min / 1.1 MB gz per
`ls/FEATURES.md:203`), and `dist/` confirms all four helper HTMLs deploy to the public origin.
**`lafayette-square.com/cartograph.html` is reachable today.**

**`vite.config.js` (8,381 B) — four hand-rolled plugins:** `serveHelperApps()` (`:13-38`, dev
clean-URL middleware) · `serveCodedesk()` (`:41-66`) · `serveInstallationContent()` (`:68-95`, maps
`/content/<look>/…` → `cartograph/data/<look>/content/`, path-traversal guard at `:88`) ·
`mirrorInstallationContent()` (`:97-129`, build-time counterpart that globs every install's content
dir — **one of the few places the kit claim is honoured structurally**). Plus
`define.global='globalThis'` for poly2tri's UMD shim, a `server.watch.ignored` list for the multi-GB
asset trees (comment: iCloud stubs `ETIMEDOUT` and kill the dev server), three dev proxies with
`agent:false`, and `manualChunks` for three vendor chunks.

**Running it:** `npm ci && npm run dev` (concurrently: vite + `node --watch` on
cartograph/arborist/meteorologist serve.js at :3333/:3334/:3335). **There is no `test` and no
`lint` script.**

---

## 2 · The instance/kit seam — the claim fails, and the write path can destroy production

**Leakage, measured** (zsh needs the `--include` globs quoted):

| Measure | Result |
|---|---|
| Files in `src/` matching "lafayette" | **65** |
| …excluding `src/instances/` + `src/data/lafayette-square/` | **64 files** |
| Matching **lines** outside those dirs | **222** |
| …excluding comment-only lines | **105 lines / 28 files** |
| `'lafayette-square'` slug outside sanctioned dirs | **59 lines / 26 files** |
| LS street proper nouns (19-name alternation) | **28 — 26 comments, 2 substantive** |
| St. Louis lat/lon literals | **3 — 2 substantive** |
| Bare `'ls'` slug; `\|\| 'ls'` fallbacks | **0 / 0 — clean** |
| `DEFAULT_*` = LS beyond `instance.js` | **3 sites** |

⇒ **"instance identity lives only in `src/instances/`" is false: 105 non-comment lines across 28
files.**

### (A) The one that destroys data

`src/cartograph/stores/useCartographStore.js:1870` — `await bakeLook(get().activeLookId, {force})`.
**The entire `runBake` body (`:1828-1890`) never reads `get().scene`.** Output is Look-keyed
(`:1641`, `:1759`), and scene/look hydrate from **different localStorage keys**
(`cartograph-scene` `:1939` vs `cartograph-active-look` `:70`), so they diverge.

The code already records the incident — `ExtentApp.jsx:1601-1605`: *"bakeLook falls back to the
default (lafayette-square) Look and the new hood's slab clobbers LS (Altadena-as-LS,
2026-07-14)"* — and the mitigation at `:1605` covers **only** the Extent build path.
`ls public/baked` → `altadena default hipointe-demun lafayette-square lafayette-square-staging toy`.

⛔ **ORIENTATION's "pouring a second neighborhood can overwrite production LS" is still true, and
the root is one un-guarded line.**

### (B) Silent LS fallbacks — 3 of 4 silent

`instance.js:31,54-64` falls back **loudly** (console.error naming the risk) — **this one is fixed
to doctrine.** Still silent:

- `MapLayers.jsx:406` — `const isLS = !scene || scene === 'lafayette-square'` (an unset scene
  *becomes* LS)
- `MapLayers.jsx:430` — `(isLS || !sceneBoundaryRaw) ? _LS_BUNDLE : …` — **a town whose boundary
  hasn't loaded renders LS's silhouette**
- `useCartographStore.js:70,431` · `Toolbar.jsx:23`

Corroborating: `ExtentApp.jsx:834` is a hand-written *escape* from the default.

### (C) LS prose on the one page no flag gates

`instance.js:69-84` documents that `LegalPage.jsx` is shown by **every** installation.
`LegalPage.jsx:24` hardcodes the service area by LS street name — *"Chouteau Avenue to Interstate
44, Jefferson Avenue to Truman Parkway"*. Also `:16,64,68,72,128,136,137,164,173,184,190,203,228,241`;
`InfoModal.jsx:157-229` (10 lines); `CourierOnboarding.jsx:543,588`; `CheckinPage.jsx:135,241`;
`tokens/categories.js:87`.

### (D) LS data compiled into every build

`LafayettePark.jsx:15,17` · `cartograph/boundary.js:17` (header admits it) · `CartographApp.jsx:54`
· `MapLayers.jsx:13,15` · `BlockGeometryV2Debug.jsx:30,31` · `loadInstanceData.js:41,43,44,53,58`.

**The two substantive street/coordinate hits:** `MeasureOverlay.jsx:350` — `const dividedNames =
['Truman Parkway','South 14th Street','Park Avenue','South Jefferson Avenue']`, **real geometry
logic keyed on LS street names**; town #2 silently gets no divided-carriageway handling. And
`CourierDots.jsx:22-25` — `IDLE_LAT=38.6158; IDLE_LON=-90.2155` with its own
`TODO(universal-reader Phase 2)`.

⭐ **Credit where due:** zero `'ls'` slug literals; geography reads go through `INSTANCE.geography`;
**all slab READS are look-keyed**; 59 `import.meta.env.BASE_URL` uses and **zero root-absolute
`fetch('/baked/…')`**. **The leak is on the write side — (A) is one guard away.**

---

## 3 · The module manifest — inverted doctrine, one dead flag, the named bug still open

Both instances declare the **same 10 keys** (`lafayette-square.js:79-93`,
`hipointe-demun.js:70-84`): `bulletin, delivery, contact, codedesk, sms, chat, info, events,
society, residences`. **`delivery.enabled` is the only differing value in the entire manifest** —
so the second installation exercises exactly one flag.

**`moduleOn` is opt-OUT, not explicit-ON** — `instance.js:116-120`: `if (m == null) return true`.
An absent flag, a missing `modules` object, or **a misspelled flag name** → the feature mounts.
This is deliberate and documented at `:104-115` ("kit procedure, Jacob 2026-07-19": an off-by-default
feature is invisible debt) — **a defensible decision ORIENTATION never absorbed.** Its cost:
`moduleOn('bulletn')` is indistinguishable from the real flag, and there is no name registry.

Only **three files** import `moduleOn`: `App.jsx:3`, `Scene.jsx:5`, `SidePanel.jsx:18`.
**`residences` → NOTHING** (`grep -rn residences src` → exactly 2 hits, both declarations).

### Features still gated on DATA PRESENCE (none of these files import `moduleOn`)

1. **The whole residences feature** — `PlaceCard.jsx:3640`: `const isResidential =
   activeListing?.category === 'residential'`. Off it hang the Community/Lobby tabs (`:3653-3658`),
   a resident-count **network fetch** (`:3691-3697`), the claim button (`:4106-4141`), the badge
   (`:4086`), lobby posting (`:2498`), the resident QR path (`:2307,2379`). **`residences:false`
   changes nothing.**
2. **Delivery ordering** — `PlaceCard.jsx:2842`: `const hasDelivery =
   (listing?.tags||[]).includes('delivery')`; CTA at `:2980`. On HPDM (`delivery.enabled:false`)
   any tagged listing renders the surface the three top-level mounts retire — and the guardian
   toggle at `:612-627` lets an operator **create** that tag there.
3. **Cary recruitment in Bulletin** — `BulletinModal.jsx:729` (comment `:728`: "always visible"),
   CTA to `/cary/apply` at `:749`, a route `App.jsx:849` refuses when `delivery` is off. **An ad
   for a nonexistent program linking to a dead route.**
4. **`sms:null`** — `PlaceCard.jsx:4122,4131,4146` gated only on `isResidential`; HPDM's
   `cary.smsNumber` is `null`. **The exact failure `instance.js:75-78` names for `mailto:null`,
   live three files away.**
5. `?embed=society` / `?embed=masthead` bypass the `society` flag (`App.jsx:830-841`);
   `/place/:id` opens PlaceCard and therefore the residences surface, ungated.
6. `SidePanel.jsx:1073-1074` switches tab *bodies* on a string, not the flag.
7. Ungated buttons into gated modals: `SidePanel.jsx:1082`, `PlaceCard.jsx:4176,4189,2379`,
   `App.jsx:279,285,291,304,314`.

⇒ **ORIENTATION cites "the ungated-Cary bug" in the past tense. It is closed at the three
top-level mounts and OPEN at `PlaceCard.jsx:2842`, `BulletinModal.jsx:729`, `PlaceCard.jsx:4122`.**

---

## 4 · Doc/code coherence ledger — 21 findings

| # | Doc:line | Claim | Code evidence | Class |
|---|---|---|---|---|
| 1 | `ls/ARCHITECTURE.md:242` | staging trunk = `curb-offset-draw` | `.github/workflows/staging.yml:5` → `[land-use-derivation]` | ROT |
| 2 | `ls/BACKLOG.md:5`, `ls/STATUS.md:28` | same stale trunk | same | ROT |
| 3 | `ls/ARCHITECTURE.md:201-208` | "**four** HTML entries" | `vite.config.js:118-125` has **five**; `meteorologist` missing from doc | ROT |
| 4 | `ls/FEATURES.md:203` | authoring routes include **`/stage`** | `vite.config.js:11-12` says `/stage` is intentionally absent | ROT |
| 5 | `SLAB-CONTRACT.md §8` | GLBs "served from `public/trees/`" | `InstancedTrees.jsx:957-958` rewrites to `${BASE_URL}baked/<look>/trees/`; `.gitignore:235` ignores `public/trees/` | ROT (contract contradicts its own consumer) |
| 6 | `SLAB-CONTRACT.md §11` | clouds JSON has "**no runtime consumer today**" | `Atmosphere.jsx` + `useAtmosphereDirective.js` exist; two other docs say wired-but-gated | ROT |
| 7 | `SLAB-CONTRACT.md:52` | cache-bust list includes `StageArch` | no such file; retired per `ls/ARCHITECTURE.md:87` | ROT |
| 8 | `SLAB-CONTRACT.md §4` | lampGlow "Consumed by `BakedLamps` **and `StreetLights`**" | `StreetLights` no longer mounted by `Scene.jsx` | ROT |
| 9 | `SLAB-CONTRACT.md §10.3` | "**Refuse unknown versions**" | Only `SlabBuildings.jsx:147-148` checks. `grep -n '\.version' src/components/{BakedGround,BakedLamps,InstancedTrees}.jsx` → **0**. **Three consumers render whatever they're handed.** | **ASPIRATION** — a NO-FALLBACKS violation inside the slab boundary |
| 10 | `SLAB-CONTRACT.md §9.5/§10.3` | "MUST **fail loudly**" | even `SlabBuildings.jsx:148` only `console.error`s | ASPIRATION |
| 11 | `ls/ARCHITECTURE.md:372` | `copyPublicDir` "**RESOLVED** … `copyPublicDir:false` + allow-list" | `grep -rn copyPublicDir vite.config.js` → **0 hits**; `plans/pre_public_cleanout.md:161` confirms default `true` ships all of `public/` (4.9 GB trees + 255 MB models + 201 MB baked) | **ASPIRATION** — marked resolved, never built |
| 12 | `ls/ARCHITECTURE.md:279` | presence-gating is leaky, so the switch is explicit; ungated-Cary cited as fixed | §3 items 2-4 still live | **REGRESSION** |
| 13 | `ORIENTATION.md` module bullet | "explicit declarative flag" | `instance.js:116-120` is default-ON opt-out, documented and attributed | ROT in ORIENTATION |
| 14 | `ls/ARCHITECTURE.md:278` | `residences` "listed … still ungated in code" | accurate parenthetical, but §6's headline overstates | ASPIRATION |
| 15 | `ls/ARCHITECTURE.md §7` | `opacity: 0.95` → "~185ms"; prod 8.2s | `index.css:61` says **"5624ms opaque vs 224ms at 0.98"** while `:74` ships `opacity: 0.95`. **Three number-sets for one measurement; the code comment cites a value the code doesn't use.** | ROT + stale in-code comment |
| 16 | `ls/BACKLOG.md:23` | "**Main is fully pre-slab** … no `public/baked/`, no `BakedGround.jsx`" | both exist; `public/baked/` has 6 dirs | ROT |
| 17 | `SLAB-CONTRACT.md:9` | last verified 2026-05-26 vs `cartograph-looks-pass-ab` | branch retired 2026-07-08; ~3 months unverified while §§5-8 drifted | ROT |
| 18 | `ls/ARCHITECTURE.md:280` | BASE_URL list names `BakedBuildings` | file doesn't exist — deleted per this doc's own `:175` | ROT (self-contradiction 105 lines apart) |
| 19 | `ls/FEATURES.md:158` | Milky Way is "planned build-out" | `ls/STATUS.md:45`: built, disabled at `CelestialBodies.jsx ~1194`, "one-line uncomment, *not* cruft" | ROT (understates a shipped capability) |
| 20 | `ls/ARCHITECTURE.md:186` | Worker "Auth: None" | true, but omits that `worker.js:1` carries a capability credential | ASPIRATION (posture never written down) |
| 21 | `ls/ARCHITECTURE.md:11`, `ls/STATUS.md:5` | verified 2026-06-02 / 06-30 | ~3 and ~2 months stale; both carry honest ⚠️ "PARTIALLY STALE, DELIBERATELY SO" banners — **so an outside reader has no current status doc for the app layer at all** | ROT (self-declared) |

*Verified, not contradicted:* `grep -c "case '" apps-script/Code.js` → **57**, consistent with the
"~54 actions / 57 routes" claim.

---

## 5 · Code health

**No tests, no linter, no types.** `find` for `*.test.*`/`*.spec.*`/`__tests__` excluding
`node_modules` → **exactly one file, `scratch/hpdm-identity-lock.test.mjs`**, not in `src/`, with
**no runner in `package.json` and no `test` script**. `ls -a | grep -iE
"eslint|prettier|biome|tsconfig|jsconfig"` → **nothing**. `@types/react` is installed and consumed
by nothing.

⛔ **For 88,161 lines, the entire correctness apparatus is `console.error` and the operator's eye.**

**Largest files:** `tileGround.js` 4,922 — cohesive but oversized. **`PlaceCard.jsx` 4,225 —
accreted and the worst file in the repo**: card UI + guardian editor + menu editor + delivery
ordering + residence/lobby + QR + reviews + claims, and the home of **four** of the seven
data-presence gates. `useCartographStore.js` 2,811 — accreted; the un-guarded bake lives here
because bake orchestration lives in a UI store. `treeAtlasMaterial.js` 2,188, `ExtentApp.jsx`
2,169, `SalonWorkstage.jsx` 2,077, `buildBlockGeometryV2.js` 1,849 — each cohesive.

⭐ **Worth saying: comment quality is unusually high** — comments record measurements, retracted
hypotheses and why a value is what it is (`index.css:55-73`, `vite.config.js:157-163`,
`instance.js:43-64`). **That rigour just never reached the docs.**

**Dead modules — 677 lines, 5 files** (hand-verified): `hooks/usePlanetarium.js` (10, zero refs) ·
`arborist/CoverageView.jsx` (182, zero refs) · `components/WeatherTimeline.jsx` (233, comment only)
· `lib/ribbonsGeometry.js` (145, comment only — yet `m3Colors.js:88` points at its
`LAND_USE_COLORS` as an authority) · `arborist/ChassisPlate.jsx` (107, comment only).
**`ls/STATUS.md:16,24` claims "No dead code" — a REGRESSION.**

Also: `hooks/useInit.js` is boot-critical but invoked purely as a side-effect import
(`App.jsx:30`), a trap for any tree-shake or reorg; `debug-map.html` (22 KB) is unreferenced by any
config.

**Day one for a new dev:** `npm run dev:web` (the obvious command) starts Vite only and the helper
apps 404 their APIs — you need bare `npm run dev`. No `.env.example`; `.env` is correctly gitignored
so the app boots with `undefined` Supabase config (`supabase.js:60` guards, so it degrades). No
feedback loop but the browser. **The first two docs you open (`ls/STATUS.md`, `ls/BACKLOG.md`) warn
you not to believe them.**

---

## 6 · Release-readiness

**`.env` is handled correctly.** `git check-ignore -v .env` → `.gitignore:8`. `git ls-files | grep
'\.env'` → empty. `git log --all -- .env` → **empty, never committed**, so no history scrub needed.
Its three keys by name: `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — all
`VITE_`-prefixed, i.e. public by design. **No key inlined in `src/`**: the secret-pattern grep over
`src/` and `public/` returns **0 hits**.

**Supabase: anon key, correctly.** One `createClient` in the whole app — `src/lib/supabase.js:8,60`,
with a `fetchWithDeviceHash` wrapper. **No `service_role` anywhere in `src/`.** Env usage:
`BASE_URL`×60, `DEV`×5, `MODE`×4, `VITE_SUPABASE_URL`×3, `VITE_SUPABASE_ANON_KEY`×1,
`VITE_API_URL`×1. The real security surface is server-side, outside `src/` and unassessed here.

⚠️ **`worker.js:1` — a committed capability URL.** File and class only: a **Google Apps Script
`/exec` deployment URL**, class **unauthenticated capability URL** — possession of the string is the
whole authorization. `grep -rl "script.google.com"` finds the same class in **5 files**:
`worker.js`, `PUBLISH.md`, `README.md`, **`public/codedesk/index.html`**,
`ls/reference/INVENTORY-API.md`. **Because `copyPublicDir` defaults true (#11), the
`public/codedesk` copy ships to the public origin, so the endpoint is discoverable by any visitor
regardless of repo visibility.** This may be intended (the GAS backend re-verifies `device_hash`)
but it is undocumented — `ls/ARCHITECTURE.md:186` says "Auth: None" without noting the credential.
**Recommend rotating if the repo has ever been public, and writing the posture down.**
`worker.js:38-40` also proxies every non-`/place/` path to the origin, so the authoring HTMLs are
reachable through it too.

**`backend/`** holds **only two JSON schema files** — no code, no server. The real backends are
`apps-script/Code.js`, Supabase, and three dev-only Node servers. **The directory name misleads.**

**Deploy topology, read from the workflows:** `staging.yml:5` triggers on push to
**`land-use-derivation`**, builds `--base=/lafayette-square-staging/`, pushes via
`peaceiris/actions-gh-pages@v3` to external repo `jacobeugenehenderson/lafayette-square-staging`
with `force_orphan: true`. `deploy.yml:5` triggers on **`main`**, base `/`, GitHub Pages;
`public/CNAME` = `lafayette-square.com`. Both inject the three `VITE_*` secrets.

⚠️ **Confirmed: staging deploys from the branch currently being worked on** — every push deploys,
with **no gate, no test step, and no approval**; `force_orphan` destroys staging history so there is
no rollback there, and production's documented rollback floor is ~3.5 months old. **Neither workflow
strips the authoring entries.**

---

## 7 · Fix order

1. **Guard the bake write path** (`useCartographStore.js:1870`) — one loud assertion that the
   active Look's scene matches the store's scene. **The only finding here that destroys production
   data**, and the code already documents it happening. Kit-general: it protects every town from
   every other town.
2. **Make the three silent LS fallbacks loud** — `MapLayers.jsx:406,430`,
   `useCartographStore.js:70,431`, `Toolbar.jsx:23`. Copy `instance.js:54-64`; it is already right.
3. **Validate flag names in `moduleOn`** — keep default-ON (a reasoned decision), reject an unknown
   name loudly.
4. **Close the three surviving data-presence gates** and either wire `residences` or delete the dead
   flag from both instance files.
5. **Get LS prose out of `LegalPage.jsx:24`** — the one page every installation shows, by the code's
   own documentation.
6. **Ship `copyPublicDir:false` + mode-conditional `rollupOptions.input`** — two `vite.config.js`
   changes remove the authoring surfaces and ~5 GB of `public/` from the public build.
7. **Re-verify `SLAB-CONTRACT.md`** — it is the interface doc, it says drift "is not allowed without
   revising this file," and four of its statements are wrong (#5-#8).
8. **Add a runner and three tests** — kit-portability (no LS literal reachable from a non-LS
   instance), flag-name validity, slab-version refusal. `scratch/hpdm-identity-lock.test.mjs`
   already shows the shape; it just has no home in `package.json`.
