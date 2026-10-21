# To do

What's next for librewolf-arc, most valuable first. Move items to the README's "What's been done" when they ship.

## Next

- [ ] **Light mode pass**: everything was verified in dark mode (Nova Ash theme); light-mode colors are set but untested.

## Later

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

## Done

- [x] Auto-archive: normal tabs unused for 24 hours close by themselves (`arc.archiveAfterHours`, 0 = off).
- [x] Sidebar notice when the script isn't running (e.g. after a LibreWolf update).
- [x] Cmd+Shift+C copies the page address, with a "Link Copied" confirmation.
- [x] Cmd+1…9 go to the tiles in order, then the pinned rows.
