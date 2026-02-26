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
  const panelOpen = useCamera(s => s.panelOpen)
  const storeListingId = useCodeDesk((s) => s.listingId)
  const storeQrType = useCodeDesk((s) => s.qrType)
  const storeClaimSecret = useCodeDesk((s) => s.claimSecret)
  const mode = useCodeDesk((s) => s.mode)
  const placeName = useCodeDesk((s) => s.placeName)
  const close = useCallback(() => useCodeDesk.getState().setOpen(false), [])
  const [qrType, setQrType] = useState(storeQrType || 'Guardian')
  const [saved, setSaved] = useState(false)
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

  // Close with on-demand dirty check (no continuous tracking)
  const handleClose = useCallback(() => {
    try {
      const iframe = iframeRef.current
      if (iframe?.contentWindow?._lsqIsDirty?.()) {
        setConfirmClose(true)
        return
      }
    } catch (e) {}
    close()
  }, [close])

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
      role="dialog" aria-modal="true" aria-label="QR Generator"
      className="absolute top-3 left-3 right-3 bg-surface-glass backdrop-blur-2xl backdrop-saturate-150 rounded-2xl text-on-surface shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-outline overflow-hidden flex flex-col z-50"
      style={{
        fontFamily: 'ui-monospace, monospace',
        bottom: panelOpen ? 'calc(35dvh - 1.5rem + 18px)' : 'calc(100px + 18px)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-outline-variant flex-shrink-0">
        {isGuardianMode ? (
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-body font-medium text-on-surface truncate">{placeName || 'QR Designer'}</h2>
          </div>
        ) : (
          <h2 className="text-body font-medium text-on-surface">QR Generator</h2>
        )}
        <div className="flex items-center gap-2">
          <select
            value={qrType}
            onChange={(e) => setQrType(e.target.value)}
            className="h-8 bg-surface-container-high text-on-surface text-body-sm rounded-lg border border-outline px-2 outline-none hover:bg-surface-container-highest transition-colors"
            style={{ fontFamily: 'ui-monospace, monospace' }}
          >
            <option value="Townie" className="bg-neutral-800 text-on-surface">Townie</option>
            <option value="Guardian" className="bg-neutral-800 text-on-surface">Guardian</option>
          </select>
          <button
            onClick={handleClose}
            className="w-9 h-9 rounded-full backdrop-blur-md bg-rose-500/20 border border-rose-400/40 text-rose-300 transition-all duration-200 flex items-center justify-center hover:bg-rose-500/30"
            aria-label="Close"
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
      <div className="px-4 py-2.5 border-t border-outline-variant flex-shrink-0">
          <button
            onClick={handleSave}
            className={`w-full py-2.5 px-4 rounded-lg text-body font-medium transition-all duration-200 ${
              saved
                ? 'bg-emerald-500/20 border border-emerald-400/40 text-emerald-300'
                : 'bg-surface-container-high border border-outline text-on-surface hover:bg-surface-container-highest'
            }`}
            style={{ fontFamily: 'ui-monospace, monospace' }}
          >
            {saved ? 'Saved' : 'Save'}
          </button>
        </div>

      {/* Unsaved changes confirmation overlay */}
      {confirmClose && (
        <div className="absolute inset-0 z-50 bg-surface-scrim backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-neutral-900 border border-outline rounded-xl p-5 max-w-xs text-center space-y-4">
            <p className="text-on-surface text-body font-medium">You have unsaved changes</p>
            <p className="text-on-surface-subtle text-body-sm">Close without saving?</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmClose(false)}
                className="flex-1 py-2 px-3 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-body transition-colors"
                style={{ fontFamily: 'ui-monospace, monospace' }}
              >
                Keep editing
              </button>
              <button
                onClick={confirmDiscard}
                className="flex-1 py-2 px-3 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/30 text-rose-300 text-body transition-colors"
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
