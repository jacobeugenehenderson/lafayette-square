# Depth of field fell back to the camera's aim in the Hero view (RETIRED 2026-10-28)

Retired by Jacob's rule (registry r-stage-focuses-the-object-and-captures-the-screen, relayed by Boz): in the Hero view the
depth of field focuses the focus OBJECT, never the aim or orbit pivot; a town with no hero and no key focus draws blurry
(no focus plane, the Amount everywhere); Street keeps the aim; Browse has none. Zob's ruling: a key focus that names
nothing weighs 0 (no plane at that end), never the other end's distance held. Browse is gated by the view, not the camera
looking down. Verbatim, as they stood:

> OPERATIONS.md (Hero shot): No hero and no key focus ⇒ the camera's aim (Street always uses the aim; Browse has no depth of field).

> src/lib/focusObject.js: ⛔ An id that names nothing is said once, loudly, naming it, and that end of the focus is the camera's aim.
> A hero that is not an object (the centroid, the landscape backdrop) is no focus object: the aim, said once.

> src/camera/MovieCamera.jsx: Outside the movie shot the depth of field takes the aim.

> src/components/dofDriver.js: Browse (overhead) camera: kill DoF — from above, the scene sits at ~one depth, so DoF only
> smears the map. Gate on look-DOWN (not raw height, which also caught the elevated Hero camera and killed DoF in the
> Hero shot) — it separates Browse (vertical) from Hero/Street (horizontal).

> ARCHITECTURE.md (DoF channel bullet): DoF blur is force-zeroed in the Browse (look-down) shot, … between keys with
> different objects it racks on the camera's timing; no object ⇒ the camera's aim (Street always).

> ARCHITECTURE.md (ladder bullet, bug 4): DoF's browse-disable gates on the camera looking **down**, not raw height (the
> height gate killed DoF in the elevated Hero shot)
