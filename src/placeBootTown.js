/**
 * Places the page's boot town on the globe the moment it is imported — IMPORT THIS FIRST in an entry.
 *
 * ⭐ WHY A SIDE-EFFECT MODULE, NOT A CALL IN THE ENTRY'S BODY. There is no default town (lib/townPlace.js throws
 * until one is placed), and some app modules read the clock while they are being EVALUATED (CartographApp's
 * ToD-still sync, for one). ES modules evaluate their imports first, in order, so a placeTown() in the entry's
 * body ran after them and Stage threw on load (2026-09-28). An import listed first runs first.
 * <Town town> moves the place to whatever town it draws.
 */
import { INSTANCE } from './instance.js'
import { placeTown } from './components/TownPlace.jsx'

// An authoring page with no town open places none: nothing is drawn until a town is chosen.
if (INSTANCE) placeTown(INSTANCE, INSTANCE.lookId)
