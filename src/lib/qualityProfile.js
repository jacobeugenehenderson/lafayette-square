/**
 * THE QUALITY PROFILE — the one place the device question is answered.
 *
 * ⭐ WHY ONE MODULE (BRIEF-one-town-assembly §4). The renderer used to ask "is this a phone?"
 * (lib/isMobile) in six files — antialiasing, log depth, pixel ratio, shadows, which pieces mount,
 * building textures, lamp halo size, which post-effects run. Every app that draws a town now passes
 * <Town quality={…}>, and the renderer reads the profile it was given (useQuality), never the device.
 * ▶ node checks/claims-the-town-reads-no-player-store.mjs fails the sniff anywhere else in the renderer.
 *
 * A profile is data, so an app may choose one that is not its own device's: Preview's tier emulator
 * can hand a desktop browser the phone profile. The device's own is deviceQuality().
 *
 * ⚠️ `postFx` still names the renderPipeline.jsx platform tag the profile includes ('desktop' runs
 * every pass, 'mobile' drops those tagged desktop). The brief wants that inclusion to come from
 * Preview's phone measurement instead of a fixed tag (Jacob, 2026-09-27) — that is the next step,
 * and it lands HERE, not in the pipeline.
 */
import { createContext, createElement, useContext } from 'react'
import { ACESFilmicToneMapping } from 'three'
import { IS_MOBILE } from './isMobile.js'

export const QUALITY = {
  desktop: {
    id: 'desktop',
    antialias: true,
    logDepth: true,
    // The movie shot's near plane (MovieCamera): log depth keeps precision at near 1 to the horizon.
    movieNear: 1,
    dpr: [1, 1.5],
    shadows: 'soft',
    // The movie shot renders every frame (under a demand loop its clock steps coarsely).
    movieEveryFrame: true,
    // Pieces that mount in every shot.
    heroOnlyPieces: false,
    buildingTextures: true,
    lampHaloRadius: 0.18,
    staggerLabels: false,
    postFx: 'desktop',
  },
  phone: {
    id: 'phone',
    antialias: false,
    // Linear depth: log depth writes gl_FragDepth on mobile WebGL2, kills early-Z and taxes the
    // canopy's fill budget. Which depth phones should run is a later phone measurement.
    logDepth: false,
    // Linear depth spends its precision near the camera, so the movie shot pushes the near plane out.
    movieNear: 10,
    dpr: 1,
    shadows: false,
    movieEveryFrame: false,
    // The Gateway Arch and the horizon disc mount in the movie shot only (the phone's budget).
    heroOnlyPieces: true,
    buildingTextures: false,
    lampHaloRadius: 0.25,
    // Street labels and markers arrive over a few seconds so the GPU compiles in batches.
    staggerLabels: true,
    postFx: 'mobile',
  },
}

/**
 * ⭐ THE CANVAS A TOWN IS DRAWN THROUGH, from its profile — the ONE source (Warden, 2026-09-28). A component cannot change
 * these once the Canvas exists (the depth buffer, antialiasing, the pixel ratio, the shadow map), so every app that
 * mounts <Town> spreads them: `<Canvas {...townCanvasProps(quality)} …>`, with the SAME quality it hands <Town>. The app
 * adds only what is its own (frameloop, the opening camera pose, onCreated, preserveDrawingBuffer). The far plane is
 * <Town>'s at runtime (it reaches its own sky). ▶ node checks/claims-the-canvas-is-the-towns.mjs
 */
export function townCanvasProps(quality) {
  if (!quality?.id) throw new Error('[quality] ⛔ townCanvasProps needs a profile from src/lib/qualityProfile.js')
  return {
    gl: {
      alpha: false,
      antialias: quality.antialias,
      logarithmicDepthBuffer: quality.logDepth,
      stencil: true,
      powerPreference: 'high-performance',
      toneMapping: ACESFilmicToneMapping,
    },
    dpr: quality.dpr,
    shadows: quality.shadows,
    camera: { near: 1 },
  }
}

/** The profile for the device this page is running on. */
export function deviceQuality() { return IS_MOBILE ? QUALITY.phone : QUALITY.desktop }

const QualityContext = createContext(null)

/** Provides a profile to renderer pieces mounted outside <Town> (a sky-only embed). <Town> provides its own. */
export function QualityProvider({ quality, children }) {
  if (!quality?.id) throw new Error('[quality] ⛔ QualityProvider needs a profile from src/lib/qualityProfile.js')
  return createElement(QualityContext.Provider, { value: quality }, children)
}

/** The profile the renderer was given. Throws outside a provider: a piece never guesses the device. */
export function useQuality() {
  const q = useContext(QualityContext)
  if (!q) throw new Error('[quality] ⛔ a renderer piece is mounted outside <Town> and outside <QualityProvider> — it has no quality profile')
  return q
}
