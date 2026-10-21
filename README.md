# librewolf-arc

An Arc-style sidebar for [LibreWolf](https://librewolf.net) on macOS, designed to feel as if Apple had made it.

LibreWolf's native vertical tabs become an Arc sidebar: the toolbar and URL bar live at the top of the sidebar, favorite **tiles** and **pinned rows** (with **folders**) sit above a divider, and normal tabs below it. Cmd+T opens a Spotlight-style command bar instead of a blank tab. Everything follows one spacing rhythm, one set of corner radii, fills and shadows, and the system accent color.

It's two pieces:

- **`userChrome.css`**: the whole look (layout, sizes, colors, motion).
- **`arc-shortcut/shortcut.cfg.js`**: the behavior (pinned rows and folders, the command bar, closing rules, tile colors, ...). It runs as a LibreWolf *autoconfig* script, installed into the app by `arc-shortcut/install.sh`.

Built and tested on **LibreWolf 158** (macOS, dark mode).

## Features

### Layout
- Toolbar and URL bar on top of the sidebar; the page is a floating card with an 8px gutter on every side.
- Window buttons, then a **sidebar button** (show / auto-hide, same as Cmd+S); back, forward, reload at the right.
- Bottom row: Bookmarks, History, Downloads, Extensions. No ☰ menu (everything in it is in the macOS menu bar) and no "Customize sidebar" gear.
- **Auto-hide mode**: the sidebar slides in over the page when the pointer reaches the window's left edge (Apple-style curves); the URL bar then floats in the middle of the window, Spotlight-style.
- Fullscreen: the sidebar and toolbar keep working when the macOS menu bar slides in.

### Tiles, pinned rows and folders (Arc's favorites and pinned tabs)
- **Tiles** (Cmd+Shift+D): LibreWolf's pinned tabs, shown as a grid of icon tiles, in both sidebar modes.
- **Pinned rows** (Cmd+D): normal tabs kept above the divider; saved and reopened (unloaded) at every launch.
- **Folders**: LibreWolf's tab groups, kept in the pinned block, styled like Arc's.
- Arc-style drag and drop between tiles, rows, folders and normal tabs, with live cues.
- **Pinned page**: each row and tile remembers the page it was pinned on. A dot shows when it's somewhere else; clicking the dot (or Cmd+W, or the right-click menu) goes back. One-time bot-check addresses (Reddit, Cloudflare) are ignored.
- **Tile colors** (as in Zen): the selected tile takes its icon's colors, as a soft gradient with a hairline in the main color.
- Tiles keep their icon while loading, show sound badges as a quiet corner icon, and have no close button.

### New tab = command bar
- Cmd+T and + New Tab open the floating URL bar instead of creating a tab; the tab is created only when Enter loads something (picking an open tab switches to it). Esc, clicking away or pressing again closes it.
- Launch and new windows start with that bar over an empty page instead of a blank tab.
- No stray blank tabs: double-clicking empty sidebar space does nothing; Cmd+W on the empty page does nothing.

### Closing
- Closing a row or tile resets it (back to its pinned page, unloaded) instead of closing it.
- After closing a row, a tile or the last normal tab you go to the most recently used open row, else the empty page with the bar, never to an unloaded row that would start loading.

### Polish
- macOS sidebar typography (13px) on 32px rows with 4px gaps; 40px tiles 8px apart; every icon and title on shared columns.
- Menus as macOS menus; dialog-like panels (Translate, Edit Bookmark) as macOS popovers.
- One set of design tokens at the top of `userChrome.css` (`--arc-*`): spacing, radii, fills, shadows, motion. Changing a size there updates every derived spacing.

## Keyboard

| Shortcut | Does |
|---|---|
| Cmd+S | Show / auto-hide the sidebar (was Save Page) |
| Cmd+T | Open the command bar (a new tab once you press Enter) |
| Cmd+D | Make the current tab a pinned row, or a normal tab again (was Bookmark Page) |
| Cmd+Shift+D | Make the current tab a tile, or not (was Bookmark All Tabs) |
| Cmd+W | On a row or tile: reset it to its pinned page. On a normal tab: close it |
| Esc | Close the command bar |

## Install

1. In `about:config`, set:
   - `toolkit.legacyUserProfileCustomizations.stylesheets` = `true` (loads `userChrome.css`)
   - `sidebar.revamp` = `true` and `sidebar.verticalTabs` = `true` (native vertical tabs)
2. Put this repo's contents in your profile's `chrome` folder (`about:support` → Profile Folder → Open; create `chrome` if it's missing). Cloning straight into it works:
   ```bash
   git clone https://github.com/GiacomoPiergentili/librewolf-arc.git "<profile folder>/chrome"
   ```
3. Install the script into LibreWolf.app. macOS requires the **App Management** permission for this: give it to Terminal in System Settings → Privacy & Security → App Management, then in Terminal:
   ```bash
   "<profile folder>/chrome/arc-shortcut/install.sh"
   ```
4. Quit LibreWolf (Cmd+Q) and reopen it.

**After every LibreWolf update, run `install.sh` again**: updates replace the app, including the config file the script lives in (the CSS keeps working without it, the behavior doesn't).

To remove the script: `install.sh uninstall`, then restart. To remove the look: delete or rename `userChrome.css`.

## How it works

| File | What it is |
|---|---|
| `userChrome.css` | All styling. Design tokens at the top; sections for the sidebar, tabs, tiles, rows/folders, URL bar, menus and panels, auto-hide, motion, fullscreen. |
| `arc-shortcut/shortcut.cfg.js` | The script, appended to `LibreWolf.app/Contents/Resources/librewolf.cfg` by the installer. Runs once per browser window. |
| `arc-shortcut/install.sh` | Installs / updates / removes the script block in the app's `librewolf.cfg` and the pref file below. |
| `arc-shortcut/arc-shortcut-prefs.js` | Disables the autoconfig sandbox so the script can reach browser windows. |

The script keeps its state in prefs and session data: pinned rows and folders in the pref `arc.pinnedRows`, each tab's pinned page in the session value `arc-pinned-page`. The CSS reacts to attributes the script sets (`[arc-pinned-row]`, `[arc-away]`, `[arc-newtab-bar]`, `[arc-start-page]`, `[arc-tile-colored]`, ...).

Some of LibreWolf's UI lives in shadow DOM that `userChrome.css` can't reach (`::part()` is ignored in this build); where needed, the script injects small style blocks there (the sidebar's bottom buttons, the tile grid).

## What's been done

Built over October 20–21, 2026, from a plain LibreWolf with vertical tabs:

1. **Arc layout**: toolbar and URL bar moved into the sidebar, floating page card, Apple-style colors, shadows, radii and motion; auto-hide sidebar with a Spotlight-style floating URL bar; fullscreen support.
2. **Tiles, pinned rows and folders**: Cmd+D / Cmd+Shift+D, saved and restored rows and folders, Arc-style drag and drop, pinned pages with the away dot and reset-on-close.
3. **Buttons**: sidebar button, back/forward/reload top right, Downloads and Extensions in the bottom row, ☰ and the sidebar gear removed, one icon-button style everywhere.
4. **Command bar for new tabs**: Cmd+T / + New Tab, launch and new windows open the bar instead of a blank tab, no stray blank tabs.
5. **Closing rules**: resets instead of closes for rows and tiles; never landing on (and loading) an unloaded row.
6. **Tile colors** (Zen-style), tile hover, icons kept while loading, quiet sound badges.
7. **Spacing audit**: everything on whole pixels and one rhythm; later a "roomier" density (32px rows, 40px tiles) with all spacings derived from two gap tokens.
8. **Full audit**: dead code and stale comments removed, dialog panels restyled as popovers, and bugs fixed: folders lost at every launch, a 2px drag offset, a black tile after Cmd+W (a stale "visually selected" state), tiles turning into rows in auto-hide mode.

Plans and known gaps: see [TODO.md](TODO.md).
