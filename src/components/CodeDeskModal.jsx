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
  const [dirty, setDirty] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
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

  // Listen for dirty state from iframe
  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === 'lsq-dirty') setDirty(e.data.value)
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  // Close with unsaved-changes guard
  const handleClose = useCallback(() => {
    if (dirty) {
      setConfirmClose(true)
    } else {
      close()
    }
  }, [dirty, close])

  const confirmDiscard = useCallback(() => {
    setConfirmClose(false)
    close()
  }, [close])

  // ESC to close (or dismiss confirmation)
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        if (confirmClose) {
          setConfirmClose(false)
        } else {
          handleClose()
        }
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleClose, confirmClose])

  // Send type changes to iframe via postMessage
  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    iframe.contentWindow?.postMessage({ type: 'lsq-set-qr-type', value: qrType }, '*')
  }, [qrType])

  // On iframe load: send places dataset (admin) or single listing (guardian)
  // Order matters: businesses → listing → secret → type (type triggers design load, needs bizId first)
  const handleIframeLoad = useCallback(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    if (!isGuardianMode) {
      iframe.contentWindow?.postMessage({ type: 'lsq-set-businesses', value: allPlaces }, '*')
    }
    if (storeListingId) {
      iframe.contentWindow?.postMessage({ type: 'lsq-set-listing', value: storeListingId }, '*')
    }
    if (storeClaimSecret) {
      iframe.contentWindow?.postMessage({ type: 'lsq-set-claim-secret', value: storeClaimSecret }, '*')
    }
    iframe.contentWindow?.postMessage({ type: 'lsq-set-qr-type', value: qrType }, '*')
  }, [isGuardianMode, allPlaces, qrType, storeListingId, storeClaimSecret])

  // Save — flash confirmation, dirty resets via lsq-dirty message from iframe
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
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10 flex-shrink-0">
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
          <button
            onClick={handleClose}
            className="w-9 h-9 rounded-full backdrop-blur-md bg-rose-500/20 border border-rose-400/40 text-rose-300 transition-all duration-200 flex items-center justify-center hover:bg-rose-500/30"
            title="Close"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
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

      {/* Footer — Save button */}
      <div className="px-4 py-2.5 border-t border-white/10 flex-shrink-0">
          <button
            onClick={handleSave}
            className={`w-full py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-200 ${
              saved
                ? 'bg-emerald-500/20 border border-emerald-400/40 text-emerald-300'
                : dirty
                  ? 'bg-amber-500/20 border border-amber-400/40 text-amber-200 hover:bg-amber-500/30'
                  : 'bg-white/10 border border-white/20 text-white/80 hover:bg-white/20 hover:text-white'
            }`}
            style={{ fontFamily: 'ui-monospace, monospace' }}
          >
            {saved ? 'Saved' : dirty ? 'Save changes' : 'Save'}
          </button>
        </div>

      {/* Unsaved changes confirmation overlay */}
      {confirmClose && (
        <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-neutral-900 border border-white/20 rounded-xl p-5 max-w-xs text-center space-y-4">
            <p className="text-white text-sm font-medium">You have unsaved changes</p>
            <p className="text-white/50 text-xs">Close without saving?</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmClose(false)}
                className="flex-1 py-2 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-white/80 text-sm transition-colors"
                style={{ fontFamily: 'ui-monospace, monospace' }}
              >
                Keep editing
              </button>
              <button
                onClick={confirmDiscard}
                className="flex-1 py-2 px-3 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/30 text-rose-300 text-sm transition-colors"
                style={{ fontFamily: 'ui-monospace, monospace' }}
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
