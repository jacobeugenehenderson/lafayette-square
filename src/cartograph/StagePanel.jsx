/**
 * Re-exports StagePanel from the Stage app so the cartograph can use it directly.
 * All the working controls (shots, camera, timeline, environment, surfaces) come along.
 */
export { StagePanel as default, defaultKeyframes, SHOTS } from '../stage/StageApp.jsx'
