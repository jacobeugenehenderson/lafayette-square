/**
 * The Look a renderer piece draws — the one it was GIVEN. ⛔ Never `?look=` and never the page's boot town:
 * a piece mounted without its Look throws, because a guessed Look draws another town's slab
 * (BRIEF-one-town-assembly, 2026-09-28). App code that really means "this page's Look" uses resolveLookId.
 */
export function lookOf(lookId, who) {
  if (!lookId) throw new Error(`[${who}] ⛔ mounted without lookId — the renderer draws the Look it is given, never a guessed one`)
  return lookId
}
