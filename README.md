# arcfox

An Arc-style sidebar for [Firefox](https://www.mozilla.org/firefox/) on macOS, designed to feel as if Apple had made it.

Firefox's own vertical tabs become an Arc sidebar: the toolbar and URL bar live at the top of the sidebar, favorite **tiles** and **pinned rows** (with **folders**) sit above a divider, and normal tabs below it. Cmd+T opens a Spotlight-style command bar instead of a blank tab. Everything follows one spacing rhythm, one set of corner radii, fills and shadows, and the system accent color.

![The sidebar in dark mode: tiles with the selected one in its icon's colors, pinned rows, a folder, the divider and normal tabs](docs/screenshots/sidebar-dark.png)

| Light mode | Cmd+T command bar | Auto-hide sidebar |
|---|---|---|
| ![The sidebar in light mode](docs/screenshots/sidebar-light.png) | ![The floating command bar with suggestions: a search, and an open tab to switch to](docs/screenshots/command-bar.png) | ![The auto-hide sidebar floating over a page](docs/screenshots/auto-hide.png) |

It's two pieces, plus a privacy baseline:

- **`userChrome.css`**: the whole look (layout, sizes, colors, motion).
- **`arc-shortcut/src/`**: the behavior (tiles, pinned rows and folders, the command bar, closing rules, drag and drop, Peek, ...), one file per feature, run by Firefox as an *autoconfig* script.
- **[Betterfox](https://github.com/yokoffing/Betterfox)**: a lean, private set of Firefox settings, installed with the script for every profile.

Tested on **Firefox 158** with Betterfox, on macOS, in dark and light mode.

> **Why Firefox.** arcfox started as [librewolf-arc](https://github.com/GiacomoPiergentili/librewolf-arc) on LibreWolf (its full history is here). It moved to Mozilla's own Firefox because Apple's iCloud Passwords and Mac passkeys only work in browsers Apple has approved, and LibreWolf isn't one. Betterfox brings back most of what LibreWolf changed.

## Features

### Layout
- Toolbar and URL bar on top of the sidebar; the page is a floating card with an 8px gutter on every side.
- Window buttons, then a **sidebar button** (show / auto-hide, same as Cmd+S); back, forward and reload at the right.
- Bottom row: Downloads at the left, the profile switcher in the middle, Extensions at the right. No ☰ menu and no "Customize sidebar" gear: everything in them is in the macOS menu bar. Extensions live in the Extensions menu, not on the toolbar (iCloud Passwords too).
- **The divider** sits between what's pinned and the normal tabs, centered in its gap: 8px under the last row or tile, 9px above + New Tab. With nothing pinned there's nothing to divide, so there's no line, and + New Tab sits where the tiles would start.
- **Auto-hide mode**: the sidebar slides in over the page when the pointer reaches the window's left edge (Apple-style curves); the URL bar then floats in the middle of the window, Spotlight-style. Its color is measured from the pinned sidebar, so it matches with any theme or wallpaper.
- Fullscreen: the sidebar and toolbar keep working when the macOS menu bar slides in; videos fill the screen.
- Start-up: everything appears at once, in one short fade (the toolbar buttons, tiles, rows, folders, their icons, the profiles and the command bar), half a second at most.

### Tiles, pinned rows and folders (Arc's favorites and pinned tabs)
- **Tiles** (Cmd+Shift+D): Firefox's pinned tabs as a grid of icon tiles, in both sidebar modes. They come back unloaded at launch and load when opened.
- **Pinned rows** (Cmd+D): tabs kept above the divider; saved, and reopened unloaded at every launch.
- **Folders**: Firefox's tab groups, kept with the pinned rows and styled like Arc's. A collapsed folder still shows its loaded tabs (no "+N"); opening or closing one slides its rows, and the folder icon opens and shuts with them.
- **Pinned page**: each row and tile remembers the page it was pinned on. A dot shows when it's somewhere else; clicking the dot (or Cmd+W, or the right-click menu) goes back.
- **Tile colors** (as in Zen): the selected tile takes its icon's colors, as a soft gradient with a hairline in the main color.
- **Every window shows the same tiles, rows and folders**, kept in sync. Private windows keep to themselves.
- **Popup windows stay plain**: an add-on's or a page's popup (iCloud Passwords' code window, a sign-in window) is an ordinary Firefox window, without the sidebar or the page card, and it closes as soon as its page does.
- **Launch opens one window**: the one you used last, with its tiles and rows back on their pinned pages. Any other windows of the last session wait in History → Recently Closed Windows (or, as Firefox starts by default, History → Restore Previous Session). `arc.restoreOneWindow` = `false` in `about:config` brings them all back instead. Firefox itself opens the profile you used last.

### Drag and drop (as in Arc)
- Between tiles, rows, folders and normal tabs, with live cues: a tab dropped on the tiles becomes a tile right where it's dropped (the tiles slide aside, the grid grows a line if needed); a tab dropped above the divider becomes a pinned row, below it a normal tab; whatever moves when a drop lands glides there.
- **The first tile**: with no tiles yet, dragging a tab to the top opens an empty tile slot in their place; the tab takes a tile's shape over it, and dropping there, or just above it, makes the first tile.
- A tab dropped on the page goes back where it was, or opens in split view (see below), instead of tearing off into a new window; only a drop outside the window does that, as in Arc and Safari. Drags may wander anywhere and come back.
- No tab preview cards during drags.

### New tab = command bar
- Cmd+T and + New Tab open the floating URL bar instead of creating a tab; the tab is created only when Enter loads something (picking an open tab switches to it). Esc, clicking away or pressing again closes it.
- Launch and new windows start with that bar over an empty page instead of a blank tab.
- No stray blank tabs: double-clicking empty sidebar space does nothing; Cmd+W on the only tab leaves the empty page, and Cmd+W on the empty page closes the window, as in other Mac apps.

### Split view (as in Arc)
- Drag a tab onto the page: the left or right half lights up, and dropping there opens it side by side with the page you were on (Firefox's own split view underneath). Firefox's right-click "Add Split View" works too.
- The two pages are two cards 8px apart; the active one has a thin accent ring. In the sidebar the pair is one row, like a macOS segmented control.
- Pinned rows can be split: the pair sits in the row's spot. Cmd+W on a row in a split resets the row and keeps the other page open.
- Tiles stay out: Firefox can't put pinned tabs in a split view.

### Peek (as in Arc)
- A link to another site clicked in a tile or a pinned row opens in a card floating over the pinned page, instead of replacing it. **Option+click** opens any link in Peek, from any tab (as in Zen).
- The card grows out of the link once its page has drawn, and shrinks back into it when closed. Its buttons: **Open as Tab**, **Open in Split View** (not from a tile) and **Close**; Esc, a click on the dimmed page, Cmd+W or switching tabs close it too.

### Closing
- Closing a row or tile resets it (back to its pinned page, unloaded) instead of closing it.
- After closing a row, a tile or the last normal tab you go to the most recently used open row, else the empty page with the command bar; never to an unloaded row that would start loading.

### Profiles (Arc's Spaces)
- Firefox profiles serve as Spaces: each has its own tiles, rows, folders, logins, history, extensions and theme.
- **Profile switcher** in the middle of the bottom row: the profiles' avatars (the current one in its colors, the others greyed out; hover for the name), as many as fit. Click one to bring its window forward, or start it. It shows once there are two profiles in Firefox's Profiles menu.
- A new profile made from the Profiles menu gets the look on its first run: its `chrome` folder is linked to this repo, and a bar offers to restart. Its first run also sets, once, what the layout relies on (no bookmarks toolbar, the empty start page); what you change afterwards stays.

### Auto-archive (as in Arc)
- Normal tabs left unused for 24 hours close by themselves, quietly; they're in History → Recently Closed Tabs (Cmd+Shift+T).
- Never touched: tiles, pinned rows and folders, the current tab, and tabs playing sound, in picture-in-picture, sharing the camera, mic or screen, or still loading.
- Change the time in `about:config` → `arc.archiveAfterHours` (hours; `0` turns it off).

### Motion and polish
- A tab's row slides open and shut; pinning and unpinning glide everything to its new place; closing a pinned row or tile settles it back in place; a selected tile's colors fade; the command bar pops in and fades out where it is. All of it off with the system's Reduce Motion (fades stay).
- macOS sidebar typography (13px) on 32px rows with 4px gaps; 40px tiles 8px apart; every icon and title on shared columns; menus as macOS menus, dialog-like panels as popovers.
- **Apple's guidelines**: every command is in the menu bar with its shortcut; Increase Contrast strengthens lines, fills and secondary text; every click target is at least 20×20; the custom buttons have VoiceOver names.
- One set of design tokens at the top of `userChrome.css` (`--arc-*`): spacing, radii, fills, shadows, motion. Changing a size there updates every spacing derived from it.

## Keyboard

| Shortcut | Does |
|---|---|
| Cmd+S | Show / auto-hide the sidebar (was Save Page) |
| Cmd+T | Open the command bar (a new tab once you press Enter) |
| Cmd+D | Make the current tab a pinned row, or a normal tab again (was Bookmark Page) |
| Cmd+Shift+D | Make the current tab a tile, or not (was Bookmark All Tabs) |
| Cmd+W | On a row or tile: reset it to its pinned page. On a normal tab: close it. On the empty page: close the window |
| Cmd+Shift+C | Copy the page's address ("Link Copied"); was the developer tools' element picker (Cmd+Option+C still opens them) |
| Cmd+1…9 | Go to the tiles in order, then on to the pinned rows |
| Option+click a link | Open it in Peek |
| Esc | Close the command bar, or a Peek |

The same commands are in the menu bar: Window → Pin as Row / Pin as Tile, View → Always Show / Auto-Hide Sidebar, Edit → Copy Link.

## Install

1. **Clone the repo** anywhere (the commands below use `~/Developer/arcfox`):
   ```bash
   git clone https://github.com/GiacomoPiergentili/arcfox.git ~/Developer/arcfox
   ```
2. **Let Terminal write into Firefox.app**: System Settings → Privacy & Security → App Management → turn on Terminal. (macOS asks for this for any change inside an app.)
3. **Install** (Firefox can stay open), in Terminal:
   ```bash
   ~/Developer/arcfox/arc-shortcut/install.sh
   ```
4. **Quit Firefox (Cmd+Q) and reopen it.** On a profile's first start with the script, its `chrome` folder is linked to the repo and a bar offers to restart once more; after that restart you have the sidebar. (You can also link it yourself: `ln -s ~/Developer/arcfox "<profile folder>/chrome"`, with the profile folder from `about:support`.)

The installer puts three files into `Firefox.app/Contents/Resources` (Firefox runs no script of this kind by default):
- `firefox.cfg`: the script, the files of `arc-shortcut/src/` joined in order, between `>>> ARC SIDEBAR SHORTCUT >>>` markers;
- `defaults/pref/arc-shortcut-prefs.js`: tells Firefox to run `firefox.cfg` at startup, outside its sandbox (the script needs the browser windows);
- `defaults/pref/betterfox.js`: Betterfox and arcfox's `betterfox/overrides.js` (vertical tabs on; Firefox's own password saving off, since iCloud Passwords saves logins) as Firefox's **default** settings. Every profile gets them, new or old, with nothing to copy; and unlike a `user.js`, a setting you change in `about:config` keeps your value.

Running it again replaces all three. For passwords and passkeys, install Apple's **iCloud Passwords** add-on from Firefox's add-ons site; it then sits in the Extensions menu.

## Keeping it working

**Firefox updates replace the app**, and with it the installed files: the look stays (it's in your profile), the behavior goes until you run `install.sh` again. A notice at the bottom of the sidebar says when the script isn't running, and vertical tabs stay on meanwhile (the script also keeps them in each profile's `user.js`).

**Automatic updates** (optional) take care of that:
```bash
~/Developer/arcfox/autoupdate/setup.sh            # on
~/Developer/arcfox/autoupdate/setup.sh uninstall  # off
```
A background job (a LaunchAgent) runs `autoupdate/check.sh` at login, whenever Firefox.app changes, and every 6 hours:
- **After a Firefox update** removed the script, it runs `install.sh` in Terminal, and a notification asks you to restart Firefox. Editing the repo never triggers an install: run `install.sh` yourself when your changes are ready.
- **Once a day** `betterfox/update.sh` fetches Betterfox. If it changed and holds only settings and comments, `betterfox/user.js` is updated (left uncommitted: `git diff betterfox/` shows what changed) and only Betterfox's defaults are reinstalled (`install.sh betterfox`). Anything else is refused and logged.

Its log is `~/Library/Logs/arcfox-autoupdate.log`.

**Something not right?** Run the doctor:
```bash
~/Developer/arcfox/doctor.sh
```
It checks every piece and says how to fix what isn't right: the installed files against the repo, whether Firefox needs a restart, each profile's `chrome` link and `user.js`, the automatic updates, and whether iCloud Passwords' helper runs for Firefox. It only reads. Profiles can be checked only from a Terminal with Full Disk Access, since macOS keeps other apps out of Firefox's folder; without it, the doctor says so and checks the rest.

**To remove it**: `~/Developer/arcfox/arc-shortcut/install.sh uninstall` (the three files), `autoupdate/setup.sh uninstall` (the background job), and delete the `chrome` link in your profile folder; then restart Firefox.

## What it does to your Mac

Worth knowing before you install:
- **It writes into Firefox.app**, which is signed by Mozilla. Firefox keeps working and updating normally; macOS's check that the app is unchanged (`codesign --verify`) no longer passes until an update replaces it.
- **The script runs with the browser's full access**, outside Firefox's autoconfig sandbox, in every window: that's how it can change tabs and the sidebar. It's this repo's code, readable in `arc-shortcut/src/`; nothing is downloaded at run time.
- **Betterfox's settings become Firefox's defaults** for every profile on the Mac, including profiles that don't use the sidebar.
- **With automatic updates on**, a background job runs as you, and Terminal opens by itself to reinstall after Firefox updates (which needs Terminal's App Management permission). Betterfox updates are installed without your review, limited to plain settings, and stay visible in `git diff`.
- **Each profile gets a `chrome` link** to the repo and two lines in its `user.js` (vertical tabs on).

`install.sh uninstall`, `autoupdate/setup.sh uninstall` and removing the `chrome` links undo all of it.

## How it works

| File | What it is |
|---|---|
| `userChrome.css` | All styling. Design tokens at the top; sections for the sidebar, tabs, tiles, rows and folders, the URL bar, menus and panels, auto-hide, motion, fullscreen. |
| `arc-shortcut/src/*.js` | The script, one file per feature: `01-start.js` opens the per-window set-up, `18-firefox-replacements-and-end.js` lists every replacement of Firefox's own code and closes it. Each feature sets itself up on its own, so one broken by a Firefox update leaves the rest working, and the browser console names it ("Arc sidebar (…): not set up"). |
| `arc-shortcut/install.sh` | Installs, updates or removes the files in Firefox.app (`install.sh betterfox`: Betterfox's defaults only). |
| `arc-shortcut/arc-shortcut-prefs.js` | Has Firefox run `firefox.cfg` at startup, outside its sandbox. |
| `betterfox/` | Betterfox's `user.js` (unchanged), arcfox's `overrides.js`, and `update.sh`, which fetches and checks a new Betterfox. |
| `autoupdate/` | The optional automatic updates: `check.sh` (what the background job runs), `setup.sh` (on / off), `install-betterfox.command` (opened in Terminal). |
| `doctor.sh` | Checks the whole setup (reads only). |
| `tests/` | `run_tests.py` and `drag_tests.py`, see below. |

The script keeps its state in prefs and session data: tiles in `arc.tiles`, pinned rows and folders in `arc.pinnedRows` (the shared list every window follows; each item has an id, `arc-id` on its tabs), the auto-archive time in `arc.archiveAfterHours`, the measured sidebar colors in `arc.sidebarColor.dark` / `.light`, one window at launch in `arc.restoreOneWindow`, and each tab's pinned page in the session value `arc-pinned-page`. The CSS reacts to attributes the script sets (`[arc-pinned-row]`, `[arc-away]`, `[arc-newtab-bar]`, `[arc-start-page]`, `[arc-tile-colored]`, ...).

Some of Firefox's interface lives in shadow DOM that `userChrome.css` can't reach (`::part()` doesn't apply from it); there the script adds small style blocks itself (the sidebar's bottom buttons, the tile grid).

## Tests

```bash
python3 tests/run_tests.py
```
Launches Firefox with a throwaway test profile using this repo (your own profiles are never touched), drives it through Marionette, Firefox's remote control, and checks: layout and spacing, tile colors, the command bar, shortcuts, closing rules, split view, Peek, the profile switcher, folders, motion, the Apple guidelines checks, auto-hide, the sidebar color, the toolbar's order, the first tile, tab previews during drags, rows and folders across a restart, auto-archive, several windows. Then a brand-new profile without the look, as made from the Profiles menu (its first run and restart), and the empty states in it (nothing pinned, only tiles, only rows); and a restart the way Firefox does it for you, with two windows (one comes back, the one used last, its tiles on their pinned page). Every launch ends with a check that the script logged no errors. About 5 minutes; `--keep` keeps the test profiles, `--user-js <file>` runs on top of a `user.js`. Needs the script installed; Python 3's standard library only.

```bash
python3 tests/drag_tests.py
```
Real drag and drop and real clicks, which simulated events miss. The real mouse moves in a test window, through `~/.arc-drag/drag` (a small tool outside the repo that refuses unless the test window is in front and on top at every point), so keep your hands off the mouse for about 4 minutes. Ten drags: a tab into the tiles at a spot, tiles reordered, a tile into the rows and down to the normal tabs, a tab into the rows and a row down to the normal tabs, a tab into a folder, a detour over the page and back, a drop on the page making a split view, and the first tile with no tiles yet. Three Peeks, from a link on a page served by a small local web server: from a tile (closed by a click on the dimmed page), Option+click in a normal tab (then Open as Tab), from a pinned row (then Open in Split View). After each, it checks where everything landed, and that no window was torn off, no drag state or offset is left behind, the script logged no errors, and the saved tiles and rows match the sidebar. `--only <text>` runs some cases, `--record <dir>` films each drag (the test window only).

Run both after changes and after Firefox updates.

## History

Built over October 20–23, 2026: first on LibreWolf (1–28), then on Firefox (29–37).

1. **Arc layout**: toolbar and URL bar moved into the sidebar, floating page card, Apple-style colors, shadows, radii and motion; auto-hide sidebar with a Spotlight-style floating URL bar; fullscreen support.
2. **Tiles, pinned rows and folders**: Cmd+D / Cmd+Shift+D, saved and restored rows and folders, Arc-style drag and drop, pinned pages with the away dot and reset-on-close.
3. **Buttons**: sidebar button, back/forward/reload top right, Downloads and Extensions in the bottom row, ☰ and the sidebar gear removed, one icon-button style everywhere.
4. **Command bar for new tabs**: Cmd+T / + New Tab; launch and new windows open the bar instead of a blank tab.
5. **Closing rules**: rows and tiles reset instead of closing; never landing on (and loading) an unloaded row.
6. **Tile colors** (Zen-style), tile hover, icons kept while loading, quiet sound badges.
7. **Spacing audit**: everything on whole pixels and one rhythm; a roomier density (32px rows, 40px tiles) with every spacing derived from two gap tokens.
8. **Full audit**: dead code and stale comments removed, dialog panels restyled as popovers; fixed folders lost at every launch, a 2px drag offset, a black tile after Cmd+W, tiles turning into rows in auto-hide mode.
9. **Update safety and shortcuts**: a sidebar notice when the script isn't running; Cmd+Shift+C copies the address; Cmd+1…9 go to the tiles, then the rows.
10. **Auto-archive**: normal tabs unused for 24 hours close by themselves.
11. **Light mode pass**: the auto-hide sidebar matches in light mode too; + New Tab in the rows' text color.
12. **Screenshots and license**: README screenshots; MIT license.
13. **Auto-hide sidebar color**: measured from the pinned sidebar on theme, appearance and wallpaper changes.
14. **Video fullscreen, accessibility, tests**: videos fill the screen; VoiceOver names; a regression test suite, which right away caught fresh installs fitting only 2 tiles per row.
15. **Multiple windows**: every window shows the same tiles, rows and folders, kept in sync.
16. **Split view by drag and drop**: drop a tab on either half of the page.
17. **Split view, every way in**: all 27 ways a split can start tested; pinned rows can be split; the "choose a tab" picker and restored splits work; tabs can come from another window.
18. **Drag and drop, checked with real mouse drags** (recorded frame by frame): tiles dropped where they're dropped, the tiles making room, no stray slots or jumps, split pairs into the rows, no preview cards mid-drag.
19. **Drag torture test** (random circles in and out of the sidebar, detours over the page): drags that leave the sidebar and come back, no tearing off on a drop over the page, tiles dropped into folders.
20. **Peek**: links to other sites from tiles and pinned rows open in a floating card.
21. **Start-up**: tiles come back unloaded and the tab list fades in complete, instead of a stray "New Tab" row, blank tiles and late icons.
22. **Profile switcher**: profiles as Arc's Spaces, from the bottom of the sidebar; new profiles get the look on their first run.
23. **Folders open and close**: loaded tabs stay in view in a collapsed folder; rows slide, and the folder icon opens and shuts.
24. **Motion**: tabs slide open and shut; pinning glides; a reset settles back in place.
25. **More motion**: tile colors fade, the away dot pops in, split views and other windows glide.
26. **Apple guidelines review**: commands in the menu bar, Increase Contrast, Reduce Motion everywhere, 20px minimum click targets.
27. **Refactor**: features set up independently, every replacement of the browser's code in one checked list, shared motion helpers, one file per feature.
28. **Start-up in one go**: toolbar, sidebar, icons, avatars and command bar appear in one fade, once everything's ready.
29. **From LibreWolf to Firefox**: the repo moved to arcfox on Firefox 158, for Apple's iCloud Passwords and passkeys. A Firefox installer; Downloads kept visible; a new profile gets back, forward, reload and Downloads on its toolbar (Firefox 158 leaves reload and Downloads out with vertical tabs); the tests run on Firefox.
30. **Betterfox and automatic updates**: Betterfox installed as Firefox's defaults for every profile; vertical tabs kept on in each profile's `user.js`; an optional background job that reinstalls after Firefox updates and pulls in Betterfox's.
31. **Fixes**: back, forward and reload kept in that order (a saved toolbar could reverse them); the first tile by drag and drop, with no tiles yet (Firefox's drop zone opened late, under the dragged tab, and a release above it was lost); the divider centered in every state, and gone when nothing is pinned.
32. **Tests for the edges, a doctor, real drags**: a brand-new profile's first run and restart, the empty states; `doctor.sh`, which checks the whole setup; `tests/drag_tests.py`, ten real drag-and-drop cases.
33. **Audit after the move**: "no tab previews while dragging" had never actually been applied (now tested, and every launch checks for any uncaught script error); LibreWolf leftovers, an old data conversion, fallbacks for older Firefox versions and dead CSS removed; new screenshots.
34. **Peek with the real mouse**: three real-click cases in the drag tests; a loop that kept forcing the page under a loading Peek to draw is gone (filmed with and without it: no difference). A dragged tile no longer shrinks to a tab's height (Firefox lifts it out of the grid that sized it); the drag test now measures it mid-drag.
35. **Tiles back on their pinned page after a restart, with several windows**: with two windows open, a tile left on another page (a YouTube video) stayed there after a restart, as if that were its pinned page. Firefox reported the windows restored before the second one's tabs were filled in; each window now also checks once its own tabs are back. A new test phase restarts the way you do, with two windows.
36. **One window at launch**: the one used last, the others kept in Recently Closed Windows (`arc.restoreOneWindow`); checked in both of Firefox's start modes.
37. **Popup windows**: iCloud Passwords' code window got the whole sidebar and never closed (the closing rules kept it open on the empty page when its page closed itself). Popups are now left alone by the script and the CSS; and Cmd+W on the empty page closes the window.

Plans, things to watch and known limitations: see [TODO.md](TODO.md).

## License

[MIT](LICENSE): free to use, change and share, with the copyright notice kept.
