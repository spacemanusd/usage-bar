# usage-bar

A Claude Code mod that shows your plan usage in the footer, next to the jobs bar:

```
⏵⏵ auto mode on (shift+tab to cycle)     ○ Idle ▰▰▰▰▰▰▰▰ ▾  5h ▰▰▰▱▱ 58% · 7d 31% ▾  ◆ Sam's tools ▾
```

- **Chip:** 5-hour window as a meter, weekly as a percent. Mint under 70%, amber 70-89%, rose at 90%+.
- **Panel:** click the chip (or type `/usage-bar`) and a boxed panel opens above the prompt with both windows with reset times ("resets in 2h 10m · 3:40 PM").
- **One warning:** a single pop-up the first time a window crosses 80% (once per reset period, remembered across restarts).
- **For Claude:** a `check_usage` tool Claude calls only when it needs the numbers, so nothing is added to every prompt and the prompt cache stays intact.

Numbers come straight from Claude Code (the same figures `/usage` shows). They appear after the first reply of a session, and only on a Pro, Max or Ultra subscription.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install usage-bar --marketplace spacemanusd/usage-bar
```

Answer `y` to add the marketplace and pick the **user** scope, so it loads in every session.

## Settings

In `/config` (or `pluginConfigs.usage-bar.options` in `~/.claude/settings.json`):

| Setting | Default | |
| --- | --- | --- |
| `placement` | `footer` | `footer` = bottom row, next to the jobs bar; `band` = top row, beside the mic and model badge |
| `warnAt` | `80` | percent that triggers the one-time pop-up |

## Develop

```
claude plugin test <path-to-this-repo>
```
