#!/usr/bin/env bash
# Loads the installed extension in a throwaway headless GNOME Shell. A private
# D-Bus, dconf and runtime dir keep it away from the real session. Exit 0 when
# the Shell reports the extension ACTIVE.
set -euo pipefail

uuid=teamclaude-gauge@ma2t.github.io
work=$(mktemp -d)
cleanup() {
    # Portals mount FUSE dirs in the private runtime dir, and session services
    # outlive the bus for a moment, still writing here.
    fusermount3 -uzq "$work/run/doc" "$work/run/gvfs" 2>/dev/null || true
    for _ in 1 2 3 4 5; do
        rm -rf "$work" 2>/dev/null && return
        sleep 1
    done
}
trap cleanup EXIT
mkdir -m 700 "$work/run"
export XDG_CONFIG_HOME="$work/config" XDG_RUNTIME_DIR="$work/run"

dbus-run-session -- bash -s "$uuid" "$work" 2>>"$work/bus.log" <<'INNER'
uuid=$1 work=$2
gsettings set org.gnome.shell enabled-extensions "['$uuid']"
gnome-shell --headless --wayland --no-x11 --virtual-monitor 1600x900 \
    --wayland-display tcg-test >"$work/shell.log" 2>&1 &
shell=$!
info=
for _ in $(seq 60); do
    sleep 0.5
    info=$(gdbus call --session --dest org.gnome.Shell.Extensions \
        --object-path /org/gnome/Shell/Extensions \
        --method org.gnome.Shell.Extensions.GetExtensionInfo "$uuid" 2>/dev/null) && break
done
sleep 3 # first poll lands in the log
kill "$shell"
wait "$shell" 2>/dev/null || true
grep -iE "teamclaude|JS ERROR|Extension" "$work/shell.log" || true
echo "$info"
[[ "$info" == *"'state': <1.0>"* ]]
INNER
