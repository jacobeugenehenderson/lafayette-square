import { useEffect } from 'react'
import Scene from './components/Scene'
import Controls from './components/Controls'
import CompassRose from './components/CompassRose'
import SidePanel from './components/SidePanel'
import BulletinModal from './components/BulletinModal'
import CodeDeskModal from './components/CodeDeskModal'
import EventTicker from './components/EventTicker'
import useCamera from './hooks/useCamera'
import useTimeOfDay from './hooks/useTimeOfDay'
import useSelectedBuilding from './hooks/useSelectedBuilding'
import useBulletin from './hooks/useBulletin'
import useListings from './hooks/useListings'
import CheckinPage from './pages/CheckinPage'
import ClaimPage from './pages/ClaimPage'

function LiveButton() {
  const isLive = useTimeOfDay((s) => s.isLive)
  if (isLive) return null

  return (
    <button
      onClick={() => useTimeOfDay.getState().returnToLive()}
      className="absolute top-4 right-4 z-50 w-10 h-10 rounded-full backdrop-blur-md bg-green-500/20 border border-green-400/40 text-green-400 transition-all duration-200 flex items-center justify-center hover:bg-green-500/30"
      title="Return to live time"
    >
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
        <path strokeLinecap="round" d="M8.5 8.5a5 5 0 0 0 0 7" />
        <path strokeLinecap="round" d="M15.5 8.5a5 5 0 0 1 0 7" />
        <path strokeLinecap="round" d="M5.5 5.5a9 9 0 0 0 0 13" />
        <path strokeLinecap="round" d="M18.5 5.5a9 9 0 0 1 0 13" />
      </svg>
    </button>
  )
}

function ModeOverlay() {
  const viewMode = useCamera((s) => s.viewMode)
  const showCard = useSelectedBuilding((s) => s.showCard)
  const bulletinOpen = useBulletin((s) => s.modalOpen)
  const isLive = useTimeOfDay((s) => s.isLive)

  // Close buttons — rose accent for dismiss actions
  if (showCard) {
    return (
      <button
        onClick={() => useSelectedBuilding.getState().deselect()}
        className="absolute top-4 right-4 z-50 w-10 h-10 rounded-full backdrop-blur-md bg-rose-500/20 border border-rose-400/40 text-rose-300 transition-all duration-200 flex items-center justify-center hover:bg-rose-500/30"
        title="Close"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    )
  }

  if (bulletinOpen) {
    return (
      <button
        onClick={() => { useBulletin.getState().setModalOpen(false); useBulletin.setState({ activeThread: null, messages: [] }) }}
        className="absolute top-4 right-4 z-50 w-10 h-10 rounded-full backdrop-blur-md bg-rose-500/20 border border-rose-400/40 text-rose-300 transition-all duration-200 flex items-center justify-center hover:bg-rose-500/30"
        title="Close"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    )
  }

  // Live button takes over the top-right slot when not live — any mode, including hero
  if (!isLive) return <LiveButton />

  // When live: hero mode shows nothing, other modes show their mode button
  if (viewMode === 'hero') return null

  if (viewMode === 'planetarium') {
    return (
      <button
        onClick={() => useCamera.getState().exitPlanetarium()}
        className="absolute top-4 right-4 z-50 w-10 h-10 rounded-full backdrop-blur-md bg-amber-500/20 border border-amber-400/40 text-amber-300 transition-all duration-200 flex items-center justify-center hover:bg-amber-500/30"
        title="Exit street view"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      </button>
    )
  }

  return (
    <button
      onClick={() => useCamera.getState().goHero()}
      className="absolute top-4 right-4 z-50 w-10 h-10 rounded-full backdrop-blur-md bg-white/10 border border-white/20 text-white/60 transition-all duration-200 flex items-center justify-center hover:bg-white/20 hover:text-white/80"
      title="Return to hero view"
    >
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
      </svg>
    </button>
  )
}

function PlaceOpener({ listingId }) {
  const listings = useListings(s => s.listings)
  useEffect(() => {
    const listing = listings.find(l => l.id === listingId)
    if (listing) {
      useSelectedBuilding.getState().select(listingId, listing.building_id)
    }
  }, [listingId, listings])
  return null
}

function App() {
  const route = parseRoute()

  if (route.page === 'checkin') {
    return <CheckinPage locationId={route.locationId} />
  }
  if (route.page === 'claim') {
    return <ClaimPage listingId={route.listingId} secret={route.secret} />
  }

  const isGround = window.location.search.includes('ground')

  return (
    <div className="w-full h-full relative">
      <Scene />
      {route.page === 'place' && <PlaceOpener listingId={route.listingId} />}
      {!isGround && <Controls />}
      {!isGround && <CompassRose />}
      {!isGround && <SidePanel />}
      {!isGround && <EventTicker />}
      {!isGround && <BulletinModal />}
      {!isGround && <CodeDeskModal />}
      {!isGround && <ModeOverlay />}
    </div>
  )
}

function parseRoute() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  const raw = window.location.pathname
  const path = base && raw.startsWith(base) ? raw.slice(base.length) || '/' : raw
  const checkinMatch = path.match(/^\/checkin\/([^/]+)$/)
  if (checkinMatch) return { page: 'checkin', locationId: checkinMatch[1] }
  const claimMatch = path.match(/^\/claim\/([^/]+)\/([^/]+)$/)
  if (claimMatch) return { page: 'claim', listingId: claimMatch[1], secret: claimMatch[2] }
  const placeMatch = path.match(/^\/place\/([^/]+)$/)
  if (placeMatch) return { page: 'place', listingId: placeMatch[1] }
  return { page: 'scene' }
}

export default App
