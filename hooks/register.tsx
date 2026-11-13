import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ResolveInput, SessionRateLimit } from 'claude-code'

import type { Limit } from '../types'

const limits = atom({ plugin: 'usage-bar', key: 'limits' } as const, [] as Limit[])
const isOpen = atom({ plugin: 'usage-bar', key: 'isOpen' } as const, false)
const now = atom({ plugin: 'usage-bar', key: 'now' } as const, 0)

// Tractor Beam palette (same as job-bar)
const MINT = '#81B5A5'
const TEAL = '#365455'
const GLOW = '#ECFFF4'
const AMBER = '#E3B766'
const ROSE = '#E07A7A'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

const LABELS: Record<string, { short: string; long: string }> = {
  five_hour: { short: '5h', long: '5-hour' },
  seven_day: { short: '7d', long: 'Weekly' },
  spend_limit: { short: '$', long: 'Spend' },
}
const ORDER = ['five_hour', 'seven_day', 'spend_limit']

const rank = (kind: string) => (ORDER.includes(kind) ? ORDER.indexOf(kind) : ORDER.length)

export const label = (kind: string) => LABELS[kind] ?? { short: kind, long: kind }

export const toLimits = (raw: readonly SessionRateLimit[]): Limit[] =>
  raw
    .map(r => ({ kind: r.kind, pct: Number(r.percentUsed) || 0, resetsAt: r.resetsAt ? Date.parse(r.resetsAt) || 0 : 0 }))
    .sort((a, b) => rank(a.kind) - rank(b.kind))

export const levelColor = (pct: number) => (pct >= 90 ? ROSE : pct >= 70 ? AMBER : MINT)

export const meter = (pct: number, slots: number) => {
  const filled = Math.max(0, Math.min(slots, Math.round((pct / 100) * slots)))
  return ['▰'.repeat(filled), '▱'.repeat(slots - filled)] as const
}

// "in 2h 10m", "in 3d 4h", "in 12m"
export const until = (resetsAt: number, at: number) => {
  const ms = resetsAt - at
  if (!resetsAt || ms <= 0) return 'now'
  if (ms >= DAY) return `in ${Math.floor(ms / DAY)}d ${Math.floor((ms % DAY) / HOUR)}h`
  if (ms >= HOUR) return `in ${Math.floor(ms / HOUR)}h ${Math.floor((ms % HOUR) / MIN)}m`
  return `in ${Math.max(1, Math.ceil(ms / MIN))}m`
}

// "3:40 PM", or "Tue 3:40 PM" when it's not today
export const clockTime = (resetsAt: number, at: number) => {
  if (!resetsAt) return ''
  const d = new Date(resetsAt)
  const h = d.getHours()
  const time = `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
  const sameDay = new Date(at).toDateString() === d.toDateString()
  return sameDay ? time : `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]} ${time}`
}

// What Claude reads from check_usage: plain text, one line per window.
export const describe = (ls: Limit[], at: number) =>
  ls.length
    ? ls
        .map(l => `${label(l.kind).long} limit: ${Math.round(l.pct)}% used, resets ${until(l.resetsAt, at)}${l.resetsAt ? ` (${clockTime(l.resetsAt, at)})` : ''}.`)
        .join('\n')
    : 'No usage reading yet: Claude Code reports plan limits after the first reply of a session, and only on a Pro, Max or Ultra subscription.'

async function store($: EngineInterface, raw: readonly SessionRateLimit[], warnAt: number) {
  const next = toLimits(raw)
  const prev = await read($, limits)
  if (JSON.stringify(prev) !== JSON.stringify(next)) await update($, limits, () => next)
  const at = await $.clock.now()
  await update($, now, () => at)
  // One pop-up per window per reset period; remembered across restarts in $.store.
  for (const l of next) {
    if (l.pct < warnAt) continue
    const key = `warned:${l.kind}:${l.resetsAt}`
    if (await $.store.get(key)) continue
    await $.store.set(key, true)
    $.ui.toast(`${label(l.kind).long} usage at ${Math.round(l.pct)}%, resets ${until(l.resetsAt, at)}`)
  }
}

// The chip: "5h ▰▰▰▱▱ 58% · 7d 31% ▾"; clicking it opens the panel.
function chip($: EngineInterface, e: ResolveInput, ls: Limit[], open: boolean) {
  const { Button, Text } = $.ui.resolve(e)
  const [first, ...rest] = ls
  if (!first) return null
  const [f, m] = meter(first.pct, 5)
  return (
    <Button plain key="usage" label="Usage" onPress={() => update($, isOpen, v => !v)}>
      <Text dimColor>{label(first.kind).short} </Text>
      <Text color={levelColor(first.pct)}>{f}</Text>
      <Text color={TEAL}>{m}</Text>
      <Text color={levelColor(first.pct)}> {Math.round(first.pct)}%</Text>
      {rest.map(l => (
        <Text key={l.kind}>
          <Text dimColor> · {label(l.kind).short} </Text>
          <Text color={levelColor(l.pct)}>{Math.round(l.pct)}%</Text>
        </Text>
      ))}
      <Text dimColor> {open ? '▴' : '▾'}  </Text>
    </Button>
  )
}

// The panel, boxed like Sam's tools and the jobs panel.
function panel($: EngineInterface, e: ResolveInput, ls: Limit[], at: number, columns: number) {
  const { Box, Text } = $.ui.resolve(e)
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={MINT} paddingX={1} width={Math.min(64, columns)}>
      <Text color={GLOW} bold>◆ USAGE</Text>
      {ls.map(l => {
        const [lf, lm] = meter(l.pct, 12)
        return (
          <Text key={`row-${l.kind}`}>
            <Text color={GLOW}>{label(l.kind).long.padEnd(7)} </Text>
            <Text color={levelColor(l.pct)}>{lf}</Text>
            <Text color={TEAL}>{lm}</Text>
            <Text color={levelColor(l.pct)}> {String(Math.round(l.pct)).padStart(3)}%</Text>
            <Text dimColor>  resets {until(l.resetsAt, at)}{l.resetsAt ? ` · ${clockTime(l.resetsAt, at)}` : ''}</Text>
          </Text>
        )
      })}
      <Text dimColor>Click the chip or type /usage-bar to close</Text>
    </Box>
  )
}

export const register: Register = (on, options) => {
  const placement = options.placement === 'band' ? 'band' : 'footer'
  const warnAt = Number(options.warnAt ?? 80) || 80

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.tool.register({
      name: 'check_usage',
      description:
        "Read the user's current Claude plan usage: how much of the 5-hour and weekly limits is used and when each resets. Call it before starting long or expensive work, or when the user asks about usage or limits.",
    })
    await $.command.register({ name: 'usage-bar', description: 'Show or hide the plan usage panel' })
    try {
      await store($, (await $.session.usage()).rateLimits, warnAt)
    } catch {
      // no reading yet: the first measure after a reply fills it
    }
    // Keeps "resets in ..." fresh while the panel is open; idle otherwise.
    $.clock.every(MIN, () => {
      void (async () => {
        if (await read($, isOpen)) {
          const at = await $.clock.now()
          await update($, now, () => at)
        }
      })()
    })
    return started
  })

  // Pushed by the engine after each turn and whenever a window moves a whole point.
  on('session.measure', async ($, e, next) => {
    const r = await next(e)
    if (e.changed.includes('rateLimits')) await store($, e.rateLimits, warnAt)
    return r
  })

  on('command.run', { command: 'usage-bar' }, async $ => {
    const open = await update($, isOpen, v => !v)
    return { text: open ? 'Usage panel open.' : 'Usage panel closed.' }
  })

  on('tool.call', { tool: 'mcp__usage-bar__check_usage' }, async $ => {
    let ls = await read($, limits)
    try {
      ls = toLimits((await $.session.usage()).rateLimits)
    } catch {
      // fall back to the last reading
    }
    return { result: describe(ls, await $.clock.now()) }
  })

  // Footer (default): the chip next to the jobs bar. Band: the chip beside the mic and model badge.
  // The panel always opens above the prompt, like the jobs panel.
  // Every hook wraps the drawing beneath, so the other mods' pieces still show.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const inner = await next(e)
    const ls = await read($, limits)
    if (e.props.hasSurvey || !ls.length) return inner
    const open = await read($, isOpen)
    const { Box } = $.ui.resolve(e)
    const top =
      placement === 'band' ? (
        <Box flexDirection="row" alignItems="flex-start">
          {inner}
          <Box marginLeft={2}>{chip($, e, ls, open)}</Box>
        </Box>
      ) : (
        inner
      )
    if (!open) return top
    const at = (await read($, now)) || (await $.clock.now())
    return (
      <Box flexDirection="column">
        {top}
        {panel($, e, ls, at, e.props.bodyColumns ?? 64)}
      </Box>
    )
  })
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const inner = await next(e)
    if (placement !== 'footer') return inner
    const ls = await read($, limits)
    if (!ls.length) return inner
    const { Box } = $.ui.resolve(e)
    return (
      <Box>
        {inner}
        {chip($, e, ls, await read($, isOpen))}
      </Box>
    )
  })
}
