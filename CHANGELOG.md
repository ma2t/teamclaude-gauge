# Changelog

## 4 (2026-10-30)

### Added

- README images rendered from a fictional fleet (`tests/demo.js`, `tests/headless.sh demo assets`). Why: a real screenshot shows real account addresses.
- Fable forecast: when Fable comes back, account by account, over the next days. `tcg-forecast` prints it in a terminal (also over SSH, also as JSON); the menu item "Fable forecast" opens it in a window. Why: the gauge showed the next resets, not when the fleet would be usable again, and a reset account fills up again within hours.
- `tests/headless.sh window DIR`: opens the forecast window from the menu in a headless Shell and saves screenshots.

### Changed

- `tests/headless.sh` loads the extension of its own checkout, with throwaway data, bin and cache dirs. Why: it tested the installed copy, and its live-load mode wrote to the real install.
- The teamclaude client moved to `extension/api.js`. Why: the panel, the command and the window share it.

## 3 (2026-10-23)

### Added

- `tools/live-load.sh`: loads the extension, or a newer copy of it, into the running Shell through Looking Glass. Why: on Wayland a new or changed extension otherwise needs a logout.
- `tests/headless.sh live-load`: checks a first load and a reload in a running headless Shell.

### Changed

- The indicator and the ring are plain classes around Shell widgets, no longer GObject subclasses. Why: a GType name cannot be registered twice, so a reload failed with "already registered".

## 2 (2026-10-23)

### Changed

- Accounts submenu: a grid of tiles replaces the table. Each tile has a Fable ring with the % inside, 7d and 5h bars, and the come-back time when the account is capped. Why: the table needed reading row by row; the rings show at a glance which accounts still have Fable.

## 1 (2026-10-23)

### Added

- Panel ring and smart label for the teamclaude fleet. Why: the Fable weekly cap hit every account, and nothing on the desktop showed it or when it would lift.
- Countdown to the first reset when a bucket is capped fleet-wide. Why: "when can I work again" is the question a cap raises.
- Next-resets list at 90% and above, with the fleet share each reset frees. Why: one account coming back frees about 9% of the fleet, so the order of resets matters.
- Accounts submenu with per-account 5h, 7d and Fable use.
- `tests/headless.sh`: loads the extension in a private headless Shell and can save screenshots. Why: on Wayland every check would otherwise need a re-login.
