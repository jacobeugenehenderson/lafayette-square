// ⛔ FROZEN — NOT A LIVE RULE. latticeNode.js#entersPixel verbatim as of d19adacc, before the corner clause (2026-10-28):
// it tested the CLOSED square's corners, so a unit diagonal through an EXCLUDED corner of a hot pixel was routed through
// it (Huron's close, checks/fixtures/huron-close-self-noding-2026-10-28.json). Kept ONLY as the mutant of
// checks/claims-the-crossings-are-noded-once.mjs row (j): it must disagree with the oracle's half-open clip, so the row
// keeps proving the class the corner clause ends. Never import this from src/.
const SMALL = 2 ** 24
const small = (...v) => v.every(x => Math.abs(x) < SMALL)
const sgnB = (v) => (v > 0n ? 1 : v < 0n ? -1 : 0)
export const entersPixel = (s, h, numberOnly = false) => {
  const ax = 2 * s.a[0], ay = 2 * s.a[1], bx = 2 * s.b[0], by = 2 * s.b[1], x0 = 2 * h.X - 1, x1 = 2 * h.X + 1, y0 = 2 * h.Y - 1, y1 = 2 * h.Y + 1
  if (Math.max(ax, bx) < x0 || Math.min(ax, bx) >= x1 || Math.max(ay, by) < y0 || Math.min(ay, by) >= y1) return false
  const dx = bx - ax, dy = by - ay, f = numberOnly || small(dx, dy, x0 - ax, y0 - ay, x1 - ax, y1 - ay)
    ? (x, y) => Math.sign(dx * (y - ay) - dy * (x - ax))
    : (x, y) => sgnB(BigInt(dx) * BigInt(y - ay) - BigInt(dy) * BigInt(x - ax))
  const v = [f(x0, y0), f(x1, y0), f(x0, y1), f(x1, y1)]
  return Math.min(...v) <= 0 && Math.max(...v) >= 0 }
