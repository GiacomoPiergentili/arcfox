# To do

What's next for librewolf-arc, most valuable first. Move items to the README's "What's been done" when they ship.

## Next

- [ ] **Multiple windows**: other windows don't show your tiles, pinned rows and folders (tiles are per-window LibreWolf pinned tabs; rows are restored only in the first window). In Arc every window shows the same ones.

## Later

Nothing queued.

## Bigger projects

- [ ] **Spaces**: several sidebars (e.g. work / personal) to switch between, as in Arc.
- [ ] **Peek**: links opened from a tile show in a floating preview window instead of replacing the tile's page.

## Known limitations

- The auto-hide sidebar is one flat color; themes that shade the pinned sidebar from edge to edge (Nova Ash does, slightly) match it in the middle, within a shade. With the sidebar kept on auto-hide, a wallpaper change is picked up the next time it's pinned (Cmd+S).
- The site-info (shield) panel's text column is slightly uneven (12–17px from the edge); it's LibreWolf's own layout.
- The Reddit tile's blank icon during its bot check at launch is handled by refilling the saved icon; this path couldn't be triggered on demand, so it's untested.
- The stale "visually selected" race behind the black tile after Cmd+W was reproduced only once; the fix (reset after the tab switch completes, plus clearing a stale mark) is logically complete but not confirmed by a repeat failure.
- `restoreRows` still converts rows saved by an early version (when rows were LibreWolf pinned tabs); it doubles as crash recovery, so it stays.

## Done

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
