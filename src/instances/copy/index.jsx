/**
 * WHAT THIS INSTALLATION SAYS ABOUT ITSELF, AND WHICH LEGAL DOCUMENTS IT RUNS UNDER.
 *
 * ⛔ NO DEFAULTS, in either lookup. The shared components used to render Lafayette
 * Square's text for every installation (`BRIEF-ls-bleed-excision` site 8). Now:
 *   · ABOUT text is keyed by MAP id. A town's About is written for that town; one with
 *     none renders <NotDeclared/>.
 *   · LEGAL documents are a JURISDICTION document an installation DECLARES in its own
 *     instance module — `legal.documents: '<id>'` in `src/instances/<map>.js`. Declared
 *     none → "not declared". Declared an id that does not exist → a loud error, because
 *     a typo there would otherwise read as a town with no terms.
 * ▶ node checks/claims-installation-legal-is-declared.mjs
 * Browser-only (JSX). Node-side code imports `../registry.js`, never this.
 */
import { INSTANCE } from '../../instance.js'
import * as lafayetteSquare from './lafayette-square.jsx'
import * as caryMissouri from './legal/cary-missouri.jsx'

const ABOUT_BY_MAP = {
  'lafayette-square': lafayetteSquare,
}

export const LEGAL_DOCUMENTS = {
  'cary-missouri': caryMissouri.legal,
}

export const COPY = ABOUT_BY_MAP[INSTANCE.mapId] ?? null

const declared = INSTANCE.legal?.documents ?? null
if (declared && !LEGAL_DOCUMENTS[declared]) {
  console.error(`[copy] ${INSTANCE.mapId} declares legal.documents '${declared}', which does not exist (have: ${Object.keys(LEGAL_DOCUMENTS).join(', ')})`)
}
export const LEGAL = declared ? (LEGAL_DOCUMENTS[declared] ?? null) : null

/** The visible gap. Unfinished and obviously so, never a plausible-looking stand-in. */
export function NotDeclared({ what, legal = false }) {
  return (
    <p className="rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-amber-200/90">
      ⚠ Not declared for this installation: {what}.{legal ? ' Its legal terms have not been written.' : ''}
    </p>
  )
}
