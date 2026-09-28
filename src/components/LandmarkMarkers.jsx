/**
 * LandmarkMarkers — the old player's map pins and its click-to-deselect, as an OVERLAY.
 *
 * ⭐ WHY THIS IS NOT IN THE TOWN (BRIEF-one-town-assembly §4). These lived inside LafayetteScene, so
 * every app that drew the town also drew the player's pins, read its landmark filter, and deselected
 * on Escape. Pins are the player's UI on top of the map, not the map: production passes this to
 * <Town> as a child. The Ward has none. ▶ node checks/claims-the-town-reads-no-player-store.mjs
 *
 * `shot` gates the pins exactly as the street labels are gated (browse-only content, staggered in
 * by the phone profile); `forceContentReady` shows them in every shot (an authoring surface).
 */
import { useEffect, useMemo, useState } from 'react'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { buildings as _allBuildings } from '../data/buildings'
import useListings from '../hooks/useListings'
import useSelectedBuilding from '../hooks/useSelectedBuilding'
import useLandmarkFilter from '../hooks/useLandmarkFilter'
import useSlabBuildingIndex from '../hooks/useSlabBuildingIndex'
import { CATEGORY_HEX } from '../tokens/categories'
import { resolveBuildingPosition } from '../lib/buildingPosition'
import { useQuality } from '../lib/qualityProfile.js'
import { getFoundationHeight, getRoofPeakHeight, isDrag, useBrowseContentReady } from './LafayetteScene'

function ClickCatcher() {
  const deselect = useSelectedBuilding((state) => state.deselect)
  return (
    <mesh position={[0, -0.5, 0]} rotation={[-Math.PI / 2, 0, 0]} onClick={(e) => { if (!isDrag(e)) deselect() }}>
      <planeGeometry args={[2000, 2000]} />
      <meshBasicMaterial visible={false} />
    </mesh>
  )
}

// ============ MAP PIN MARKERS ============

function getInitials(name) {
  if (!name) return '?'
  const words = name.split(/\s+/).filter(w => w.length > 0)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].substring(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

const PIN_STEM_GEO = new THREE.CylinderGeometry(0.12, 0.12, 1, 4)

// Approx storey height (m) — pin-stem estimate for content-only installations
// (roster carries no `size`; pins are billboards, so an estimate reads fine).
const PIN_STORY_M = 3.4

function MapPin({ listing, building, position, xOffset = 0, zOffset = 0 }) {
  const select = useSelectedBuilding((state) => state.select)
  const categoryHex = CATEGORY_HEX[listing.category] || '#888888'
  // Wall height + roof peak come from content geometry when the installation
  // carries it (LS → exact, unchanged); content-only installations estimate
  // the wall from `stories` and skip the roof peak. Foundation reads only
  // `year_built`, so it is safe for both.
  const hasGeom = Array.isArray(building.size)
  const wallH = hasGeom ? building.size[1] : (building.stories || 1) * PIN_STORY_M
  const roofPeak = hasGeom ? getRoofPeakHeight(building) : 0
  const roofY = getFoundationHeight(building) + wallH + roofPeak
  const stemHeight = 18
  const initials = getInitials(listing.name)
  const thumbnail = listing.logo || null
  const [logoSize, setLogoSize] = useState(null) // { w, h } after image loads
  const [logoFailed, setLogoFailed] = useState(false)

  const stemMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: categoryHex,
    transparent: true,
    opacity: 0.5,
  }), [categoryHex])

  // Compute container size from logo's natural aspect ratio
  const PIN_H = 42
  const PAD = 6
  const containerStyle = useMemo(() => {
    if (!thumbnail || logoFailed || !logoSize) {
      // Circle for initials (or while logo is loading)
      return { width: '40px', height: '40px', borderRadius: '50%' }
    }
    const ratio = logoSize.w / logoSize.h
    if (ratio < 1.4) {
      // Square-ish logo → compact square container
      return { width: `${PIN_H}px`, height: `${PIN_H}px`, borderRadius: '8px', padding: `${PAD}px` }
    }
    // Wide logo → snug rectangle
    const w = Math.min(Math.round(PIN_H * ratio * 0.7), 110)
    return { width: `${w}px`, height: `${PIN_H}px`, borderRadius: '8px', padding: `${PAD}px` }
  }, [thumbnail, logoFailed, logoSize])

  const hasLogo = thumbnail && !logoFailed && logoSize

  return (
    <group position={[position[0] + xOffset, 0, position[2] + zOffset]}>
      {/* Stem line from roof to pin */}
      <mesh
        position={[0, roofY + stemHeight / 2, 0]}
        scale={[1, stemHeight, 1]}
        geometry={PIN_STEM_GEO}
        material={stemMat}
      />

      {/* Pin head */}
      <Html
        center
        position={[0, roofY + stemHeight + 4, 0]}
        zIndexRange={[1, 10]}
      >
        <div
          // Defer select past the click event: select() changes selectedListingId,
          // which recomputes LandmarkMarkers' filtered set + de-overlap offsets and
          // re-renders/repositions these drei <Html> pins. Doing that SYNCHRONOUSLY
          // inside the pin's own click handler reconciles the <Html> mid-event →
          // drei crashes (~75% intermittent "click a business icon → site crashes").
          // rAF lets the click finish first. (isDrag reads the event → run it sync.)
          onClick={(e) => { e.stopPropagation(); const ok = !isDrag(e); if (ok) requestAnimationFrame(() => select(listing.id, listing.building_id)) }}
          onPointerOver={() => { document.body.style.cursor = 'pointer' }}
          onPointerOut={() => { document.body.style.cursor = 'auto' }}
          style={{
            ...containerStyle,
            background: hasLogo
              ? 'linear-gradient(135deg, #880e4f 0%, #ad1457 50%, #c2185b 100%)'
              : categoryHex,
            border: `2.5px solid ${hasLogo ? categoryHex : 'rgba(255,255,255,0.25)'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            userSelect: 'none',
            boxShadow: '0 2px 8px rgba(0,0,0,0.7)',
            overflow: 'hidden',
          }}
        >
          {thumbnail && !logoFailed ? (
            <img
              src={`${import.meta.env.BASE_URL}${thumbnail.replace(/^\//, '')}`}
              alt={listing.name}
              style={{
                maxWidth: '100%', maxHeight: '100%', objectFit: 'contain',
                display: logoSize ? 'block' : 'none',
              }}
              onLoad={(e) => setLogoSize({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
              onError={() => setLogoFailed(true)}
            />
          ) : null}
          <span style={{
            display: hasLogo ? 'none' : 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            color: '#fff',
            fontSize: '14px',
            fontWeight: 700,
            fontFamily: 'ui-sans-serif, system-ui, sans-serif',
            letterSpacing: '0.5px',
            textShadow: '0 1px 2px rgba(0,0,0,0.4)',
          }}>
            {initials}
          </span>
        </div>
      </Html>
    </group>
  )
}

function Landmarks() {
  const activeTags = useLandmarkFilter((state) => state.activeTags)
  const selectedListingId = useSelectedBuilding((state) => state.selectedListingId)
  const listings = useListings((s) => s.listings)
  // Subscribe so pins (re)appear once SlabBuildings publishes the async index —
  // the position source for content-only installations (HiPointe roster).
  const slabIndex = useSlabBuildingIndex((s) => s.index)

  const filteredLandmarks = useMemo(() => {
    return listings.filter(l =>
      !l._bare && l.status !== 'closed' && (activeTags.has(l.subcategory) || activeTags.has(l.category) || l.id === selectedListingId)
    )
  }, [activeTags, listings, selectedListingId])

  const buildingMap = useMemo(() => {
    const map = {}
    _allBuildings.forEach(b => { map[b.id] = b })
    return map
  }, [])

  // Resolved world XZ per visible listing — content position (LS) or slab
  // footprint centroid (content-only installations); listings with no
  // resolvable coordinates drop out (no pin). Recomputes when the slab index
  // publishes (`slabIndex` dep).
  const positions = useMemo(() => {
    const m = new Map()
    for (const l of filteredLandmarks) {
      const b = buildingMap[l.building_id]
      const pos = b ? resolveBuildingPosition(b) : null
      if (pos) m.set(l.id, pos)
    }
    return m
  }, [filteredLandmarks, buildingMap, slabIndex])

  // De-overlap: spread pins that are too close in XZ space
  const pinOffsets = useMemo(() => {
    const THRESH = 25  // detection radius
    const SPREAD = 20  // spacing between spread pins
    const entries = filteredLandmarks.map(l => {
      const pos = positions.get(l.id)
      return pos ? { id: l.id, x: pos[0], z: pos[2] } : null
    }).filter(Boolean)

    const dx = {}, dz = {}
    entries.forEach(e => { dx[e.id] = 0; dz[e.id] = 0 })

    // Group pins within THRESH of each other
    const assigned = new Set()
    for (let i = 0; i < entries.length; i++) {
      if (assigned.has(i)) continue
      const cluster = [i]
      for (let j = i + 1; j < entries.length; j++) {
        if (assigned.has(j)) continue
        const ex = entries[i].x - entries[j].x
        const ez = entries[i].z - entries[j].z
        if (Math.sqrt(ex * ex + ez * ez) < THRESH) cluster.push(j)
      }
      if (cluster.length < 2) continue
      cluster.forEach(ci => assigned.add(ci))
      // Fan out radially around the cluster center
      const cx = cluster.reduce((s, ci) => s + entries[ci].x, 0) / cluster.length
      const cz = cluster.reduce((s, ci) => s + entries[ci].z, 0) / cluster.length
      cluster.forEach((ci, idx) => {
        const angle = (idx / cluster.length) * Math.PI * 2 - Math.PI / 2
        dx[entries[ci].id] = Math.cos(angle) * SPREAD
        dz[entries[ci].id] = Math.sin(angle) * SPREAD
      })
    }
    return { dx, dz }
  }, [filteredLandmarks, positions])

  if (filteredLandmarks.length === 0) return null

  return (
    <group>
      {filteredLandmarks.map(listing => {
        const building = buildingMap[listing.building_id]
        const position = positions.get(listing.id)
        if (!building || !position) return null   // no resolvable coordinates → no pin
        return (
          <MapPin
            key={listing.id}
            listing={listing}
            building={building}
            position={position}
            xOffset={pinOffsets.dx[listing.id] || 0}
            zOffset={pinOffsets.dz[listing.id] || 0}
          />
        )
      })}
    </group>
  )
}

export default function LandmarkMarkers({ shot, forceContentReady }) {
  const deselect = useSelectedBuilding((state) => state.deselect)
  useEffect(() => {
    const handleKeyDown = (e) => { if (e.key === 'Escape') deselect() }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [deselect])
  const ready = useBrowseContentReady(shot, forceContentReady, useQuality().staggerLabels ? 3500 : 0)
  return (
    <group>
      <ClickCatcher />
      {ready && <Landmarks />}
    </group>
  )
}
