# BACKLOG item, resolved 2026-10-28: the Salon loader ignored HTTP status

Moved from `arborist/BACKLOG.md` (▶ 2026-10-04 — THE GROVE SHOULD BE READY BEFORE YOU OPEN IT, item 3), verbatim:

> 3. **⛔ The Salon loader ignores HTTP status:** a dead arborist server reads as *"Chassis library is empty"* (`useArboristStore#loadSalonLibraries`). That's a silent fallback; an unreachable server must say so. Seen 2026-10-04, when the arborist server had crashed (the cause is in Jacob's terminal).

Seen again 2026-10-28 (the banner, with 241 chassis on disk). Resolved by `src/arborist/salonLibraries.js#readSalonLibraries`: each of
the server's four answers is read for its status and its list, and a failed one is said by name (`salonError`); the "empty"
banner waits for `salonChassisLoaded`. ▶ `node checks/claims-the-salon-says-why-its-library-is-empty.mjs`
