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
 * can hand a desktop browser the phone profile. A player's is deviceQuality(manifest.deployment); an authoring
 * surface's is authoringQuality().
 *
 * ⭐ WHICH POST-EFFECTS RUN is the profile's too: `postFxOff` lists the passes it switches off, by
 * the pipeline's ids, and `includesPass` is the ONE place anything asks (the installer, Preview's
 * toggle matrix, the checks). Per-surface inclusion is data, not a tag on the pass (Phase 2 D,
 * 2026-10-04; it was `platform: 'desktop'` in renderPipeline.jsx): Jacob wants every effect
 * switchable per surface — desktop, phone-hi, phone-lo — "we don't want to 'cancel bloom' because we
 * can't get it going on a lo phone." That per-surface setting is the town's DEPLOYMENT policy
 * (src/lib/deployment.js, authored in Preview, frozen into the manifest), laid on the profile by
 * surfaceQuality — the one function Preview and the Ward both apply it through.
 */
import { createContext, createElement, useContext } from 'react'
import { ACESFilmicToneMapping } from 'three'
import { IS_MOBILE } from './isMobile.js'
import { RUNTIME_PHONE_SURFACE, surfacePolicy } from './deployment.js'

export const QUALITY = {
  desktop: {
    id: 'desktop',
    // The DEVICE's canvas anti-aliasing. ⛔ A canvas that receives a composer's final draw takes none (canvasAntialias):
    // MSAA leaves that full-screen draw identical (0 of 11.5 M values differ, scratch/msaa/probe.mjs --quad; ~1 ms/frame
    // on huron at 2268×1270), the composer's multisampling + SMAA being the scene's AA. A canvas with NO composer (the
    // sky embed, the transparent diorama, Cartograph's, which is also the Designer's) keeps this, or nothing smooths its edges.
    antialias: true,
    logDepth: true,
    // The movie shot's near plane (held by Town.jsx#TownOptics): log depth keeps precision at near 1 to the horizon.
    movieNear: 1,
    dpr: [1, 1.5],
    shadows: 'soft',
    // The movie shot renders every frame (under a demand loop its clock steps coarsely).
    movieEveryFrame: true,
    // Pieces that mount in every shot.
    heroOnlyPieces: false,
    buildingTextures: true,
    // The wind sheet's resolution: texels per gust correlation length (100 m, lib/windSheet.js) — 8.3 m here. Its SIZE
    // is the town's: Huron's ~7 km disc is 851² (≈12 MB for the ping-pong pair); 24 had made it 1701² (≈46 MB).
    windTexelsPerCorrelation: 12,
    lampHaloRadius: 0.18,
    staggerLabels: false,
    // Which passes run is the town's deployment policy, per surface (surfaceQuality, below); the bare profile runs all.
    postFxOff: [],
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
    windTexelsPerCorrelation: 6,
    lampHaloRadius: 0.25,
    // Street labels and markers arrive over a few seconds so the GPU compiles in batches.
    staggerLabels: true,
    // Which passes run is the town's deployment policy, per surface (surfaceQuality, below); the bare profile runs all.
    // (Until 2026-10-04 this was the constant ['ao','pyramid','heroLadder','bloom','dof','aerial']; it moved into every
    // town's cartograph/data/<map>/deployment.json, unchanged, where Preview authors it per surface.)
    postFxOff: [],
  },
}

/**
 * ⭐ THE CANVAS A TOWN IS DRAWN THROUGH, from its profile — the ONE source (Warden, 2026-09-28). A component cannot change
 * these once the Canvas exists (the depth buffer, antialiasing, the pixel ratio, the shadow map), so every app that
 * mounts <Town> spreads them: `<Canvas {...townCanvasProps(quality, { composer })} …>`, with the SAME quality it hands
 * <Town>. The app adds only what is its own (frameloop, the opening camera pose, onCreated, preserveDrawingBuffer). The far
 * plane is <Town>'s at runtime (it reaches its own sky). ▶ node checks/claims-the-canvas-is-the-towns.mjs
 * ⛔ `composer` is REQUIRED (canvasAntialias, below): true only when every frame the canvas shows goes through <Town>'s
 * composer. A canvas that also draws without <Town> says false and keeps the device's MSAA: Cartograph's canvas is the
 * Designer's too, and with `true` the Designer had no AA at all, every edge stair-stepped (Jacob's screenshot,
 * 2026-10-28; off since 095dec54, 2026-10-07).
 */
// the town camera's near plane, m — the canvas's, and the floor under every shot's (Town.jsx#TownOptics; the plan's is derived above it): nothing nearer is drawn, so it bounds how close any shot shows the ground (Stage's coast card reads it)
export const TOWN_CAMERA_NEAR_M = 1
export function townCanvasProps(quality, { composer } = {}) {
  if (!quality?.id) throw new Error('[quality] ⛔ townCanvasProps needs a profile from src/lib/qualityProfile.js')
  if (typeof composer !== 'boolean') throw new Error('[quality] ⛔ townCanvasProps needs { composer: true | false } — does every frame this canvas shows go through <Town>\'s composer?')
  return {
    gl: {
      alpha: false,
      antialias: canvasAntialias(quality, { composer }),
      logarithmicDepthBuffer: quality.logDepth,
      stencil: true,
      powerPreference: 'high-performance',
      toneMapping: ACESFilmicToneMapping,
    },
    dpr: quality.dpr,
    shadows: quality.shadows,
    camera: { near: TOWN_CAMERA_NEAR_M },
  }
}

/**
 * ⭐ THE CANVAS'S ANTI-ALIASING, answered structurally (Zob's review, 2026-10-22): a canvas whose COMPOSER supplies the AA
 * takes none (MSAA would leave the composer's final draw unchanged); any other canvas takes the device's (`antialias`:
 * desktop true, phone false). Every canvas asks here, saying whether it mounts a composer. ⛔ `composer` is required.
 */
/**
 * ⭐ THE CANVAS AND THE COMPOSER AGREE (Ward's point, Boz's ruling, 2026-10-28). `{ composer }` is said by the host, and
 * <Town> knows the same fact (it mounts PostProcessing unless layers.post is off), so the two could disagree silently.
 * <Town> asks THIS at mount with the canvas's ACTUAL anti-aliasing, read off its context (never a second statement), and
 * refuses by name when the canvas has none and no composer smooths it either: every edge would be aliased (LS's ground-only
 * player was exactly that, `post: false` on a composer canvas). The other way round (MSAA on, a composer drawing) is only
 * redundant: Cartograph's canvas is also the Designer's, so its Stage shots pay ~1 ms for it (accepted). → message | null
 */
export function canvasAAMismatch(quality, { contextAntialias, composer } = {}) {
  if (!quality?.id) throw new Error('[quality] ⛔ canvasAAMismatch needs a profile from src/lib/qualityProfile.js')
  if (typeof contextAntialias !== 'boolean' || typeof composer !== 'boolean') throw new Error('[quality] ⛔ canvasAAMismatch needs { contextAntialias, composer } as booleans')
  if (composer || contextAntialias || !quality.antialias) return null
  return '[Town] ⛔ this canvas was made with NO anti-aliasing (townCanvasProps(…, { composer: true })), and <Town> draws no composer '
    + '(layers.post is off): every edge is aliased. ▶ the host passes townCanvasProps(quality, { composer: false }) whenever it turns post off.'
}

export function canvasAntialias(quality, { composer } = {}) {
  if (!quality?.id) throw new Error('[quality] ⛔ canvasAntialias needs a profile from src/lib/qualityProfile.js')
  if (typeof composer !== 'boolean') throw new Error('[quality] ⛔ canvasAntialias needs { composer: true | false } — whether this canvas mounts the composer')
  return composer ? false : !!quality.antialias
}

/** Does this profile run the post-FX pass `id` (renderPipeline.jsx's manifest id)? The one question, asked here. */
export function includesPass(quality, id) {
  if (!Array.isArray(quality?.postFxOff)) throw new Error(`[quality] ⛔ profile "${quality?.id}" has no postFxOff — which post-effects it runs is unknown`)
  return !quality.postFxOff.includes(id)
}

/**
 * ⭐ THE ONE FUNCTION a surface's deployment policy is applied through (Preview and the Ward alike): the surface's render
 * profile (desktop, or the phone's for phone-hi / phone-lo) with the town's policy for that surface laid on it.
 * `deployment` is the manifest's `deployment` (the Ward) or Preview's live copy of `deployment.json`: src/lib/deployment.js.
 */
export function surfaceQuality(surface, deployment) {
  const base = surface === 'desktop' ? QUALITY.desktop : QUALITY.phone
  return { ...base, surface, postFxOff: surfacePolicy(deployment, surface).postFxOff }
}

/** The surface this device is: desktop, or a phone (every phone is phone-lo until phones can be told apart: deployment.js). */
export function deviceSurface() { return IS_MOBILE ? RUNTIME_PHONE_SURFACE : 'desktop' }

/** The profile a PLAYER runs on this device, under its town's deployment (`manifest.deployment`). ⛔ No record, no profile. */
export function deviceQuality(deployment) {
  if (deployment === undefined) throw new Error('[quality] ⛔ deviceQuality needs the town\'s deployment (manifest.deployment) — which passes a surface ships is the town\'s policy')
  return surfaceQuality(deviceSurface(), deployment)
}

/**
 * The profile for an AUTHORING surface on this device (Stage, the lab, the tree diorama): every pass on. Authoring
 * shows creative intent; what each surface ships is the deployment layer, authored and inspected in Preview.
 */
export function authoringQuality() { return IS_MOBILE ? QUALITY.phone : QUALITY.desktop }

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
