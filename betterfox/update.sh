#!/bin/zsh
# Fetches the latest Betterfox (GitHub, main) into betterfox/user.js, if it
# changed and holds only prefs and comments (nothing that could load code).
# Then install it with: arc-shortcut/install.sh betterfox (autoupdate/check.sh
# runs this once a day and does that by itself).
# Exit: 0 updated, 1 couldn't fetch, 2 refused (prints the odd lines), 3 unchanged.
HERE="${0:A:h}"
NEW=$(mktemp)
trap 'rm -f "$NEW"' EXIT
if ! curl -fsSL --max-time 30 https://raw.githubusercontent.com/yokoffing/Betterfox/main/user.js | tr -d '\r' > "$NEW" || [[ ! -s "$NEW" ]]; then
  echo "couldn't fetch Betterfox (offline?)"
  exit 1
fi
if cmp -s "$NEW" "$HERE/user.js"; then
  echo "unchanged ($(grep -m1 -o 'version: [0-9.]*' "$NEW"))"
  exit 3
fi
BAD=$(grep -v -E '^\s*$|^\s*(//|/\*|\*)|^user_pref\("[A-Za-z0-9._-]+", .*\);\s*(//.*)?$' "$NEW" | head -3)
if [[ -n "$BAD" ]] || grep -q -E 'general\.config|autoadmin' "$NEW"; then
  echo "refused, unexpected lines: $BAD"
  exit 2
fi
cp "$NEW" "$HERE/user.js"
echo "updated to $(grep -m1 -o 'version: [0-9.]*' "$NEW") (review: git diff betterfox/)"
