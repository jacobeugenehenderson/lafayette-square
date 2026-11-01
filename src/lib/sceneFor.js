/**
 * The scene a hook may hand out for `lookId`: the one it holds when it holds THAT Look's, else null ("not loaded").
 * ⛔ Never another Look's scene: a hook that held the previous Look's across a switch drew a frame of the old town as
 * the new one (src/lib/useSceneJson.js, 2026-10-31). Pure, so a check can run it.
 * ▶ node checks/claims-a-scene-is-its-own-looks.mjs
 * @param {{ lookId: string, scene: object|null }|null} held
 * @param {string} lookId
 */
export function sceneFor(held, lookId) {
  return held && held.lookId === lookId ? held.scene : null
}
