# Lafayette Square — Operations

**Kind:** Reference (operator's manual). The operator-facing counterpoint to `FEATURES.md` (user-facing) and `ARCHITECTURE.md` (developer-facing). What you need to *run* LS: admin powers, the data backend, moderation, runtime knobs, and the known operational gaps.

> Seeded 2026-06-02 from the forensic inventory (`scratch/ls-forensic-inventory.md` §§3, 6). The role *system* is also described user-side in `FEATURES.md`; here it's framed for whoever operates the neighborhood.

---

## 1. Admin access

- **Enter admin** by appending `?admin` to the URL → passphrase prompt (`AdminPrompt`, mounts before the scene). The passphrase is **not in code** — it's a Google Apps Script *Script Property* (`ADMIN_PASSPHRASE`), set manually in the GAS project.
- A correct passphrase returns a **6-hour token**, cached in `localStorage` (`lsq_admin_token`) and re-verified async on reload.
- **Exit / reset identity:** `?logout` clears all identity keys (admin token, guardian list, handle).
- **What admin unlocks:** auto-verify any residence claim; generate/fetch a listing's QR claim secret (and auto-provision a listing on the fly); run one-time `setup-photo-folder` (creates the Drive folder for photos).

> ⚠️ **Security:** the admin token is trusted for the session and passed in request bodies. Treat it like a root password — anyone who captures it has 6 hours of those powers. Hardening (signed/ephemeral JWT, per-action re-verify, rate-limiting, audit log) is a tracked arc: `project_ls_security_arc`, sequenced after doc-formalization. Privileged *writes* are otherwise sound — the backend re-verifies the caller against the Guardians/Residents/Checkins sheet on 25+ endpoints before mutating.

---

## 2. The role system (operator's view)

> **Deep specs per role:** [`TOWNIES.md`](TOWNIES.md) (check-in ladder + gates) · [`GUARDIANS.md`](GUARDIANS.md) (claim, permission model, staff ops) · [`RESIDENTS.md`](RESIDENTS.md) (residence + lobby). This table is the at-a-glance summary; the mechanics live in those.

| Role | How earned | Powers |
|------|-----------|--------|
| **Visitor** | default (anonymous device hash) | browse, search, read everything |
| **Townie** | 3+ distinct check-in days in a rolling 14-day window (server-computed) — **also auto-granted on claiming a listing or verifying a residence** (all four residence paths incl. co-resident, `grantTownieStatus`, backfills synthetic check-ins; intended as-built per Jacob 2026-06-30) | post reviews, post to bulletin + comment + DM threads |
| **Resident** | claim a building → verified by admin, QR invite, an existing verified resident, or a linked already-verified device | building's private lobby (read + post) |
| **Keyholder** | added by a guardian | exactly the per-field permissions the guardian grants (menu / hours / photos / replies / events) |
| **Guardian** | first to claim a listing via its QR secret (physical presence) | full edit of the listing + manage its staff (promote/demote/revoke) |
| **Admin** | `?admin` + passphrase | see §1 |

- **Identity** is a per-device anonymous UUID (`lsq_device_hash`) + a chosen `@handle` + emoji/vignette avatar. No email, no password. A handle can be carried across devices via a 6-char link token (5-min expiry).
- **Claiming a listing** requires the secret printed on the physical QR card at the location — this is the presence proof that anchors the whole guardian system.
- **What a guardian actually edits** (every card field, the menu/delivery model, where curated menus live vs. guardian-authored ones) is specced in [`PLACE-CARDS.md`](PLACE-CARDS.md).

---

## 3. The data backend

- **One Google Apps Script web app** (`apps-script/Code.js`), deployed "Execute as: Me / Access: Anyone", fronting **one shared Google Sheet** (`SPREADSHEET_ID` hardcoded in `Code.js`, 14 tabs). **~54 actions / 57 GET+POST routes** (reconciled 2026-06-30 against `Code.js`), all routed via `?action=` (full table in `reference/INVENTORY-API.md`).
- **Photos** live in a Google Drive folder (`PHOTO_FOLDER_ID` in Script Properties, created once via `setup-photo-folder`); URLs are stored in the Sheet and are **public** (guessable Drive links).
- **Supabase** backs the Cary courier system (phone-OTP auth, `courier_profiles`, realtime dispatch/chat) + the live courier count on the masthead.
- **Open-Meteo** (no key) supplies live weather; polled every 5 min + on tab-focus.
- **Cloudflare Worker** (`worker.js`) injects per-`/place/*` OG tags for social previews.
- **Client fetch layer** (`src/lib/api.js`): no auth header (device hash in params/body), no retry, no caching, online-only. If `VITE_API_URL` is unset in dev → in-memory mocks.

### Operational facts to know
- **No audit log / no versioning** — the Sheet is the mutable source of truth. A bad edit or deletion has no built-in trail or rollback. Keep periodic Sheet backups.
- **Optimistic gates** — townie/guardian gates are enforced server-side, but if the API is *unreachable*, the client fails open silently (no error UI). Correctness depends on the backend being up.
- **No rate-limiting** — after the townie gate, posting is unlimited. Spam mitigation today is the townie gate + manual moderation.

---

## 4. Moderation

- **Reviews are immutable** — no edit/delete UI. To remove a review, edit the Sheet directly (the only path today). Guardians (and keyholders with the `replies` permission) can *reply* to reviews but not delete them; **a reply posts in the business voice** (logo + name, not the staffer's handle — managers stay anonymous, 2026-06-30).
- **Events** — guardians create; **no delete UI** (remove via Sheet).
- **Bulletin posts/comments** — authors delete their own (post-delete cascades to its comments; DM threads spun off a deleted post become orphaned/read-only). No admin moderation UI; remove via Sheet.
- **Listings** — guardians can mark their own removed (`remove-listing`); admin can act via the Sheet / claim-secret tooling.

---

## 5. Runtime knobs (what's live vs authored)

- **Time of day** is *live wall-clock* in production (`ClockCalendarPump`, mode=`live`, 60s tick). The scrub UI (`DawnTimeline`) exists only in Stage/Preview authoring — production has no time-scrub. Geography (lat/lon/tz) is fixed per instance in `src/instance.js`, **not** slab-authored.
- **Weather** is live from Open-Meteo and drives the volumetric `Atmosphere` (clouds). The meteorologist *rules* (almanac/presets/modulators) are authored in Stage and shipped as `/clouds/*.json`.
  - ◻ **OWED, NOT SHIPPED — wind** (Jacob, 2026-08-22: *"we'll want wind which is informed by the meteorologist; that's why it's not really hooked up in the runtime environment or the arborist yet"*). The tree sway apparatus is real and mounted — `treeSwayUniforms` + `InstancedTrees#SwayDriver`, reading `useAtmosphere`'s tweened directive — but **almost no directive carries a `wind` block**, so `uWindIntensity` sits at 0 and the canopy runs on the 5 mm rustle floor alone. ⚠️ Kept as open state, not as a correction notice: the claim that this shipped has been excised, and what remains is the owed work — an unbuilt decision filed as done is how it stays unbuilt. ▶ Re-derive, never quote: `node -e "const a=require('./public/clouds/almanac.json');console.log(a.rules.filter(r=>JSON.stringify(r).includes('\"wind\"')).length+'/'+a.rules.length+' rules author wind')"`
- **Leaf transmission** — how much light comes *through* a leaf rather than off it. `uLeafTransmission` on the shared tree material, with `uLeafTransmissionSharpness` for how tightly the glow hugs the light's direction. ⭐ **Default 0, and 0 is what ships** — every scene renders exactly as it did before this existed until someone authors a value, which is what made it safe to put on the material every tree uses. It applies to **every directional light**, so a moonlit canopy transmits too. ⭐ **It is species-agnostic by construction** — the gate is leaf-vs-bark (`vBark`), not a species table — so pointing the canary at a different tree carries it over with no work. ▶ Tune by eye on the proving ground: `?view=fullmonte&at=17:55&leafT=<0..4>&leafK=<0.25..16>`. ⚠️ **`?at=` is not optional for judging this.** The diorama runs on live wall clock, so at midday the sun is overhead, nothing is backlit, and an effect that depends on backlight is invisible — which reads exactly like it did not work. Put the sun low first, then move the dial; ⚠️ **not yet authored per Look** — the value is a decision, and until it is made the map is unchanged. ⛔ It is a uniform branch, never a shader variant: a second compiled program breaks the single-program constraint Bloom needs.
- **Look / framing / sky / post-FX / lighting / neon / arch** are all operator-authored in Cartograph's Stage and travel through `scene.json` — production replays them; it does not re-author. To change them, re-bake the Look, don't edit the runtime.
- **The embeddable scenes** (`?embed=sky`, `?embed=tree`) are FRAMED-only and carry no chrome — a direct visit shows nothing, by design. `?embed=tree` takes `?species=` / `?lod=` / `?variant=` so a host page can frame a different specimen without a rebuild; it defaults to the Look's baked `linden_american` at lod0. ⛔ It reads the **bake** (`public/baked/<look>/trees/…`), never the Arborist's source pool (`public/trees/` is gitignored authoring-only), so anything it shows is a thing that actually deploys. The operator's own view of the same scene is the Arborist's `?view=fullmonte`.
- **The public contact fields are AUTHORED PER INSTALLATION and there are three** — `contact.email`, `cary.email`, `cary.smsNumber` (`src/instances/<look>.js`). ⭐ **They are PUBLIC**: they render on the legal page, which every installation shows and which **no module flag gates** — so an unset field is visible to the public, not hidden by an off switch. ⛔ **Use an alias, not a personal address** — LS ships `jacob@lafayette-square.com`, forwarded, so the operator's real mailbox is one layer removed from a scraped page. ⚠️ **Unset, the page now renders a labelled gap** (`[not set for this installation]`) and `src/instance.js:90` logs which fields are missing at boot; **before 2026-08-23 it emitted a dead `mailto:null` link and said nothing** — a plausible-looking success, which is the failure mode a kit can least afford. ▶ `node -e "…"` is not needed: open the legal page of a fresh pour and the check prints to the console.
- **Mobile vs desktop** diverge by design: mobile = linear depth, no soft shadows, untextured, 1× DPR; desktop = log depth, soft shadows, full textures, up to 1.5× DPR. The `logarithmicDepthBuffer: !IS_MOBILE` gate is load-bearing.

---

## 6. Deploy

- **Production:** GitHub Pages from `main` (`deploy.yml`), `BASE_URL='/'`, apex domain `lafayette-square.com` (CNAME); Cloudflare owns DNS + the OG Worker.
- **Staging:** auto-deploys on push to the trunk `curb-offset-draw` (`staging.yml`; repointed from the retired `cartograph-looks-pass-ab` 2026-07-08) at `…/lafayette-square-staging/` with `--base=/lafayette-square-staging/`; all asset fetches route through `import.meta.env.BASE_URL` so the same build works at root or subpath.
- **Rollback floor:** tag `v1-pre-cartograph-merge` (`20866ef`) — `git push --force-with-lease origin v1-pre-cartograph-merge:main` restores last-known-good.
- **Backend redeploy:** GAS is deployed from its own Apps Script project (not the Pages build). Updating `Code.js` requires re-publishing the web-app deployment.
- See `PUBLISH.md` for the full procedures (Pages, GAS, Worker, DNS, Supabase).

> Note (2026-06-02): the render-conformance arc left a **pending production redeploy** so the deployed app picks up recent fixes — confirm before calling production current. See root state docs.

---

## 7. Known operational gaps (from the inventory)

- **Security arc** (post-doc): admin-token hotspot (ship-blocker), no rate-limiting, no audit log — `project_ls_security_arc`.
- **No review edit/delete, no event delete** UI — Sheet-only.
- **`savedesign` (QR design) endpoint has no auth gate** — low risk (cosmetic), but open.
- ⛔ **`contact-sms` is an unauthenticated endpoint that SPENDS MONEY** — `cary/supabase/functions/contact-sms/index.ts` has `Access-Control-Allow-Origin: '*'`, no caller auth, and no rate limit, and it calls Twilio and SendGrid. So the exposure is not a data leak but **billable abuse from any origin**. Higher priority than `savedesign` above, which is merely cosmetic. Tracked with the security arc.
- ⛔ **`009_security_advisor_fixes.sql` is written and NOT APPLIED** — it enables RLS on `sms_messages` and revokes `anon`/`authenticated`. Until `supabase db push` runs, the anon key can read message bodies and phone numbers. ⚠️ Application state is **not verifiable from the repo** — the migration file on disk proves nothing about the live database. Jacob owns running it.
- **Milky Way** is mounted-disabled (`CelestialBodies.jsx` ~1194) — **keep / re-enable** (one-line uncomment), do not delete.
- **`HERO_CENTER`/`HERO_TARGET`** — removable vestigial fallback (hero framing is slab-authored now).
- **Community stats go stale until reload** (`useCommunityStats` hydrates once at boot; courier count is the only live one).
- **EventForm** can't author event *times* / day-of-week (schema supports it; UI doesn't) and its guest-list field is unwired.

---

## Pointers
- `FEATURES.md` — the same surfaces, user-facing
- `ARCHITECTURE.md` — runtime composition, slab boundary, endpoint table
- `STATUS.md` — the whole-picture section×state map
- `reference/INVENTORY-API.md` — endpoint reference
- `PUBLISH.md` — deployment procedures
- `scratch/ls-forensic-inventory.md` — the raw §§1–6 source this doc distills
