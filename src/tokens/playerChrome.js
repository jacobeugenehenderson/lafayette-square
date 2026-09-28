/**
 * THE PLAYER'S CHROME — the grounds a player draws its text on, the colours that carry MEANING, and the contrast rules
 * (Warden's ruling, 2026-09-28). The kit owns them because dependencies point down: the Ward pins the kit, never the
 * reverse. The Ward's src/styles/tokens.css must EQUAL these (its own check reads this module); Quire authors the
 * values, and changing one is a kit commit. Read by the Identity panel's suggester (src/cartograph/suggestFromMark.js)
 * so a suggested colour clears the rules on the grounds it will sit on and stays clear of the meaning colours.
 */
import { UNKNOWN_HEX } from './categories.js'

/** Where the chrome's text sits. `ink` = the page (Ward --ground), `surface` = fields, tiles, cards (--ground-2). */
export const GROUNDS = {
  ink: '#0A0B0E',
  surface: '#121419',
}

/**
 * Colours that already MEAN something to a visitor — a town's colour must not be mistaken for one. The open/closed
 * status (Ward --open / --closed) and "live" (--live, amber), plus the neon's "no category" slate
 * (src/tokens/categories.js UNKNOWN_HEX, the absence of a category on the map).
 */
export const MEANING = {
  open: '#7FD1A8',
  closed: '#E0A39A',
  live: '#F59E0B',
  uncategorised: UNKNOWN_HEX,
}

/** WCAG contrast floors (the Ward's README §5 rule): text 7:1, a control's or chip's edge 3:1 — on every ground. */
export const CONTRAST = { text: 7, edge: 3 }
