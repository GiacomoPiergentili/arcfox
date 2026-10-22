      // Favorite tiles, pinned rows and folders (Arc-style).
      //   Tiles are Firefox's own pinned tabs (Cmd+Shift+D).
      //   Pinned rows are normal tabs marked [arc-pinned-row], always kept at
      //   the top of the tab list above the divider (Cmd+D). Folders are
      //   Firefox's tab groups, kept in that same pinned block; their tabs
      //   are pinned rows too. The script saves the block (pref
      //   arc.pinnedRows) and reopens it, unloaded, at startup. Closing a row
      //   unloads it but keeps it.
      // Keeping rows out of Firefox's pinned grid lets its own drag and
      // drop work: dragging between rows and normal tabs is plain reordering.
      const gBrowser = win.gBrowser;
      const SessionStore = win.SessionStore;
      const dragRoot = doc.documentElement; // carries the drag state attributes
      const ROW = "arc-pinned-row";
      const ROWS_PREF = "arc.pinnedRows";
      const isRow = tab => tab.hasAttribute(ROW);
      const isGroup = el => el?.localName === "tab-group";
      // Split views (two pages side by side) are Firefox's
      // <tab-split-view-wrapper>s. One with a pinned row in it is part of the
      // pinned block, in the row's spot; the normal tab next to the row is a
      // guest ([arc-split-guest]): never saved, and back with the normal tabs
      // once the two are separated.
      const isSplit = el => el?.localName === "tab-split-view-wrapper";
      const hasRow = split => split.tabs.some(isRow);
      const GUEST = "arc-split-guest";
      // A split view of two rows sits in the first one's spot. The other one
      // keeps its own place (folder included): it's saved there and goes
      // back there when the two are separated. {group, next}: its folder (or
      // none) and the item that followed it.
      const rowOrigin = new WeakMap();
      const noteOrigin = tab => {
        if (isRow(tab) && !tab.splitview && !rowOrigin.has(tab)) {
          let next = tab.nextElementSibling;
          while (next && !(next.localName === "tab" || isGroup(next) || isSplit(next))) {
            next = next.nextElementSibling;
          }
          rowOrigin.set(tab, { group: tab.group ?? null, next });
        }
      };
      const backToOrigin = tab => {
        const { group, next } = rowOrigin.get(tab);
        rowOrigin.delete(tab);
        const level = group?.isConnected ? group : null;
        if (next?.isConnected && next.parentElement === (level ?? gBrowser.tabContainer.arrowScrollbox)) {
          gBrowser.moveTabBefore(tab, next);
        } else if (level) {
          level.addTabs([tab]);
        } else {
          if (tab.group) {
            gBrowser.ungroupTab(tab);
          }
          moveToRowBlockEnd(tab);
        }
      };
      const unpinned = () => gBrowser.tabs.filter(t => !t.pinned && !t.hidden);
      const setRow = (tab, on) => {
        tab.toggleAttribute(ROW, on);
        try {
          if (on) {
            SessionStore.setCustomTabValue(tab, ROW, "1");
          } else {
            SessionStore.deleteCustomTabValue(tab, ROW);
          }
        } catch {}
        if (on) {
          ensureHome(tab);
        } else {
          forgetHomeLater(tab);
        }
        scheduleSave();
      };
      // The tab list's own items, in order: tabs, folders (and split views),
      // without Firefox's end-of-list box
      const listItems = () =>
        [...gBrowser.tabContainer.arrowScrollbox.children].filter(el => el.id !== "tabbrowser-arrowscrollbox-periphery");
      // The pinned block: rows and folders, always together at the top
      const inBlock = el => isGroup(el) || (el?.localName === "tab" && isRow(el)) || (isSplit(el) && hasRow(el));
      // Rows and folders always form one block at the top of the tab list
      const moveToRowBlockEnd = el => {
        const items = listItems().filter(item => item !== el && item !== el.group);
        const firstOutside = items.find(item => !inBlock(item));
        if (firstOutside) {
          gBrowser.moveTabBefore(el, firstOutside);
        } else if (items.length) {
          gBrowser.moveTabAfter(el, items.at(-1));
        }
      };
      // Folder tabs are rows; stray rows/folders go back into the block.
      // Run after anything that may have broken that (Firefox adds tabs to
      // folders and creates folders where it likes).
      let normalizing = false;
      const leavingFolder = new WeakSet(); // links opened from folder tabs
      const normalize = () => {
        if (normalizing || dragRoot.hasAttribute("arc-dragging")) {
          return;
        }
        normalizing = true;
        try {
          // guests: marked while next to a row, sent back to the normal tabs
          // once they're on their own again
          for (const split of gBrowser.splitViews) {
            for (const tab of split.tabs) {
              tab.toggleAttribute(GUEST, !isRow(tab) && hasRow(split));
            }
          }
          for (const tab of gBrowser.tabs.filter(t => rowOrigin.has(t) && !t.splitview)) {
            backToOrigin(tab);
          }
          for (const tab of gBrowser.tabs.filter(t => t.hasAttribute(GUEST) && !t.splitview)) {
            tab.removeAttribute(GUEST);
            if (tab.group) {
              gBrowser.ungroupTab(tab);
            }
            moveToRowBlockEnd(tab);
          }
          for (const group of gBrowser.tabGroups) {
            for (const tab of group.tabs) {
              if (!isRow(tab) && !tab.splitview && !leavingFolder.has(tab)) {
                setRow(tab, true);
              }
            }
          }
          const items = listItems();
          const firstOutside = items.findIndex(item => !inBlock(item));
          if (firstOutside !== -1) {
            for (const item of items.slice(firstOutside + 1).filter(inBlock)) {
              moveToRowBlockEnd(item);
            }
          }
        } finally {
          normalizing = false;
        }
        scheduleSave();
      };
      let normalizeTimer = null;
      const scheduleNormalize = () => {
        win.clearTimeout(normalizeTimer);
        normalizeTimer = win.setTimeout(normalize, 0);
      };
      // Two pages side by side become two tabs again: a row keeps its spot,
      // a guest goes back down to the normal tabs
      const separate = split => {
        const guests = split.tabs.filter(t => !isRow(t));
        split.unsplitTabs();
        for (const tab of guests) {
          if (tab.isConnected && !tab.closing) {
            tab.removeAttribute(GUEST);
            if (tab.group) {
              gBrowser.ungroupTab(tab);
            }
            moveToRowBlockEnd(tab);
          }
        }
        normalize();
      };

