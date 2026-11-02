#!/usr/bin/env node
/**
 * "DOES THE SCHEDULE CARD CHANGE ONLY WHAT THE OPERATOR TOUCHED, AND SAY WHY IN THEIR WORDS WHEN IT CANNOT?" (Jacob's first use
 * of the card, 2026-11-02, Boz's four: his hourly shows lost on the first edit (cause not established); "ends" stuck on
 * Dawn; an error naming a value the control did not show; "really ugly". Boz's go on a–f.)
 *
 *   1. ONE FIELD (the store's real displayChannelActions, the card's own gestures from src/stage/scheduleCard.js): an old
 *      Look (the published per-key shape PTown carries) read, then each gesture once → the saved entry equals the old
 *      Look's reading in every field but the one touched;
 *   2. ADD seeds from the default channel (one home), never a constant;
 *   3. JACOB'S NIGHT, the acceptance case (Boz, verbatim from Jacob: "ambient to come on at Golden, and displays to run on
 *      the hour from 6-12", the last show at midnight, then a dark tree): entered through the gestures from his published
 *      Look and from his file as it is now, each step saved → the entry; Tonight on a December night at PTown says 7 shows,
 *      18:00…00:00, dark after the 00:00 show; the engine's starts every night of a December week are 18:00…00:00;
 *   4. REFUSED IN THE CARD'S WORDS and the store left as it was: Ambient's 'comes on' = 'goes off'; a single show (first =
 *      last, the card's own "+ Dated event") is never refused;
 *   5. WIRED (StageApp.jsx, read): every change goes through a scheduleCard gesture and the store; no native select or
 *      time input; "clock" writes nothing; removing is an action worded as a verb, never "none"; a refusal leaves the
 *      attempt on the card, NOT SAVED; Tonight is on the Lit card, drawn from tonightOf, and says tonight's clock change.
 * Usage: node checks/claims-the-schedule-card-changes-only-what-it-touches.mjs [--mutants]
 */
import { importSource, sourceOf } from './_importSource.mjs'

const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const PT = { lat: 42.0525, lon: -70.1886, tz: 'America/New_York' }

async function verdict({ card, sched, view, store } = {}) {
  const fails = [], F = (c, m) => { if (!c) fails.push(m) }
  const schedRedirect = { 'src/displays/showSchedule.js': sched ? { transform: sched } : {} }
  const S = await importSource('src/displays/showChannel.js', { redirect: schedRedirect })
  const H = await importSource('src/displays/showSchedule.js', sched ? { transform: sched } : {})
  const T = await importSource('src/lib/todSlots.js')
  const K = await importSource('src/stage/scheduleCard.js', { ...(card ? { transform: card } : {}), redirect: schedRedirect })
  const ST = await importSource('src/cartograph/stores/useCartographStore.js', { span: { functions: ['displayChannelActions'] },
    prefix: "import { defaultDisplayChannel, validateDisplayChannel } from '../../displays/showChannel.js'\nimport { levelsAt, refuseShortCadence, refuseScheduleSense } from '../../displays/showSchedule.js'\nimport { NAMED_TOD_SLOTS_BY_ID } from '../animatedParam.js'\nimport { todSlotDays } from '../../lib/todSlots.js'\nconst getTodSlotMinutes = () => null\nconst getTodSlotDaysAhead = (from, n) => todSlotDays({ lat: 42.0525, lon: -70.1886, tz: 'America/New_York' }, new Date('2026-11-02T17:00:00Z'), n)\nconst useTimeOfDay = { getState: () => ({ currentTime: new Date(0) }) }\n",
    suffix: '\nexport { displayChannelActions }', redirect: schedRedirect, ...(store ? { transform: store } : {}) })
  let state = { displays: {} }
  const set = (f) => { const r = f(state); if (r !== state) state = { ...state, ...r } }
  const A = ST.displayChannelActions(set, () => ({ _saveDesignDebounced: () => {} }))
  const SECS = 302.2, today = '2026-12-04'
  // PTown's published Look (design.json at integration, the per-key shape): its reading is the reference
  const published = { animated: 'tod', values: { dawn: { glow: 1.36, show: 2.4, kelvin: 3810, showEvery: 60 }, sunset: { glow: 1.36, show: 2, kelvin: 2700, showEvery: 60 } }, edges: { dawn: { fade: 'down', minutes: 15 }, sunset: { fade: 'up', minutes: 15 } } }
  const read = S.validateDisplayChannel(published, 'check').schedule
  const fresh = (ch) => { state = { displays: { m: JSON.parse(JSON.stringify(ch)) } } }
  const saved = () => state.displays.m.schedule
  const cardList = () => S.validateDisplayChannel(state.displays.m, 'check').schedule     // what the card shows (readChannel)
  // 1. one field
  F(same(read, [{ days: 'daily', ambient: { on: 'sunset', fadeIn: 15, off: 'dawn', fadeOut: 15 }, shows: { first: '00:00', last: '23:00', every: 60 } }]), `the published Look does not read as its one daily entry (${JSON.stringify(read)})`)
  const gestures = [
    ['Ambient comes on at 20:00', (l) => K.setAmbient(l, 0, 'on', '20:00'), (e) => ({ ...e, ambient: { ...e.ambient, on: '20:00' } })],
    ['Ambient goes off at 00:00', (l) => K.setAmbient(l, 0, 'off', '00:00'), (e) => ({ ...e, ambient: { ...e.ambient, off: '00:00' } })],
    ['Ambient fades in 5', (l) => K.setAmbient(l, 0, 'fadeIn', 5), (e) => ({ ...e, ambient: { ...e.ambient, fadeIn: 5 } })],
    ['Ambient fades out 5', (l) => K.setAmbient(l, 0, 'fadeOut', 5), (e) => ({ ...e, ambient: { ...e.ambient, fadeOut: 5 } })],
    ['the first show at Golden', (l) => K.setShows(l, 0, 'first', 'golden'), (e) => ({ ...e, shows: { ...e.shows, first: 'golden' } })],
    ['the last show starts at 22:00', (l) => K.setShows(l, 0, 'last', '22:00'), (e) => ({ ...e, shows: { ...e.shows, last: '22:00' } })],
    ['every 30 min', (l) => K.setShows(l, 0, 'every', 30), (e) => ({ ...e, shows: { ...e.shows, every: 30 } })],
    ['weekdays', (l) => K.setDays(l, 0, 'weekdays', today), (e) => ({ ...e, days: 'weekdays' })],
  ]
  for (const [name, gesture, want] of gestures) {
    fresh(published)
    try { A.setDisplaySchedule('m', gesture(cardList()), SECS) } catch (e) { F(false, `${name}, from the published Look, is refused (${String(e.message).slice(0, 140)})`); continue }
    F(same(saved(), [want(read[0])]), `${name}, from the published Look, changes more than itself (${JSON.stringify(saved())})`)
  }
  // 2. add seeds from the default
  const dflt = S.defaultDisplayChannel().schedule[0]
  F(same(K.addShows([{ days: 'daily', ambient: dflt.ambient, shows: null }], 0)[0].shows, dflt.shows), 'adding shows does not seed them from the default channel')
  F(same(K.addAmbient([{ days: 'daily', ambient: null, shows: dflt.shows }], 0)[0].ambient, dflt.ambient), 'adding Ambient does not seed it from the default channel')
  // 3. Jacob's night, through the gestures, every step saved
  const want = [{ days: 'daily', ambient: { on: 'golden', fadeIn: 15, off: 'after-last-show', fadeOut: 15 }, shows: { first: '18:00', last: '00:00', every: 60 } }]
  const steps = (fromNow) => [
    (l) => K.setAmbient(l, 0, 'on', 'golden'),
    ...(fromNow ? [(l) => K.addShows(l, 0)] : []),
    (l) => K.setShows(l, 0, 'first', '18:00'),
    (l) => K.setShows(l, 0, 'last', '00:00'),
    (l) => K.setAmbient(l, 0, 'off', 'after-last-show'),
  ]
  const now = { animated: 'tod', values: { dawn: { glow: 1.36, show: 2.4, kelvin: 3810 }, sunset: { glow: 1.36, show: 2, kelvin: 2700 } }, schedule: [{ days: 'daily', ambient: { on: '20:00', fadeIn: 15, off: 'dawn', fadeOut: 15 }, shows: null }] }
  for (const [from, start] of [['his published Look', published], ['his file as it is now', now]]) {
    fresh(start)
    let k = 0
    try { for (const step of steps(start === now)) { k++; A.setDisplaySchedule('m', step(cardList()), SECS) } } catch (e) { F(false, `Jacob's night from ${from}: step ${k} is refused (${String(e.message).slice(0, 160)})`); continue }
    F(same(saved(), want), `Jacob's night from ${from} is not saved as entered (${JSON.stringify(saved())})`)
  }
  const ch = state.displays.m, rowOf = (d) => T.todSlotRowOf(PT, d)
  const tn = K.tonightOf(ch, today, SECS, rowOf), hm = (h) => h * 60
  F(same(tn.times, [18, 19, 20, 21, 22, 23, 24].map(hm)) && tn.dark === hm(24), `Tonight on ${today} is not 7 shows 18:00…00:00, dark after 00:00 (${tn.times}; dark ${tn.dark})`)
  F(/Tonight: Ambient \d\d:\d\d–00:\d\d · 7 shows \(18:00…00:00\), 5:02 each · dark after the 00:00 show/.test(tn.line), `Tonight's line does not say it (${tn.line})`)
  for (let d = '2026-12-01'; d <= '2026-12-07'; d = H.nextDate(d)) {
    const starts = H.nightsOn(ch, d, rowOf, SECS).flatMap(n => n.starts)
    F(same(starts, [18, 19, 20, 21, 22, 23, 24].map(hm)), `the engine's shows on the night of ${d} are not 18:00…00:00 (${starts})`)
  }
  // 4. refused in the card's words, the store as it was; a single show never refused
  fresh(published)
  const before = JSON.stringify(state)
  const onOff = K.setAmbient(K.setAmbient(cardList(), 0, 'on', '20:00'), 0, 'off', '20:00')
  let msg = '', stored = false
  try { A.setDisplaySchedule('m', onOff, SECS); stored = true } catch { /* refused: the store must be as it was */ }
  try { S.validateDisplayChannel({ ...S.validateDisplayChannel(state.displays.m, 'check'), schedule: onOff }, 'check') } catch (e) { msg = e.message }
  F(!stored && /Ambient's 'comes on' and 'goes off' are both 20:00, so it would never be lit: choose a different time for it to go off/.test(msg) && JSON.stringify(state) === before, `on = off is not refused in the card's words, or it changed the store (${msg.slice(0, 160)})`)
  fresh(published)
  try { A.setDisplaySchedule('m', K.addEvent(cardList(), today), SECS); F(saved().length === 2 && same(saved()[1].shows, { first: '21:00', last: '21:00', every: 60 }), 'the dated event is not saved') } catch (e) { F(false, `a dated event of one show (first = last) is refused (${String(e.message).slice(0, 160)})`) }
  F(K.clockTyped('0:00') === '00:00' && K.clockTyped('23:59') === '23:59' && K.clockTyped('24:00') === null && K.clockTyped('8pm') === null, 'a typed time is not read as HH:MM (or a bad one accepted)')
  // 6. THE KEYS (Jacob, 2026-11-02: one home, the levels on the keys he made): keyed in the day's order, "+ key at" the rest;
  // adding a key seeds it with the levels there, and editing one key leaves every other key as it was
  F(same(K.keyedSlots({ sunset: 1, dawn: 1, golden: 1 }), ['dawn', 'golden', 'sunset']) && same(K.unkeyedSlots({ dawn: 1, golden: 1, sunset: 1 }), ['sunrise', 'noon', 'dusk', 'night', 'deep']), `the keys are not the keyed slots in the day's order, with the rest offered (${K.keyedSlots({ dawn: 1, golden: 1, sunset: 1 })}; ${K.unkeyedSlots({ dawn: 1, golden: 1, sunset: 1 })})`)
  fresh(now)
  const others = JSON.stringify(state.displays.m.values)
  A.setDisplayValue('m', 'glow', 0.4, 'sunset')
  const v = state.displays.m.values, was = JSON.parse(others)
  F(v.sunset.glow === 0.4 && v.sunset.show === was.sunset.show && v.sunset.kelvin === was.sunset.kelvin && same(v.dawn, was.dawn) && same(state.displays.m.schedule, now.schedule), `editing one key's level changes more than that level (${JSON.stringify(v)})`)
  // 5. wired
  const sa = code(view ? view(sourceOf('src/stage/StageApp.jsx')) : sourceOf('src/stage/StageApp.jsx'))
  const block = sa.slice(sa.indexOf('const CAPTION = '), sa.indexOf('function LanternChannel'))
  F(block.length > 1000 && /const put = \(next\) => \{ try \{ setSchedule\(display\.id, next, secs\); setTried\(null\) \} catch \(e\) \{ setTried\(\{ list: next, reason: plainReason\(e\) \}\) \} \}/.test(block) && /const list = tried\?\.list \?\? channel\.schedule/.test(block) && /Not saved: \{tried\.reason\}/.test(block), 'a refusal does not leave the attempt on the card, NOT SAVED, with its reason')
  F(!/j === i|\{ \.\.\.e,|\{ \.\.\.a,|\{ \.\.\.sh,|\.\.\.x\./.test(block) && (block.match(/put\((setAmbient|setShows|addAmbient|addShows|removeAmbient|removeShows|setDays|addEvent|removeEntry)\(/g) || []).length >= 14, 'the card changes the schedule other than through scheduleCard.js\'s gestures')
  F(!/<select|type="time"|type="number"/.test(block), 'the card uses a native select, time or number input (not the panel\'s controls)')
  F(/<Pill on=\{showClock\} title=\{`\$\{label\}: a time on the town's clock`\} onClick=\{\(\) => setClockOpen\(true\)\}>clock<\/Pill>/.test(block), '"clock" writes something (it must only open the time)')
  F(/>Remove Ambient<\/Action>/.test(block) && />Remove shows<\/Action>/.test(block) && />\+ Add shows<\/Action>/.test(block) && !/>\s*none[^<]*</.test(block), 'removing is not an action worded as a verb, or "none" is shown')
  F(/<Tonight display=\{display\} channel=\{read\.channel\} keys=\{keys\}[\s\S]*<ScheduleBlock display=\{display\} channel=\{read\.channel\} \/>/.test(sa) && /const t = useMemo\(\(\) => tonightOf\(channel, D, secs, getTodSlotRow\), \[channel, D, secs\]\)/.test(sa) && !/TonightStrip/.test(sa), 'Tonight is not on the Lit card above the levels and the Schedule, drawn from tonightOf')
  F(/return townClockChange\(noon\(D\), noon\(nextDate\(D\)\)\)/.test(sa) && /\{clock && <div className="text-caption" style=\{CAPTION\}>\{clock\}<\/div>\}/.test(sa), "Tonight does not say tonight's clock change (townClockChange, noon to noon)")
  const lit = sa.slice(sa.indexOf('function DisplayChannel('), sa.indexOf('const CAPTION = '))
  F(/const values = read\.channel\.values, keys = keyedSlots\(values\), selected = keys\.includes\(picked\) \? picked : keys\[0\]/.test(lit) && /keys\.map\(s => <Pill key=\{s\} on=\{s === selected\}[^>]*onClick=\{\(\) => setPicked\(s\)\}>/.test(lit), 'the keys are not picked by name (the levels shown are not the picked key\'s)')
  F(/unkeyedSlots\(values\)\.map\(s => <Action key=\{s\}[^>]*onClick=\{\(\) => put\(\(\) => \{ addSlot\(id, s\); setPicked\(s\) \}\)\}>/.test(lit) && /\{keys\.length > 1 && <Action danger[^>]*onClick=\{\(\) => put\(\(\) => removeSlot\(id, selected\)\)\}>Remove key<\/Action>\}/.test(lit), '"+ key at" does not add and pick the slot, or "Remove key" is offered on the last key')
  F(/<Tonight display=\{display\} channel=\{read\.channel\} keys=\{keys\} selected=\{selected\} onSelect=\{setPicked\} \/>/.test(lit) && /keys\.map\(s => \{\s*const m = getTodSlotRow\(D\)\[s\], on = s === selected/.test(sa) && /onClick=\{\(\) => onSelect\?\.\(s\)\}/.test(sa), 'Tonight does not mark the keys at their times tonight, or a marker does not pick its key')
  return fails
}

const run = async (m) => { try { return await verdict(m) } catch (e) { return [`it threw: ${String(e.message).slice(0, 200)}`] } }
const fails = await run()
if (fails.length) { console.log('⛔ the schedule card changes more than it touches, or cannot say why:\n  · ' + fails.join('\n  · ')); process.exitCode = 1 }
else console.log("✅ the schedule card changes only what it touches: each gesture one field, add from the default, Jacob's night saved as entered (Tonight 7 shows 18:00…00:00, dark after; the engine the same all week), refusals in the card's words with the store unchanged, the panel's own controls")

if (process.argv.includes('--mutants')) {
  const mutants = [
    ['a gesture dropping a sibling (the lost shows)', { card: (s) => s.replace("export const setAmbient = (list, i, field, value) => editEntry(list, i, { ambient: { ...list[i].ambient, [field]: value } })", "export const setAmbient = (list, i, field, value) => editEntry(list, i, { ambient: { ...list[i].ambient, [field]: value }, shows: null })") }],
    ['shows added from a constant', { card: (s) => s.replace('editEntry(list, i, { shows: { ...DEFAULT().shows } })', "editEntry(list, i, { shows: { first: '20:00', last: '23:00', every: 60 } })") }],
    ['a single show refused again', { sched: (s) => s.replace("if (L === 0 && what === 'Ambient' && (HHMM.test(from) || HHMM.test(to)))", 'if (L === 0 && (HHMM.test(from) || HHMM.test(to)))') }],
    ['on = off in the engine\'s words', { sched: (s) => s.replace("Ambient's 'comes on' and 'goes off' are both ${endName(a.on)}, so it would never be lit: choose a different time for it to go off", 'Ambient comes on and goes off at ${endName(a.on)}, so it holds no time') }],
    ['"clock" writing a placeholder', { view: (s) => s.replace("onClick={() => setClockOpen(true)}>clock</Pill>", "onClick={() => onChange('20:00')}>clock</Pill>") }],
    ['a refusal not left on the card', { view: (s) => s.replace('setTried({ list: next, reason: plainReason(e) })', 'setTried(null)') }],
    ['remove shown as "none"', { view: (s) => s.replace('>Remove shows</Action>', '>none</Action>') }],
    ['an edit made inline', { view: (s) => s.replace("onChange={(v) => put(setShows(list, i, 'every', v))}", "onChange={(v) => put(list.map((x, j) => j === i ? { ...x, shows: { ...x.shows, every: v } } : x))}") }],
    ['Tonight not on the card', { view: (s) => s.replace('      <Tonight display={display} channel={read.channel} keys={keys} selected={selected} onSelect={setPicked} />\n', '') }],
    ['Tonight silent on a clock change', { view: (s) => s.replace('      {clock && <div className="text-caption" style={CAPTION}>{clock}</div>}\n', '') }],
    ['a key edit writing every key', { store: (s) => s.replace("? { ...ch, values: { ...ch.values, [slotId]: { ...ch.values[slotId], [key]: value } } } : null", "? { ...ch, values: Object.fromEntries(Object.entries(ch.values).map(([k, x]) => [k, { ...x, [key]: value }])) } : null") }],
    ['the keys out of the day\'s order', { card: (s) => s.replace('export const keyedSlots = (values) => TOD_SLOT_IDS.filter(id => id in values)', 'export const keyedSlots = (values) => Object.keys(values)') }],
    ['"+ key at" not picking the new key', { view: (s) => s.replace('onClick={() => put(() => { addSlot(id, s); setPicked(s) })}', 'onClick={() => put(() => { addSlot(id, s) })}') }],
    ['the last key removable', { view: (s) => s.replace('{keys.length > 1 && <Action danger', '{<Action danger') }],
    ['a marker not picking its key', { view: (s) => s.replace('onClick={() => onSelect?.(s)}', 'onClick={() => {}}') }],
    ['a native select', { view: (s) => s.replace('<span style={SUBHEAD}>Schedule</span>', '<span style={SUBHEAD}>Schedule</span><select />') }],
  ]
  let bad = 0
  for (const [name, m] of mutants) { const f = await run(m); console.log(`${f.length ? '🔴' : '⚪ SURVIVED'} mutant: ${name}${f.length ? ` (${f.length})` : ''}`); if (!f.length) bad++ }
  if (bad) process.exitCode = 1
}
