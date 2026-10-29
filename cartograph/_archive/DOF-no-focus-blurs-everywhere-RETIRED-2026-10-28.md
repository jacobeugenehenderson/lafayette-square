# With no focus object, the blur was the Amount everywhere (RETIRED 2026-10-28, the same day it landed)

Replaced by Jacob's noFocusObject ruling (registry r-stage-focuses-the-object-and-captures-the-screen, relayed by Boz): with
no focus object the blur is anchored to the TOWN — a pixel's world ground distance from the disc's centre over its radius,
sharp at the centre, the Amount at the rim and beyond (RomanceDoF.jsx#townLaw). Window softness then means the share of
the radius that ramps (Boz's ruling (a)). Verbatim, as they stood:

> OPERATIONS.md (Hero shot): A key focus naming nothing has no plane: the frame racks toward the Amount there. **No hero and no key focus ⇒ no focus plane: the frame blurs at the Amount** (Amount 0: sharp).

> ARCHITECTURE.md (DoF channel bullet): In Hero the focus is never the aim: an end naming nothing weighs 0, and no object at all ⇒ no focus plane, the Amount everywhere (`uFocusOn`); Street takes the aim.

> RomanceDoF.jsx (DOF_BLUR_GLSL): uFocusOn is how much of a focus plane there is: 0 = none, the Amount everywhere — `return mix(uMaxBlur, law, uFocusOn);`
