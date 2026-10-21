#!/bin/zsh
# Installs (or removes) the Arc sidebar script (shortcut.cfg.js) into LibreWolf.app.
# Rerun after every LibreWolf update, since updates replace the app.
#   ./install.sh            install
#   ./install.sh uninstall  remove
set -e

HERE="${0:A:h}"
RES="/Applications/LibreWolf.app/Contents/Resources"
CFG="$RES/librewolf.cfg"
PREFDIR="$RES/defaults/pref"
START=">>> ARC SIDEBAR SHORTCUT >>>"
END="<<< ARC SIDEBAR SHORTCUT <<<"

# Remove any previous copy of the block (keeps reinstalls idempotent)
sed -i '' "/$START/,/$END/d" "$CFG"

if [[ "$1" == "uninstall" ]]; then
  rm -f "$PREFDIR/arc-shortcut-prefs.js"
  echo "Removed. Restart LibreWolf."
  exit 0
fi

mkdir -p "$PREFDIR"
cp "$HERE/arc-shortcut-prefs.js" "$PREFDIR/arc-shortcut-prefs.js"
printf '\n' >> "$CFG"
cat "$HERE/shortcut.cfg.js" >> "$CFG"
echo "Installed. Quit LibreWolf (Cmd+Q) and reopen it."
