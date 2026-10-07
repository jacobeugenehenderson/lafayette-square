/**
 * horizonReach — how far the horizon reaches, in multiples of the town's own radius: the disc out to 2.8 R, fading from
 * 1.05 R to 3.53 R (what 65b273dd derived from LS's authored horizon over its radius, so LS renders as it did).
 * ONE definition, read by the runtime (HorizonDisc.jsx, BakedGround.jsx) and the bake (cartograph/outer-coast.mjs,
 * which carries the water past the rim out to `fadeOuter`).
 */
const DISC_R = 2.8, FADE_IN_R = 1.05, FADE_OUT_R = 3.53
export const horizonFor = (townRadius) => ({ radius: DISC_R * townRadius, fadeInner: FADE_IN_R * townRadius, fadeOuter: FADE_OUT_R * townRadius })
