#!/usr/bin/env bash
# Loads the extension into the running GNOME Shell without a logout, through
# Looking Glass (the Shell's JS console). The Shell imports an extension once
# per session, keyed by its path, so each run snapshots extension/ into a
# fresh directory: the same command serves a first load and a reload after
# code changes. The Shell also refuses a version it unloaded before; the
# command clears that guard, since the snapshot is a new module.
#
# Usage: tools/live-load.sh [--print]
#   default  copies the Looking Glass command to the clipboard
#   --print  prints the command on stdout instead
set -euo pipefail

uuid=teamclaude-gauge@ma2t.github.io
repo="$(cd "$(dirname "$0")/.." && pwd)"
root="${XDG_CACHE_HOME:-$HOME/.cache}/teamclaude-gauge"
# The Shell requires the directory name to equal the UUID.
snap="$root/live-$(date +%s%N)/$uuid"

"$repo/install.sh" >/dev/null
mkdir -p "$root"
find "$root" -mindepth 1 -maxdepth 1 -name 'live-*' -exec rm -rf {} +
mkdir -p "$(dirname "$snap")"
cp -r "$repo/extension" "$snap"

cmd="const uuid = '$uuid', m = Main.extensionManager, old = m.lookup(uuid); \
if (old) { await m.unloadExtension(old); m._unloadedExtensions.delete(uuid) }; \
const ext = m.createExtensionObject(uuid, Gio.File.new_for_path('$snap'), 2); \
await m.loadExtension(ext); ext.state === 1 ? 'loaded' : 'failed: ' + ext.error"

if [[ "${1:-}" == --print ]] || ! command -v wl-copy >/dev/null; then
    printf '%s\n' "$cmd"
    exit
fi
printf '%s' "$cmd" | wl-copy
cat <<'EOF'
Load command copied to the clipboard. In GNOME:
  1. Alt+F2, type lg, press Enter
  2. Ctrl+V, Enter: the result line reads "loaded"
  3. Escape
EOF
