import useCamera from '../hooks/useCamera'
import useTimeOfDay from '../hooks/useTimeOfDay'
import useSelectedBuilding from '../hooks/useSelectedBuilding'
import useBulletin from '../hooks/useBulletin'
import { useCodeDesk } from './CodeDeskModal'
import { useContact } from './ContactModal'
import { useInfo } from './InfoModal'

export default function BrowseHeader() {
  const viewMode = useCamera(s => s.viewMode)
  const dissolveOn = useCamera(s => s.buildingDissolve)
  const isLive = useTimeOfDay(s => s.isLive)
  const showCard = useSelectedBuilding(s => s.showCard)
  const bulletinOpen = useBulletin(s => s.modalOpen)
  const codeDeskOpen = useCodeDesk(s => s.open)
  const contactOpen = useContact(s => s.open)
  const infoOpen = useInfo(s => s.open)

  const panelFull = useCamera(s => s.panelState) === 'full'
  if (viewMode !== 'browse' && !panelFull) return null
  if (showCard || bulletinOpen || codeDeskOpen || contactOpen || infoOpen || panelFull) return null

  return (
    <div className="fixed right-5 z-[60] flex flex-col items-end gap-2" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 20px)' }}>
      {/* See-through buildings: fade only the buildings the camera passes
          THROUGH (roofs passing below stay solid). */}
      <button
        onClick={() => useCamera.getState().toggleBuildingDissolve()}
        className={`w-9 h-9 rounded-full backdrop-blur-md border transition-all duration-200 flex items-center justify-center ${
          dissolveOn
            ? 'bg-primary/25 border-primary/50 text-primary hover:bg-primary/35'
            : 'bg-surface-container-high border-outline text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface'
        }`}
        aria-label={dissolveOn ? 'Solid buildings' : 'See through buildings the camera passes through'}
        title="Fade buildings the camera passes through"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M5.25 21V6.75A1.5 1.5 0 016.75 5.25h4.5A1.5 1.5 0 0112.75 6.75V21" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dissolveOn ? '2 2' : '0'} d="M12.75 21V10.5a1.5 1.5 0 011.5-1.5h3.75a1.5 1.5 0 011.5 1.5V21" />
        </svg>
      </button>
      {!isLive ? (
        <button
          onClick={() => useTimeOfDay.getState().returnToLive()}
          className="w-9 h-9 rounded-full backdrop-blur-md bg-green-500/20 border border-green-400/40 text-green-400 transition-all duration-200 flex items-center justify-center hover:bg-green-500/30"
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
          className="w-9 h-9 rounded-full backdrop-blur-md bg-surface-container-high border border-outline text-on-surface-variant transition-all duration-200 flex items-center justify-center hover:bg-surface-container-highest hover:text-on-surface"
          aria-label="Return to hero view"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
          </svg>
        </button>
      )}
    </div>
  )
}
