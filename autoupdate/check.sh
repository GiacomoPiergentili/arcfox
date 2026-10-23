#!/bin/zsh
# Run by the LaunchAgent (setup.sh): at login, when Firefox.app changes and
# every 6 hours. Log: ~/Library/Logs/arcfox-autoupdate.log
#  - After a Firefox update took the script out of the app: reinstalls it
#    (install.sh, in Terminal: macOS lets only apps with App Management write
#    into Firefox.app) and asks for a restart. Edits to the repo alone never
#    trigger a reinstall: run install.sh yourself when they're ready.
#  - Once a day: betterfox/update.sh fetches Betterfox; if it changed (and is
#    only prefs and comments), betterfox/user.js is updated (left
#    uncommitted, see git diff) and Betterfox's defaults reinstalled.
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

# --- Betterfox, once a day (betterfox/update.sh fetches and checks it)
if [[ -z $(find "$STATE/betterfox-checked" -mtime -1 2>/dev/null) ]]; then
  out=$("$REPO/betterfox/update.sh")
  case $? in
    0) touch "$STATE/betterfox-checked"
       log "Betterfox $out: installing"
       open -a Terminal "$REPO/autoupdate/install-betterfox.command"
       notify "Betterfox $out. Restart Firefox to use it." ;;
    2) touch "$STATE/betterfox-checked"
       log "Betterfox update $out"
       notify "A Betterfox update looked unusual and wasn't installed: see ~/Library/Logs/arcfox-autoupdate.log" ;;
    3) touch "$STATE/betterfox-checked" ;;
    *) log "Betterfox check failed: $out" ;;
  esac
fi
