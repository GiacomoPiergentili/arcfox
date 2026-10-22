#!/bin/zsh
# Refreshes betterfox/user.js from Betterfox's GitHub (main). Review the diff
# (git diff betterfox/user.js), then rerun arc-shortcut/install.sh.
set -e
HERE="${0:A:h}"
curl -fsSL https://raw.githubusercontent.com/yokoffing/Betterfox/main/user.js | tr -d '\r' > "$HERE/user.js"
grep -m1 "version:" "$HERE/user.js"
