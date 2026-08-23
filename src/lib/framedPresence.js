/**
 * FRAMED PRESENCE — how much of the Ward an embedding page can currently see.
 *
 * ⭐ WHY THIS LIVES IN THE WARD AND NOT IN THE PAGE. A framed document cannot
 * observe its own position in the parent's viewport — `IntersectionObserver`
 * inside an iframe measures against the IFRAME's viewport, and cross-origin it
 * can see nothing of the parent at all. So the page must SAY, which makes it a
 * contract rather than a local trick; and a contract belongs here, where every
 * installation and every embedding page gets it, rather than in one site's
 * JavaScript.
 *
 * The page decides WHEN (it can see its own scroll); the Ward decides WHAT
 * (it owns its own frame budget). Neither half works alone.
 *
 * ⛔ IDLE IS NOT PAUSED, and must never become paused. Going idle is precisely
 * what makes Chrome drop a WebGL surface, and restoring it costs one blocked
 * frame of several seconds — measured on production, see `.embed-sheet` in
 * index.css. The scene keeps rendering; it renders LESS OFTEN.
 */

let presence = 'active'

export function setFramedPresence(next) {
  presence = next === 'idle' ? 'idle' : 'active'
}

export function framedPresence() {
  return presence
}
