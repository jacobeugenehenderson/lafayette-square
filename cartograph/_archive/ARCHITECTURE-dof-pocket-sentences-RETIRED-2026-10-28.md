# ARCHITECTURE — the "Post-FX shares a blur LADDER" bullet's DoF sentences (RETIRED 2026-10-28)

Replaced by what the code is (Ferrule, Boz's ruling: ROT). The hero pocket was superseded by one focal plane measured along the
ground (the tilt-shift, Jacob 2026-09-27), the focus object by identity racking between keyframes (237ee4db) and the hero ladder
(11ade6c7); the VIEW-Z anchor by the ground metric that focus and pixel share. Verbatim, as they stood:

> **DoF** (`RomanceDoF.jsx`) picks blur **radius** by depth (2-tap lerp of the straddling rungs) → a real focus pull; *single-focal* (sharp near → mid/far melts), which **replaced the two-focal model** (it read backwards — pushing Focus out blurred the *near*, since everything closer than the far plane was "foreground"). A **hero pocket** eases the far blur toward `heroBlur` at the designated hero's distance (the gentle-soft Arch).

> Bugs worth banking: (1) **anchor the hero pocket in VIEW-Z space** — the shader decodes depth as forward-axis Z, so `camera.distanceTo` (Euclidean) missed the off-axis Arch; (2) feed the **live** hero placement via override, not the stale baked `scene.json` arch;
