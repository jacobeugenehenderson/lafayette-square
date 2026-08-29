# LS — QR codes & the QR Studio

The QR codes are LS's bridge to the physical world: scanning a printed card at a real location is how someone checks in, claims a listing, verifies residence, or links a device. This is the reference for every QR type, the secret model behind them, and the QR Studio that designs the printable cards. Related specs: [`TOWNIES.md`](TOWNIES.md) (check-in), [`GUARDIANS.md`](GUARDIANS.md) (claim secret), [`RESIDENTS.md`](RESIDENTS.md) (resident invite), [`PLACE-CARDS.md`](PLACE-CARDS.md) (the QR tab on a card). Endpoints: [`reference/INVENTORY-API.md`](reference/INVENTORY-API.md).

Last verified: 2026-06-29 against the working tree (`curb-offset-draw`).

---

## 1. What it is

Every QR encodes a **deep-link URL** into the app. Routes are parsed in `src/App.jsx:609–629`. There are **four** kinds, and the printed card *is* the credential — possession of the physical card is the trust anchor.

| QR type | Encodes | Scanning it… | Carries | For |
|---|---|---|---|---|
| **Check-in (Townie)** | `/checkin/<listingId>` | logs a check-in toward townie status | — | visitors/customers |
| **Resident** | `/checkin/<buildingId>` | auto-verifies residence (neighbor invite) | — | neighbors inviting co-residents |
| **Guardian (claim)** | `/claim/<listingId>/<secret>` | claims the listing (1st = guardian, then keyholder) | the 8-char `claim_secret` | business owner / staff |
| **Device link** | `/link/<token>` | syncs your identity onto another device | a 6-char token (5-min TTL) | one person, multiple devices |

The same `/checkin/<id>` route serves both **Check-in** and **Resident** QRs; `CheckinPage.jsx` branches on whether the target is residential (`:181`). **Residential places have no Guardian QR** — residents are invited via the Resident QR; there's no staff-claim override (`PlaceCard.jsx:2418`, `(!isResidential || isHouse)`).

QR images are rendered **client-side** via the `QRCode` lib (`QRCode.toDataURL(url, …)` — e.g. `PlaceCard.jsx:2331`/`2350`, `App.jsx:100`).

---

## 2. The claim secret (Guardian QR) — the security model

The Guardian QR embeds an 8-char hex `claim_secret` directly in its URL, so **the printed card is the credential** — there's no separate auth token. Generated lazily and persisted on the Listings sheet (`getClaimSecret`, `apps-script/Code.js:792`):

```js
var secret = Utilities.getUuid().split('-')[0]   // 8-char hex, generated on first fetch if missing
// persisted to the listing's claim_secret column
```

- **Who may fetch it:** a **full guardian** of the listing (`isFullGuardianOf`) or an **admin** (`getClaimSecretAdmin`). For a non-existent listing, **admin only** — it auto-provisions a minimal `residential/houses` row so a card can be printed (`Code.js:800`).
- **Validation on claim:** `postClaim` (`Code.js:601`) rejects a mismatched secret (`:614`); first claimant becomes guardian, the rest keyholders (`:629`). See [`GUARDIANS.md`](GUARDIANS.md).
- **Stripped from public reads:** `claim_secret` (with `guardian_hash`/`guardian_token`) is deleted from the `getListings` response (`Code.js:337`).

Check-in and Resident QRs carry **no secret** — they encode only an id; the trust there is the physical card itself (the Resident QR copy warns "a gesture of trust between neighbors, please don't share it outside your building," `CheckinPage.jsx:286`).

---

## 3. The device-link token

The Link QR (`/link/<token>`) syncs one person's identity (handle + avatar + vignette) across devices. The token is a **6-char alphanumeric, 5-minute TTL** held in Apps Script cache (`createLinkToken`, `Code.js:1035`):
- **Push mode** — the creating device has a handle → identity is embedded in the token; the scanning device adopts it.
- **Pull mode** — the creating device has no handle → the token is pending; the scanning device pushes *its* identity back.

Flow: `createLinkToken` → `postClaimLinkToken` (`Code.js:1059`) → `checkLinkToken` poll (`Code.js:1109`). UI lives in the account popover (`App.jsx:100–128`, `LinkPage.jsx`). A linked device also unlocks the **linked-device** residence auto-verify path — see [`RESIDENTS.md`](RESIDENTS.md).

---

## 4. The QR Studio (Code Desk)

Printable cards are designed in the **QR Studio**, embedded as an iframe by `CodeDeskModal.jsx` and opened from a card's QR tab ("Design in QR Studio", `PlaceCard.jsx:2477`). It opens in **guardian mode** (locked to one listing) or **admin mode** (full place picker).

> ### ⛔⛔ THERE ARE THREE DEPLOYED CODEDESKS AND THEY ALL DIFFER *(measured 2026-08-29)*
> `public/codedesk/` in THIS repo is **an in-app copy**, not the tool Jacob authors in.
> A fix applied here reaches the LS place-card modal and nothing else.
>
> | build | source | who uses it |
> |---|---|---|
> | `github.io/**codedesk**/` | repo `jacobeugenehenderson/codedesk` | ⭐ **PRODUCTION** — framed by `jacobhenderson.studio` (`?mode=embed`) |
> | `<app>/codedesk/` | `public/codedesk/` here | the LS place-card QR tab |
> | `github.io/ascend-portal/…` · `ascend.jacobhenderson.studio/…` | repo `ascend-portal` | ⚰️ **dead siblings** — Jacob: *"I don't care about the ascend version"* |
>
> ⚠️ **They are not the same file and none matches another.** On 2026-08-29 they measured
> 95,884 / 80,350 / 77,586 bytes for `qr_sync_pipeline.js`, and the Cloudflare one matched
> **no commit in any checkout**. ⛔ **So "the live tool" is a question with three answers —
> certify which one before editing.** A whole fix was applied to the wrong copy that day
> because the repo that happened to be open was named `codedesk`.
> ▶ `curl -s <base>/codedesk/qr_sync_pipeline.js | md5` against your working copy.
> ⭐ The payload rules, the two-builder trap and how to check a code's scanning margin live
> in the PRODUCTION repo's own `README.md` — not here, and not in `public/codedesk/`.

- **Host ↔ studio** talk over `postMessage` (`CodeDeskModal.jsx:83–114`): `lsq-set-qr-type` (Townie/Resident/Guardian), `lsq-set-businesses`, `lsq-set-listing`, `lsq-set-claim-secret`, `lsq-save` → `lsq-saved`.
- **Engine files** (`public/codedesk/`): `qr_app-bootstrapper.js`, `qr_render_engine.js` (canvas), `qr_state_engine.js`, `qr_sync_pipeline.js` (persistence), `qr_ui_toolkit.js`, plus `qr_type_manifest.json` + `qr_templates.json`.
- **Customizable:** campaign + caption text, text/body colors, background gradient (top/bottom + alpha or transparent), module/eye-ring/eye-center shapes (Square or Emoji mode), a center logo/emoji, scales. Font is fixed (IBM Plex Sans).

⚠️ **OPEN (2026-08-29, Jacob) — A MODULE BRIGHTNESS EDIT DOES NOT REACH THE RENDER.** He set the module values to 5% brightness deliberately; the rendered code came out unchanged. ⭐ **Raising ERROR CORRECTION in the same session did take effect and is measurable** — the same design went from decoding on 1 of 24 preprocessing variants to **8 of 18, first try, unprocessed** — so the ECC pill is wired and this is specific to the module colour path. ⛔ **Cause not established** — not measured, so nothing here says why. ▶ First place to look: the `style` shape below carries `bodyColor`, `eyeRingColor` and `eyeCenterColor` but **no module colour of its own**, so it is worth confirming which field the modules actually draw from in `qr_render_engine.js` before assuming the edit was lost in state or in persistence. ⚠️ Contrast is not cosmetic here: the code shipped on `theward.online` decoded only after thresholding at native size (Chrome BarcodeDetector, 2026-08-29), so the brightness control is the one that governs whether a code scans at all.

### Design object + persistence
The design shape (`qr_sync_pipeline.js`):
```js
{ v: 1, at: <ts>, fields: {}, style: {
    fontFamily, campaign, captionBody, captionColor, bodyColor,
    eyeRingColor, eyeCenterColor, bgTransparent, bgTopHex, bgBottomHex,
    bgTopAlpha, bgBottomAlpha, moduleShape, eyeRingShape, eyeCenterShape,
    modulesMode, modulesEmoji, modulesScale, centerMode, centerEmoji,
    centerScale, eyeCenterMode, eyeCenterEmoji, eyeCenterScale } }
```
- **Backend:** the **Designs** sheet `['biz_id', 'design_json', 'updated_at']` (`Code.js:1940`), keyed `biz_id = <listingId>-<Type>` (e.g. `lmk-010-Guardian`). `getDesign(bizId)` (`Code.js:1556`) / `saveDesign(body)` (`Code.js:1569`, auto-creates the sheet). API wrapper `getQrDesign(listingId, type)` (`api.js:225`).
- **Local-first:** designs cache in `localStorage` under `lsq-qr-design-<bizId>-<type>`; **save is explicit** (the Save button), remote save is fire-and-forget; on load, a newer remote `updated_at` wins. Switching type preserves the prior design in a session cache (no data loss) and auto-fetches the claim secret when switching to Guardian.

> Design records are **keyed by `bizId-type` and not access-gated** — anyone who knows a `bizId` could read a design. Low-sensitivity (cosmetic card styling), but noted.

---

## Source map
| Thing | File | Key lines |
|---|---|---|
| Route parsing | `src/App.jsx` | 609–629 (checkin 613 · claim 615 · link 617) |
| QR rendering (client) | `src/components/PlaceCard.jsx` · `src/App.jsx` | `QrTab` 2299–2489 (Townie 2331 · secret 2343 · Guardian 2350) · link 100 |
| Check-in / resident flow | `src/pages/CheckinPage.jsx` | 173–217 (residential branch 181; invite copy 286) |
| Claim flow | `src/pages/ClaimPage.jsx` | 9–27 |
| Device link | `src/pages/LinkPage.jsx` · `src/App.jsx` | 6–50 · 100–128 |
| QR Studio host | `src/components/CodeDeskModal.jsx` | store 6–21 · iframe 169 · postMessage 83–114 |
| QR Studio app — ⛔ **the in-app COPY, not production** (§4) | `public/codedesk/` | `qr_sync_pipeline.js` (design shape, persistence) + engine files |
| QR Studio app — ⭐ **PRODUCTION**, framed by jacobhenderson.studio | repo `jacobeugenehenderson/codedesk` (outside this repo) | its own `README.md` carries the payload rules + the two-builder trap |
| Claim secret | `apps-script/Code.js` | `getClaimSecret` 792–831 (gen 800/822) · validate `postClaim` 614 |
| Designs backend | `apps-script/Code.js` | `getDesign` 1556 · `saveDesign` 1569 · sheet 1940 · routes 194/246 |
| Device-link backend | `apps-script/Code.js` | `createLinkToken` 1035 · `postClaimLinkToken` 1059 · `checkLinkToken` 1109 |
| API wrappers | `src/lib/api.js` | getQrDesign 225 · getClaimSecret 229 · getClaimSecretAdmin 233 |

*New doc, 2026-06-29. Reference-kind: when a QR type, the secret model, or the Studio design schema changes, update the type table / §2 / §4 + the source map.*
