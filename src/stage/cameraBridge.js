/**
 * Live camera bridge — R3F ⇄ React DOM, shared by every host that mounts the
 * Stage panel.
 *
 * ⛔⛔ WHY THIS IS A MODULE AND NOT A LOCAL IN StageApp (2026-09-08).
 * The Stage panel's CAMERA card (`BrowseCamera` / `StreetCamera`) reads
 * `cameraState` and writes `cameraPush`. Both used to be module-private to
 * `StageApp.jsx`, so only `StageCamera` — the standalone `/stage` page — ever
 * filled them. The Cartograph app mounts the SAME panel but drives its own
 * `CameraRig` (`CartographApp.jsx`), which referenced neither. Result: in the
 * app the operator actually authors in, the CAMERA card was inert in both
 * directions — it displayed this file's initial constants (Center 0/0,
 * Altitude 0 m, FOV 22°) while the live Browse camera sat at [95, 1299, −158]
 * fov 45, and typing into it pushed to a `pending` nobody drained.
 * ⭐ The card is the only numeric framing control in the product, so a dead
 * card is why a repeatable screenshot frame could not be dialled in at all.
 *
 * The bridge is deliberately NOT React state: it is written from `useFrame`
 * (every 10 frames) and read by a DOM panel, so it is a plain mutable record
 * plus a listener set. Consumers copy it (`{...cameraState}`) on notify.
 */

// R3F → DOM. Mutated in place; copy on read.
export const cameraState = { position: [0, 0, 0], target: [0, 0, 0], fov: 22, up: [0, 1, 0] }

// DOM → R3F. Set `.pending`; the host's useFrame drains it next frame.
export const cameraPush = { pending: null }

const cameraListeners = new Set()

export function subscribeCameraState(fn) {
  cameraListeners.add(fn)
  return () => cameraListeners.delete(fn)
}

export function notifyCameraListeners() {
  for (const fn of cameraListeners) fn()
}

/** Panel → camera. One pending update per frame; last write wins. */
export function pushCamera(update) {
  cameraPush.pending = update
}

/**
 * Camera → panel. `target` is passed in because each host knows its own aim
 * (OrbitControls target, the hero's interpolated aim, or a derived look-at) —
 * that is the ONLY thing the three publish sites disagreed about.
 * Rounds to integers: the card shows metres, and un-rounded floats made every
 * frame a state change.
 */
export function publishCameraState(camera, target) {
  const p = camera.position
  cameraState.position = [Math.round(p.x), Math.round(p.y), Math.round(p.z)]
  cameraState.target = [Math.round(target[0]), Math.round(target[1]), Math.round(target[2])]
  cameraState.fov = Math.round(camera.fov)
  cameraState.up = [camera.up.x, camera.up.y, camera.up.z]
  notifyCameraListeners()
}
