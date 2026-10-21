# To do

What's next for librewolf-arc, most valuable first. Move items to the README's "What's been done" when they ship.

## Next

- [ ] **Survive LibreWolf updates.** Updates replace the app and silently drop the script (the CSS still loads, so it just looks broken). Show a small notice in the sidebar when the script isn't running ("run install.sh"), detected from CSS (e.g. a missing attribute the script sets on startup).
- [ ] **Cmd+Shift+C copies the page address**, with a brief "Copied" confirmation (Arc's most-used shortcut).
- [ ] **Cmd+1…9 jump to tiles in order.** LibreWolf counts every tab, so with rows and folders in between the numbers feel random.

## Later

- [ ] **Auto-archive**: close normal tabs untouched for a set time (12h / a day / a week / off); never rows or tiles.
- [ ] **Light mode pass**: everything was verified in dark mode (Nova Ash theme); light-mode colors are set but untested.
- [ ] **Screenshots** in the README.
- [ ] **License**: choose one (e.g. MIT) so others may reuse the code.

## Bigger projects

- [ ] **Spaces**: several sidebars (e.g. work / personal) to switch between, as in Arc.
- [ ] **Peek**: links opened from a tile show in a floating preview window instead of replacing the tile's page.

## Known limitations

- The site-info (shield) panel's text column is slightly uneven (12–17px from the edge); it's LibreWolf's own layout.
- The Reddit tile's blank icon during its bot check at launch is handled by refilling the saved icon; this path couldn't be triggered on demand, so it's untested.
- The stale "visually selected" race behind the black tile after Cmd+W was reproduced only once; the fix (reset after the tab switch completes, plus clearing a stale mark) is logically complete but not confirmed by a repeat failure.
- `restoreRows` still converts rows saved by an early version (when rows were LibreWolf pinned tabs); it doubles as crash recovery, so it stays.
