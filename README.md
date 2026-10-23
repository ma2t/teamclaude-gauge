# TeamClaude Gauge

GNOME Shell 49 panel indicator for a local [teamclaude](https://github.com/KarpelesLab/teamclaude) proxy. It shows where the account fleet stands on the 5h window, the weekly window and the Fable weekly cap.

## Panel

A ring plus one short label. The first matching rule wins.

| # | Fleet state | Label | Ring |
|---|---|---|---|
| 1 | Proxy unreachable | `TC off` | grey |
| 2 | A bucket is capped on every account | `Fable 99% · back in 3h48` | red, full |
| 3 | Top bucket at 70% or more | `Fable 90% · 7d 51%` | amber or red |
| 4 | Otherwise | `7d 60%` | green |

- Capped: no active account is under teamclaude's switch threshold (0.99 by default, per bucket when configured).
- Block order: `7d`, then `5h`, then `Fable`. A capped 7d or 5h window blocks every model.
- Percentages are fleet values, weighted by plan tier, rounded down.

## Menu

| Section | Content |
|---|---|
| Header | Account count, current account |
| Buckets | Bar, percent, next reset (or `back in ...` when capped) |
| Next resets | At 90% or more: the 3 soonest account resets of that bucket, with the fleet share each one frees |
| Accounts | Collapsed grid of tiles: a Fable ring per account, 7d and 5h bars, the come-back time when capped; current outlined, inactive dimmed |
| Footer | Open dashboard, age of teamclaude's last quota probe |

## Data flow

```mermaid
flowchart LR
  TC[teamclaude service<br/>127.0.0.1:3456] -->|GET /teamclaude/quota| EXT
  TC -->|GET /teamclaude/status| EXT
  EXT[extension.js<br/>every 30 s and on menu open] --> MODEL[model.js<br/>pure view model]
  MODEL --> EXT
  EXT --> UI[panel ring + label<br/>popup menu]
```

Both calls are local and read-only. The extension sends nothing anywhere else.

## Install

Requires GNOME Shell 49 and the teamclaude service (`teamclaude service install`).

```bash
./install.sh          # symlinks extension/ and enables it
tools/live-load.sh    # optional: load it now, without a logout
```

`tools/live-load.sh` copies a one-line command to the clipboard. Paste it in Looking Glass, the Shell's JS console:

```mermaid
flowchart LR
  A[tools/live-load.sh] --> B[Alt+F2, type lg, Enter]
  B --> C[Ctrl+V, Enter]
  C --> D{result line}
  D -->|loaded| E[Escape]
  D -->|failed: ...| F[log out and back in]
```

Without it, log out and back in. The same command loads an update: `git pull && tools/live-load.sh`.

| Case | Without logout? | Why |
|---|---|---|
| First install from this repo | Yes, with `tools/live-load.sh` | The Shell scans extension folders at login only. Looking Glass can load one later |
| Update of a running copy | Yes, with `tools/live-load.sh` | The Shell caches a module by path; the tool loads a fresh snapshot from a new path |
| Plain `gnome-extensions install` | No | Only extensions.gnome.org installs load live |

## Develop

| Command | What it checks |
|---|---|
| `npm test` | `model.js` unit tests, plus a read-only smoke test against the running proxy (skips when it is down) |
| `tests/headless.sh` | Loads the extension in a throwaway headless Shell, exit 0 when ACTIVE |
| `tests/headless.sh shots DIR` | Same, and saves panel, menu and accounts screenshots (dark and light) to `DIR` |
| `tests/headless.sh live-load` | Starts the Shell without the extension, loads it with `tools/live-load.sh`, then reloads it |

`tests/headless.sh shots DIR` shows a change before it reaches your session; `tools/live-load.sh` then puts it there.

| Path | Role |
|---|---|
| `extension/model.js` | Every display decision; no GNOME imports |
| `extension/extension.js` | Polling, menu, rendering |
| `extension/ring.js` | Panel ring (Cairo) |
| `extension/stylesheet.css` | Level colors and layout |

## Version history

| Version | Date | Change |
|---|---|---|
| 1 | 2026-10-23 | First release |
| 2 | 2026-10-23 | Accounts shown as ring tiles instead of a table |
| 3 | 2026-10-23 | Loads and reloads in a running Shell (`tools/live-load.sh`) |

Last updated: 2026-10-24

## License

GPL-2.0-or-later, see [LICENSE](LICENSE).
