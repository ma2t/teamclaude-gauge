#!/usr/bin/env bash
# Links extension/ into the user's GNOME Shell extensions and enables it, and
# links tcg-forecast into ~/.local/bin. On Wayland the Shell picks up a new
# extension at the next login.
set -euo pipefail

uuid=teamclaude-gauge@ma2t.github.io
repo="$(cd "$(dirname "$0")" && pwd)"
dest="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$uuid"
bin="${XDG_BIN_HOME:-$HOME/.local/bin}"

if [[ -e "$bin/tcg-forecast" && ! -L "$bin/tcg-forecast" ]]; then
    echo "$bin/tcg-forecast exists and is not a link: remove it first" >&2
    exit 1
fi
mkdir -p "$(dirname "$dest")" "$bin"
ln -sfn "$repo/extension" "$dest"
ln -sfn "$repo/bin/tcg-forecast" "$bin/tcg-forecast"

enabled=$(gsettings get org.gnome.shell enabled-extensions)
case "$enabled" in
    *"'$uuid'"*) ;;
    "@as []") gsettings set org.gnome.shell enabled-extensions "['$uuid']" ;;
    *) gsettings set org.gnome.shell enabled-extensions "${enabled%]}, '$uuid']" ;;
esac
echo "Installed $uuid. Log out and back in to load it."
