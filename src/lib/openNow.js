/**
 * openNow — is this place open at this moment? ONE home for the predicate.
 *
 * ⛔⛔ THIS EXISTED FOUR TIMES AND THREE OF THEM WERE WRONG. `EventTicker._isOpenNow`,
 * `SidePanel._isWithinHours` and `SceneNeon._isWithinHours` were byte-identical and did
 * `mins >= open && mins < close`; `PlaceCard` had its own, which handled a close that
 * falls after midnight. So the product disagreed with itself about the same business at
 * the same instant: the card said "Open · Closes 2:30 AM" while the ticker, the side
 * panel and the NEON SIGN all said closed.
 *
 * ⭐⭐ AND THE THREE THAT AGREED WERE THE WRONG ONES — the repo's own lesson from the
 * zoning table, where four copies agreed and the lone outlier was the only one right.
 * Four agreeing copies are not evidence; they are copies of each other.
 *
 * ⛔ HOW BAD: with `10:00 → 02:30`, `mins >= 600 && mins < 150` is false at EVERY minute
 * of the day, so the bar was not "wrong after midnight" — it was **never open, ever**,
 * and its neon never lit. Measured 2026-09-22 on Knucklehead Saloon, Huron's only late
 * venue: closed at 11:00, 18:00, 23:00, 01:00 and 02:00 alike.
 *
 * ⭐ IT IS A WHOLE-CLASS DEFECT, NOT A TAIL CASE. Ohio's statutory last call is 2:30, so
 * every late bar in every Ohio town lands on this exact value; every state has its own.
 * Lafayette Square has no listing that closes after midnight, which is why nobody saw it
 * — the kit's signature shape, invisible on town #1.
 *
 * ⭐ SPILL IS PART OF THE SEMANTICS, not a refinement. At 01:00 on Tuesday a place is
 * open because of MONDAY's window, so the previous day is consulted too. ⛔ A window that
 * does not wrap may never spill, or a shop that shuts at 17:00 would read as open the
 * next morning.
 */

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

// `m` is minutes-from-midnight of the day the SLOT belongs to, so a caller testing
// yesterday's slot passes `now + 1440`.
//
// ⭐ A NON-WRAPPING WINDOW CANNOT SPILL, AND THE ARITHMETIC ALREADY SAYS SO — no guard
// is needed and one was removed after a mutation test showed it unreachable. A spill
// caller's `m` is at least 1440; a window that does not wrap has `c <= 1439`; so
// `m < c` is false and a shop that shuts at 17:00 can never read open the next morning.
// ⛔ Written down because the first version of this file carried that guard WITH a
// comment claiming it was load-bearing — an explanation of a mechanism nobody had
// measured, which is the thing this repo keeps getting wrong.
function _within(slot, m) {
  if (!slot || typeof slot.open !== 'string' || typeof slot.close !== 'string') return false
  const [oh, om] = slot.open.split(':').map(Number)
  const [ch, cm] = slot.close.split(':').map(Number)
  if (!Number.isFinite(oh) || !Number.isFinite(om) || !Number.isFinite(ch) || !Number.isFinite(cm)) return false
  const o = oh * 60 + om
  let c = ch * 60 + cm
  if (c <= o) c += 24 * 60        // the window runs past midnight
  return m >= o && m < c
}

/**
 * The slot that is covering `when`, or null. ⛔ CALLERS THAT LABEL THE WINDOW MUST USE
 * THIS, not `hours[today]`: once a window can wrap, the slot keeping a place open at
 * 01:00 belongs to YESTERDAY, and reaching for today's would read `undefined.close` and
 * take the surface down. The boolean and the label must come from one resolution.
 */
export function openSlotAt(hours, when) {
  if (!hours) return null
  const mins = when.getHours() * 60 + when.getMinutes()
  const dow = when.getDay()
  const today = hours[DAYS[dow]]
  if (_within(today, mins)) return today
  const yesterday = hours[DAYS[(dow + 6) % 7]]
  if (_within(yesterday, mins + 24 * 60)) return yesterday
  return null
}

/** True when `hours` (a {day: {open, close}} map) covers the instant `when`. */
export function isOpenAt(hours, when) {
  return openSlotAt(hours, when) !== null
}

export { DAYS as OPEN_NOW_DAYS }
