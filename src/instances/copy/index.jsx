/**
 * WHICH COPY THIS INSTALLATION HAS — its About text and legal documents, by MAP id.
 *
 * ⛔ No default. An installation with no entry here renders <NotDeclared/>, loudly,
 * where the shared components used to render Lafayette Square's text for everyone
 * (`BRIEF-ls-bleed-excision` site 8). A town's copy is written for that town (and its
 * legal documents by counsel for its jurisdiction — `cary/legal/rider-template.md`);
 * it is never inherited from another.
 * Browser-only (JSX). Node-side code imports `../registry.js`, never this.
 */
import { INSTANCE } from '../../instance.js'
import * as lafayetteSquare from './lafayette-square.jsx'

const BY_MAP = {
  'lafayette-square': lafayetteSquare,
}

export const COPY = BY_MAP[INSTANCE.mapId] ?? null

/** The visible gap. Unfinished and obviously so, never a plausible-looking stand-in. */
export function NotDeclared({ what, legal = false }) {
  return (
    <p className="rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-amber-200/90">
      ⚠ Not declared for this installation: {what}.{legal ? ' Its legal terms have not been written.' : ''}
    </p>
  )
}
