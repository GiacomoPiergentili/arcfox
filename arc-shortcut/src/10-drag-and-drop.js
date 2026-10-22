      // --- drag and drop ---
      // Dropped above the divider (inside the row block) -> pinned row; below
      // it -> normal tab. The divider position is taken when the drag starts,
      // before Firefox shifts anything. Tiles are Firefox's own business,
      // except that Firefox puts an unpinned tile first; it goes where it
      // was dropped instead.
      const TAB_DROP_TYPE = "application/x-moz-tabbrowser-tab";
      let dividerY = null;
      let startMids = [];
      let slotHeight = 0;
      let folderSlot = 0; // height of a folder being dragged
      let newTabTop = null; // where + New Tab was when a folder drag started
      let firstSlotTop = null;
      // How far a tab is drawn from its place while dragging: Firefox's own
      // offsets (style top + transform) plus [arc-make-room]
      const shiftOf = t =>
        (parseFloat(t.style.top) || 0) +
        (Number(/translateY\((-?[\d.]+)px\)/.exec(t.style.transform)?.[1]) || 0) +
        (t.hasAttribute("arc-make-room") ? slotHeight : 0);
      let pendingDrop = null;
      // What Firefox moves while dragging: tabs and folder labels (their
      // container), visible ones only (a collapsed folder's tabs aren't)
      const movables = () =>
        gBrowser.tabContainer.dragAndDropElements
          .filter(el => !el.pinned)
          .map(el => (gBrowser.isTabGroupLabel(el) ? el.closest(".tab-group-label-container") : el))
          .filter(el => el && el.getBoundingClientRect().height > 0);
      const itemOf = el => (el.localName === "tab" ? el : el.closest("tab-group"));
      const inBlockEl = el => (el.localName === "tab" ? isRow(el) : true);
      const tilesBox = () => (gBrowser.tabContainer.pinnedTabsContainer || doc.getElementById("pinned-tabs-container"))?.getBoundingClientRect();
      const isOverTiles = (y, r = tilesBox()) => !!r && r.height > 0 && y >= r.top && y <= r.bottom + 4;
      // Would a drop at this height make a pinned row?
      const headsForRow = y => !isOverTiles(y) && dividerY !== null && y < dividerY;
      // A tab dropped on the tiles becomes a tile there, not at the end
      // (Firefox just pins it): the place under the pointer, in reading
      // order. The tiles' cells are measured once per drag, as they stand.
      const stillTiles = () => gBrowser.tabs.filter(t => t.pinned && !t.hasAttribute("dragtarget"));
      let tileCells = null;
      const cells = () => {
        if (!tileCells) {
          const tiles = stillTiles();
          tiles.forEach(t => (t.style.translate = ""));
          tileCells = tiles.map(tile => ({ tile, rect: tile.getBoundingClientRect() }));
        }
        return tileCells;
      };
      const tileSlot = (x, y) => {
        const i = cells().findIndex(({ rect: r }) => r.top > y || (r.bottom >= y && r.left + r.width / 2 > x));
        return i === -1 ? cells().length : i;
      };
      // ...and while it's over them, the tiles from that place on slide one
      // cell along to make room (the grid grows a line if it has to)
      const tilesContainer = () => gBrowser.tabContainer.pinnedTabsContainer || doc.getElementById("pinned-tabs-container");
      let tileGap = -1;
      const openTileGap = index => {
        if (index === tileGap) {
          return;
        }
        tileGap = index;
        const all = cells();
        const box = tilesBox();
        let grow = 0;
        all.forEach(({ tile, rect }, i) => {
          if (i < index) {
            tile.style.translate = "";
            return;
          }
          let to = all[i + 1]?.rect;
          if (!to) {
            // the cell after the last tile: along the line, or the next line
            const pitchX = all.length > 1 && all[1].rect.top === all[0].rect.top ? all[1].rect.left - all[0].rect.left : rect.width;
            const fits = rect.right + pitchX <= box.right + 1;
            to = fits ? { left: rect.left + pitchX, top: rect.top } : { left: all[0].rect.left, top: rect.bottom + 8 };
            grow = fits ? 0 : rect.height + 8;
          }
          tile.style.translate = `${to.left - rect.left}px ${to.top - rect.top}px`;
        });
        tilesContainer()?.style.setProperty("--arc-tiles-grow", `${grow}px`);
        tilesContainer()?.toggleAttribute("arc-tiles-growing", grow > 0);
      };
      const closeTileGap = () => {
        tileGap = -1;
        if (tileCells) {
          tileCells.forEach(({ tile }) => (tile.style.translate = ""));
          tileCells = null;
          tilesContainer()?.style.removeProperty("--arc-tiles-grow");
          tilesContainer()?.removeAttribute("arc-tiles-growing");
        }
      };
      const placeAt = (tab, y, moving) => {
        // between two items of an open folder: into the folder, there
        const groupOf = el => el.localName === "tab" ? el.group : el.closest("tab-group");
        const marks = startMids.filter(m => !moving.includes(m.tab)).sort((a, b) => a.mid - b.mid);
        const after = marks.find(m => m.mid >= y)?.tab;
        const before = marks.filter(m => m.mid < y).at(-1)?.tab;
        if (after?.localName === "tab" && after.group && (!after.group.collapsed || after.visible) && before && groupOf(before) === after.group) {
          gBrowser.moveTabBefore(tab, after);
          return;
        }
        // before the first top-level item (tab or folder) that started below y
        const below = new Set(startMids.filter(m => m.mid >= y).map(m => itemOf(m.tab)));
        const others = listItems().filter(item => !moving.includes(item));
        const next = others.find(item => below.has(item));
        if (next) {
          gBrowser.moveTabBefore(tab, next);
        } else if (others.length) {
          gBrowser.moveTabAfter(tab, others.at(-1));
        }
      };
      guard("drag and drop: tiles", () => {
        // Place it in the same frame Firefox unpins it, so it never shows up
        // at the top first
        gBrowser.tabContainer.addEventListener("TabPinned", e => {
          const drop = pendingDrop;
          if (drop?.tileBefore && drop.moving.includes(e.target)) {
            // once Firefox is done with the drop (it moves the tab itself
            // after pinning it), still before the next frame
            const tab = e.target;
            Promise.resolve().then(() => {
              if (drop.tileBefore.isConnected && drop.tileBefore.pinned && tab.pinned && drop.tileBefore !== tab) {
                gBrowser.moveTabBefore(tab, drop.tileBefore);
              }
            });
          }
        });
        gBrowser.tabContainer.addEventListener("TabUnpinned", e => {
          const drop = pendingDrop;
          if (drop?.wasTile.includes(e.target)) {
            const tab = e.target;
            placeAt(tab, drop.y, drop.moving);
            if (drop.toRow) {
              setRow(tab, true);
            }
            // again once Firefox is done with the drop: it moves the tab
            // itself after unpinning it (into a folder only we know about)
            Promise.resolve().then(() => tab.isConnected && !tab.pinned && placeAt(tab, drop.y, drop.moving));
          }
        });
      });
      const finishDrop = ({ moving, y, limit }) => {
        pendingDrop = null;
        for (const tab of moving) {
          if (tab.pinned) {
            continue; // became (or stayed) a tile
          }
          const list = unpinned();
          const i = list.indexOf(tab);
          const insideBlock = list.slice(0, i).every(t => isRow(t) || moving.includes(t));
          const aboveDivider = limit === null ? false : y < limit;
          const wantRow = insideBlock && aboveDivider;
          if (wantRow !== isRow(tab)) {
            setRow(tab, wantRow);
          }
          if (!wantRow && list.slice(i + 1).some(isRow)) {
            moveToRowBlockEnd(tab);
          }
        }
        normalize();
      };
      guard("drag and drop", () => {
        gBrowser.tabContainer.addEventListener("dragstart", e => {
          // (the target can be a text node, e.g. a folder's name)
          const target = e.target?.nodeType === 1 ? e.target : e.target?.parentElement;
          const els = movables();
          startMids = els.map(el => ({ tab: el, mid: (r => r.top + r.height / 2)(el.getBoundingClientRect()) }));
          const box = periphery?.getBoundingClientRect();
          slotHeight = unpinned()[0]?.getBoundingClientRect().height || 0;
          // the list ends after the last tab, and a dragged row may always go
          // one slot below + New Tab
          listEndScreenY = Math.max(...els.map(el => el.getBoundingClientRect().bottom), box ? box.bottom + slotHeight : 0) + win.mozInnerScreenY;
          // a folder never leaves the pinned block: its drag ends at the block's end
          const folderLabel = target?.closest(".tab-group-label-container");
          folderSlot = 0;
          newTabTop = null;
          if (folderLabel) {
            // it's lifted out of the layout while dragged: + New Tab keeps its place
            const cs = win.getComputedStyle(folderLabel);
            folderSlot = folderLabel.getBoundingClientRect().height + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom);
            // Firefox folds the folder up while it's dragged: + New Tab and
            // what's below keep their place (the space is held, see dragover)
            const group = folderLabel.closest("tab-group");
            newTabTop = periphery?.getBoundingClientRect().top ?? null;
            dragRoot.setAttribute("arc-folder-drag", "");
            const blockEls = els.filter(el => inBlockEl(el) && (el === folderLabel || !group.contains(el)));
            listEndScreenY = Math.max(...blockEls.map(el => el.getBoundingClientRect().bottom)) + win.mozInnerScreenY;
          }
          dragRoot.setAttribute("arc-dragging", "");
          // no tab preview card hanging around during the drag
          try {
            gBrowser.tabContainer.previewPanel?.forceReset?.();
          } catch {}
          // the first row's slot: right above the divider gap (the end-of-list
          // box's top margin in userChrome.css), the line in its middle
          const gap = periphery ? parseFloat(win.getComputedStyle(periphery).marginTop) || 0 : 0;
          firstSlotTop = box ? box.top - gap : null;
          const draggedTab = target?.closest(".tabbrowser-tab");
          // a dragged row leaves a gap above + New Tab: keep the button in place
          if (draggedTab && isRow(draggedTab)) {
            periphery?.style.setProperty("--arc-newtab-shift", `${slotHeight}px`);
          }
          const first = listItems()[0];
          if (!listItems().some(inBlock) && draggedTab && draggedTab === first) {
            // no rows yet and the first tab itself is dragged (Firefox can't
            // move it any higher): nudging it up is enough
            dividerY = startMids.find(m => m.tab === draggedTab).mid - 6;
          } else {
            dividerY = box ? box.top - gap / 2 - 1 : null; // the line
          }
        }, true);
        gBrowser.tabContainer.addEventListener("drop", e => {
          const dt = e.dataTransfer;
          if (dt?.mozTypesAt(0)[0] !== TAB_DROP_TYPE) {
            return;
          }
          const dragged = dt.mozGetDataAt(TAB_DROP_TYPE, 0);
          // whatever still moves when it lands (the tile grid shrinking, a
          // folder opening again) glides there instead of jumping
          glideFrom(notePlaces({ dropping: true }), { nextFrame: true });
          // A split view: dropped above the line, its pages become pinned rows
          // (one that has a row already stays as it is); below it, normal tabs
          if (isSplit(dragged) && gBrowser.splitViews.includes(dragged)) {
            const toRow = !isOverTiles(e.clientY) && headsForRow(e.clientY);
            if (!toRow || !hasRow(dragged)) {
              for (const tab of dragged.tabs) {
                if (isRow(tab) !== toRow) {
                  setRow(tab, toRow);
                }
              }
            }
            return;
          }
          // (not ownerGlobal === win: here win is a cross-compartment wrapper)
          if (!gBrowser.tabs.includes(dragged)) {
            return;
          }
          const moving = dragged.multiselected ? [...gBrowser.selectedTabs] : [dragged];
          const y = e.clientY;
          const limit = dividerY;
          // over the tiles: the tile it goes before (null: the end)
          let tileBefore;
          if (isOverTiles(y) && moving.some(t => !t.pinned)) {
            tileBefore = cells()[tileSlot(e.clientX, y)]?.tile ?? null;
          }
          // Mark it right away, as the cue showed (rows sort above + New Tab, so
          // a late mark would make it jump); finishDrop double-checks
          const toRow = headsForRow(y);
          for (const tab of moving) {
            if (!tab.pinned && isRow(tab) !== toRow) {
              setRow(tab, toRow);
            }
          }
          const drop = { moving, y, limit, toRow, wasTile: moving.filter(t => t.pinned), tileBefore };
          pendingDrop = drop;
          win.setTimeout(() => finishDrop(drop), 400);
        }, true);
      });
      // No extra macOS drag preview (the big page thumbnail): the dragged tab
      // itself follows the pointer, as in Arc and Safari
      const blankDragImage = new win.Image();
      blankDragImage.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
      guard("drag and drop: no page thumbnail", () => {
        gBrowser.tabContainer.addEventListener("dragstart", e => {
          if (e.dataTransfer?.mozTypesAt(0)?.[0] === TAB_DROP_TYPE) {
            e.dataTransfer.setDragImage(blankDragImage, 0, 0);
          }
        });
      });
      // On macOS Firefox swaps in a page thumbnail once it's captured
      // (updateDragImage); ignore that for tab drags
      const noThumbnailForTabs = original => function (...args) {
        if (this.mozTypesAt?.(0)?.[0] === TAB_DROP_TYPE) {
          return undefined;
        }
        return original.apply(this, args);
      };
      guard("drag and drop: cues", () => {
        // While a dragged tab is over the tiles, show it as a tile
        // ([arc-drag-over-tiles] + --arc-drag-x, styled in userChrome.css)
        gBrowser.tabContainer.addEventListener("dragover", e => {
          if (e.dataTransfer?.mozTypesAt(0)[0] !== TAB_DROP_TYPE) {
            return;
          }
          const r = tilesBox();
          const over = isOverTiles(e.clientY, r);
          dragRoot.toggleAttribute("arc-drag-over-tiles", over);
          if (over) {
            dragRoot.style.setProperty("--arc-drag-x", `${e.clientX - r.left}px`);
          }
          const draggedItem = gBrowser.tabContainer.querySelector(".tabbrowser-tab[dragtarget]");
          // a tab (not a tile) over the tiles: they make room; the rows stay put
          const tabOverTiles = over && !!draggedItem && !draggedItem.pinned;
          dragRoot.toggleAttribute("arc-tab-over-tiles", tabOverTiles);
          if (tabOverTiles) {
            openTileGap(tileSlot(e.clientX, e.clientY));
          } else {
            closeTileGap();
          }
          // a folder being dragged: the space it left (its name lifted out,
          // its tabs folded up) is held, so + New Tab stays where it was
          if (folderSlot && newTabTop !== null && periphery) {
            const held = parseFloat(periphery.style.getPropertyValue("--arc-folder-space")) || 0;
            const drift = newTabTop - (periphery.getBoundingClientRect().top - held);
            periphery.style.setProperty("--arc-folder-space", `${Math.max(0, drift)}px`);
          }
          // A tile dragged below the grid lines up with the rows
          const tab = gBrowser.tabContainer.querySelector(".tabbrowser-tab[dragtarget][pinned]");
          const ref = unpinned()[0];
          const overRows = !!tab && !!ref && !!r && e.clientY > r.bottom + 4;
          dragRoot.toggleAttribute("arc-drag-over-rows", overRows);
          if (overRows) {
            const shift = parseFloat(dragRoot.style.getPropertyValue("--arc-row-dx")) || 0;
            const refBox = ref.getBoundingClientRect();
            dragRoot.style.setProperty("--arc-row-w", `${refBox.width}px`);
            dragRoot.style.setProperty("--arc-row-dx", `${refBox.left - (tab.getBoundingClientRect().left - shift)}px`);
          } else {
            dragRoot.style.removeProperty("--arc-row-dx");
          }
          // ...and the tabs below the pointer make room for it
          for (const { tab: el, mid } of startMids) {
            el.toggleAttribute("arc-make-room", overRows && mid > e.clientY);
          }
          // Show while dragging whether the drop makes a pinned row (a folder
          // always stays pinned: no cue)
          const toRow = !folderSlot && headsForRow(e.clientY);
          dragRoot.toggleAttribute("arc-drop-row", toRow);
          // + New Tab follows the rows: as far as Firefox has moved the last
          // one, and a slot down while the dragged tab is headed for them
          const rows = movables().filter(el => inBlockEl(el) && !el.hasAttribute("dragtarget"));
          const shift = folderSlot || tabOverTiles ? 0 : Math.max(rows.length ? shiftOf(rows.at(-1)) : 0, toRow ? slotHeight : 0);
          periphery?.style.setProperty("--arc-newtab-shift", `${shift}px`);
          // With no rows yet, the tab snaps into the first row's slot (where
          // + New Tab was), the line and + New Tab moving down below it
          const dragged = gBrowser.tabContainer.querySelector(".tabbrowser-tab[dragtarget]");
          const snap = toRow && !rows.length && firstSlotTop !== null && dragged && !dragged.pinned;
          dragRoot.toggleAttribute("arc-snap-row", !!snap);
          if (snap) {
            const current = parseFloat(dragRoot.style.getPropertyValue("--arc-snap-dy")) || 0;
            dragRoot.style.setProperty("--arc-snap-dy", `${firstSlotTop - (dragged.getBoundingClientRect().top - current)}px`);
          } else {
            dragRoot.style.removeProperty("--arc-snap-dy");
          }
        }, true);
      });
      let quietPreviewsUntil = 0;
      const endDrag = () => {
        quietPreviewsUntil = win.performance.now() + 1000;
        closeTileGap();
        dragRoot.removeAttribute("arc-tab-over-tiles");
        periphery?.style.removeProperty("--arc-folder-space");
        dragRoot.removeAttribute("arc-folder-drag");
        dragRoot.removeAttribute("arc-drag-over-tiles");
        dragRoot.removeAttribute("arc-drag-over-rows");
        dragRoot.removeAttribute("arc-drop-row");
        periphery?.style.removeProperty("--arc-newtab-shift");
        dragRoot.removeAttribute("arc-dragging");
        dragRoot.removeAttribute("arc-snap-row");
        dragRoot.style.removeProperty("--arc-snap-dy");
        listEndScreenY = null;
        dragRoot.style.removeProperty("--arc-row-dx");
        for (const el of gBrowser.tabContainer.querySelectorAll("[arc-make-room]")) {
          el.removeAttribute("arc-make-room");
        }
        // e.g. a folder dragged below the line goes back to the pinned block
        win.setTimeout(normalize, 450);
      };
      guard("drag and drop: ending", () => {
        gBrowser.tabContainer.addEventListener("dragend", endDrag, true);
        // Tab preview cards: none while dragging, nor right after a drop (the
        // pointer comes to rest on a tab)
        const noPreviewsWhileDragging = original => function () {
          return !dragRoot.hasAttribute("arc-dragging") && win.performance.now() > quietPreviewsUntil && original.call(this);
        };
        gBrowser.tabContainer.addEventListener("drop", endDrag, true);
        // Leaving the sidebar doesn't end the drag (it may come back, e.g.
        // after a detour over the page): only the cues that follow the pointer
        // go; Firefox keeps everything else as it was until the drop
        gBrowser.tabContainer.addEventListener("dragleave", e => {
          if (!gBrowser.tabContainer.contains(e.relatedTarget)) {
            closeTileGap();
            for (const name of ["arc-drop-row", "arc-drag-over-tiles", "arc-tab-over-tiles", "arc-drag-over-rows", "arc-snap-row"]) {
              dragRoot.removeAttribute(name);
            }
            for (const el of gBrowser.tabContainer.querySelectorAll("[arc-make-room]")) {
              el.removeAttribute("arc-make-room");
            }
          }
        }, true);
        // A drag that ended without reaching us (dropped outside the window,
        // cancelled): the next click proves it's over, as Firefox assumes too
        win.addEventListener("mousedown", e => {
          if (e.button === 0 && dragRoot.hasAttribute("arc-dragging")) {
            endDrag();
          }
        }, true);
      });

