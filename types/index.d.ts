// One rate-limit window as the last API response reported it.
// kind: 'five_hour' | 'seven_day' | 'spend_limit'; pct 0-100; resetsAt epoch ms (0 = unknown)
export type Limit = { kind: string; pct: number; resetsAt: number }

declare module 'claude-code' {
  interface PluginState {
    'usage-bar': {
      limits: Limit[]
      isOpen: boolean
      now: number
      // Flips every 1.2s while Claude is out, for the Odysseus chip's soft green pulse
      pulse: boolean
      // The last message failed on the usage limit (the last reading can still say 98%)
      limited: boolean
    }
  }
}
