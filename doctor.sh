#!/bin/zsh
# Checks that every piece of the arcfox setup is in place, and says how to fix
# what isn't. Reads only, changes nothing.
#   ./doctor.sh
# Exit code 1 when something needs fixing (warnings alone don't count).
REPO="${0:A:h}"
APP=/Applications/Firefox.app
RES="$APP/Contents/Resources"
FF="$HOME/Library/Application Support/Firefox"
LABEL=io.github.giacomopiergentili.arcfox.autoupdate
LOG="$HOME/Library/Logs/arcfox-autoupdate.log"
errors=0
ok()   { print -r -- "  ✓ $1"; }
warn() { print -r -- "  ! $1"; [[ -n "$2" ]] && print -r -- "      → $2"; }
bad()  { print -r -- "  ✗ $1"; [[ -n "$2" ]] && print -r -- "      → $2"; errors=$((errors + 1)); }
section() { print -r -- ""; print -r -- "$1"; }

section "Firefox"
if [[ ! -d "$APP" ]]; then
  bad "Firefox isn't in /Applications" "install Firefox, then run arc-shortcut/install.sh"
  exit 1
fi
version=$(defaults read "$APP/Contents/Info.plist" CFBundleShortVersionString 2>/dev/null)
ok "Firefox $version"

section "Installed into Firefox.app (arc-shortcut/install.sh)"
INSTALL="run $REPO/arc-shortcut/install.sh (in Terminal, which needs App Management)"
if [[ ! -f "$RES/firefox.cfg" ]] || ! grep -q ">>> ARC SIDEBAR SHORTCUT >>>" "$RES/firefox.cfg"; then
  bad "the script isn't installed (a Firefox update removes it)" "$INSTALL"
else
  if ! head -1 "$RES/firefox.cfg" | grep -q '^//'; then
    bad "firefox.cfg doesn't start with a comment line (Firefox skips the first line)" "$INSTALL"
  fi
  if sed -n '/>>> ARC SIDEBAR SHORTCUT >>>/,/<<< ARC SIDEBAR SHORTCUT <<</p' "$RES/firefox.cfg" |
     cmp -s - <(cat "$REPO"/arc-shortcut/src/*.js | sed "s|__ARC_CHROME_DIR__|$REPO|"); then
    ok "the script, identical to the repo's"
  else
    warn "the installed script differs from the repo's (changes not installed yet, or installed from elsewhere)" "$INSTALL"
  fi
fi
if cmp -s "$REPO/arc-shortcut/arc-shortcut-prefs.js" "$RES/defaults/pref/arc-shortcut-prefs.js"; then
  ok "its pref file (loads firefox.cfg, no sandbox)"
else
  bad "its pref file is missing or different" "$INSTALL"
fi
other=$(grep -l "general.config.filename" /dev/null "$RES"/defaults/pref/*.js(N) 2>/dev/null | grep -v "/arc-shortcut-prefs.js$")
[[ -n "$other" ]] && bad "another autoconfig file is installed: $other" "remove it, then $INSTALL"
if cat "$REPO/betterfox/user.js" "$REPO/betterfox/overrides.js" | sed 's/^user_pref(/pref(/' | cmp -s - "$RES/defaults/pref/betterfox.js"; then
  ok "Betterfox's defaults ($(grep -m1 -o 'version: [0-9.]*' "$REPO/betterfox/user.js")), identical to the repo's"
elif [[ -f "$RES/defaults/pref/betterfox.js" ]]; then
  warn "Betterfox's installed defaults differ from the repo's" "$INSTALL"
else
  bad "Betterfox's defaults aren't installed" "$INSTALL"
fi
# (your Firefox, not a test browser: those run throwaway arcfox-* profiles)
pid=""
for p in $(pgrep -f "$APP/Contents/MacOS/firefox$|$APP/Contents/MacOS/firefox "); do
  ps -o command= -p $p | grep -q -- "-profile .*arcfox-" || { pid=$p; break; }
done
if [[ -n "$pid" ]]; then
  started=$(date -j -f "%a %b %d %T %Y" "$(ps -o lstart= -p $pid)" +%s 2>/dev/null)
  installed=$(stat -f %m "$RES/firefox.cfg" 2>/dev/null || echo 0)
  if [[ -n "$started" && "$installed" -gt "$started" ]]; then
    warn "Firefox was started before the last install" "quit Firefox (Cmd+Q) and reopen it"
  else
    ok "Firefox is running the installed version"
  fi
fi

section "Profiles"
if ! ls "$FF" >/dev/null 2>&1; then
  warn "can't look inside Firefox's folder (macOS keeps other apps out of it)" "to check profiles too, run this from Terminal with Full Disk Access"
else
  default=$(awk -F= '/^\[Install/{s=1} s&&/^Default=/{print $2; exit}' "$FF/profiles.ini")
  for rel in $(awk -F= '/^Path=/{print $2}' "$FF/profiles.ini"); do
    dir="$FF/$rel"
    [[ "${rel:0:1}" == "/" ]] && dir="$rel"
    name=$(awk -v p="Path=$rel" -F= '/^\[/{n=""} /^Name=/{n=$2} $0==p{print n; exit}' "$FF/profiles.ini")
    label="$name${rel:+ ($rel)}$([[ "$rel" == "$default" ]] && echo ", default")"
    link="$dir/chrome"
    if [[ -L "$link" && "${link:A}" == "$REPO" ]]; then
      ok "$label: chrome linked to the repo"
    elif [[ -e "$dir/chrome/userChrome.css" ]]; then
      warn "$label: has a chrome folder of its own, not this repo" "replace it with a link: ln -s $REPO \"$dir/chrome\" (after moving it away)"
    else
      warn "$label: no look yet" "it gets linked on its next start (or: ln -s $REPO \"$dir/chrome\")"
    fi
    if [[ -f "$dir/user.js" ]] && grep -q 'user_pref("sidebar.verticalTabs", true);' "$dir/user.js"; then
      ok "$label: user.js keeps vertical tabs on"
    else
      warn "$label: user.js doesn't keep vertical tabs on yet" "added on its next start"
    fi
  done
fi

section "Automatic updates (autoupdate/setup.sh)"
if launchctl print "gui/$UID/$LABEL" >/dev/null 2>&1; then
  plist="$HOME/Library/LaunchAgents/$LABEL.plist"
  if grep -q "$REPO/autoupdate/check.sh" "$plist" 2>/dev/null; then
    ok "on, running this repo's check.sh"
  else
    bad "on, but running a check.sh from another folder" "run $REPO/autoupdate/setup.sh"
  fi
  code=$(launchctl print "gui/$UID/$LABEL" | awk '/last exit code/ && !/never/{print $NF; exit}')
  [[ -n "$code" && "$code" != "0" ]] && warn "its last run ended with code $code" "see $LOG"
  if [[ -f "$LOG" ]]; then
    recent=$(grep -E "failed|refused" "$LOG" | tail -1)
    [[ -n "$recent" ]] && warn "last problem in its log: ${recent}" "see $LOG"
    print -r -- "      last entry: $(tail -1 "$LOG")"
  fi
else
  warn "off: reinstall by hand after Firefox updates" "turn on with $REPO/autoupdate/setup.sh"
fi

section "iCloud Passwords"
if [[ -f "/Library/Application Support/Mozilla/NativeMessagingHosts/com.apple.passwordmanager.json" ]]; then
  ok "Apple's helper is registered for Firefox"
else
  warn "Apple's helper isn't registered for Firefox" "it comes with macOS; check System Settings → Passwords"
fi
# (Zen and other Firefox-based browsers start the same helper: only Firefox's counts)
connected=""
for helper in $(pgrep -f PasswordManagerBrowserExtensionHelper); do
  [[ "$(ps -o ppid= -p $helper | tr -d ' ')" == "$pid" ]] && connected=1
done
if [[ -z "$pid" ]]; then
  print -r -- "      (Firefox isn't running: whether iCloud Passwords connects is checked while it is)"
elif [[ -n "$connected" ]]; then
  ok "Apple's helper is running for Firefox (iCloud Passwords connected)"
else
  warn "Apple's helper isn't running for Firefox" "in Firefox, open the Extensions menu (bottom right of the sidebar) and click iCloud Passwords to connect"
fi
# (the log doesn't say which app the helper was refused for: only recent ones)
if /usr/bin/log show --last 30m --predicate 'eventMessage CONTAINS "Launch Constraint Violation" AND eventMessage CONTAINS "PasswordManager"' 2>/dev/null | grep -q "AMFI"; then
  warn "macOS refused to start Apple's password helper in the last 30 minutes (for Firefox, or another browser)" \
    "see: /usr/bin/log show --last 30m --predicate 'eventMessage CONTAINS \"Launch Constraint Violation\"'"
fi

section "Repo"
changes=$(git -C "$REPO" status --short 2>/dev/null)
if [[ -z "$changes" ]]; then
  ok "no uncommitted changes"
else
  warn "uncommitted changes:$(print -r -- "$changes" | sed 's/^/ /' | tr '\n' ',' | sed 's/,$//')" \
    "$(print -r -- "$changes" | grep -q betterfox/user.js && echo "betterfox/user.js: an automatic Betterfox update; review with git diff betterfox/")"
fi

print -r -- ""
if (( errors )); then
  print -r -- "$errors problem(s) to fix."
  exit 1
fi
print -r -- "Everything's in place."
