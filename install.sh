#!/usr/bin/env bash
# Links extension/ into the user's GNOME Shell extensions and enables it.
# On Wayland the Shell picks up a new extension at the next login.
set -euo pipefail

uuid=teamclaude-gauge@ma2t.github.io
src="$(cd "$(dirname "$0")" && pwd)/extension"
dest="$HOME/.local/share/gnome-shell/extensions/$uuid"

mkdir -p "$(dirname "$dest")"
ln -sfn "$src" "$dest"

enabled=$(gsettings get org.gnome.shell enabled-extensions)
case "$enabled" in
    *"'$uuid'"*) ;;
    "@as []") gsettings set org.gnome.shell enabled-extensions "['$uuid']" ;;
    *) gsettings set org.gnome.shell enabled-extensions "${enabled%]}, '$uuid']" ;;
esac
echo "Installed $uuid. Log out and back in to load it."
