import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { create } from 'zustand'
import useCamera from '../hooks/useCamera'
import useListings from '../hooks/useListings'
import buildingsData from '../data/buildings.json'

export const useCodeDesk = create((set) => ({
  open: false,
  listingId: null,
  qrType: 'Guardian',
  claimSecret: null,
  mode: 'admin', // 'admin' = full Places picker, 'guardian' = single place
  placeName: null,
  setOpen: (open, opts) => set({
    open,
    listingId: opts?.listingId || null,
    qrType: opts?.qrType || 'Guardian',
    claimSecret: opts?.claimSecret || null,
    mode: opts?.mode || 'admin',
    placeName: opts?.placeName || null,
  }),
}))

// Thin gate: renders nothing when closed — no hooks, no subscriptions on mobile boot
export default function CodeDeskModal() {
  const open = useCodeDesk((s) => s.open)
  if (!open) return null
  return <CodeDeskModalInner />
}

// Only mounted when modal is open
function CodeDeskModalInner() {
  const storeListingId = useCodeDesk((s) => s.listingId)
  const storeQrType = useCodeDesk((s) => s.qrType)
  const storeClaimSecret = useCodeDesk((s) => s.claimSecret)
  const mode = useCodeDesk((s) => s.mode)
  const placeName = useCodeDesk((s) => s.placeName)
  const close = useCallback(() => useCodeDesk.getState().setOpen(false), [])
  const [qrType, setQrType] = useState(storeQrType || 'Guardian')
  const [saved, setSaved] = useState(false)
  const iframeRef = useRef(null)
  const listings = useListings((s) => s.listings)
  const isGuardianMode = mode === 'guardian'

  // Merge landmarks + non-landmark buildings as residential
  const allPlaces = useMemo(() => {
    const landmarkBuildingIds = new Set(listings.map(l => l.building_id).filter(Boolean))
    const residential = buildingsData.buildings
      .filter(b => b.address && !landmarkBuildingIds.has(b.id))
      .map(b => ({ id: b.id, name: b.address, category: 'residential' }))
    return [...listings, ...residential]
  }, [listings])

  // Auto-collapse SidePanel when modal opens
  useEffect(() => {
    useCamera.getState().setPanelOpen(false)
  }, [])

  // ESC to close
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [close])

  // Send type changes to iframe via postMessage
  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    iframe.contentWindow?.postMessage({ type: 'lsq-set-qr-type', value: qrType }, '*')
  }, [qrType])

  // On iframe load: send places dataset (admin) or single listing (guardian)
  const handleIframeLoad = useCallback(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    if (!isGuardianMode) {
      iframe.contentWindow?.postMessage({ type: 'lsq-set-businesses', value: allPlaces }, '*')
    }
    iframe.contentWindow?.postMessage({ type: 'lsq-set-qr-type', value: qrType }, '*')
    if (storeListingId) {
      iframe.contentWindow?.postMessage({ type: 'lsq-set-listing', value: storeListingId }, '*')
    }
    if (storeClaimSecret) {
      iframe.contentWindow?.postMessage({ type: 'lsq-set-claim-secret', value: storeClaimSecret }, '*')
    }
  }, [isGuardianMode, allPlaces, qrType, storeListingId, storeClaimSecret])

  // Save button flash
  const handleSave = useCallback(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    iframe.contentWindow?.postMessage({ type: 'lsq-save' }, '*')
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }, [])

  return (
    <div
      className="absolute top-3 left-3 right-3 bg-black/40 backdrop-blur-2xl backdrop-saturate-150 rounded-2xl text-white shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-white/20 overflow-hidden flex flex-col z-50"
      style={{
        fontFamily: 'ui-monospace, monospace',
        bottom: 'calc(76px + 18px)',
      }}
    >
      {/* Header — close button is provided by ModeOverlay (floating top-right system button) */}
      <div className="flex items-center justify-between px-4 pr-12 py-2.5 border-b border-white/10 flex-shrink-0">
        {isGuardianMode ? (
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-medium text-white truncate">{placeName || 'QR Designer'}</h2>
          </div>
        ) : (
          <h2 className="text-sm font-medium text-white">QR Generator</h2>
        )}
        <div className="flex items-center gap-2">
          <select
            value={qrType}
            onChange={(e) => setQrType(e.target.value)}
            className="h-8 bg-white/10 text-white text-xs rounded-lg border border-white/20 px-2 outline-none hover:bg-white/15 transition-colors"
            style={{ fontFamily: 'ui-monospace, monospace' }}
          >
            <option value="Townie" className="bg-neutral-800 text-white">Townie</option>
            <option value="Guardian" className="bg-neutral-800 text-white">Guardian</option>
          </select>
          {isGuardianMode && (
            <button
              onClick={handleSave}
              className={`h-8 px-3 text-xs rounded-lg border transition-all duration-200 ${
                saved
                  ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
                  : 'bg-white/10 border-white/20 text-white/70 hover:bg-white/15'
              }`}
              style={{ fontFamily: 'ui-monospace, monospace' }}
            >
              {saved ? 'Saved' : 'Save'}
            </button>
          )}
        </div>
      </div>

      {/* Iframe */}
      <iframe
        ref={iframeRef}
        src={`${import.meta.env.BASE_URL}codedesk/?embed${isGuardianMode ? '&guardian' : ''}`}
        onLoad={handleIframeLoad}
        className="flex-1 min-h-0 w-full border-0"
        style={{ background: 'transparent' }}
        title="QR Generator"
        allow="clipboard-write"
      />
    </div>
  )
}
