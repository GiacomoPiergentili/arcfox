#!/bin/zsh
# Installs (or removes) the Arc sidebar script (src/*.js, joined in order) into Firefox.app.
# Rerun after every Firefox update, since updates replace the app.
#   ./install.sh            install
#   ./install.sh uninstall  remove
#   ./install.sh betterfox  update Betterfox's defaults only (after betterfox/update.sh)
# Firefox runs an autoconfig file only when a pref file in defaults/pref names
# it: arc-shortcut-prefs.js does (firefox.cfg) and turns off its sandbox.
# Betterfox (betterfox/user.js and overrides.js) goes in as Firefox's default
# prefs, for every profile: betterfox.js.
set -e

HERE="${0:A:h}"
RES="/Applications/Firefox.app/Contents/Resources"
CFG="$RES/firefox.cfg"
PREFDIR="$RES/defaults/pref"
START=">>> ARC SIDEBAR SHORTCUT >>>"
END="<<< ARC SIDEBAR SHORTCUT <<<"
# (Firefox skips the cfg file's first line: it has to be a comment)
HEADER="// firefox.cfg: autoconfig, run by Firefox at startup (arc-shortcut/install.sh)"

if [[ ! -d "$RES" ]]; then
  echo "Firefox isn't in /Applications."
  exit 1
fi

if [[ "$1" == "betterfox" ]]; then
  mkdir -p "$PREFDIR"
  cat "${HERE:h}/betterfox/user.js" "${HERE:h}/betterfox/overrides.js" | sed 's/^user_pref(/pref(/' > "$PREFDIR/betterfox.js"
  echo "Betterfox updated. Restart Firefox to use it."
  exit 0
fi

# Remove any previous copy of the block (keeps reinstalls idempotent)
if [[ -f "$CFG" ]]; then
  sed -i '' "/$START/,/$END/d" "$CFG"
fi

if [[ "$1" == "uninstall" ]]; then
  rm -f "$PREFDIR/arc-shortcut-prefs.js" "$PREFDIR/betterfox.js"
  # (and the folders, when nothing else is in them: Firefox ships without)
  rmdir "$PREFDIR" "$RES/defaults" 2>/dev/null || true
  # (the cfg file too, when nothing but its header is left)
  if [[ -f "$CFG" ]] && [[ -z "$(grep -v -x -F -e "$HEADER" -e '' "$CFG")" ]]; then
    rm -f "$CFG"
  fi
  echo "Removed. Quit Firefox (Cmd+Q) and reopen it."
  exit 0
fi

# Another autoconfig set-up would fight over general.config.filename
OTHER=$(grep -l "general.config.filename" "$PREFDIR"/*.js 2>/dev/null | grep -v "/arc-shortcut-prefs.js$" || true)
if [[ -n "$OTHER" ]]; then
  echo "Another autoconfig file is installed ($OTHER); remove it first."
  exit 1
fi

mkdir -p "$PREFDIR"
cp "$HERE/arc-shortcut-prefs.js" "$PREFDIR/arc-shortcut-prefs.js"
# (user_pref -> pref: a default, which about:config changes override)
cat "${HERE:h}/betterfox/user.js" "${HERE:h}/betterfox/overrides.js" | sed 's/^user_pref(/pref(/' > "$PREFDIR/betterfox.js"
if [[ ! -s "$CFG" ]]; then
  printf '%s\n' "$HEADER" > "$CFG"
fi
printf '\n' >> "$CFG"
# (the repo's folder, for profiles that don't have the look yet)
cat "$HERE"/src/*.js | sed "s|__ARC_CHROME_DIR__|${HERE:h}|" >> "$CFG"
echo "Installed. Quit Firefox (Cmd+Q) and reopen it."
