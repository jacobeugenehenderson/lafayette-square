/**
 * The kit's two kinds of failure: a Refusal and a Transient (BRIEF-a-refusal-is-never-swallowed, 2026-10-31).
 *
 *   · Refusal: the kit will not draw this, and asking again gives the same answer (a missing input, an unknown state,
 *     a contract broken). It is NEVER retried and NEVER drawn as nothing in silence: it goes to the one sink
 *     (./failures.js), which Stage shows to the operator and the Ward can show to a visitor.
 *   · Transient: asking again may succeed (no answer from the network, a 5xx, a forecast that has not reached this
 *     hour yet). A boundary may retry it; one that gives up reports that it gave up, to the same sink.
 *
 * Every `⛔` error the kit raises is built as one of the two. An untyped error (a three.js crash, an OOM) is treated as
 * a Transient by the boundary. ▶ node checks/claims-a-refusal-is-never-swallowed.mjs
 *
 * `instanceof` is the one test, and it holds across two copies of this module (a brand on Symbol.for), so a page that
 * bundles the kit twice still tells a Refusal from a Transient. A subclass keeps ordinary `instanceof`.
 */
const REFUSAL = Symbol.for('kit.refusal'), TRANSIENT = Symbol.for('kit.transient')

const branded = (Base, brand) => function (x) {
  return this === Base ? !!(x && x[brand]) : Function.prototype[Symbol.hasInstance].call(this, x)
}

export class Refusal extends Error {
  static [Symbol.hasInstance] = branded(Refusal, REFUSAL)
  get [REFUSAL]() { return true }
}
export class Transient extends Error {
  static [Symbol.hasInstance] = branded(Transient, TRANSIENT)
  get [TRANSIENT]() { return true }
}

/**
 * A failed HTTP answer, classified by what it is (Boz's ruling, 2026-10-31): no answer at all, a 5xx, 408 or 429 can
 * succeed on a second ask, so it is a Transient; any other status (404 included) is the server's settled answer, so it
 * is a Refusal. `res` is a fetch Response, or null/undefined when nothing answered. The message is the site's own.
 */
export function httpFailure(res, message) {
  const s = res?.status
  return (!s || s >= 500 || s === 408 || s === 429) ? new Transient(message) : new Refusal(message)
}
