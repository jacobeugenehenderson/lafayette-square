import useCamera from '../hooks/useCamera'
import useTimeOfDay from '../hooks/useTimeOfDay'
import useSelectedBuilding from '../hooks/useSelectedBuilding'
import useBulletin from '../hooks/useBulletin'
import { useCodeDesk } from './CodeDeskModal'
import { useContact } from './ContactModal'
import { useInfo } from './InfoModal'
import { BrowseSearchInput } from './GlassSearch'

export default function BrowseHeader() {
  const viewMode = useCamera(s => s.viewMode)
  const azimuth = useCamera(s => s.azimuth)
  const isLive = useTimeOfDay(s => s.isLive)
  const showCard = useSelectedBuilding(s => s.showCard)
  const bulletinOpen = useBulletin(s => s.modalOpen)
  const codeDeskOpen = useCodeDesk(s => s.open)
  const contactOpen = useContact(s => s.open)
  const infoOpen = useInfo(s => s.open)

  if (viewMode !== 'browse') return null
  if (showCard || bulletinOpen || codeDeskOpen || contactOpen || infoOpen) return null

  const rotationDeg = (azimuth * 180) / Math.PI

  return (
    <div className="absolute top-0 left-0 right-0 z-50 select-none">
      <div className="relative flex items-center gap-4 pl-5 pr-16 pt-5 pb-5 bg-[rgba(0,0,0,0.75)] border-b border-white/10">
        {/* Mini compass rose */}
        <div className="flex-shrink-0">
          <svg
            viewBox="0 0 100 100"
            className="w-9 h-9"
            style={{ transform: `rotate(${rotationDeg}deg)` }}
          >
            <circle cx="50" cy="50" r="45" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
            <polygon points="50,15 44,50 50,42 56,50" fill="#cc4444" stroke="#ff6666" strokeWidth="0.5" />
            <polygon points="50,85 44,50 50,58 56,50" fill="#666" stroke="#888" strokeWidth="0.5" />
            <circle cx="50" cy="50" r="3" fill="#555" stroke="#777" strokeWidth="1" />
            <text x="50" y="9" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="bold" fontFamily="system-ui">N</text>
          </svg>
        </div>

        {/* Search bar */}
        <BrowseSearchInput />

        {/* Right-side button — absolutely positioned to match PlaceCard X (top-2 right-2 inside top-3 right-3 = 20px/20px from viewport) */}
        {!isLive ? (
          <button
            onClick={() => useTimeOfDay.getState().returnToLive()}
            className="absolute top-5 right-5 w-9 h-9 rounded-full backdrop-blur-md bg-green-500/20 border border-green-400/40 text-green-400 transition-all duration-200 flex items-center justify-center hover:bg-green-500/30"
            aria-label="Return to live time"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
              <path strokeLinecap="round" d="M8.5 8.5a5 5 0 0 0 0 7" />
              <path strokeLinecap="round" d="M15.5 8.5a5 5 0 0 1 0 7" />
              <path strokeLinecap="round" d="M5.5 5.5a9 9 0 0 0 0 13" />
              <path strokeLinecap="round" d="M18.5 5.5a9 9 0 0 1 0 13" />
            </svg>
          </button>
        ) : (
          <button
            onClick={() => useCamera.getState().goHero()}
            className="absolute top-5 right-5 w-9 h-9 rounded-full backdrop-blur-md bg-surface-container-high border border-outline text-on-surface-variant transition-all duration-200 flex items-center justify-center hover:bg-surface-container-highest hover:text-on-surface"
            aria-label="Return to hero view"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
