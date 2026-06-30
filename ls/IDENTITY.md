# LS — Identity & avatar

Who you are in the neighborhood: an anonymous device identity, a chosen `@handle`, and an emoji avatar on a colored vignette. No email, no password. For carrying that identity across devices see [`DEVICE-LINK.md`](DEVICE-LINK.md); for the trust roles built on top see [`TOWNIES.md`](TOWNIES.md) / [`GUARDIANS.md`](GUARDIANS.md) / [`RESIDENTS.md`](RESIDENTS.md). Endpoints: [`reference/INVENTORY-API.md`](reference/INVENTORY-API.md).

Last verified: 2026-06-29 against the working tree (`curb-offset-draw`).

---

## 1. What it is

Identity is **anonymous by design**:
- **Device hash** — a per-device UUID (`lsq_device_hash`), the primary key for everything a person does (`src/lib/device.js` `getDeviceHash` / `clearCachedHash`). No account, no login.
- **Handle** — a chosen, unique `@handle` (uniqueness checked via `check-handle`).
- **Avatar** — an **emoji** on a colored **vignette** backdrop (default `v0`).

Every participatory action (reviews, bulletin posts/comments, DMs, guardian/staff display) attaches the handle + avatar; **anonymous** posting nulls them server-side (see [`BULLETIN.md`](BULLETIN.md)). A handle isn't required to browse or check in — it's required to *post*.

## 2. Setting it up

- **Avatar editor** (`src/components/AvatarEditor.jsx`): a two-step flow — emoji picker (`@emoji-mart`) → vignette/style chooser → `onSave(emoji, vignette)`. `AvatarCircle.jsx` renders the emoji-on-vignette everywhere.
- **Store** (`src/hooks/useHandle.js`): holds `{ handle, avatar, vignette }`, mirrored to `localStorage` (`lsq_handle` / `lsq_avatar` / `lsq_vignette`). Actions: `setHandle(handle, avatar, vignette)` (first-time set → `set-handle`), `updateAvatar(...)` (→ `update-avatar`), `refresh()` (pulls from `handle` GET), and availability check (`checkHandleAvailability` → `check-handle`).

## 3. The data model

**Handles sheet** (`apps-script/Code.js:1931`):
```
['device_hash', 'handle', 'avatar', 'created_at', 'vignette']
```
The handle row is the lookup that resolves a device hash → display identity wherever a name/avatar is shown (bulletin, reviews, staff rosters). **Linked devices share one handle row** (the basis for cross-device identity and the linked-device auto-verify paths — see [`DEVICE-LINK.md`](DEVICE-LINK.md), [`RESIDENTS.md`](RESIDENTS.md), [`GUARDIANS.md`](GUARDIANS.md)).

## 4. Endpoints
| Verb | Action | Wrapper (`src/lib/api.js`) | Purpose |
|---|---|---|---|
| GET | `handle` | `getHandle(dh)` | fetch this device's handle/avatar/vignette |
| GET | `check-handle` | `checkHandleAvailability(h)` | uniqueness check while typing |
| POST | `set-handle` | `setHandle(dh, handle, avatar, vignette)` | first-time claim |
| POST | `update-avatar` | `updateAvatar(dh, avatar, vignette)` | change emoji/vignette later |

## Source map
| Thing | File | Notes |
|---|---|---|
| Device hash | `src/lib/device.js` | `getDeviceHash` · `clearCachedHash` |
| Store | `src/hooks/useHandle.js` | handle/avatar/vignette + actions; localStorage mirror |
| Avatar editor | `src/components/AvatarEditor.jsx` · `AvatarCircle.jsx` | emoji-mart picker → vignette |
| Backend | `apps-script/Code.js` | Handles sheet 1931; actions handle/set-handle/update-avatar/check-handle |
| API wrappers | `src/lib/api.js` | the four above |

*New doc, 2026-06-29. Reference-kind: when the identity fields or avatar model change, update §1–§3 + the source map.*
