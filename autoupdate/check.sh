#!/bin/zsh
# Run by the LaunchAgent (setup.sh): at login, when Firefox.app changes and
# every 6 hours. Log: ~/Library/Logs/arcfox-autoupdate.log
#  - After a Firefox update took the script out of the app: reinstalls it
#    (install.sh, in Terminal: macOS lets only apps with App Management write
#    into Firefox.app) and asks for a restart. Edits to the repo alone never
#    trigger a reinstall: run install.sh yourself when they're ready.
#  - Once a day: fetches Betterfox; if it changed (and is only user_pref
#    lines), updates betterfox/user.js (left uncommitted, see git diff) and
#    reinstalls Betterfox's defaults.
REPO="${0:A:h:h}"
RES=/Applications/Firefox.app/Contents/Resources
STATE="$HOME/Library/Application Support/arcfox-autoupdate"
LOG="$HOME/Library/Logs/arcfox-autoupdate.log"
mkdir -p "$STATE"
log() { print -r -- "$(date '+%F %T') $*" >> "$LOG"; }
notify() { /usr/bin/osascript -e "display notification \"$1\" with title \"arcfox\"" >/dev/null 2>&1; }

[[ -d "$RES" ]] || exit 0
# (wait while Firefox's updater is replacing the app)
for i in {1..60}; do
  pgrep -f "Firefox.app/Contents/MacOS/updater.app" >/dev/null || break
  sleep 5
done

# --- the script, after a Firefox update
if ! grep -q ">>> ARC SIDEBAR SHORTCUT >>>" "$RES/firefox.cfg" 2>/dev/null || [[ ! -f "$RES/defaults/pref/arc-shortcut-prefs.js" ]]; then
  # (not twice within 10 minutes, e.g. if Terminal was refused)
  if [[ -z $(find "$STATE/reinstalled" -mmin -10 2>/dev/null) ]]; then
    touch "$STATE/reinstalled"
    log "script missing from Firefox.app ($(defaults read /Applications/Firefox.app/Contents/Info.plist CFBundleShortVersionString 2>/dev/null)): reinstalling"
    open -a Terminal "$REPO/arc-shortcut/install.sh"
    sleep 15
    if grep -q ">>> ARC SIDEBAR SHORTCUT >>>" "$RES/firefox.cfg" 2>/dev/null; then
      log "reinstalled"
      notify "Reinstalled after a Firefox update. Restart Firefox (Cmd+Q) to get the sidebar back."
    else
      log "reinstall failed (does Terminal have App Management?)"
      notify "Couldn't reinstall after a Firefox update: run arc-shortcut/install.sh."
    fi
  fi
fi

# --- Betterfox, once a day
if [[ -z $(find "$STATE/betterfox-checked" -mtime -1 2>/dev/null) ]]; then
  NEW=$(mktemp)
  if curl -fsSL --max-time 30 https://raw.githubusercontent.com/yokoffing/Betterfox/main/user.js | tr -d '\r' > "$NEW" && [[ -s "$NEW" ]]; then
    touch "$STATE/betterfox-checked"
    if ! cmp -s "$NEW" "$REPO/betterfox/user.js"; then
      # (only prefs and comments; nothing that could load code)
      BAD=$(grep -v -E '^\s*$|^\s*(//|/\*|\*)|^user_pref\("[A-Za-z0-9._-]+", .*\);\s*(//.*)?$' "$NEW" | head -3)
      if [[ -n "$BAD" ]] || grep -q -E 'general\.config|autoadmin' "$NEW"; then
        log "Betterfox update refused (unexpected lines): $BAD"
        notify "A Betterfox update looked unusual and wasn't installed: see ~/Library/Logs/arcfox-autoupdate.log"
      else
        cp "$NEW" "$REPO/betterfox/user.js"
        log "Betterfox updated to $(grep -m1 -o 'version: [0-9.]*' "$NEW"): installing"
        open -a Terminal "$REPO/autoupdate/install-betterfox.command"
        notify "Betterfox updated ($(grep -m1 -o 'version: [0-9.]*' "$NEW")). Restart Firefox to use it."
      fi
    fi
  else
    log "Betterfox check failed (offline?)"
  fi
  rm -f "$NEW"
fi
