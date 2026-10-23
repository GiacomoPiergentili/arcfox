# Betterfox

`user.js` is [Betterfox](https://github.com/yokoffing/Betterfox) by yokoffing (MIT license), unchanged
apart from line endings; `overrides.js` is arcfox's additions. `arc-shortcut/install.sh` installs both
into Firefox.app as default prefs (`defaults/pref/betterfox.js`), so every profile gets them; a pref
you change in `about:config` keeps your value. `update.sh` fetches the latest Betterfox (only if it holds nothing but prefs and comments); install it with `arc-shortcut/install.sh betterfox`. With automatic updates on (`autoupdate/setup.sh`), that happens once a day by itself, and the new `user.js` is left uncommitted: `git diff betterfox/` shows what changed.
