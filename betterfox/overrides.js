// arcfox's additions to Betterfox, installed with it by arc-shortcut/install.sh
// (as Firefox's defaults: what you set in about:config still wins)

// Native vertical tabs, which the Arc sidebar is built on (Firefox's default
// is horizontal tabs)
user_pref("sidebar.revamp", true);
user_pref("sidebar.verticalTabs", true);
// Logins are saved by Apple's iCloud Passwords add-on, not Firefox
user_pref("signon.rememberSignons", false);
