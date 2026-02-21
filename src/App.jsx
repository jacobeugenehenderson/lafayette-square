import { useState, useEffect } from 'react'
import Scene from './components/Scene'
import Controls from './components/Controls'
import CompassRose from './components/CompassRose'
import SidePanel from './components/SidePanel'
import BulletinModal from './components/BulletinModal'
import CodeDeskModal from './components/CodeDeskModal'
import useCamera from './hooks/useCamera'
import useSelectedBuilding from './hooks/useSelectedBuilding'
import CheckinPage from './pages/CheckinPage'
import ClaimPage from './pages/ClaimPage'

function ModeOverlay() {
  const viewMode = useCamera((s) => s.viewMode)
  const showCard = useSelectedBuilding((s) => s.showCard)
  if (viewMode === 'hero' || showCard) return null

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

function DebugOverlay() {
  const viewMode = useCamera((s) => s.viewMode)
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 500)
    return () => clearInterval(id)
  }, [])
  const logs = window.__cameraLog || []
  return (
    <div
      style={{
        position: 'fixed', bottom: 70, left: 4, zIndex: 9999,
        background: 'rgba(0,0,0,0.88)', color: '#0f0', fontSize: 9,
        fontFamily: 'monospace', padding: '3px 6px', borderRadius: 4,
        maxWidth: '90vw', maxHeight: 160, overflowY: 'auto',
        pointerEvents: 'none', lineHeight: 1.3,
      }}
    >
      <div style={{ color: '#ff0', marginBottom: 2 }}>mode: {viewMode}</div>
      {logs.slice(-12).map((l, i) => (
        <div key={i} style={{ color: l.includes('goHero') || l.includes('IDLE') ? '#f44' : '#0f0' }}>{l}</div>
      ))}
    </div>
  )
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
  const showDebug = window.location.search.includes('debug')

  return (
    <div className="w-full h-full relative">
      <Scene />
      {!isGround && <Controls />}
      {!isGround && <CompassRose />}
      {!isGround && <SidePanel />}
      {!isGround && <BulletinModal />}
      {!isGround && <CodeDeskModal />}
      {!isGround && <ModeOverlay />}
      {showDebug && <DebugOverlay />}
    </div>
  )
}

function parseRoute() {
  const path = window.location.pathname
  const checkinMatch = path.match(/^\/checkin\/([^/]+)$/)
  if (checkinMatch) return { page: 'checkin', locationId: checkinMatch[1] }
  const claimMatch = path.match(/^\/claim\/([^/]+)\/([^/]+)$/)
  if (claimMatch) return { page: 'claim', listingId: claimMatch[1], secret: claimMatch[2] }
  return { page: 'scene' }
}

export default App
