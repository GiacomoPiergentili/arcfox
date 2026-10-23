# To do

What's next for arcfox, most valuable first. Move items to the README's "What's been done" when they ship.

## Next

Nothing queued.

## Later

Nothing queued.

## Bigger projects

Nothing queued.

## To watch
- The first Firefox update with automatic updates on (159): the reinstall should happen by itself and `doctor.sh` come back clean. Right after the very first install into Firefox.app, Firefox's first launch once restarted itself without its arguments (on the default profile); not seen since, but each reinstall changes the app again.

- `tests/drag_tests.py`'s "tiles reordered" failed once in about a dozen runs (Blue stayed last); not reproduced since. If it repeats, record it (`--record`).

## Known limitations
- Apple guidelines, not done: the pinned page dot can't take keyboard focus (its action is in the tab's context menu); the sidebar can't be translucent (Firefox allows no blur behind its own interface); our few labels are English only.

- The auto-hide sidebar is one flat color; themes that shade the pinned sidebar from edge to edge (Nova Ash does, slightly) match it in the middle, within a shade. With the sidebar kept on auto-hide, a wallpaper change is picked up the next time it's pinned (Cmd+S).
- Multiple windows: if two windows change the sidebar within the same half second, the later save wins. Whether a folder is open or closed stays per window. A change of a tile's icon alone reaches other windows with the next other change.
- The site-info (shield) panel's text column is slightly uneven (12–17px from the edge); it's Firefox's own layout. (Seen on LibreWolf; not re-checked on Firefox.)
- The Reddit tile's blank icon during its bot check at launch is handled by refilling the saved icon; this path couldn't be triggered on demand, so it's untested.
- The stale "visually selected" race behind the black tile after Cmd+W was reproduced only once (on LibreWolf); the fix (reset after the tab switch completes, plus clearing a stale mark) is logically complete but not confirmed by a repeat failure.
- Peek: a link opened in the background (Cmd+click) is a normal background tab, not a Peek. A Peek left open when Firefox quits comes back as a normal tab. Split View from a Peek isn't offered over a tile (Firefox can't split tiles). Peek is tested with real clicks too (`tests/drag_tests.py`), but not its Esc key or a click on a link mid-load.
- Profile switcher: the tests use made-up profiles (Firefox turns its profiles on only for profiles in its profile list, which test profiles aren't); switching and creating real profiles was tried by hand.
- Tiles can't be split (Firefox keeps its pinned tabs out of split views). Dropping a tab onto another tab in the sidebar still reorders, as before.
- Dragging a tab in from another window is tested with simulated events only. Real drags within a window are checked by `tests/drag_tests.py`.
- When a tab leaves the tiles mid-drag, Firefox sizes the gap for a tile-shaped tab (44px) for about 0.1s before using the row's 36px: a brief wobble. (Seen before the first-tile slot work; not re-checked.)
- A folder folds up while it's dragged (Firefox's design); the rows above close up and its space waits above the divider until the drop.
- Firefox's internal `moveTabToSplitView` can make a 3-page split; no menu or gesture does that.
- Extension buttons pinned to the toolbar aren't shown (the toolbar row keeps only back, forward and reload): extensions, iCloud Passwords included, are in the Extensions menu at the bottom right of the sidebar.
- Automatic reinstalls (`autoupdate/`) open Terminal, which needs the App Management permission to write into Firefox.app.
- `doctor.sh` can check profiles only from a Terminal with Full Disk Access (macOS keeps other apps out of Firefox's folder).
- `tests/drag_tests.py` needs `~/.arc-drag/drag`, a small tool outside the repo.

## Animation ideas
- Left alone on purpose: switching tabs and hover stay instant / near-instant; page loading and the Downloads progress are Firefox's own.

## Done

- [x] Fixed: with two windows, a tile left on another page (a YouTube video) came back there after a restart instead of on its pinned page (the pinned page itself was still recorded right). Firefox says all windows are restored before a later window's tabs are filled in; each window now also checks when its own tabs are back (`SSWindowRestored`). New test phase: a restart with two windows, the way Firefox starts for you.
- [x] Peek with the real mouse: three cases in `tests/drag_tests.py` (from a tile, Option+click, from a pinned row; closing by a click on the dimmed page, Open as Tab, Open in Split View), on pages from a local web server. Peek's loop forcing the page underneath to keep drawing (20 times a second while a Peek loaded) is gone: filmed with and without it, the page underneath never flashed either way. Fixed: a tile shrank to 32px while dragged (Firefox lifts the dragged tab out of the grid that gave it its height); checked mid-drag by the reorder case.
- [x] Audit and cleanup after the move: "no tab previews while dragging" had never been applied (an unreachable function; now tested, and every launch checks for any uncaught script error); a misspelled focus-colour variable; the test runner's silent relaunch (it hid failures); orphaned test browsers; doctor and installer fixes; `betterfox/update.sh` checks what it fetches; LibreWolf leftovers (`sidebar.revamp`, comments, `.gitignore`), an old data conversion, fallbacks for older Firefox and dead CSS removed. `::part()` from userChrome.css was re-checked on Firefox: still ignored, so the tile grid style stays injected.
- [x] `tests/drag_tests.py`: ten real drag-and-drop cases with the real mouse (through `~/.arc-drag/drag`), each checked for where things land and for leftovers (torn-off windows, drag state, offsets, errors, saved state).
- [x] `doctor.sh`: checks the whole setup in one go (installed files against the repo, restart needed, profiles' chrome link and user.js, automatic updates, iCloud Passwords, uncommitted Betterfox updates) and says how to fix each problem.
- [x] Tests for empty and unusual states: a brand-new profile's first run and restart, nothing pinned, tiles only, rows only, a scrambled toolbar. Fixed along the way: the divider sat 12px too low with no rows (and was clipped away with tiles only); with nothing pinned there's no divider now.
- [x] Fixed: with no tiles, dragging a tab to the top never made the first tile (Firefox's pin drop zone opened below the dragged tab, late, and a release above it, where the pointer ends up, landed on the toolbar). The zone is now an empty Arc tile slot that opens at once, and a release just above it counts. Fixed: a profile's saved toolbar could show reload, forward, back; they're put back in order.
- [x] Moved from LibreWolf to Firefox 158 + Betterfox: Firefox installer, Downloads kept visible, toolbar buttons placed on a new profile's first run, tests on Firefox (also on top of Betterfox's `user.js`). Betterfox ships in `betterfox/` and `install.sh` installs it as Firefox's default prefs, for every profile. Vertical tabs kept on in each profile's `user.js`; optional automatic updates (`autoupdate/`).
- [x] New profiles: the settings the layout relies on are applied once on a profile's first run (a new profile showed the bookmarks toolbar in the sidebar, no launch command bar, no Bookmarks button).
- [x] Spaces, as LibreWolf profiles: a profile switcher in the sidebar's bottom row; profiles made from LibreWolf's menu get the look on their first run.
- [x] Profile switcher after a restart showed nothing to switch to: it asked for the profiles before LibreWolf's profile service had started. No more + (profiles come from LibreWolf's menu), no Bookmarks / History buttons, Downloads at the left, a visible hover on the avatars.
- [x] Launch: Bookmarks / History / the Customize gear flashed in the bottom row and Downloads popped in late. The tool buttons are no longer made at all, the gear is hidden before the window shows, and Downloads is shown from the first frame. Icon buttons hover with the tab rows' soft grey again (LibreWolf 158 renamed the variables).
- [x] Start-up: tiles load when opened; the tab list fades in complete instead of popping in (no stray "New Tab" row, blank tiles or late icons).
- [x] Peek motion: the card grows out of the clicked link once its page has drawn and shrinks back on close; no black frames (the page underneath is kept drawn), no empty card.
- [x] Option+click a link in any tab opens it in Peek (as in Zen).
- [x] Peek: links to other sites from tiles and pinned rows open in a card over the dimmed pinned page (Esc / click outside / Cmd+W / switching tabs close it; Open as Tab; Split View from a row).
- [x] Drag torture test: drags that leave the sidebar and come back, drops on the page (no more tearing off into a new window), tiles dropped into folders.
- [x] Drag and drop glitches (found with recorded real drags): tile drop position, tiles making room, stray row slot, jumps when the grid shrinks or a folder is dragged, split pairs into/out of the rows, leftover offset after a page drop, preview cards during drags, dragged tile's icon spacing.
- [x] Split view's sidebar item restyled as one 32px row (segmented-control style, whole pixels, folder line continuous).
- [x] Split view, every way in: pinned rows can be split (pair in the row's spot, only the row saved), right-click split and its "choose a tab" picker, restored split views, tabs from another window, Cmd+W on a row in a split.
- [x] Split view by drag and drop (as in Arc): drop a tab on the left or right half of the page.
- [x] Multiple windows: every window shows the same tiles, rows and folders, kept in sync (as in Arc).
- [x] Test suite (`python3 tests/run_tests.py`). It found fresh installs fitting only 2 tiles per row: fixed (the sidebar's contents now always fill it).
- [x] Video fullscreen fills the screen (no page-card gutter, corners or shadow).
- [x] Accessibility: the sidebar button and the pinned-page dot have proper names for VoiceOver.
- [x] Command bar screenshot with suggestions (a macOS capture: LibreWolf's own snapshot doesn't draw the suggestion list).
- [x] The auto-hide sidebar measures the pinned sidebar's color itself (at launch, on theme and light/dark changes, when the window becomes active, when the sidebar gets pinned), so it matches with any theme or wallpaper.
- [x] Fixed: a quick Cmd+T right after Enter was ignored, and the bar could fill with the previous tab's address while it loaded.
- [x] README screenshots (dark, light, command bar, auto-hide) and an MIT license.
- [x] Light mode pass (Nova Ash): auto-hide sidebar color fixed for light mode; + New Tab text in the rows' color.
- [x] Auto-archive: normal tabs unused for 24 hours close by themselves (`arc.archiveAfterHours`, 0 = off).
- [x] Sidebar notice when the script isn't running (e.g. after a LibreWolf update).
- [x] Cmd+Shift+C copies the page address, with a "Link Copied" confirmation.
- [x] Cmd+1…9 go to the tiles in order, then the pinned rows.
- [x] Folders: a collapsed folder keeps showing its loaded tabs (no "+N"); rows slide open and shut; the folder icon's front tilts open and shuts.
- [x] Motion: tabs slide open and shut; Cmd+D / Cmd+Shift+D and Pin / Unpin glide everything to its new place (a tab changing shape grows into it); closing a pinned row or tile settles it back in place.
- [x] More motion: a selected tile's colors fade in and out; the away dot pops in; split views glide together and apart; other windows glide when they follow a change.
- [x] Animation check, frame by frame (frozen refresh driver + window-only screenshots): fixed a new tab's row drawn full height for a frame before sliding, glides starting a frame late, a gliding tab showing through the rows it crosses, tiles that only resized fading in and out (and overlapping as they moved), the grow-in never actually fading, Cmd+Shift+D also opening "Bookmark All Tabs" when run as a command, and a pinned page with no icon keeping the old page's icon on reset.
- [x] The Cmd+T bar fades out where it is when it closes (as Spotlight does), then goes back to the sidebar.
- [x] Apple guidelines review: commands in the menu bar with their shortcuts; Increase Contrast; Reduce Motion for the drop glide, drag reactions and folder icon; the pinned page dot's click area 20px.
- [x] Refactor: each feature sets itself up on its own (a broken one is named in the browser console, the rest keep working); every replacement of LibreWolf's code in one checked list; one set of motion helpers; the script split into `arc-shortcut/src/*.js`, one file per feature, joined by the installer. Fixed along the way: `console.error` threw in this script's sandbox (errors were never logged), and the tab-preview override was never applied when LibreWolf made the panel later.
- [x] Start-up: the whole sidebar and the command bar appear together in one fade, once the tabs, their icons and the profiles are ready (0.5s at most); no change of shade in the page area.
