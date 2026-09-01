# REPORT 07 — The true open-work ledger

Branch `land-use-derivation`, HEAD `5a0bdaea` (2026-08-31). **Read-only. Zero edits made.**

Note: `git rev-parse HEAD origin/main origin/land-use-derivation` returns **one SHA three times** —
main and the trunk are currently identical.

*See also **REPORT-07a**, the verification of the four aspiration briefs, which revises §2.3 and
adds the report's most important finding.*

---

## EXECUTIVE SUMMARY

**Is it a couple of bugs? No — but the owner's *second* claim is true, and it's the more important
one.**

The granularity is real and unusual. **6 `TODO`/`FIXME`/`HACK`/`XXX` markers in all of
`src/ cartograph/ arborist/ meteorologist/ ls/`** — all `TODO`, zero `FIXME`/`HACK`/`XXX`, and **two
of the six are comments recording *resolved* TODOs**, so the live count is **4**. Almost every open
item is written down, sized, and pointed at a code site. **That is a disciplined tree.**

But deduplicated across seven boards, **~55 distinct open items survive verification**:
**9 MUST-FIX-BEFORE-RELEASE**, **14 SHOULD-FIX**, **21 KNOWN-AND-ACCEPTABLE**, **11 NOT-A-BUG**.
*(Revised by 07a to 9 / 18 / 17 / 11.)* The honest restatement: **there are two or three open
*investigations* (A17, A0, the land-use join) and roughly nine things that block a release.** The
"couple of bugs" intuition is tracking the investigations — the right thing to track, but not the
release ledger.

**The single most useful number:**

> **Of 36 items sampled that the boards claim OPEN, 8 are fully closed in the code (22%) and 4 more
> are materially misstated (11%). One in three "open" items is not what the board says.**

**And critically, the drift is not uniform — it tracks board age:**

> **Of 20 cited `file:line` references checked, 12 resolve today, 8 drifted (40%). All 8 drifted
> citations come from `AUDIT-MATRIX.md` (2026-06-15) and `ACCORDANCE-REVIEW.md` (2026-07-18). Every
> citation written after ~2026-08-20 — ROADMAP A17, ROADMAP A0, SECURITY.md, the substrate-walk flag
> — resolved exactly.**

**Recent boards are trustworthy. Boards older than ~six weeks are not.**

**The biggest single finding — the kit's own deliverable is unwired:**

```bash
ls scratch/claims-*.mjs scratch/claims-*.sh | wc -l          # → 79
grep -n "scratch/\|claims-\|correctness" .github/workflows/*.yml # → no output
node -e "console.log(require('./package.json').scripts)"     # → no "test" script
```

**79 verification scripts, zero wired to CI.** `ROADMAP C3` calls this *"the real kit deliverable:
one automatic check per bug-class → **CI gate**."* The checks exist; the gate does not. **An
`npm test` running those 79 scripts would have caught 8 of the 8 closed-but-still-listed items
automatically.**

⭐ **The most encouraging finding:** `scratch/correctness-detector.mjs` — the flagship detector —
**loads the scene's authoring** (`:542` reads `design.json`; `:549` passes `blockCustoms:
design.blockCustoms || null`). **The Layer-0 defect `CLAUDE.md` holds up as its standing receipt is
confined to the *older* `litmus-curb-parallel.mjs`. The doctrine took.** Remaining work there is
retiring one legacy script, not fixing systemic blindness.

---

## 1 · The closed-but-still-listed rate (36-item sample)

### 1.1 CLOSED-BUT-STILL-LISTED — 8 of 36 (22%)

| # | Item | Tracked in | Evidence |
|---|---|---|---|
| 1 | `public/baked/lafayette-square.json` stale bake | AUDIT-MATRIX ⓵ | File absent. `public/baked/` is now per-scene **directories**. |
| 2 | `arborist/_attic/` sweep | AUDIT-MATRIX ⓵ | Directory absent. |
| 3 | `setSegmentMeasure` dead write path | AUDIT-MATRIX ⓵ | Removed; only a retirement comment at `useCartographStore.js:2699-2703`. |
| 4 | **"`CURVE_FIT` built + eye-approved but OFF"** | ROADMAP `A4`; ACCORDANCE `PA-3` | **It is ON by default.** `cartograph/skeleton.js:859`: `const CURVE_FIT = process.env.CURVE_FIT !== '0'  // ON by default`; consumed `:1949`. |
| 5 | **`classify.js` types an unreadable overlay `unknown`, hijacking the face** | ROADMAP land-use "step 1" | **Excised.** `classify.js:73` is `let type = null`; `:94-99` records it in a `createVocabularyGate` instead of voting; `:139-141` prints the gap every pour. Step 2 also done — `derive.js:3046`. |
| 6 | **"Prod: 184 trees 404"** | ROADMAP live-defects | Path gone. `git ls-tree origin/main public/baked/` → six directories, no `default.json`. Current bakes carry 5,074 refs. |
| 7 | **A11-c "136 slots safe to remove"** | ROADMAP `A11` | altadena now **0** slots; `ksi-y-m-yn` and `centrum` Look dirs **deleted**. 104 of 136 gone with their Looks. |
| 8 | **F-16** "anonymous sign-in DISABLED in prod, launch blocker" | SECURITY §3 | A live probe obtained an anon token from `/auth/v1/signup`. **It is enabled.** (Disclosure §5.3.) |

### 1.2 MATERIALLY MISSTATED — 4 of 36 (11%)

| # | Item | Board says | Code says |
|---|---|---|---|
| 9 | `A12` `?look=X` silently renders LS | "no warning" | **Half fixed** — `src/instance.js:43-49` now `console.error`s a named warning. It **still falls back to LS**. ROADMAP's own repro is stale: `ls src/instances/` → **2** files, not the 4 listed. |
| 10 | `PA-6` "no meshopt/draco/quantization" | flat | `arborist/bake-look.js:25-26` imports `quantize` + `MeshoptEncoder`, registered `:67`. Tree-GLB half done. Slab `.bin` half — **cause not established.** |
| 11 | `PA-11` "`ws` CVE (8.0.0–8.20.1)" | flat | Installed `ws` = **8.19.0**. `npm audit --omit=dev` → `{"high":1}`. **Full `npm audit` = 12 (2 crit, 8 high), but 11 of 12 are dev-only tooling.** Quoting "12 vulnerabilities" **overstates shipped risk 12×.** |
| 12 | `F-13` broad CORS + no rate limiting, 4 functions | one row | `contact-sms` genuinely closed (`:73` origin-locked); the other three still emit `*` (`sms-reply:14,118`, `web-messages:16,151`, `sms-inbox:13,99`). |

### 1.3 STILL OPEN, VERBATIM — 24 of 36 (67%)

- **`A05` / Check A — OPEN at the exact lines.** `litmus-curb-parallel.mjs:77` = `blockCustoms:
  null, emitArtifact: true,`; `:86` = `if (!tile?.iA?.length) continue`. **Both Layer-0 failure modes
  intact. `CLAUDE.md`'s receipt is live and accurate.**
- **`A17` — OPEN, no fix, cause still not established.** No file on the swap path touched since
  filing: `MeasureOverlay.jsx` 08-13, `buildBlockGeometryV2.js` 08-13, `tileGround.js` 08-14,
  `feCustomKey.js` 07-17; `git log --since=2026-08-21` on all four → nothing. The receipt
  reproduces: **16 of 209** chains carry a duplicate vertex; `node
  scratch/segord-duplicate-forensic.mjs` still prints *"THE ORDINALS MOVE"*, 12 of 16 partitions
  shift. The click path resolves the fe by **proximity to a chain-derived frontage edge**
  (`MeasureOverlay.jsx:691` `nearestFeForSide`) — the chain-side resolution the ticket says must be
  replaced. **The polygon-side measurement has not been run.**
- **`A0` — OPEN, `STATUS: UNDECIDED` (the board says so honestly).** `SPUR_OUTLINE` in **zero**
  source files. The out-and-back degenerate face is still what `extractFaces` produces
  (`tileGround.js:917`). What ships is a cap **stamp** (`detectTileCaps:1201`), not a closed polygon.
- **Clip minting endpoints — root OPEN, but made LOUD.** `pipeline.js:172/196/239` unchanged;
  `:246-249` states in-source that `junctionMap` isn't in the clipped key list. ⭐ `846c9535` (32 min
  after `6d2fcb4d`) added the census at `:257-279` printing severed/manufactured/stranded, and *"⛔
  NOT MEASURED"* when it can't run. **This is the project's own NO-FALLBACK doctrine executed
  correctly.**
- **The walk IS still default-off, structurally.** `src/lib/tileGround.js:3047`: `const
  substrateTiles = opts.substrateTiles ?? (typeof process !== 'undefined' &&
  process.env?.SUBSTRATE_TILES === '1')`. Nothing in `src/`, `cartograph/` or `scripts/` passes
  `opts.substrateTiles` — only `scratch/` harnesses. `SUBSTRATE_TILES` is unreachable in the browser:
  `vite.config.js:140-146` defines only `__BUILD_HASH__` and `global`. **So the clip root reaches
  nothing on screen.**
- **Park polygon ④ — OPEN.** `clean/park-polygon.json` present in two scenes; consumers wired at
  `derive.js:1103,2307,2314,3159`, `LafayettePark.jsx:17,42,49,234,290`, `loadInstanceData.js:58`,
  `BlockGeometryV2Debug.jsx:30,1059,1073`, `bake-ground.js:760`. **Three hardcode an LS path.**
- **Tip couplers ⑤ — OPEN, disclosed not closed.** Only tip source is Source 6 (`derive.js:4325`),
  gated on a `|left−right| ≥ 0.5 m` **width-step standing in for a tip test** — **a symmetric dead
  end mints no node, no coupler.** `:4553-4557` says so; `:4575` prints it.
- **Phantom park — OPEN.** `classify.js:76` still buckets `landuse=grass`/`recreation_ground` →
  `'park'`; containment race `:110-115` is still **first-overlay-wins with `break`**, no area
  weighting, one direction.
- **`pickLuFromHash` — OPEN.** `tileGround.js:40` imports, `:3943` calls.
- **`A13` — OPEN verbatim.** `skyLightChannels.js:352`: `browse: { fov:45, padding:1.05,
  bounds:{cx:95, cz:-158, w:1292, h:1025} }` — **LS's frame as every town's default.** ⭐ **The cheap
  fix is still unbuilt**: per-town radius already authored — LS `892`, hipointe-demun `1251`,
  ksi-y-m-yn `1530`, centrum `2147`, altadena `4161`, toy `180`.
- **`A11` Stage re-bleed — OPEN, exact line.** `useCartographStore.js:341`.
- **`A11` horizon clone — OPEN.** `{radius:2500, fadeInner:940, fadeOuter:3150}` byte-identical
  across **all four** real Looks; only `toy` carries the store default.
- **AUDIT-MATRIX removal queue: 8 of 10 rows still live, all with drifted lines** — `POST /rebuild`
  `serve.js:2587` (cited `:674`; `render.js` still absent so the stub still throws) ·
  `_saveCenterlines` `:2477` (cited `:1785`) · `GET /analyze` `:959` (cited `:264`) ·
  `toggleCoupler` `:2642` (cited `:1901`; **0 external callers confirmed**) · `Grove.jsx:166`
  cosmetic at `:1194` · `Workstage.jsx` present · `PRESETS.browse` `Scene.jsx:121` (cited `:62`) ·
  `lsq-tokens.css` loaded by `public/codedesk/index.html:31`. ⚠️ **One rationale is now false**: the
  queue says `PRESETS.browse` is "unreachable"; it's reached at `Scene.jsx:739` and `:744`.
- **`AP-3` — OPEN, three sites.** No host arg: `cartograph/serve.js:2607` (cited `:2242`),
  `arborist/serve.js:1965` (cited `:1770`), `meteorologist/serve.js:241` (exact). **All bind
  `0.0.0.0`.**
- **`AP-5` — OPEN.** `poly2tri` at `package.json:22`; polyfill at `vite.config.js:142`; **zero real
  imports.**
- **`AP-6` — OPEN and worse.** `SLAB-CONTRACT.md:9` still `Last verified: 2026-05-26` — three months.
- **SECURITY `F-14`, `F-5`(Stripe/Checkr), `F-6`, `F-11`, `F-12` — all OPEN, confirmed in source.**

### 1.4 Reproducing commands

```bash
grep -rn --include='*.js' --include='*.mjs' --include='*.jsx' --include='*.ts' --include='*.tsx' \
  --include='*.vue' --include='*.html' -E '\b(TODO|FIXME|HACK|XXX)\b' src cartograph arborist meteorologist ls \
  | grep -v node_modules | grep -v '/_archive/'                       # → 6
sed -n '77p;86p' cartograph/litmus-curb-parallel.mjs                   # Check A
grep -n 'CURVE_FIT' cartograph/skeleton.js                             # ON by default
grep -n '1292' src/cartograph/skyLightChannels.js                      # A13
for s in $(ls cartograph/data); do b=cartograph/data/$s/neighborhood_boundary.json; \
  [ -f "$b" ] && node -e "console.log('$s', require('./$b').radius)"; done
node -e "const r=require('./src/data/ribbons.json');let n=0;for(const s of r.streets){if(!s.points)continue;for(let i=1;i<s.points.length;i++)if(Math.hypot(s.points[i][0]-s.points[i-1][0],s.points[i][1]-s.points[i-1][1])<1e-6){n++;break}}console.log(n,'of',r.streets.length)"   # → 16 of 209
node scratch/segord-duplicate-forensic.mjs
sed -n '3041,3048p' src/lib/tileGround.js ; grep -rn 'substrateTiles' src cartograph scripts
npm audit --omit=dev   # → 1 high (ws);  npm audit → 12 total, 11 dev-only
node scratch/correctness-detector.mjs
```

---

## 2 · The deduplicated ledger

IDs are this report's (`L-`), to survive the ROADMAP's own ID collision (§6.2).

### 2.1 MUST-FIX-BEFORE-RELEASE (9)

| ID | Statement | Tracked | State |
|---|---|---|---|
| **L-01** | `courier_profiles_select_active` hands every column — licence plate, Stripe account id — to the anon key for any active courier. `002_rls_policies.sql:46-48`, **no auth predicate**, never superseded; **the doc's cited `security_invoker` fix does not exist.** | SECURITY F-14, ROADMAP S3 | **OPEN** |
| **L-02** | `web-messages` IDOR — body `device_hash` is the only authorization. `web-messages/index.ts:37-38`, sole filter `:51,70,82`; **zero `auth.getUser()`**; `:27` advertises it as a header. | SECURITY F-6, PA-8 | **OPEN** |
| **L-03** | Command injection in the Publish dev server. `cartograph/serve.js:2447` matches `[^/]+` (≈20 sibling routes use `[a-z0-9-]*`); `id` flows unvalidated to `:2469`'s `git commit -m '…${id}…'` under `spawn(…,{shell:true})` (`:50`). Second path via `slabPathspecs()` `:87-95`. | SECURITY F-12 | **OPEN** |
| **L-04** | All three dev servers bind `0.0.0.0` — `serve.js:2607`, `arborist:1965`, `meteorologist:241`. | ACCORDANCE AP-3 | **OPEN** — turns L-03 LAN-reachable. **One line ×3.** |
| **L-05** | Fail-open cron guard: `credential-check/index.js:20-21` `if (cronSecret && …)`. Unset ⇒ guard skipped ⇒ `suspend_expired_couriers` + Twilio proceed. | SECURITY F-11 | **OPEN** — a NO-FALLBACK violation inside security code. |
| **L-06** | Wildcard CORS + no rate limit on `sms-reply`, `web-messages`, `sms-inbox`. | SECURITY F-13 | **OPEN (3 of 4)** — `contact-sms` proves the pattern. |
| **L-07** | `cary/supabase/functions/onboarding/` holds **both** `index.ts` (fixed, `authenticateCourier:90`) and a stale `index.js` (Mar 13, zero caller auth). Whether Deno could serve the `.js` — **cause not established.** | *untracked — new* | **OPEN** |
| **L-08** | LS Apps-Script ship-blockers: admin passphrase → 6h UUID in `localStorage`, passed in body, no per-action re-validation; no rate limiting. | ls/STATUS 🔴, ROADMAP H7 | **CANNOT-VERIFY** (deployed, not in-tree) |
| **L-09** | `?look=<unregistered>` still renders LS's identity/geography/jurisdiction — now with `console.error` (`instance.js:43-49`), **no user-visible failure**. | ROADMAP A12/A00 | **PARTIAL** |

### 2.2 SHOULD-FIX (14)

| ID | Statement | State |
|---|---|---|
| **L-10** | Check A runs with authoring OFF and silently skips ringless tiles — reports authoring as a 3.13 m bow. | **OPEN**, exact lines |
| **L-11** | `browse.bounds` = LS's frame in every town. Per-town radius already authored. | **OPEN** |
| **L-12** | Stage re-bleed: absent `heroKeyframes` inherits the last-opened Look's, written back on save. | **OPEN**, exact line |
| **L-13** | LS's authored sky cloned into all four real Looks by the Look seed. | **OPEN** — product decision, not a fix |
| **L-14** | `PreviewApp.jsx` hero-position literal — the defect A11-c fixed in `Scene.jsx`, in a second file. | **CANNOT-VERIFY** (file moved) |
| **L-15** | Offset not robust on tight bends; `STREET_SMOOTH` pinned 0 (`smoothCenterline.js:150`). ⭐ **The project's own gate confirms it** — curve-fit gate ❌ RED, **12 new needle/spur degenerates** at smooth=1.5. | **OPEN** (the "CURVE_FIT is OFF" half is rot) |
| **L-16** | Cul-de-sac keyhole gate ❌ RED — 2 turning circles, **10 mouth notches >16°** (worst 149°/154°/164°). | **OPEN**, measured today |
| **L-17** | Junction construction leaves **6 unresolvable pairs** and **30 tip-wraps** every run. | **OPEN**, measured today |
| **L-18** | Land use remainder: containment direction unsettled; `OSM_TO_LU` allow-list gap; `pickLuFromHash` live; Phase 3 unbuilt. | **OPEN** (steps 1–2 of 3 CLOSED) |
| **L-19** | Phantom park: `landuse=grass` → `'park'` (`classify.js:76`). | **OPEN** |
| **L-20** | `atlasKind /stem/` bug — 11.3% of placements render black. | **CANNOT-VERIFY** (not re-measured) |
| **L-21** | `acer_saccharum` 123 m card; card grid 11.7M→4.0M tris. | **CANNOT-VERIFY** |
| **L-22** | Trees don't reliably render — needs explicit `invalidate()` on asset load. | **OPEN** per board |
| **L-23** | `ws` is a genuine prod high; vite/esbuild/postcss criticals affect the build host. | **OPEN**, re-measured |

### 2.3 KNOWN-AND-ACCEPTABLE — document, don't fix now (21)

**Dead/vestigial, frozen behind the post-v1 removal window (8):** `POST /rebuild` ·
`_saveCenterlines` · `GET /analyze` · `toggleCoupler` · `Grove.jsx hovered` · `Workstage.jsx` ·
`PRESETS.browse` · `lsq-tokens.css`. ⚠️ **Two queue rows already executed and one rationale now
false — the queue needs one re-verify pass**, which its own `Verify-before-cut` column asks for.

**Doc-currency debt (4):** `SLAB-CONTRACT.md:9` · `AUDIT-MATRIX.md` frozen 06-15 · `ls/STATUS.md`
(**self-declared, deliberate**, blocked on Extent) · `AGENT-VALIDATION-SURFACES.md`.

**Dependency/build (2):** `poly2tri` + polyfill · dev-tooling CVEs.

**Blocked on a larger arc (7):** clip/`junctionMap` root (default-off, loudly counted) · tip
couplers · park-polygon retirement · `A0` (UNDECIDED) · `A6` junction geometry · `A9` pair-free edge
anchor · `A5` band-fold clamp.

⚠️ **REPORT-07a revises this bucket:** pair-free and freeze-the-curb move to SHOULD-FIX ("**that was
too generous; it is a specified, dispatch-ready fix, not a blocked one**"), ground-seam is added, and
the terminal-node removal pass is added. **Revised totals: 9 / 18 / 17 / 11.**

### 2.4 NOT-A-BUG (11) — being rigorous here is worth as much as finding bugs

1. **Per-block width differences on one street are the product.** `SURVEY §4`. Park Avenue genuinely
   differs per block. **Any measurement with `blockCustoms: null` mis-reports these — which is
   exactly why L-10 matters.**
2. **`layers.park[0]` is AUTHORED** — the 350×350 m origin square is `clean/park-polygon.json`,
   deliberately prefixed. **It reads synthetic and is not.** Retire via `tile #8`.
3. **A `layerVis` flip is the operator troubleshooting** — `A14`, correctly withdrawn.
4. **`A16`'s pre-fix `treelawn`/`sidewalk` slots** — ⛔ not assumable as fabrication; `SECTION §3.3`
   makes equal-width strips sacrosanct, so `1.5/1.5` may be correct.
5. **`tileGround.js:2684` `gleanTreelawn ? STD_TREELAWN : 0`** — may be `SECTION §3` step 3's ruled
   exception.
6. **`fare_config_select_all using (true)`** — RULED PUBLIC, recorded in-schema by migration `017`.
7. **`F-3` `complete-session`** — fixed in source, *deliberately* undeployed. A decision.
8. **The Look-seed mechanism (`A11`)** — was itself the fix for Altadena clobbering LS.
9. **The removal freeze** — a deliberate decision, not neglect.
10. **`ls/STATUS.md`'s staleness** — self-declared and ruled *"Do not tidy this."*
11. **The clip root reaching nothing on screen** — correctly scoped by the board as *"a blocker on
    the walk becoming the producer, never a diagnosis of a symptom."*

---

## 3 · Marker census

**6 markers, all `TODO`; ROADMAP `C9` claims 7 — accurate to within one, trending down.**

| File:line | Cluster |
|---|---|
| `src/hooks/useCary.js:481` | Cary — safety reports for device-based requesters |
| `src/components/CourierDots.jsx:22` | Kit-generality — installation-specific coordinate (ROADMAP C1) |
| `src/components/CourierDots.jsx:142` | Cary — active vs idle courier state |
| `cartograph/derive.js:1873` | Geometry — marker-stroke trigger for other areas |
| `cartograph/bake-lamps.js:47` | ✅ records a *resolved* TODO (2026-07-09) |
| `arborist/bake-look.js:1325` | ✅ records fixing `serve.js`'s TODO at source |

**Live count: 4.**

---

## 4 · The flagship detector, run today

`node scratch/correctness-detector.mjs` (exit 0), **with authoring loaded**:

- **29 of 31** curated defect names flagged (94% recall, 50% precision, 29/78 clean-grid FPs)
- **Curve-fit gate ❌ RED** — 12 new needle/spur degenerates at smooth=1.5 (**this is *why* L-15 is
  pinned to 0 — a measured blocker, not a preference**)
- **Cul-de-sac keyhole gate ❌ RED** — 10 mouth notches >16°
- Junction construction: 6 unresolvable pairs, 30 tip-wraps, every run

⚠️ **Read 29/31 with care:** precision is 50%, the curated set was labeled earlier, and **a
between-block difference is the product.** **The two ❌ RED gates are the hard, self-defined
failures. The 29/31 is a candidate list, not a defect count.**

---

## 5 · Security

**17 findings (F-1…F-17). 10 ticked CLOSED; 7 open or partial.** Genuinely open: **F-5**, **F-6**,
**F-11**, **F-12**, **F-13** (3 of 4), **F-14**, **F-17** (§3 says open, §1 line 41 says GONE — **the
doc contradicts itself**). **F-16 is closed and still listed.**

**F-5's shape, stated precisely because it reads worse than it is:** `cary/stripe/webhooks.js` is 136
lines exporting four bare handlers with no signature verification — and **no HTTP entrypoint and no
code importer anywhere.** **Unreachable source, not a live forged-webhook path.**
`constructEvent`/`STRIPE_WEBHOOK_SECRET`/`checkr-signature` appear **zero** times outside
`SECURITY.md`.

### 5.2 "Every CLOSED tick carries a command" — spot-checked

**7 of 10 ticked items name a runnable command in their own entry (70%).** F-1/F-7 lean on a shared
block at `:48-50`; **F-8 carries none and says so** — *"DDL applied; catalog not read."* ⭐ **The one
true gap is self-disclosed, not hidden.**

Three run: (1) `node scratch/claims-twilio-webhook-guard.mjs` — **PASS**, exit 0, 9 assertions incl.
*"NO FAIL-OPEN"*; tick earned. (2) `node scratch/claims-contact-sms-rate-limit.mjs` — **PASS**, exit
0, 22 assertions; tick earned. (3) `node scratch/claims-cary-anon-exposure.mjs` — **NOT RUN against
prod** (fetches live PostgREST); with no credentials it **fails closed**. Script correct; those
closures unverified from here.

⛔ **One instrument defect, and it's the project's signature shape.** `SECURITY.md:70` and `:426`
both assert `claims-onboarding-guard.sh` *"exits 1 until run with the key."* **It exits 0** — prints
`[ UNCHECKED ] SERVICE_ROLE exemption` and returns success (`:86`, `exit $rc`, where the unchecked
branch never sets `rc`). ***A check that reports "I did not check half the surface" while exiting 0
is invisible to any CI gate keyed on exit status.***

### 5.3 Disclosure

`claims-onboarding-guard.sh` was run believing (per the doc) it would abort without credentials. It
did not — `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are in the shell profile. It made read-only
RPC probes plus **one anonymous-user signup** against the live Supabase project; **that call is what
established F-16 is closed.** No other live call. **No secret values reproduced.** Classes
encountered by name only: Supabase anon/service-role keys, Stripe secret, Checkr API key, Twilio
SID/token, SendGrid key, `CRON_SECRET`, Apps-Script admin passphrase.

---

## 6 · Board health

### 6.1 Not four competing boards — two boards, one lens, one claims-ledger, plus a fifth nobody counted

| Doc | Kind | Items | Last commit | Verdict |
|---|---|---|---|---|
| `ROADMAP.md` | **Board** | 58 top-level (20 closed) | 08-29 | **The live master. Keep.** |
| `cartograph/BACKLOG.md` | **Board** | 50 bullets (12 closed) | 08-28 | ⚠️ **The fifth board.** Substantially disjoint. |
| `AUDIT-MATRIX.md` | Instrument + queue | ~108 rows, 10-row queue | **06-30** | **Stalest. 2 of 10 rows executed; 1 rationale false.** |
| `ACCORDANCE-REVIEW.md` | **Lens** | 18 rows | 08-29 | Explicitly pointer-not-restatement. Keep as lens. |
| `PIPELINE-CLAIMS.md` | Claims ledger, one family | 43 (16 REQ / 27 OUR) | 08-05 | Honest about scope. Keep. |
| `SECURITY.md` | Board, one domain | 17 findings | 08-25 | **Best-run board here.** Keep. |

**Cross-reference density shows hub-and-spoke, not rivalry:** ACCORDANCE cites ROADMAP 9× and
SECURITY 11×; PIPELINE-CLAIMS cites ROADMAP 9×; BACKLOG cites ROADMAP 3×. **AUDIT-MATRIX cites only
BACKLOG (1×) and is cited by almost nothing — it has fallen out of the graph.**

Genuine duplication is narrower than feared: **`ROADMAP` ⟷ `cartograph/BACKLOG`** (D3 corner
identity ⟷ A7; dead-end mouth crossing ⟷ A0; phantom park ⟷ land-use; T3 authoring ⟷ C4), and
**`AUDIT-MATRIX` ⟷ everything.**

### 6.2 ⛔ The ID collision — a real defect in the board

`ROADMAP.md` runs **two ID series colliding on eight IDs.** `A0 A1 A2 A3 A5 A7 A8 A9` each exist
**twice**, meaning unrelated work:

| ID | Meaning #1 | Meaning #2 |
|---|---|---|
| `A0`/`A00` | close the polygon at dead ends | the LS-fallback excision |
| `A1`/`A01` | flippable cul-de-sac legs | the stale committed artifact |
| `A5`/`A05` | band-fold thorn clamp | the curb check measuring authoring |
| `A7`/`A07` | fortify corner identity + ADA | the shape producer discloses |
| `A9`/`A09` | pair-free edge anchor | intake throws away OSM node tags |

```bash
grep -oE '^- \*\*(A|B|C|H|S)[0-9]+ ' ROADMAP.md | sort | uniq -c
```

⛔ **The brief commissioning this audit hit the collision** — it asked for "`ROADMAP A0` endcaps,"
which is `A0`, unrelated to `A00`. **Renumber before anything else.**

### 6.3 The recommendation

1. **Renumber ROADMAP first.** Nothing is safe to cite until the collision is gone.
2. **Fold `cartograph/BACKLOG.md` into Column A**, or demote it explicitly with a one-line pointer
   per item. **It is a second board with 50 bullets a ROADMAP reader never sees — the real
   duplication.**
3. **`AUDIT-MATRIX.md` → the Diary**, keeping two live extracts: the **removal queue**
   (re-verified) and the **productization register**, both moved into ROADMAP `C`/`H`. Its
   *methodology* is good and belongs in the Process doc, not on a board.
4. **`ACCORDANCE-REVIEW.md` stays a lens.** Its rows should carry ROADMAP IDs rather than a third ID
   space.
5. **`PIPELINE-CLAIMS.md` and `SECURITY.md` stay.** SECURITY is the model: numbered findings, a
   status each, a reproducing command per closure.
6. **Then build the CI gate.** Everything above decays again without it.

---

## 7 · In one paragraph

The engineering is in better shape than the boards suggest, and the boards are in worse shape than
their currency suggests. Four `TODO`s in live product code, a flagship detector that correctly loads
the operator's authoring, a security doc where 70% of closures carry a runnable proof and the one gap
is self-disclosed — **that is a disciplined project.** But nine things block a release (seven
security, six of those one-to-ten-line fixes), one in three "open" items is already closed or
misstated, the ROADMAP's IDs collide eight ways, and the kit's own stated deliverable — the automatic
check per bug class — exists as 79 scripts that nothing runs. **The gap between "a couple of bugs"
and what is actually open is not a gap in the code. It is a gap in the instrumentation of the boards,
and one `npm test` closes most of it.**
