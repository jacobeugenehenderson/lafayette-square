<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-26
evict-when: when it rains on screen the sky is overcast and the whole scene is darkened, in every app that draws rain, driven by the same weather state; a check proves the light follows the weather; and Jacob has seen Provincetown in rain.
-->

# The weather reaches the light: rain comes with its sky

**You are the dispatched agent. Name yourself: one word, not a name another RUNNING session holds**
(check `ListAgents`, then ask Jacob to `/rename`). **Agent: FRESH.**

## The ask (Jacob, 2026-09-26)

He saw it raining in Provincetown on screen, because it really was: *"It's raining on screen!"* But: *"the weather
is supposed to be more pronounced in the sky, please make sure the weather is connected. If nothing else we're
supposed to apply a neutral density filter to the whole scene when it's raining; right now it looks like the
devil is beating his wife"* (rain falling in sunshine).

## ⭐ The rule

**One weather state drives everything it implies.** If rain draws, its sky draws: cloud cover, a dimmed sun, and
a scene-wide darkening (Jacob's neutral density filter, the minimum). Rain in full sun means some consumer is
reading a different state from the rain, or none. ⛔ Don't add a rain-specific dimmer beside the existing
machinery. Find where the chain breaks.

## What Boz found (confirm it; don't inherit it)

- The live chain: `WeatherPoller` → `useSkyState` (`cloudCover`, `storminess`, `precipitationIntensity`, eased
  toward targets) and the Almanac directive (`useAtmosphereDirective`, `AtmosphereDirectiveDriver`: `sun`,
  `lightDome`, `precip`) → consumers. `CelestialBodies.jsx` reads `sky.cloudCover` / `storminess` (the
  *"overcast flattening"*). Rain is drawn by `WeatherEffects` → `weather/RainParticles.jsx`, mounted in
  `Scene.jsx`, `PreviewApp.jsx` and `CartographApp.jsx`.
- `meteorologist/STATUS.md` claims *"`useSkyState` darkening (sun dim + sky desat) ✅ from the live weather
  poller"*. Jacob's screen says otherwise. ⭐ **That's a doc/code disagreement; find which is wrong.**
- ⚠️ `STATUS.md` also says the Almanac's directives carry **no `cloudCover`**, so the rain may come from the
  directive's `precip` while the darkening waits on `cloudCover` from a different path. That's a lead, not a
  cause.
- Not established: which app Jacob saw it in (Stage, Preview or production). Check all three. They all mount
  the rain.

## The steps

1. **Trace one real moment.** With Provincetown's live weather (raining now), log the whole chain in each app:
   what the poller received, what `useSkyState` holds, which directive the Almanac picked, what the rain reads,
   and what the sun, sky dome, ambient light and exposure read. Say where the rain and the light part ways.
2. **Report to Jacob** before fixing: the break, and which doc line was wrong.
3. **Fix at the break**, so the light and sky follow the same state as the rain. The neutral density darkening
   has to hold even if the clouds aren't pretty yet.

## Read first

`meteorologist/WEATHER-MODEL.md` (Condition, Degrees, directive), `meteorologist/ARCHITECTURE.md` (the directive,
§ weather effects), `meteorologist/STATUS.md`, `meteorologist/BACKLOG.md` (the "video game weather" tell: wet
surfaces are a separate item and out of scope here).

## Can the instrument see it?

A check that drives the weather state from clear to rain (through `setWeatherTargets`, as the lab does) and reads
the resolved light: sun intensity, ambient, exposure and cloud cover must all move toward overcast as
precipitation rises, in every app's mount. Mutation: cut one consumer off the state. Then Jacob's eye:
Provincetown in rain and in clear weather, same shot.

## Bounds

- Write in the weather/sky/light consumers and the directive path, plus the check. No bake.
- ⛔ Wet surfaces, puddles and snow accumulation are separate backlog items. Clouds' beauty is the
  Meteorologist's tuning, not this brief. This brief connects; it doesn't style.
- Commit only your own paths (`git commit -- <paths>`); the working tree is shared.
- Canon: `meteorologist/STATUS.md` (correct the ✅ line), `OPERATIONS` if a knob appears, `FEATURES` (weather you
  can see). Commit messages name the register reached.

**The instruction is confirm-then-build:** trace, tell Jacob where it breaks, then fix. If the code contradicts this
brief, stop and flag him.
