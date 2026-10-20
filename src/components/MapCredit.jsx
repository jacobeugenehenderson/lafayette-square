import { useSources, attributedCredits } from '../lib/sources.js'

/**
 * MapCredit — the map's data credit, in the bottom-right corner of the town's canvas, ALWAYS visible. Mounted by
 * <Town> through its CanvasOverlay, so every app that draws a town carries it (the Ward, Preview, Stage, the LS player).
 *
 * ⭐ AN OBLIGATION, NOT A NICETY. OpenStreetMap's data is ODbL and a rendered map is a Produced Work. The OSMF
 * attribution guidelines' safe harbour for a browsable map: the credit sits in a corner of the map, is visible
 * without interaction, and the text links to openstreetmap.org/copyright (which carries the licence). It used to live
 * in the LS side panel's footer, which disappears when the panel collapses (e.g. when a PlaceCard opens). In the LS
 * player it sits in the 12 px gutter under the panel and the card (both stop at bottom-3).
 *
 * ⛔ PER-LOOK, OFF THE SLAB (lib/sources.js). Never hardcode "© OpenStreetMap" here: this renders for every
 * installation, and a credit right for one town and wrong for the next is a false legal notice that looks correct.
 * A slab that owes no attribution renders nothing; one with no sources.json is said in the console (useSources).
 * The full list — every dataset and its licence — is the Sources section of the info panel.
 */
export default function MapCredit({ lookId }) {
  const credits = attributedCredits(useSources(lookId).credits)
  if (!credits.length) return null
  return (
    <div className="absolute bottom-0 right-4 h-3 flex items-center gap-1.5 text-caption leading-none text-on-surface-subtle select-none"
      style={{ pointerEvents: 'auto', marginBottom: 'env(safe-area-inset-bottom, 0px)', textShadow: '0 0 3px var(--surface-dim)' }}>
      {credits.map((c, i) => (
        <span key={i} className="whitespace-nowrap">
          {i > 0 && <span aria-hidden="true" className="mr-1.5">·</span>}
          {c.url
            ? <a href={c.url} target="_blank" rel="noreferrer noopener" className="hover:text-on-surface-variant transition-colors">{c.text}</a>
            : c.text}
        </span>
      ))}
    </div>
  )
}
