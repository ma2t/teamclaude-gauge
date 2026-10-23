#!/usr/bin/env bash
# Runs the extension in a throwaway headless GNOME Shell. A private D-Bus,
# dconf and runtime dir keep it away from the real session.
#
# Usage:
#   tests/headless.sh             the Shell loads the installed extension at
#                                 startup; exit 0 when it reports it ACTIVE
#   tests/headless.sh shots DIR   same, plus panel, menu and accounts
#                                 screenshots in the dark and light theme
#   tests/headless.sh live-load   the Shell starts without the extension;
#                                 tools/live-load.sh loads it, then reloads it
#   tests/headless.sh demo DIR    the README images: the fictional fleet of
#                                 tests/demo.js at 2x scale, cropped to the menu
set -euo pipefail

uuid=teamclaude-gauge@ma2t.github.io
here="$(realpath "$(dirname "$0")")"
mode=${1:-load}
script=
monitor=1600x900

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

case "$mode" in
    load) ;;
    shots)
        mkdir -p "${2:?usage: tests/headless.sh shots DIR}"
        export TCG_SHOT_DIR="$(realpath "$2")"
        script="$here/shot.js"
        ;;
    demo)
        mkdir -p "${2:?usage: tests/headless.sh demo DIR}"
        export TCG_SHOT_DIR="$(realpath "$2")"
        script="$here/demo-shot.js"
        monitor=2560x2880 # tall enough that the accounts grid does not scroll
        ;;
    live-load)
        # An empty data dir hides the installed copy from the startup scan.
        mkdir "$work/data"
        export XDG_DATA_HOME="$work/data" TCG_RESULT="$work/result" TCG_REPO="$(dirname "$here")"
        script="$here/live-load.js"
        ;;
    *)
        echo "usage: tests/headless.sh [shots DIR | live-load | demo DIR]" >&2
        exit 2
        ;;
esac

dbus-run-session -- bash -s "$uuid" "$work" "$script" "$mode" "$monitor" 2>>"$work/bus.log" <<'INNER'
uuid=$1 work=$2 script=$3 mode=$4 monitor=$5
gsettings set org.gnome.shell enabled-extensions "['$uuid']"
gsettings set org.gnome.shell welcome-dialog-last-shown-version '999'
if [[ "$mode" == demo ]]; then
    gsettings set org.gnome.desktop.background picture-options 'none'
    gsettings set org.gnome.desktop.background primary-color '#241f31'
    gsettings set org.gnome.desktop.interface scaling-factor 2
fi
gnome-shell --headless --wayland --no-x11 --virtual-monitor "$monitor" \
    --wayland-display tcg-test ${script:+--automation-script "$script"} >"$work/shell.log" 2>&1 &
shell=$!
info=
if [[ "$mode" != live-load ]]; then
    for _ in $(seq 60); do
        sleep 0.5
        info=$(gdbus call --session --dest org.gnome.Shell.Extensions \
            --object-path /org/gnome/Shell/Extensions \
            --method org.gnome.Shell.Extensions.GetExtensionInfo "$uuid" 2>/dev/null) && break
    done
fi
if [[ -n "$script" ]]; then
    wait "$shell" # the automation script ends the Shell when done
else
    sleep 3 # first poll lands in the log
    kill "$shell"
    wait "$shell" 2>/dev/null
fi
grep -iE "teamclaude|JS ERROR|Script failed" "$work/shell.log" || true
if [[ "$mode" == live-load ]]; then
    cat "$work/result" 2>/dev/null
    printf 'before: absent\nfirst: loaded\nreload: loaded\nfresh: true\n' | cmp -s - "$work/result"
else
    echo "$info"
    [[ "$info" == *"'state': <1.0>"* ]]
fi
INNER
