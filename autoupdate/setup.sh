#!/bin/zsh
# Turns the automatic updates on (a LaunchAgent running check.sh), or off:
#   autoupdate/setup.sh             on
#   autoupdate/setup.sh uninstall   off
set -e
HERE="${0:A:h}"
LABEL=io.github.giacomopiergentili.arcfox.autoupdate
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
if [[ "$1" == "uninstall" ]]; then
  rm -f "$PLIST"
  echo "Automatic updates off."
  exit 0
fi
mkdir -p "${PLIST:h}"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/zsh</string><string>$HERE/check.sh</string></array>
  <key>WatchPaths</key><array><string>/Applications/Firefox.app/Contents/Info.plist</string></array>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>21600</integer>
  <key>ProcessType</key><string>Background</string>
</dict>
</plist>
PL
launchctl bootstrap "gui/$UID" "$PLIST"
echo "Automatic updates on (log: ~/Library/Logs/arcfox-autoupdate.log)."
