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
- **Weather** is live from Open-Meteo and drives the volumetric `Atmosphere` (clouds) + wind (trees sway in lockstep). The meteorologist *rules* (almanac/presets/modulators) are authored in Stage and shipped as `/clouds/*.json`.
- **Look / framing / sky / post-FX / lighting / neon / arch** are all operator-authored in Cartograph's Stage and travel through `scene.json` — production replays them; it does not re-author. To change them, re-bake the Look, don't edit the runtime.
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
