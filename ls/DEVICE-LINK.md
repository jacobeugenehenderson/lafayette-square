# LS — Device linking (desktop handoff) & disconnection

How one person carries their identity across devices (phone ↔ laptop), and how they disconnect. Built on [`IDENTITY.md`](IDENTITY.md); the link uses the device-link QR documented in [`QR-CODES.md`](QR-CODES.md). Endpoints: [`reference/INVENTORY-API.md`](reference/INVENTORY-API.md).

Last verified: 2026-06-29 against the working tree (`curb-offset-draw`).

---

## 1. What it is

Identity is per-device (`lsq_device_hash`), so by default your phone and your laptop are *different* neighbors. **Linking** ties a second device to the same `@handle` (and avatar/vignette) so the same identity follows you across them. Linked devices sharing a handle is also what powers the **linked-device auto-verify** paths for guardians and residents (see [`GUARDIANS.md`](GUARDIANS.md), [`RESIDENTS.md`](RESIDENTS.md)).

The token is a **6-char alphanumeric, 5-minute TTL** held in Apps Script cache.

## 2. Connecting a device

From the account popover (`src/App.jsx:84–128`), the app calls `createLinkToken(dh)` and renders a **link QR** encoding `/link/<token>`:
- **Push mode** — the current device already has a handle → the identity is embedded in the token; the *scanning* device adopts it.
- **Pull (pending) mode** — the current device has no handle → the token is pending; the scanning device pushes *its* identity back instead.

The scanning device opens `/link/<token>` → `LinkPage.jsx` → `claimLinkToken(token, deviceHash)` (`postClaimLinkToken`, `apps-script/Code.js:1059`), which registers it under the shared handle. The originating device **polls** `checkLinkToken` (`Code.js:1109`) and updates when the link is claimed (status `pending` → `claimed`, or `expired` after 5 min).

`getLinkedDeviceCount(dh)` reports how many devices share the handle (shown in the sign-out copy).

## 3. Disconnecting / sign-out

`?logout` clears the local identity keys on that device — device hash, handle, guardian list, admin token (`clearCachedHash`, `src/lib/device.js`; see [`OPERATIONS.md`](OPERATIONS.md) §1). This is a **local clear** of that one device's stored identity; it doesn't revoke the handle on other linked devices.

## 4. Endpoints
| Verb | Action | Wrapper | Purpose |
|---|---|---|---|
| GET | `create-link-token` | `createLinkToken(dh)` | mint a 6-char token (push or pull), 5-min TTL |
| POST | `claim-link-token` | `claimLinkToken(token, dh)` | scanning device joins the handle |
| GET | `check-link-token` | `checkLinkToken(token)` | originating device polls status |
| GET | `linked-devices` | `getLinkedDeviceCount(dh)` | count devices on the handle |

## Source map
| Thing | File | Key lines |
|---|---|---|
| Link UI + token QR + poll | `src/App.jsx` | 77–128 (createLinkToken 94 · QR 101 · poll 110) |
| Scanning device | `src/pages/LinkPage.jsx` | `/link/<token>` → claimLinkToken |
| Backend | `apps-script/Code.js` | `createLinkToken` 1035 · `postClaimLinkToken` 1059 · `checkLinkToken` 1109 |
| Sign-out clear | `src/lib/device.js` | `clearCachedHash` (`?logout`) |
| API wrappers | `src/lib/api.js` | create/claim/check link-token · linked-devices |

*New doc, 2026-06-29. Reference-kind: when the token model or the link/disconnect flow changes, update §2–§3 + the source map.*
