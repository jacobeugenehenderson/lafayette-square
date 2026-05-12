# LS — API Inventory

Every backend endpoint the LS app calls at runtime. Format: pasteable catalog.

Last verified: 2026-05-12 against `cartograph-looks-pass-ab @ b39834b`. For deploy / DNS / secret management see [`../../PUBLISH.md`](../../PUBLISH.md). For data sources see [`INVENTORY-DATA.md`](INVENTORY-DATA.md). For auth + identity model see [`SECURITY.md`](SECURITY.md).

---

## A. Google Apps Script (GAS) — primary backend

Base URL (production): `https://script.google.com/macros/s/AKfycbxv3JihCx0U7JfGqle6ZpsLamkRS5PAEGRn6_NaM0Nc7r5zdY7kyctDioScGy8nVcAqWQ/exec`

Source: `apps-script/Code.js`. Auth: query param `dh=<deviceHash>` for user-scoped reads; POST body `device_hash` for writes; query param `admin=<token>` or POST body `admin_token` for admin-scoped ops. Token issuance via `admin-auth` (passphrase) + `admin-verify`.

Wrapper helpers live in `src/lib/api.js`. Two transports:
- `get(action, params)` → `GET ?action=<action>&...params&_t=<now>`
- `post(action, body)` → `POST <url>` with `Content-Type: text/plain` and body `{action, ...fields}`

Dev fallback: when `VITE_API_URL` is unset in dev, `lib/api.js` serves a 30+ entry in-memory mock map (no backend reached).

### Endpoint catalog (40+)

| Verb | Action | `lib/api.js` export | Caller(s) | Auth |
|---|---|---|---|---|
| GET | `init` | `getInit(dh)` | `hooks/useInit.js` (boot batch) | Optional `dh` |
| GET | `listings` | `getListings()` | `worker.js` (OG meta cache); admin | None |
| GET | `events` | `getEvents()` | `EventTicker.jsx` poll | None |
| GET | `handle` | `getHandle(dh)` | `useHandle` | `dh` |
| GET | `check-handle` | `checkHandleAvailability(h)` | `AvatarEditor.jsx` | None |
| GET | `reviews` | `getReviews(lid)` | `PlaceCard.jsx` | None |
| GET | `bulletins` | `getBulletins(dh)` | `BulletinModal.jsx` | Optional `dh` |
| GET | `comments` | `getComments(bid, dh)` | `BulletinModal.jsx` | Optional `dh` |
| GET | `threads` | `getThreads(dh)` | `ChatModal.jsx` | `dh` |
| GET | `thread-messages` | `getThreadMessages(tid, dh)` | `ChatModal.jsx` | `dh` |
| GET | `checkin-status` | `getCheckinStatus(dh)` | `useLocalStatus` | `dh` |
| GET | `claim-secret` | `getClaimSecret(lid, dh)` / `getClaimSecretAdmin(lid)` | Guardian flow / admin | `dh` or `admin` |
| GET | `getDesign` | `getQrDesign(lid, type)` | QR Studio | None |
| GET | `listing-staff` | `getListingStaff(dh, lid)` | Guardian flow | `dh` |
| GET | `residence-status` | `getResidenceStatus(dh)` | `useResidence` | `dh` |
| GET | `resident-count` | `getResidentCount(bid)` | `BulletinModal.jsx` | None |
| GET | `lobby-posts` | `getLobbyPosts(dh, bid)` | `BulletinModal.jsx` (lobby tab) | `dh` |
| GET | `linked-devices` | `getLinkedDeviceCount(dh)` | `App.jsx` (sign-out copy) | `dh` |
| GET | `create-link-token` | `createLinkToken(dh)` | `App.jsx` link-device flow | Optional `dh` |
| GET | `check-link-token` | `checkLinkToken(token)` | `LinkPage.jsx` | None |
| GET | `admin-auth` | `adminAuth(passphrase)` | `AdminPrompt.jsx` | Passphrase |
| GET | `admin-verify` | `adminVerify(token)` | `useGuardianStatus`, boot | Token |
| POST | `checkin` | `postCheckin(dh, lid)` | `CheckinPage.jsx` | `device_hash` |
| POST | `claim` | `postClaim(dh, lid, secret)` | `ClaimPage.jsx` | `device_hash` + `secret` |
| POST | `review` | `postReview(...)` | `PlaceCard.jsx` | `device_hash` |
| POST | `reply` | `postReply(dh, reviewId, lid, text)` | Guardian flow | `device_hash` (must own listing) |
| POST | `event` | `postEvent(...)` | Guardian flow | `device_hash` |
| POST | `set-handle` | `setHandle(dh, handle, avatar, vignette)` | `AvatarEditor.jsx` | `device_hash` |
| POST | `update-avatar` | `updateAvatar(dh, avatar, vignette)` | `AvatarEditor.jsx` | `device_hash` |
| POST | `upload-photo` | `uploadPhoto(dh, lid, imageData)` | Guardian flow | `device_hash` (must own listing) |
| POST | `remove-photo` | `removePhoto(dh, lid, url)` | Guardian flow | `device_hash` |
| POST | `update-listing` | `updateListing(dh, lid, fields)` | Guardian flow | `device_hash` |
| POST | `accept-listing` | `acceptListing(dh, lid)` | Guardian flow | `device_hash` |
| POST | `remove-listing` | `removeListing(dh, lid)` | Admin | `device_hash` (admin) |
| POST | `update-staff-perms` | `updateStaffPermissions(...)` | Guardian flow | `device_hash` (owner) |
| POST | `promote-staff` / `demote-staff` / `revoke-staff` | `promoteStaff` etc. | Guardian flow | `device_hash` (owner) |
| POST | `bulletin` | `postBulletin(dh, section, text, anonymous)` | `BulletinModal.jsx` | `device_hash` |
| POST | `remove-bulletin` | `removeBulletin(dh, bid)` | `BulletinModal.jsx` (author or admin) | `device_hash` |
| POST | `comment` | `postComment(dh, bid, text, anonymous)` | `BulletinModal.jsx` | `device_hash` |
| POST | `remove-comment` | `removeComment(dh, cid)` | `BulletinModal.jsx` | `device_hash` |
| POST | `start-thread` | `startThread(dh, bid)` | `BulletinModal.jsx` | `device_hash` |
| POST | `send-message` | `sendMessage(dh, tid, text)` | `ChatModal.jsx` | `device_hash` |
| POST | `close-thread` | `closeThread(dh, tid)` | `ChatModal.jsx` | `device_hash` |
| POST | `claim-link-token` | `claimLinkToken(token, dh)` | Link-device flow | `device_hash` |
| POST | `claim-residence` | `claimResidence(dh, bid, autoVerify, admin)` | Residence flow | `device_hash` (admin optional) |
| POST | `verify-resident` | `verifyResident(verifierHash, targetHash, bid)` | Residence flow | Verifier `device_hash` |
| POST | `lobby-post` | `postLobbyPost(dh, bid, text, photoUrl, imageData)` | `BulletinModal.jsx` (lobby tab) | `device_hash` (resident) |
| POST | `remove-lobby-post` | `removeLobbyPost(dh, postId)` | `BulletinModal.jsx` | `device_hash` |
| POST | `leave-residence` | `leaveResidence(dh)` | Residence flow | `device_hash` |

### GAS Sheets (server-side state)

Per `PUBLISH.md §2`:

| Sheet | Purpose |
|---|---|
| Listings | All landmark/business data (synced from `landmarks.json` on init) |
| Checkins | Device check-in log per location |
| Reviews | Star ratings + text reviews |
| Events | Community calendar events |
| Guardians | Device → listing guardian mapping |
| Residents | Device → building residence claims + verification status |
| LobbyPosts | Per-building resident-only posts |
| Handles | Device → handle/avatar mapping |
| QRDesigns | Styled QR images per listing |
| (Bulletins / Comments / Threads / Messages — TO VERIFY against `apps-script/Code.js`) | |

### Deployment ID single source of truth

Per `PUBLISH.md §"Single source of truth"`, the deployment ID must match across four locations:
- `PUBLISH.md` heading
- `.env` → `VITE_API_URL`
- GitHub Secret → `VITE_API_URL`
- `public/codedesk/index.html` → `window.LSQ_API_URL`
- `worker.js` → `GAS_API` constant (also)

Drift = "Unknown-action" errors at runtime.

---

## B. Supabase — Cary courier + chat realtime

Project: `ngbvgjzrpnfrqmzkqvch` (`https://ngbvgjzrpnfrqmzkqvch.supabase.co`). Anon key in `VITE_SUPABASE_ANON_KEY`.

Client wrapper: `src/lib/supabase.js`. When the env vars are unset, returns a safe-stub client so the rest of the app stays functional (Cary features inert).

### Tables (`.from(...)`)

| Table | Accessor | Used in |
|---|---|---|
| `requests` | `.from('requests')` | `useCary` (active request lookup, dispatch, completion); courier flow |
| `sessions` | `.from('sessions')` | `useCary` (active session, history) |
| `profiles` | `.from('profiles')` | `useCary` (general profile) |
| `courier_profiles` | `.from('courier_profiles')` | `useCary` (onboarding state); `useInit` |
| `courier_locations` | `.from('courier_locations')` | `CourierDots.jsx` (realtime positions); `useCary` (broadcast) |

### RPCs (`.rpc(...)`)

| RPC | Purpose | Caller |
|---|---|---|
| `get_onboarding_status` | Returns current courier onboarding step | `useCary` |

### Edge Functions (`.functions.invoke(...)`)

| Function | Purpose | Caller |
|---|---|---|
| `onboarding` | Multi-step courier onboarding state machine | `useCary` |
| `dispatch` | Match request → courier | `useCary` |
| `complete-session` | Finalize courier session | `useCary` |
| `web-messages` | Inbound web→courier message bridge | `ChatModal.jsx` |
| `sms-inbox` | List SMS conversations | `SmsInbox.jsx` |
| `sms-reply` | Send SMS reply | `SmsInbox.jsx` |
| `contact-sms` | Contact-form → SMS gateway | `ContactModal.jsx` |

### Auth

`supabase.auth.signInWithOtp({ phone })` — phone-OTP. Session via `supabase.auth.getSession()` / `verifyOtp({ token, phone, type: 'sms' })`. Used by Cary couriers exclusively today; LS end users don't auth via Supabase.

### Realtime channels

Subscriptions via `.channel(name).on('postgres_changes', ...)` — used in `CourierDots` for `courier_locations` updates and `useCary` for request/session changes. (Exact channel names TO VERIFY by grepping `.channel(`.)

### Status

Cary surfaces are **behind "coming soon" placeholders in production today** (per `PUBLISH.md §5`). The Supabase project is live and the code paths work; UI is gated.

---

## C. Cloudflare Worker — OG meta injection

Source: `worker.js`. Route: `lafayette-square.com/place/*` on the `lafayette-square.com` zone.

| Trigger | Behavior |
|---|---|
| `/place/<listingId>` | Fetch `INDEX_URL`, inject `<meta property="og:*">` tags for the listing (cached 5 min per `CACHE_TTL`) |
| Anything else | Straight proxy to origin (`ORIGIN + path + url.search`) |

Reads `GAS_API?action=listings` to look up listing for OG title/description/image. This is the only Worker-side call to GAS — and yet another spot the deployment ID must match.

Deploy: Cloudflare dashboard → Workers & Pages → `lafayette-square-proxy` → Edit Code → paste `worker.js`.

---

## D. External APIs

| API | URL | Purpose | Auth | Caller |
|---|---|---|---|---|
| open-meteo | `https://api.open-meteo.com/v1/forecast?latitude=38.616&longitude=-90.2161&current=...&hourly=...&forecast_hours=48&temperature_unit=fahrenheit&timezone=America/Chicago` | 48-hour weather forecast for St. Louis | None (free tier) | `hooks/useWeather.js:fetchWeather()` (called by `WeatherPoller`) |

Polling interval: see `WeatherPoller.jsx` (also re-fetches on tab refocus).

---

## E. Cartograph backend (dev-only, never reached in production)

Production never hits these — listed only so partners don't mistake them for runtime deps.

| Service | URL (dev) | Used by |
|---|---|---|
| `cartograph/serve.js` | `localhost:3333/api/cartograph/*` | Designer / Stage panels in `src/cartograph/` |
| `arborist/serve.js` | `localhost:3334/api/arborist/*` | Arborist UI in `src/arborist/` |
| `meteorologist/serve.js` | `localhost:3335/api/meteorologist/*` | Meteorologist panel (in Stage) |

---

## F. Environment variables

Read at build time via `import.meta.env.*`:

| Var | Required? | Default behavior if missing |
|---|---|---|
| `VITE_API_URL` | Production yes; dev optional | Dev: serves 30+ in-memory GAS mocks. Prod build: API calls hit empty URL and throw. |
| `VITE_SUPABASE_URL` | Cary surfaces only | Stub client; Cary inert |
| `VITE_SUPABASE_ANON_KEY` | Cary surfaces only | Stub client; Cary inert |

GitHub Pages build injects all three from GitHub Secrets via `.github/workflows/deploy.yml`.

---

## G. Identity flow at a glance

```
Browser opens lafayette-square.com
  ↓
getDeviceHash()  (src/lib/device.js — deterministic browser fingerprint)
  ↓
useInit.runInit() fires once on import
  ├─ GAS: getInit(deviceHash)  → listings + events + handle + residence
  └─ Supabase: auth.getSession() → Cary session (if any)
  ↓
Hooks hydrate:
  useListings  ← landmarks.json + menus.json + GAS listings
  useEvents    ← GAS events (fallback: seedEvents.json)
  useHandle    ← GAS handle
  useResidence ← GAS residence-status (lazy)
  useCary      ← Supabase session + courier_profile (if onboarded)
```

Every subsequent write is keyed by `device_hash` (GAS) or `supabase.auth.user().id` (Cary).
