# Changelog

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
