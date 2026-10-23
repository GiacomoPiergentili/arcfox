      // --- saving / restoring ---
      const tabUrl = tab => {
        try {
          const uri = tab.linkedBrowser?.currentURI?.spec;
          if (uri && uri !== "about:blank") {
            return uri;
          }
          return SessionStore.getLazyTabValue(tab, "url") || uri || "about:blank";
        } catch {
          return "about:blank";
        }
      };
      // --- pinned page (Arc) ---
      // Every pinned row and tile remembers the page it was pinned on (its
      // pinned page, SessionStore value arc-pinned-page). Closing it resets
      // it there, unloaded; restarts open it there; a dot shows while it's
      // somewhere else.
      const HOME = "arc-pinned-page";
      const isPinnedish = tab => tab.pinned || isRow(tab);
      const getHome = tab => {
        try {
          return JSON.parse(SessionStore.getCustomTabValue(tab, HOME) || "null");
        } catch {
          return null;
        }
      };
      const currentEntry = tab => {
        try {
          const state = JSON.parse(SessionStore.getTabState(tab));
          return state.entries?.[(state.index || 1) - 1] || null;
        } catch {
          return null;
        }
      };
      // the page a tab shows (or will show, if it's unloaded)
      const pageUrl = tab =>
        !tab.hasAttribute("pending") && tab.linkedPanel ? tab.linkedBrowser.currentURI.spec : currentEntry(tab)?.url || tabUrl(tab);
      // Bot checks (Reddit's, Cloudflare's) send you through an address with
      // a one-time token. Saved as a pinned page, it never matched the page
      // again, so the tab always showed as away: those parameters don't count.
      const withoutChallenge = url => {
        try {
          const u = new win.URL(url);
          const p = u.searchParams;
          const before = u.search;
          for (const key of [...p.keys()]) {
            if (key.startsWith("__cf_chl_")) {
              p.delete(key);
            }
          }
          if (p.has("js_challenge") || p.has("jsc_token")) {
            for (const key of ["js_challenge", "jsc_token", "jsc_orig_r", "solution"]) {
              p.delete(key);
            }
          }
          if (u.search === before) {
            return url;
          }
          return u.href.replace(/\?(?=#|$)/, "");
        } catch {
          return url;
        }
      };
      const homeHere = tab => {
        const url = pageUrl(tab);
        const entry = currentEntry(tab);
        const same = entry?.url === url;
        return { url: withoutChallenge(url), title: tab.label, principal: same ? entry.triggeringPrincipal_base64 || null : null };
      };
      const samePage = (a, b) => !!a && !!b &&
        withoutChallenge(a).split("#")[0] === withoutChallenge(b).split("#")[0];
      // A tab's icon, kept with its pinned page so an unloaded row still shows
      // it after a restart. Only inline (data:) icons up to 32 KB: the only
      // kind Firefox lets the script set, and small enough for the pref.
      const iconOf = tab => {
        const icon = tab.linkedBrowser?.mIconURL || "";
        return icon.startsWith("data:") && icon.length <= 32768 ? icon : null;
      };
      const isAway = tab => {
        const home = getHome(tab);
        return !!home && !samePage(pageUrl(tab), home.url);
      };
      // The dot: shown on a pinned tab that's away from its pinned page;
      // clicking it goes back there
      const homeDot = tab => {
        let dot = tab.querySelector(".arc-home-dot");
        if (!dot) {
          dot = doc.createXULElement("box");
          dot.className = "arc-home-dot";
          dot.setAttribute("tooltiptext", "Back to pinned page");
          dot.setAttribute("role", "button");
          dot.setAttribute("aria-label", "Back to pinned page");
          // don't let the tab itself react (select / start a drag)
          dot.addEventListener("mousedown", e => e.stopPropagation());
          dot.addEventListener("click", e => {
            e.stopPropagation();
            gBrowser.selectedTab = tab;
            goHome(tab);
          });
          const content = tab.querySelector(".tab-content");
          content?.insertBefore(dot, content.querySelector(".tab-close-button"));
        }
        return dot;
      };
      const updateAway = tab => {
        const away = isPinnedish(tab) && isAway(tab);
        tab.toggleAttribute("arc-away", away);
        if (away) {
          homeDot(tab);
        }
      };
      const setHome = (tab, home) => {
        try {
          SessionStore.setCustomTabValue(tab, HOME, JSON.stringify(home));
        } catch {}
        updateAway(tab);
        scheduleSave();
      };
      // (a tab pinned before its page has loaded gets it once it has: see
      // onLocationChange)
      const ensureHome = tab => {
        if (isPinnedish(tab) && !getHome(tab)) {
          const home = homeHere(tab);
          if (home.url && home.url !== "about:blank") {
            setHome(tab, home);
          }
        }
      };
      // A tab that stops being pinned forgets its pinned page; checked a bit
      // later, since a tile dragged to the rows is unpinned before it's marked
      const forgetHomeLater = tab =>
        win.setTimeout(() => {
          if (tab.isConnected && !isPinnedish(tab)) {
            try {
              SessionStore.deleteCustomTabValue(tab, HOME);
            } catch {}
            updateAway(tab);
          }
        }, 1000);
      // Back to the pinned page, its history replaced (as in Arc). A tab in
      // the background stays unloaded until it's opened.
      const goHome = tab => {
        const home = getHome(tab);
        let state = null;
        try {
          state = JSON.parse(SessionStore.getTabState(tab));
        } catch {}
        if (!home || !state) {
          return;
        }
        // a tab in the background is unloaded first: just replacing its saved
        // page would leave the open one (and any video) running
        if (!tab.selected) {
          gBrowser.discardBrowser(tab, true);
        }
        state.entries = [{
          url: withoutChallenge(home.url),
          title: home.title,
          triggeringPrincipal_base64: home.principal || win.E10SUtils.SERIALIZED_SYSTEMPRINCIPAL,
        }];
        state.index = 1;
        delete state.scroll;
        delete state.formdata;
        delete state.userTypedValue;
        // (its own icon, or none: never the page it's leaving's)
        if (home.icon) {
          state.image = home.icon;
        } else {
          delete state.image;
        }
        SessionStore.setTabState(tab, JSON.stringify(state));
        try {
          gBrowser.setIcon(tab, home.icon || "");
        } catch {}
        win.setTimeout(() => updateAway(tab), 0);
      };
      const tabEntry = tab => {
        const home = getHome(tab);
        return home ? { url: home.url, title: home.title, icon: home.icon } : { url: tabUrl(tab), title: tab.label, icon: iconOf(tab) };
      };
      // Tiles, rows and folders are the same in every window (as in Arc):
      // one shared list (prefs arc.tiles and arc.pinnedRows), in which each
      // item has an id ([arc-id] on its tab in every window, [arc-folder-id]
      // on a folder). A window where something changes saves the list; the
      // others follow it (see "the same sidebar in every window" below).
      // Private windows keep to themselves.
      const TILES_PREF = "arc.tiles";
      const ITEM_ID = "arc-id";
      const isPrivate = !!win.PrivateBrowsingUtils?.isWindowPrivate(win);
      const setItemId = (tab, id) => {
        tab.setAttribute(ITEM_ID, id);
        try {
          SessionStore.setCustomTabValue(tab, ITEM_ID, id);
        } catch {}
      };
      const itemId = tab => {
        let id = tab.getAttribute(ITEM_ID);
        if (!id) {
          try {
            id = SessionStore.getCustomTabValue(tab, ITEM_ID);
          } catch {}
          setItemId(tab, id || win.crypto.randomUUID());
          id = tab.getAttribute(ITEM_ID);
        }
        return id;
      };
      const folderId = group => {
        if (!group.hasAttribute("arc-folder-id")) {
          group.setAttribute("arc-folder-id", group.id);
        }
        return group.getAttribute("arc-folder-id");
      };
      const markRow = tab => {
        tab.setAttribute(ROW, "");
        try {
          SessionStore.setCustomTabValue(tab, ROW, "1");
        } catch {}
      };
      // A tile or row from the shared list, unloaded until it's opened
      const createItem = (entry, tile) => {
        const lazy = !/^about:/.test(entry.url);
        const tab = gBrowser.addTab(entry.url, {
          triggeringPrincipal: win.Services.scriptSecurityManager.getSystemPrincipal(),
          createLazyBrowser: lazy,
          lazyTabTitle: lazy ? entry.title : undefined,
          skipAnimation: true,
        });
        setItemId(tab, entry.id || win.crypto.randomUUID());
        try {
          SessionStore.setCustomTabValue(tab, HOME, JSON.stringify({ url: entry.url, title: entry.title, icon: entry.icon }));
        } catch {}
        if (entry.icon) {
          try {
            gBrowser.setIcon(tab, entry.icon);
          } catch {}
        }
        if (tile) {
          gBrowser.pinTab(tab);
        } else {
          markRow(tab);
        }
        return tab;
      };
      // [{id, url, title, icon}] for a tile or a row, {folder: {...}, tabs:
      // [...]} for a folder
      const snapshot = () => {
        const away = gBrowser.tabs.filter(t => t.splitview && rowOrigin.has(t) && isRow(t));
        const saved = savedSnapshot(t => !away.includes(t));
        // rows in a split view away from their own place: saved there
        for (const tab of away) {
          const { group, next } = rowOrigin.get(tab);
          const entry = { id: itemId(tab), ...tabEntry(tab) };
          const matches = (e, el) => !!el && (el.localName === "tab"
            ? e.id === el.getAttribute(ITEM_ID)
            : isGroup(el)
              ? e.folder?.id === folderId(el)
              : isSplit(el) && el.tabs.some(t => t.getAttribute(ITEM_ID) === e.id));
          const folder = group?.isConnected ? saved.block.find(e => e.folder?.id === folderId(group)) : null;
          const list = folder ? folder.tabs : saved.block;
          const at = list.findIndex(e => matches(e, next));
          list.splice(at === -1 ? list.length : at, 0, entry);
        }
        return saved;
      };
      // (a closing tab may still be in the list while its row slides shut:
      // it's not saved)
      const savedSnapshot = keepTab => {
        const keep = t => !t.closing && keepTab(t);
        return {
          tiles: gBrowser.tabs.filter(t => t.pinned && !t.closing).map(t => ({ id: itemId(t), ...tabEntry(t) })),
          // (a split view's rows are saved as rows; its guest isn't saved)
          block: listItems().filter(inBlock).filter(item => !item.closing && (!isGroup(item) || item.tabs.some(t => !t.closing))).flatMap(item =>
            isGroup(item)
              ? {
                  folder: { id: folderId(item), label: item.label, color: item.color, collapsed: item.collapsed },
                  tabs: item.tabs.filter(t => isRow(t) && keep(t)).map(t => ({ id: itemId(t), ...tabEntry(t) })),
                }
              : isSplit(item)
                ? item.tabs.filter(t => isRow(t) && keep(t)).map(t => ({ id: itemId(t), ...tabEntry(t) }))
                : { id: itemId(item), ...tabEntry(item) }
          ),
        };
      };
      // The first browser window restores the list at launch; another one
      // builds it from the shared list when it opens. A window saves only once
      // it has (an earlier save would drop whatever isn't there yet), and not
      // while it's following another window's change.
      const firstWindow = [...win.Services.wm.getEnumerator("navigator:browser")].length === 1;
      let rowsRestored = false;
      let syncing = false;
      let writing = false; // this window is saving: not a change to follow
      let saveTimer = null;
      const scheduleSave = () => {
        if (isPrivate || !rowsRestored || syncing) {
          return;
        }
        win.clearTimeout(saveTimer);
        saveTimer = win.setTimeout(() => {
          saveTimer = null;
          const { tiles, block } = snapshot();
          writing = true;
          try {
            prefs.setStringPref(ROWS_PREF, JSON.stringify(block));
            prefs.setStringPref(TILES_PREF, JSON.stringify(tiles));
          } finally {
            writing = false;
          }
        }, 400);
      };
      const restoreRows = () => {
        // Tabs that Firefox itself restored with the mark (crash recovery,
        // session restore; folders come back with them)
        const marked = [...gBrowser.tabs].filter(tab => {
          try {
            return SessionStore.getCustomTabValue(tab, ROW) === "1";
          } catch {
            return false;
          }
        });
        if (marked.length) {
          // keep their original order: mark them all first, then line them up
          for (const tab of marked) {
            tab.setAttribute(ROW, "");
          }
          // Firefox restores split views too: a row comes back on its own,
          // its guest with the normal tabs (see normalize)
          for (const split of [...gBrowser.splitViews]) {
            if (hasRow(split)) {
              for (const tab of split.tabs) {
                tab.toggleAttribute(GUEST, !isRow(tab));
              }
              split.unsplitTabs();
            }
          }
          for (const tab of marked) {
            moveToRowBlockEnd(tab.group ?? tab);
          }
          normalize();
          return;
        }
        let saved = [];
        try {
          saved = JSON.parse(prefs.getStringPref(ROWS_PREF, "[]"));
        } catch {}
        const openRow = entry => {
          const tab = createItem(entry, false);
          moveToRowBlockEnd(tab);
          return tab;
        };
        // each item goes to the end of the block, so the saved order holds
        for (const entry of saved) {
          if (entry.folder) {
            const tabs = (entry.tabs || []).map(openRow);
            if (!tabs.length) {
              continue;
            }
            const { id, label, color, collapsed } = entry.folder;
            // (its saved id, unless another folder has it already)
            const group = gBrowser.addTabGroup(tabs, { id: gBrowser.getTabGroupById(id) ? null : id, label, color });
            if (group) {
              group.setAttribute("arc-folder-id", id || group.id);
              moveToRowBlockEnd(group);
              group.collapsed = !!collapsed;
            }
          } else if (entry.url) {
            openRow(entry);
          }
        }
        scheduleSave();
      };
      // Restored once Firefox's own session restore (the tiles) is done: it
      // dissolved folders made before it, leaving their tabs as plain rows.
      // Another window builds the list from the shared one instead.
      guard("saving and restoring", () => {
        if (!isPrivate) {
          SessionStore.promiseAllWindowsRestored.then(() => {
            try {
              if (firstWindow) {
                restoreRows();
              } else {
                reconcile();
              }
            } finally {
              rowsRestored = true;
              scheduleSave();
            }
          });
        }
        // Pinned tabs start on their pinned page (tiles come back from
        // Firefox's session where they were left). One without a recorded
        // pinned page takes the page it shows now. Done once the window's
        // own tabs are restored too: with several windows, Firefox says
        // they're all restored before a later one's tabs are filled in (its
        // tiles looked blank then, and came back where they were left)
        const startOnPinnedPages = () => {
          for (const tab of gBrowser.tabs) {
            if (isPinnedish(tab)) {
              ensureHome(tab);
              if (isAway(tab)) {
                goHome(tab);
              }
            }
          }
        };
        SessionStore.promiseAllWindowsRestored.then(startOnPinnedPages);
        win.addEventListener("SSWindowRestored", startOnPinnedPages, { once: true });
        gBrowser.tabContainer.addEventListener("TabAttrModified", e => {
          const tab = e.target;
          // the pinned page's title and icon: the page's own, once it has loaded
          // (when the pinned page is recorded it may still show the address)
          const home = isPinnedish(tab) && !tab.hasAttribute("busy") && !tab.hasAttribute("pending") && getHome(tab);
          const icon = home && (iconOf(tab) || home.icon);
          const cleanUrl = home && withoutChallenge(home.url);
          if (home && (home.title !== tab.label || home.icon !== icon || home.url !== cleanUrl) && samePage(pageUrl(tab), home.url)) {
            setHome(tab, { ...home, url: cleanUrl, title: tab.label, icon });
          } else if (isRow(tab)) {
            scheduleSave();
          }
        });
        gBrowser.tabContainer.addEventListener("TabMove", e => isPinnedish(e.target) && scheduleSave());
        gBrowser.tabContainer.addEventListener("TabClose", e => {
          if (!isPinnedish(e.target)) {
            return;
          }
          // dragged into another window: it's still in the shared list, so
          // this window gets its own copy back instead of dropping it everywhere
          if (e.detail?.adoptedBy) {
            win.setTimeout(() => reconcile(), 300);
            return;
          }
          scheduleSave();
        });
        gBrowser.tabContainer.addEventListener("TabPinned", scheduleSave);
        gBrowser.tabContainer.addEventListener("TabUnpinned", scheduleSave);
        for (const type of ["TabGroupCreate", "TabGrouped", "TabUngrouped", "TabGroupRemoved", "SplitViewCreated", "SplitViewRemoved"]) {
          gBrowser.tabContainer.addEventListener(type, scheduleNormalize);
        }
        // A folder made from the menu moves into the block before Firefox
        // opens its "name this folder" panel next to it
        gBrowser.tabContainer.addEventListener("TabGroupCreateByUser", normalize, true);
        for (const type of ["TabGroupUpdate", "TabGroupCollapse", "TabGroupExpand"]) {
          gBrowser.tabContainer.addEventListener(type, scheduleSave);
        }
        gBrowser.addTabsProgressListener({
          onLocationChange(browser) {
            const tab = gBrowser.getTabForBrowser(browser);
            if (tab && isPinnedish(tab)) {
              ensureHome(tab);
              updateAway(tab);
            }
          },
        });
      });

