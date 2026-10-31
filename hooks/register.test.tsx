import { expect, mock, test } from 'claude-code/testing'

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

for (const surface of ['terminal', 'desktop'] as const) {
  test(`chip beside the band, panel on click, one warning per window (${surface})`, async ($, on) => {
    mock.clock(on, { now: T0 })
    mock.store(on)
    const toasts: string[] = []
    let reading: typeof READING = []
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    on('session.usage', () => ({ value: { startedAt: T0, context: {}, rateLimits: reading } }) as never)
    on('tool.register', (_, e) => ({ value: { tool: `mcp__usage-bar__${e.name}` } }))
    on('command.register', () => ({ value: { command: 'usage-bar' } }))
    on('session.measure', (_, e) => ({ changed: e.changed }))
    on('ui.toast', (_, e) => {
      toasts.push(e.text)
      return { value: undefined }
    })
    on('ui.render', ($, e) => {
      const { Text } = $.ui.resolve(e)
      return <Text>MIC</Text> // stands for sams-tools' mic + model badge beneath
    })

    await $.session.start({ cwd: '/', surface, isInteractive: true })
    const band = { plugin: 'usage-bar', component: 'AbovePrompt', surface, props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80 } as never } as const

    // No reading yet: only what's beneath draws
    const empty = await $.ui.mount(band)
    expect(await empty.find({ type: 'Text', text: /%/ })).toBeUndefined()
    expect(await empty.find({ type: 'Text', text: /MIC/ })).toBeDefined()
    await empty.unmount()

    // First reply: the engine pushes a measurement
    reading = READING
    await $.session.measure({ context: {} as never, rateLimits: READING, changed: ['rateLimits'] })
    const ui = await $.ui.mount(band)
    expect(await ui.find({ type: 'Text', text: /MIC/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /58%/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /31%/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /USAGE/ })).toBeUndefined()
    await ui.press({ key: 'usage' })
    expect(await ui.find({ type: 'Text', text: /USAGE/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /resets in 2h 10m/ })).toBeDefined()
    await ui.unmount()

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

test('placement: footer moves the chip next to the jobs bar', { options: { placement: 'footer' } }, async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: T0, context: {}, rateLimits: READING } }) as never)
  on('tool.register', (_, e) => ({ value: { tool: `mcp__usage-bar__${e.name}` } }))
  on('command.register', () => ({ value: { command: 'usage-bar' } }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>BENEATH</Text>
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const band = await $.ui.mount({ plugin: 'usage-bar', component: 'AbovePrompt', surface: 'terminal', props: { hasSurvey: false } as never })
  expect(await band.find({ type: 'Text', text: /58%/ })).toBeUndefined()
  await band.unmount()
  const footer = await $.ui.mount({ plugin: 'usage-bar', component: 'SessionMode', surface: 'terminal', props: { modes: [] } as never })
  expect(await footer.find({ type: 'Text', text: /BENEATH/ })).toBeDefined()
  expect(await footer.find({ type: 'Text', text: /58%/ })).toBeDefined()
  await footer.unmount()
})
