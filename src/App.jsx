import Scene from './components/Scene'
import Controls from './components/Controls'
import CompassRose from './components/CompassRose'
import SidePanel from './components/SidePanel'
import CheckinPage from './pages/CheckinPage'
import ClaimPage from './pages/ClaimPage'
import useCamera from './hooks/useCamera'

function ExitStreetViewButton() {
  const viewMode = useCamera((s) => s.viewMode)
  if (viewMode !== 'street') return null

  return (
    <button
      onClick={() => useCamera.getState().exitStreetView()}
      className="absolute top-4 right-4 z-50 w-10 h-10 rounded-full backdrop-blur-md bg-amber-500/20 border border-amber-400/40 text-amber-300 transition-all duration-200 flex items-center justify-center hover:bg-amber-500/30"
      title="Return to map view"
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

function App() {
  const route = parseRoute()

  if (route.page === 'checkin') {
    return <CheckinPage locationId={route.locationId} />
  }
  if (route.page === 'claim') {
    return <ClaimPage businessId={route.businessId} secret={route.secret} />
  }

  const isGround = window.location.search.includes('ground')

  return (
    <div className="w-full h-full relative">
      <Scene />
      {!isGround && <Controls />}
      {!isGround && <CompassRose />}
      {!isGround && <SidePanel showAdmin={true} />}
      {!isGround && <ExitStreetViewButton />}
    </div>
  )
}

function parseRoute() {
  const path = window.location.pathname
  const checkinMatch = path.match(/^\/checkin\/([^/]+)$/)
  if (checkinMatch) return { page: 'checkin', locationId: checkinMatch[1] }
  const claimMatch = path.match(/^\/claim\/([^/]+)\/([^/]+)$/)
  if (claimMatch) return { page: 'claim', businessId: claimMatch[1], secret: claimMatch[2] }
  return { page: 'scene' }
}

export default App
