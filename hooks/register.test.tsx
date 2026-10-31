import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { clockTime, describe, levelColor, meter, toLimits, until } from './register'

const H = 3_600_000
const T0 = Date.parse('2026-10-31T12:00:00')
const READING = [
  { kind: 'seven_day', percentUsed: 31.2, resetsAt: new Date(T0 + 76 * H).toISOString() },
  { kind: 'five_hour', percentUsed: 58, resetsAt: new Date(T0 + 2 * H + 10 * 60_000).toISOString() },
]

test('helpers: order, meter, colors, times, text for Claude', () => {
  const ls = toLimits(READING)
  expect(ls.map(l => l.kind)).toEqual(['five_hour', 'seven_day'])
  expect(meter(58, 5)).toEqual(['▰▰▰', '▱▱'])
  expect(meter(140, 5)).toEqual(['▰▰▰▰▰', ''])
  expect(levelColor(58)).toBe('#81B5A5')
  expect(levelColor(75)).toBe('#E3B766')
  expect(levelColor(95)).toBe('#E07A7A')
  expect(until(T0 + 2 * H + 10 * 60_000, T0)).toBe('in 2h 10m')
  expect(until(T0 + 76 * H, T0)).toBe('in 3d 4h')
  expect(until(T0 - 1, T0)).toBe('now')
  expect(clockTime(T0 + 3 * H + 40 * 60_000, T0)).toBe('3:40 PM')
  expect(clockTime(T0 + 76 * H, T0)).toBe('Tue 4:00 PM')
  expect(describe(ls, T0)).toContain('5-hour limit: 58% used, resets in 2h 10m')
  expect(describe([], T0)).toContain('No usage reading yet')
})

const setup = (on: On, reading: () => typeof READING, toasts: string[] = []) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: T0, context: {}, rateLimits: reading() } }) as never)
  on('tool.register', (_, e) => ({ value: { tool: `mcp__usage-bar__${e.name}` } }))
  on('command.register', () => ({ value: { command: 'usage-bar' } }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>BENEATH</Text> // stands for the engine and the other mods' drawing
  })
}
const BAND = { plugin: 'usage-bar', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80 } as never } as const
const FOOTER = { plugin: 'usage-bar', component: 'SessionMode', props: { modes: [] } as never } as const

for (const surface of ['terminal', 'desktop'] as const) {
  test(`footer chip, panel above the prompt on click, one warning per window (${surface})`, async ($, on) => {
    let reading: typeof READING = []
    const toasts: string[] = []
    setup(on, () => reading, toasts)
    await $.session.start({ cwd: '/', surface, isInteractive: true })

    // No reading yet: only what's beneath draws
    const empty = await $.ui.mount({ ...FOOTER, surface })
    expect(await empty.find({ type: 'Text', text: /%/ })).toBeUndefined()
    expect(await empty.find({ type: 'Text', text: /BENEATH/ })).toBeDefined()
    await empty.unmount()

    // First reply: the engine pushes a measurement
    reading = READING
    await $.session.measure({ context: {} as never, rateLimits: READING, changed: ['rateLimits'] })
    const footer = await $.ui.mount({ ...FOOTER, surface })
    expect(await footer.find({ type: 'Text', text: /BENEATH/ })).toBeDefined()
    expect(await footer.find({ type: 'Text', text: /58%/ })).toBeDefined()
    expect(await footer.find({ type: 'Text', text: /31%/ })).toBeDefined()

    const band = await $.ui.mount({ ...BAND, surface })
    expect(await band.find({ type: 'Text', text: /58%/ })).toBeUndefined() // chip is not in the band
    expect(await band.find({ type: 'Text', text: /USAGE/ })).toBeUndefined()
    await band.unmount()

    await footer.press({ key: 'usage' })
    await footer.unmount()
    const opened = await $.ui.mount({ ...BAND, surface })
    expect(await opened.find({ type: 'Text', text: /BENEATH/ })).toBeDefined()
    expect(await opened.find({ type: 'Text', text: /USAGE/ })).toBeDefined()
    expect(await opened.find({ type: 'Text', text: /resets in 2h 10m/ })).toBeDefined()
    await opened.unmount()

    expect(toasts).toEqual([])
    const hot = [{ ...READING[1]!, percentUsed: 83 }, READING[0]!]
    await $.session.measure({ context: {} as never, rateLimits: hot, changed: ['rateLimits'] })
    await $.session.measure({ context: {} as never, rateLimits: [{ ...hot[0]!, percentUsed: 86 }, READING[0]!], changed: ['rateLimits'] })
    expect(toasts.length).toBe(1)
    expect(toasts[0]).toContain('5-hour usage at 83%')

    reading = hot
    const r = await $.tool.call({ tool: 'mcp__usage-bar__check_usage' })
    expect(String(r.result)).toContain('5-hour limit: 83% used')
  })
}

test('placement: band puts the chip beside the mic instead', { options: { placement: 'band' } }, async ($, on) => {
  setup(on, () => READING)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })
  expect(await footer.find({ type: 'Text', text: /58%/ })).toBeUndefined()
  await footer.unmount()
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await band.find({ type: 'Text', text: /BENEATH/ })).toBeDefined()
  expect(await band.find({ type: 'Text', text: /58%/ })).toBeDefined()
  await band.press({ key: 'usage' })
  expect(await band.find({ type: 'Text', text: /USAGE/ })).toBeDefined()
  await band.unmount()
})

test('Claude out: a green Odysseus chip appears in the footer and opens Odysseus only when clicked', async ($, on) => {
  const out = [{ ...READING[1]!, percentUsed: 100 }, READING[0]!]
  setup(on, () => out)
  const opened: string[][] = []
  on('process.run', (_, e) => {
    opened.push([...e.argv])
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })
  expect(await footer.find({ type: 'Text', text: /Odysseus/ })).toBeDefined()
  expect(opened).toEqual([]) // nothing opens by itself
  await footer.press({ key: 'odysseus' })
  expect(opened).toEqual([['cmd', '/c', 'start', '', 'http://localhost:7000']])
  await footer.unmount()
})

test('not out: no Odysseus chip', async ($, on) => {
  setup(on, () => READING)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })
  expect(await footer.find({ type: 'Text', text: /58%/ })).toBeDefined()
  expect(await footer.find({ type: 'Text', text: /Odysseus/ })).toBeUndefined()
  await footer.unmount()
})

test('a message that fails on the usage limit shows the chip even if the last reading said 97%; a good reply clears it', async ($, on) => {
  setup(on, () => [{ ...READING[1]!, percentUsed: 97 }, READING[0]!])
  on('turn.complete', (_, e) => ({ text: '', answer: '' }) as never)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.session.measure({ context: {} as never, rateLimits: [{ ...READING[1]!, percentUsed: 97 }, READING[0]!], changed: ['rateLimits'] })

  await $.turn.complete({ turnId: 't1', reason: 'error', answer: 'Claude usage limit reached. Your limit will reset at 3pm.', durationMs: 1, isAborted: false } as never)
  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })
  expect(await footer.find({ type: 'Text', text: /Odysseus/ })).toBeDefined()
  await footer.unmount()

  await $.turn.complete({ turnId: 't2', reason: 'answer', answer: 'done', durationMs: 1, isAborted: false } as never)
  const after = await $.ui.mount({ ...FOOTER, surface: 'terminal' })
  expect(await after.find({ type: 'Text', text: /Odysseus/ })).toBeUndefined()
  await after.unmount()
})
