// >>> ARC SIDEBAR SHORTCUT >>>
// Appended to librewolf.cfg by arc-shortcut/install.sh.
// Cmd+S switches the sidebar between "always show" and "expand on hover".
// A sidebar button next to the window buttons does the same; no sidebar gear.
// Cmd+D toggles a pinned row, Cmd+Shift+D a favorite tile (Arc-style).
// Tab groups are kept as pinned folders (saved and restored with the rows).
// Keeps an edit in the floating URL bar floating when the sidebar opens.
// Cmd+T / + New Tab open the floating URL bar; Enter opens the new tab.
// New windows (and launch) start with that bar instead of a blank tab.
// Closing a row, a tile or the last tab never loads an unloaded row; Cmd+W
// on the empty page does nothing.
// Pinned rows and tiles remember their pinned page (dot while away).
// Selected tiles take their icon's colors (as in Zen).
// Cmd+Shift+C copies the page's address; Cmd+1…9 go to the tiles, then the rows.
try {
  (() => {
    const Cc = Components.classes;
    const Ci = Components.interfaces;
    const prefs = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch);
    const obs = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
    const PREF = "sidebar.visibility";
    // Dragging a tab onto another one reorders it (as in Arc) instead of
    // pausing to create a tab group. Set here: LibreWolf's own defaults load
    // after the app's defaults/pref files and would override it there.
    Cc["@mozilla.org/preferences-service;1"]
      .getService(Ci.nsIPrefService)
      .getDefaultBranch("")
      .setBoolPref("browser.tabs.dragDrop.createGroup.enabled", false);

    function toggleSidebarMode() {
      const current = prefs.getStringPref(PREF, "always-show");
      prefs.setStringPref(PREF, current === "expand-on-hover" ? "always-show" : "expand-on-hover");
    }

    obs.addObserver(win => {
      const doc = win.document;
      // Marks the window as running this script: userChrome.css shows a
      // notice when it's missing (e.g. after a LibreWolf update replaced it)
      doc.documentElement.setAttribute("arc-script", "");
      // Reuse the existing Cmd+S key: detach it from "Save Page" and run our toggle instead
      const key = doc.getElementById("key_savePage");
      if (!key) {
        return;
      }
      key.removeAttribute("command");
      key.addEventListener("command", toggleSidebarMode);
      // Drop the now-wrong "⌘S" hint next to File > Save Page As (the menu item still works)
      doc.getElementById("menu_savePage")?.removeAttribute("key");

      // A sidebar button right after the window buttons does the same as
      // Cmd+S (its icon comes from userChrome.css)
      const buttonbox = doc.querySelector("#nav-bar > .titlebar-buttonbox-container");
      if (buttonbox) {
        const sidebarButton = doc.createXULElement("toolbarbutton");
        sidebarButton.id = "arc-sidebar-button";
        sidebarButton.className = "toolbarbutton-1";
        sidebarButton.setAttribute("tooltiptext", "Show or Auto-Hide Sidebar (⌘S)");
        sidebarButton.addEventListener("command", toggleSidebarMode);
        buttonbox.after(sidebarButton);
      }

      // No "Customize sidebar" gear in the sidebar's bottom row (it lives in
      // the sidebar's shadow DOM, which userChrome.css can't reach). Its
      // settings stay in Settings > General > Browser layout. Without it
      // LibreWolf shows a "More tools" button, with nothing to show in it.
      const sidebarMain = doc.querySelector("sidebar-main");
      if (sidebarMain) {
        win.customElements.whenDefined("sidebar-main").then(() => sidebarMain.updateComplete).then(() => {
          const style = doc.createElementNS("http://www.w3.org/1999/xhtml", "style");
          // The remaining buttons (Bookmarks, History) get the style of every
          // other icon button: 8px corners and the tab rows' hover / pressed
          // fills instead of round, accent-tinted ones, 34px apart, the first
          // icon in line with the tab icons
          style.textContent = `
            moz-button[view="viewCustomizeSidebar"], .more-tools-button { display: none !important; }
            .tools-and-extensions { gap: 4px !important; padding-inline-start: 9px !important; }
            .tools-and-extensions moz-button {
              --button-size-icon: 30px !important; /* LibreWolf sizes them from the tab height */
              --button-border-radius: var(--arc-radius-inner) !important;
              --button-background-color-ghost-hover: var(--arc-fill-hover) !important;
              --button-background-color-ghost-active: var(--arc-fill-selected) !important;
            }`;
          sidebarMain.shadowRoot?.append(style);
        });
      }

      // Tiles stay a grid with the sidebar on auto-hide too (LibreWolf turns
      // them into a list there): the grid lives inside the pinned area's
      // shadow DOM, which userChrome.css can't reach. Same values LibreWolf
      // uses for the pinned sidebar.
      const pinnedArea = doc.getElementById("pinned-tabs-container");
      if (pinnedArea?.shadowRoot) {
        const style = doc.createElementNS("http://www.w3.org/1999/xhtml", "style");
        style.textContent = `
          :host([orient="vertical"]) [part~="items-wrapper"] {
            display: grid !important;
            grid-template-columns: repeat(auto-fit, minmax(var(--tab-pinned-min-width), auto)) !important;
            grid-auto-rows: var(--tab-height-with-margin-padding) !important;
            padding-inline: var(--tab-container-margin-inline-pinned-expanded) !important;
          }`;
        pinnedArea.shadowRoot.append(style);
      }

      // Favorite tiles, pinned rows and folders (Arc-style).
      //   Tiles are LibreWolf's own pinned tabs (Cmd+Shift+D).
      //   Pinned rows are normal tabs marked [arc-pinned-row], always kept at
      //   the top of the tab list above the divider (Cmd+D). Folders are
      //   LibreWolf's tab groups, kept in that same pinned block; their tabs
      //   are pinned rows too. The script saves the block (pref
      //   arc.pinnedRows) and reopens it, unloaded, at startup. Closing a row
      //   unloads it but keeps it.
      // Keeping rows out of LibreWolf's pinned grid lets its own drag and
      // drop work: dragging between rows and normal tabs is plain reordering.
      const gBrowser = win.gBrowser;
      const SessionStore = win.SessionStore;
      const dragRoot = doc.documentElement; // carries the drag state attributes
      const ROW = "arc-pinned-row";
      const ROWS_PREF = "arc.pinnedRows";
      const isRow = tab => tab.hasAttribute(ROW);
      const isGroup = el => el?.localName === "tab-group";
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
      // without LibreWolf's end-of-list box
      const listItems = () =>
        [...gBrowser.tabContainer.arrowScrollbox.children].filter(el => el.id !== "tabbrowser-arrowscrollbox-periphery");
      // The pinned block: rows and folders, always together at the top
      const inBlock = el => isGroup(el) || (el?.localName === "tab" && isRow(el));
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
      // Run after anything that may have broken that (LibreWolf adds tabs to
      // folders and creates folders where it likes).
      let normalizing = false;
      const leavingFolder = new WeakSet(); // links opened from folder tabs
      const normalize = () => {
        if (normalizing || dragRoot.hasAttribute("arc-dragging")) {
          return;
        }
        normalizing = true;
        try {
          for (const group of gBrowser.tabGroups) {
            for (const tab of group.tabs) {
              if (!isRow(tab) && !leavingFolder.has(tab)) {
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
      // kind LibreWolf lets the script set, and small enough for the pref.
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
        if (home.icon) {
          state.image = home.icon;
        }
        SessionStore.setTabState(tab, JSON.stringify(state));
        if (home.icon) {
          try {
            gBrowser.setIcon(tab, home.icon);
          } catch {}
        }
        win.setTimeout(() => updateAway(tab), 0);
      };
      const tabEntry = tab => {
        const home = getHome(tab);
        return home ? { url: home.url, title: home.title, icon: home.icon } : { url: tabUrl(tab), title: tab.label, icon: iconOf(tab) };
      };
      // Only the first browser window owns the rows: it restores them and is
      // the only one that saves them (another window would save its own,
      // empty, list over them), and only once they're restored (an earlier
      // save would drop whatever isn't back yet)
      const firstWindow = [...win.Services.wm.getEnumerator("navigator:browser")].length === 1;
      let rowsRestored = false;
      let saveTimer = null;
      const scheduleSave = () => {
        if (!firstWindow || !rowsRestored) {
          return;
        }
        win.clearTimeout(saveTimer);
        saveTimer = win.setTimeout(() => {
          // [{url, title}] for a row, {folder: {...}, tabs: [...]} for a folder
          const block = listItems().filter(inBlock).map(item =>
            isGroup(item)
              ? {
                  folder: { id: item.id, label: item.label, color: item.color, collapsed: item.collapsed },
                  tabs: item.tabs.map(tabEntry),
                }
              : tabEntry(item)
          );
          prefs.setStringPref(ROWS_PREF, JSON.stringify(block));
        }, 400);
      };
      const restoreRows = () => {
        // Tabs that LibreWolf itself restored with the mark (crash recovery,
        // session restore; folders come back with them) or that use the old
        // pinned-row style
        const marked = [...gBrowser.tabs].filter(tab => {
          try {
            return SessionStore.getCustomTabValue(tab, ROW) === "1";
          } catch {
            return false;
          }
        });
        if (marked.length) {
          // keep their original order: unpin all first, then line them up
          for (const tab of marked) {
            if (tab.pinned) {
              gBrowser.unpinTab(tab);
            }
            tab.setAttribute(ROW, "");
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
        const principal = win.Services.scriptSecurityManager.getSystemPrincipal();
        const openRow = entry => {
          const lazy = !/^about:/.test(entry.url);
          const tab = gBrowser.addTab(entry.url, {
            triggeringPrincipal: principal,
            createLazyBrowser: lazy,
            lazyTabTitle: lazy ? entry.title : undefined,
            skipAnimation: true,
          });
          tab.setAttribute(ROW, "");
          try {
            SessionStore.setCustomTabValue(tab, ROW, "1");
            SessionStore.setCustomTabValue(tab, HOME, JSON.stringify({ url: entry.url, title: entry.title, icon: entry.icon }));
          } catch {}
          if (entry.icon) {
            try {
              gBrowser.setIcon(tab, entry.icon);
            } catch {}
          }
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
            let group = null;
            try {
              group = gBrowser.addTabGroup(tabs, { id: gBrowser.getTabGroupById?.(id) ? null : id, label, color });
            } catch {
              group = gBrowser.addTabGroup(tabs, { label, color });
            }
            if (group) {
              moveToRowBlockEnd(group);
              group.collapsed = !!collapsed;
            }
          } else if (entry.url) {
            openRow(entry);
          }
        }
        scheduleSave();
      };
      // Restored once LibreWolf's own session restore (the tiles) is done: it
      // dissolved folders made before it, leaving their tabs as plain rows
      if (firstWindow) {
        SessionStore.promiseAllWindowsRestored.then(() => {
          try {
            restoreRows();
          } finally {
            rowsRestored = true;
            scheduleSave();
          }
        });
      }
      // Pinned tabs start on their pinned page (tiles come back from
      // LibreWolf's session where they were left). Ones pinned before this
      // feature take the page they show now.
      SessionStore.promiseAllWindowsRestored?.then(() => {
        for (const tab of gBrowser.tabs) {
          if (isPinnedish(tab)) {
            ensureHome(tab);
            if (isAway(tab)) {
              goHome(tab);
            }
          }
        }
      });
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
      gBrowser.tabContainer.addEventListener("TabMove", e => isRow(e.target) && scheduleSave());
      gBrowser.tabContainer.addEventListener("TabClose", e => isRow(e.target) && scheduleSave());
      for (const type of ["TabGroupCreate", "TabGrouped", "TabUngrouped", "TabGroupRemoved"]) {
        gBrowser.tabContainer.addEventListener(type, scheduleNormalize);
      }
      // A folder made from the menu moves into the block before LibreWolf
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

      // --- shortcuts ---
      const toggleRow = () => {
        const makeRow = !isRow(gBrowser.selectedTab);
        for (const tab of [...gBrowser.selectedTabs]) {
          if (makeRow) {
            if (tab.pinned) {
              gBrowser.unpinTab(tab);
            }
            setRow(tab, true);
            moveToRowBlockEnd(tab);
          } else {
            gBrowser.ungroupTab(tab);
            setRow(tab, false);
            moveToRowBlockEnd(tab); // first place below the rows
          }
        }
      };
      const toggleTile = () => {
        const makeTile = !gBrowser.selectedTab.pinned;
        for (const tab of [...gBrowser.selectedTabs]) {
          if (makeTile) {
            setRow(tab, false);
            gBrowser.pinTab(tab);
          } else {
            gBrowser.unpinTab(tab);
          }
        }
      };
      const rebind = (keyId, menuId, handler) => {
        const key = doc.getElementById(keyId);
        if (key) {
          key.removeAttribute("command");
          key.addEventListener("command", handler);
          // The menu item keeps working, just without the shortcut hint
          doc.getElementById(menuId)?.removeAttribute("key");
        }
      };
      // One press must never toggle twice (it may arrive through both routes)
      let lastRun = -1000;
      const run = (fn, via) => {
        const now = win.performance.now();
        if (now - lastRun < 300) {
          return;
        }
        lastRun = now;
        try {
          fn();
        } catch (e) {
          console.error(`Arc sidebar (${via}):`, e);
        }
      };
      rebind("addBookmarkAsKb", "menu_bookmarkThisPage", () => run(toggleRow, "key-command"));   // Cmd+D (was Bookmark This Page)
      rebind("bookmarkAllTabsKb", "menu_bookmarkAllTabs", () => run(toggleTile, "key-command")); // Cmd+Shift+D (was Bookmark All Tabs)
      // Direct route: catch the key press itself before anything else does
      win.addEventListener("keydown", e => {
        if (e.code === "KeyD" && e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          e.stopPropagation();
          run(e.shiftKey ? toggleTile : toggleRow, "keydown");
        }
      }, true);

      // A short confirmation over the page, e.g. "Link Copied" (styled in
      // userChrome.css as #arc-toast)
      let toast = null;
      let toastTimer = null;
      const showToast = text => {
        if (!toast) {
          toast = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
          toast.id = "arc-toast";
          toast.setAttribute("role", "status");
          doc.body.append(toast);
        }
        const page = doc.getElementById("tabbrowser-tabbox")?.getBoundingClientRect();
        if (page) {
          toast.style.left = `${page.left + page.width / 2}px`;
          toast.style.top = `${page.bottom - 24}px`;
        }
        toast.textContent = text;
        toast.toggleAttribute("shown", false);
        toast.getBoundingClientRect(); // restart the animation
        toast.toggleAttribute("shown", true);
        win.clearTimeout(toastTimer);
        toastTimer = win.setTimeout(() => toast.toggleAttribute("shown", false), 1500);
      };

      // Cmd+Shift+C copies the page's address (as in Arc). It was the
      // developer tools' element picker (Cmd+Option+C still opens them).
      const copyAddress = () => {
        const url = gBrowser.selectedBrowser.currentURI?.spec;
        if (!url || win.isBlankPageURL(url) || gBrowser.selectedTab.hasAttribute("arc-start-page")) {
          return;
        }
        Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper).copyString(url);
        showToast("Link Copied");
      };
      doc.getElementById("key_inspectorMac")?.setAttribute("disabled", "true");

      // Cmd+1…9 go to the tiles in order, then on to the pinned rows (a
      // collapsed folder's rows don't count). LibreWolf's own (the 1st to 8th
      // tab, the last tab) counted every tab, rows and folders in between.
      const pinnedInOrder = () => [
        ...gBrowser.tabs.filter(t => t.pinned),
        ...gBrowser.tabs.filter(t => !t.pinned && isRow(t) && !t.group?.collapsed),
      ];
      for (const id of ["key_selectTab1", "key_selectTab2", "key_selectTab3", "key_selectTab4", "key_selectTab5",
                        "key_selectTab6", "key_selectTab7", "key_selectTab8", "key_selectLastTab"]) {
        doc.getElementById(id)?.setAttribute("disabled", "true");
      }

      win.addEventListener("keydown", e => {
        if (!e.metaKey || e.ctrlKey || e.altKey) {
          return;
        }
        if (e.code === "KeyC" && e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          copyAddress();
          return;
        }
        const n = /^Digit([1-9])$/.exec(e.code)?.[1];
        if (n && !e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          const tab = pinnedInOrder()[n - 1];
          if (tab) {
            gBrowser.selectedTab = tab;
          }
        }
      }, true);

      // --- keeping the row block intact ---
      // A tile is never a row. A tab opened inside the block (a link from a
      // row or a folder tab: it has an opener) goes below it, as in Arc; one
      // added to a folder on purpose ("New Tab in Group") becomes a row of
      // that folder.
      gBrowser.tabContainer.addEventListener("TabPinned", e => {
        if (isRow(e.target)) {
          setRow(e.target, false);
        }
        ensureHome(e.target);
      });
      gBrowser.tabContainer.addEventListener("TabUnpinned", e => forgetHomeLater(e.target));
      gBrowser.tabContainer.addEventListener("TabOpen", e => {
        const tab = e.target;
        if (tab.group && tab.openerTab) {
          leavingFolder.add(tab);
        }
        win.setTimeout(() => {
          if (!tab.isConnected || tab.pinned || isRow(tab)) {
            return;
          }
          if (tab.group) {
            if (leavingFolder.has(tab)) {
              leavingFolder.delete(tab);
              gBrowser.ungroupTab(tab);
              moveToRowBlockEnd(tab);
            } else {
              scheduleNormalize();
            }
            return;
          }
          const items = listItems();
          if (items.slice(items.indexOf(tab) + 1).some(inBlock)) {
            moveToRowBlockEnd(tab);
          }
        }, 0);
      });

      // No new tab from the tab list's empty space: LibreWolf opens one on a
      // double-click there (which includes the gaps between rows, so it
      // seemed random) or a middle-click below the last tab, bypassing the
      // New Tab command and its floating URL bar. Middle-clicking a tab or a
      // folder still works.
      gBrowser.tabContainer.addEventListener("dblclick", e => {
        if (e.target === gBrowser.tabContainer.arrowScrollbox) {
          e.stopPropagation();
          e.preventDefault();
        }
      }, true);
      gBrowser.tabContainer.addEventListener("click", e => {
        if (e.button === 1 && !e.target.closest?.("tab, tab-group, .tab-group-label-container")) {
          e.stopPropagation();
          e.preventDefault();
        }
      }, true);

      // --- + New Tab right under the divider (as in Arc) ---
      // userChrome.css shows LibreWolf's end-of-list box (which holds the
      // button) there. While dragging, LibreWolf measures that box as the end
      // of the tab list, so it's told where the list really ends.
      const periphery = doc.getElementById("tabbrowser-arrowscrollbox-periphery");
      let listEndScreenY = null;
      let screenYDesc = null;
      for (let proto = periphery && Object.getPrototypeOf(periphery); proto && !screenYDesc; proto = Object.getPrototypeOf(proto)) {
        screenYDesc = Object.getOwnPropertyDescriptor(proto, "screenY");
      }
      if (screenYDesc?.get) {
        Object.defineProperty(periphery, "screenY", {
          configurable: true,
          get() {
            return listEndScreenY ?? screenYDesc.get.call(this);
          },
        });
      }

      // --- drag and drop ---
      // Dropped above the divider (inside the row block) -> pinned row; below
      // it -> normal tab. The divider position is taken when the drag starts,
      // before LibreWolf shifts anything. Tiles are LibreWolf's own business,
      // except that LibreWolf puts an unpinned tile first; it goes where it
      // was dropped instead.
      const TAB_DROP_TYPE = "application/x-moz-tabbrowser-tab";
      let dividerY = null;
      let startMids = [];
      let slotHeight = 0;
      let folderSlot = 0; // height of a folder being dragged
      let firstSlotTop = null;
      // How far a tab is drawn from its place while dragging: LibreWolf's own
      // offsets (style top + transform) plus [arc-make-room]
      const shiftOf = t =>
        (parseFloat(t.style.top) || 0) +
        (Number(/translateY\((-?[\d.]+)px\)/.exec(t.style.transform)?.[1]) || 0) +
        (t.hasAttribute("arc-make-room") ? slotHeight : 0);
      let pendingDrop = null;
      // What LibreWolf moves while dragging: tabs and folder labels (their
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
      const placeAt = (tab, y, moving) => {
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
      // Place it in the same frame LibreWolf unpins it, so it never shows up
      // at the top first
      gBrowser.tabContainer.addEventListener("TabUnpinned", e => {
        if (pendingDrop?.wasTile.includes(e.target)) {
          placeAt(e.target, pendingDrop.y, pendingDrop.moving);
          if (pendingDrop.toRow) {
            setRow(e.target, true);
          }
        }
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
        if (folderLabel) {
          // it's lifted out of the layout while dragged: + New Tab keeps its place
          const cs = win.getComputedStyle(folderLabel);
          folderSlot = folderLabel.getBoundingClientRect().height + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom);
          periphery?.style.setProperty("--arc-newtab-shift", `${folderSlot}px`);
          const group = folderLabel.closest("tab-group");
          const blockEls = els.filter(el => inBlockEl(el) && (el === folderLabel || !group.contains(el)));
          listEndScreenY = Math.max(...blockEls.map(el => el.getBoundingClientRect().bottom)) + win.mozInnerScreenY;
        }
        dragRoot.setAttribute("arc-dragging", "");
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
          // no rows yet and the first tab itself is dragged (LibreWolf can't
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
        // (not ownerGlobal === win: here win is a cross-compartment wrapper)
        if (!gBrowser.tabs.includes(dragged)) {
          return;
        }
        const moving = dragged.multiselected ? [...gBrowser.selectedTabs] : [dragged];
        const y = e.clientY;
        const limit = dividerY;
        // Mark it right away, as the cue showed (rows sort above + New Tab, so
        // a late mark would make it jump); finishDrop double-checks
        const toRow = headsForRow(y);
        for (const tab of moving) {
          if (!tab.pinned && isRow(tab) !== toRow) {
            setRow(tab, toRow);
          }
        }
        const drop = { moving, y, limit, toRow, wasTile: moving.filter(t => t.pinned) };
        pendingDrop = drop;
        win.setTimeout(() => finishDrop(drop), 400);
      }, true);
      // No extra macOS drag preview (the big page thumbnail): the dragged tab
      // itself follows the pointer, as in Arc and Safari
      const blankDragImage = new win.Image();
      blankDragImage.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
      gBrowser.tabContainer.addEventListener("dragstart", e => {
        if (e.dataTransfer?.mozTypesAt(0)?.[0] === TAB_DROP_TYPE) {
          e.dataTransfer.setDragImage(blankDragImage, 0, 0);
        }
      });
      // On macOS LibreWolf swaps in a page thumbnail once it's captured
      // (updateDragImage); ignore that for tab drags
      const updateDragImage = win.DataTransfer.prototype.updateDragImage;
      if (updateDragImage) {
        win.DataTransfer.prototype.updateDragImage = function (...args) {
          if (this.mozTypesAt?.(0)?.[0] === TAB_DROP_TYPE) {
            return undefined;
          }
          return updateDragImage.apply(this, args);
        };
      }
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
        // + New Tab follows the rows: as far as LibreWolf has moved the last
        // one, and a slot down while the dragged tab is headed for them
        const rows = movables().filter(el => inBlockEl(el) && !el.hasAttribute("dragtarget"));
        const shift = Math.max(rows.length ? shiftOf(rows.at(-1)) : 0, toRow ? slotHeight : 0, folderSlot);
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
      const endDrag = () => {
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
      gBrowser.tabContainer.addEventListener("dragend", endDrag, true);
      gBrowser.tabContainer.addEventListener("drop", endDrag, true);
      gBrowser.tabContainer.addEventListener("dragleave", e => {
        if (!gBrowser.tabContainer.contains(e.relatedTarget)) {
          endDrag();
        }
      }, true);

      // --- closing a pinned row or tile resets it instead ---
      // It goes back to its pinned page, unloaded (except when its whole
      // folder is deleted: then its tabs really close)
      const closingFolderTabs = new WeakSet();
      const removeTabGroup = gBrowser.removeTabGroup.bind(gBrowser);
      gBrowser.removeTabGroup = (group, options) => {
        for (const tab of group.tabs) {
          closingFolderTabs.add(tab);
        }
        return removeTabGroup(group, options);
      };
      // Where to go after closing a pinned row or tile: the most recently used
      // open (loaded) pinned row, else open normal tab, else the empty page
      // with the floating URL bar, as at launch (set up by the new tab bar
      // below; a new tab page if that's missing)
      let openStartPage = null;
      const nextAfterClose = closing => {
        const open = gBrowser.tabs.filter(t => t !== closing && !t.hidden && !t.pinned && t.linkedPanel &&
          !t.hasAttribute("pending") && !t.hasAttribute("arc-start-page"));
        const latest = tabs => tabs.reduce((a, b) => (!a || b.lastAccessed > a.lastAccessed ? b : a), null);
        return latest(open.filter(isRow)) || latest(open.filter(t => !isRow(t))) ||
          (openStartPage ? openStartPage() : gBrowser.addTrustedTab(win.BROWSER_NEW_TAB_URL));
      };
      const resetClosed = tab => {
        if (isAway(tab)) {
          goHome(tab);
        } else {
          gBrowser.discardBrowser(tab, true);
        }
        // never left marked as the tab on screen (see below)
        if (!tab.selected && tab.hasAttribute("visuallyselected")) {
          tab.removeAttribute("visuallyselected");
        }
      };
      // LibreWolf switches tabs asynchronously and keeps the old tab marked
      // as the one on screen ([visuallyselected]) until the new one is drawn.
      // A tab unloaded before that kept the mark for good, and was drawn with
      // LibreWolf's own selected style (black in dark themes). So the closed
      // tab is reset once the switch is done. The event can fire during the
      // switch itself, hence listening before switching.
      const whenSwitched = fn => {
        let done = false;
        const run = () => {
          if (!done) {
            done = true;
            win.removeEventListener("TabSwitchDone", run);
            fn();
          }
        };
        win.addEventListener("TabSwitchDone", run);
        win.setTimeout(run, 1000);
      };
      const removeTab = gBrowser.removeTab.bind(gBrowser);
      gBrowser.removeTab = (tab, options) => {
        // The empty page (no tab open) has nothing to close: Cmd+W there would
        // let LibreWolf go to the tab next to it, often an unloaded pinned
        // row, and load it. It stays (the script removes it itself once
        // another tab is selected, while it's no longer the selected one).
        if (tab?.selected && tab.hasAttribute("arc-start-page")) {
          gBrowser.selectedBrowser.focus(); // closes the floating URL bar
          return undefined;
        }
        // Closing the last normal tab: LibreWolf would go to the tab next to
        // it, often an unloaded pinned row, and load it. Go where closing a
        // pinned row goes instead (an open row, else the empty page with the
        // floating URL bar). With other normal tabs open, LibreWolf decides.
        if (tab?.selected && !isPinnedish(tab) && !tab.hasAttribute("arc-start-page") &&
            !gBrowser.tabs.some(t => t !== tab && !t.closing && !t.hidden && !isPinnedish(t) && !t.hasAttribute("arc-start-page"))) {
          gBrowser.selectedTab = nextAfterClose(tab);
        }
        if (!tab || !isPinnedish(tab) || closingFolderTabs.has(tab)) {
          return removeTab(tab, options);
        }
        if (tab.selected) {
          whenSwitched(() => resetClosed(tab));
          gBrowser.selectedTab = nextAfterClose(tab);
        } else {
          resetClosed(tab);
        }
        return undefined;
      };

      // Cmd+W on a tile: LibreWolf never closes a tile from the keyboard (it
      // just jumps to the first unpinned tab); here it closes like a pinned
      // row does (reset, unloaded) and goes where nextAfterClose says
      const commands = win.BrowserCommands;
      const closeTabOrWindow = commands?.closeTabOrWindow;
      if (closeTabOrWindow) {
        commands.closeTabOrWindow = function (event) {
          if (!gBrowser.multiSelectedTabsCount && gBrowser.selectedTab.pinned) {
            gBrowser.removeTab(gBrowser.selectedTab);
            return;
          }
          return closeTabOrWindow.call(this, event);
        };
      }

      // Right-click: "Back to Pinned Page" / "Set Pinned Page to This Page",
      // on a pinned row or tile that's away from its pinned page
      const tabMenu = doc.getElementById("tabContextMenu");
      if (tabMenu) {
        const contextTab = () => win.TabContextMenu?.contextTab;
        const item = (label, action) => {
          const menuitem = doc.createXULElement("menuitem");
          menuitem.setAttribute("label", label);
          menuitem.addEventListener("command", () => {
            const tab = contextTab();
            if (tab) {
              action(tab);
            }
          });
          return menuitem;
        };
        const backItem = item("Back to Pinned Page", tab => goHome(tab));
        const setItem = item("Set Pinned Page to This Page", tab => setHome(tab, homeHere(tab)));
        const anchor = doc.getElementById("context_unpinTab") || doc.getElementById("context_pinTab");
        tabMenu.insertBefore(setItem, anchor?.nextSibling ?? tabMenu.firstChild);
        tabMenu.insertBefore(backItem, setItem);
        tabMenu.addEventListener("popupshowing", e => {
          if (e.target !== tabMenu) {
            return;
          }
          const tab = contextTab();
          const show = !!tab && isPinnedish(tab) && isAway(tab);
          backItem.hidden = !show;
          setItem.hidden = !show;
        });
      }

      // --- Tile colors (as in Zen) ---
      // A tile's icon gives it up to three colors (the most common saturated
      // ones; white, black, gray and transparent pixels don't count), set as
      // --arc-tile-c1..c3 with [arc-tile-colored]. userChrome.css paints the
      // selected tile with them; an icon without a clear color leaves the
      // tile neutral.
      const tileColorCache = new Map();
      const iconColors = url => {
        if (tileColorCache.has(url)) {
          return Promise.resolve(tileColorCache.get(url));
        }
        return new Promise(resolve => {
          const done = colors => {
            // (keyed by the icon itself, often a large data: address)
            if (tileColorCache.size >= 64) {
              tileColorCache.delete(tileColorCache.keys().next().value);
            }
            tileColorCache.set(url, colors);
            resolve(colors);
          };
          const img = doc.createElementNS("http://www.w3.org/1999/xhtml", "img");
          img.onerror = () => done(null);
          img.onload = () => {
            try {
              const size = 32;
              const canvas = doc.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
              canvas.width = canvas.height = size;
              const ctx = canvas.getContext("2d", { willReadFrequently: true });
              ctx.drawImage(img, 0, 0, size, size);
              const data = ctx.getImageData(0, 0, size, size).data;
              // group the colored pixels by hue (12 families, so a gradient
              // counts as one color), averaging each group
              const hue = (r, g, b) => {
                const max = Math.max(r, g, b);
                const d = max - Math.min(r, g, b) || 1;
                const h = max === r ? (g - b) / d : max === g ? 2 + (b - r) / d : 4 + (r - g) / d;
                return ((h * 60) + 360) % 360;
              };
              const groups = new Map();
              let colored = 0;
              for (let i = 0; i < data.length; i += 4) {
                const [r, g, b, alpha] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
                const max = Math.max(r, g, b);
                const min = Math.min(r, g, b);
                if (alpha < 128 || max < 48 || max - min < 0.25 * max || min > 220) {
                  continue;
                }
                colored++;
                const key = Math.round(hue(r, g, b) / 30) % 12;
                const group = groups.get(key) || { r: 0, g: 0, b: 0, n: 0 };
                group.r += r;
                group.g += g;
                group.b += b;
                group.n++;
                groups.set(key, group);
              }
              const ranked = [...groups.values()]
                .map(c => ({ r: c.r / c.n, g: c.g / c.n, b: c.b / c.n, n: c.n }))
                .sort((x, y) => y.n - x.n);
              // each color: at least 8% of the colored pixels (and 1.5% of the
              // icon, so a few stray pixels don't count), hues 35deg apart
              const minPixels = Math.max(colored * 0.08, size * size * 0.015);
              const hueGap = (x, y) => {
                const d = Math.abs(hue(x.r, x.g, x.b) - hue(y.r, y.g, y.b));
                return Math.min(d, 360 - d);
              };
              const picked = [];
              for (const c of ranked) {
                if (c.n < minPixels || picked.length === 3) {
                  break;
                }
                if (picked.every(p => hueGap(p, c) > 35)) {
                  picked.push(c);
                }
              }
              done(picked.length ? picked.map(c => `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`) : null);
            } catch (e) {
              done(null);
            }
          };
          img.src = url;
        });
      };
      const updateTileColors = tab => {
        const url = tab.getAttribute("image");
        // keep the last colors while an icon is briefly missing (loading)
        if (!tab.pinned || !url) {
          return;
        }
        iconColors(url).then(colors => {
          if (!tab.isConnected || tab.getAttribute("image") !== url) {
            return;
          }
          for (let i = 1; i <= 3; i++) {
            if (colors?.[i - 1]) {
              tab.style.setProperty(`--arc-tile-c${i}`, colors[i - 1]);
            } else {
              tab.style.removeProperty(`--arc-tile-c${i}`);
            }
          }
          tab.toggleAttribute("arc-tile-colored", !!colors);
        });
      };
      // A tile never sits without an icon either: LibreWolf clears it when a
      // new page starts loading (Reddit's bot check page has none, so at
      // launch its tile was blank for seconds); the one saved with its pinned
      // page fills in until the page brings its own
      gBrowser.tabContainer.addEventListener("TabAttrModified", e => {
        const tab = e.target;
        if (!tab.pinned || !e.detail?.changed?.includes("image")) {
          return;
        }
        const icon = !tab.getAttribute("image") && getHome(tab)?.icon;
        if (icon) {
          try {
            gBrowser.setIcon(tab, icon);
          } catch {}
          return; // (that change comes back here and updates the colors)
        }
        updateTileColors(tab);
      });
      gBrowser.tabContainer.addEventListener("TabPinned", e => updateTileColors(e.target));
      for (const tab of gBrowser.tabs) {
        updateTileColors(tab);
      }

      // Floating edit: an edit in the floating (Cmd+T) bar stays there even if
      // the sidebar opens. Marks the window while such an edit is in
      // progress; userChrome.css does the rest.
      const root = doc.documentElement;
      const urlbar = doc.getElementById("urlbar");
      const sidebar = doc.getElementById("sidebar-container");
      if (urlbar && sidebar) {
        const collapsed = () =>
          root.hasAttribute("sidebar-expand-on-hover") &&
          !sidebar.hasAttribute("sidebar-launcher-expanded");
        const engineMenuOpen = () =>
          !!urlbar.querySelector(".searchmode-switcher-panel-list:is([open], [showing])");
        // LibreWolf briefly takes focus away while the sidebar hides, so a
        // focus loss only ends the floating edit if it lasts a moment
        const END_DELAY_MS = 150;
        let endTimer = null;
        const editInProgress = () => urlbar.hasAttribute("focused") || engineMenuOpen();
        // Enter / Escape are a clear "done": end as soon as focus has left,
        // without the delay (so the bar doesn't linger)
        urlbar.addEventListener("keydown", e => {
          if (e.key === "Enter" || e.key === "Escape") {
            win.setTimeout(() => {
              if (!editInProgress()) {
                win.clearTimeout(endTimer);
                endTimer = null;
                root.removeAttribute("arc-floating-urlbar");
              }
            }, 30);
          }
        });
        const sync = () => {
          if (urlbar.hasAttribute("focused")) {
            win.clearTimeout(endTimer);
            endTimer = null;
            if (collapsed()) {
              root.setAttribute("arc-floating-urlbar", "");
            }
          } else if (!engineMenuOpen() && endTimer === null) {
            endTimer = win.setTimeout(() => {
              endTimer = null;
              if (!editInProgress()) {
                root.removeAttribute("arc-floating-urlbar");
              }
            }, END_DELAY_MS);
          }
        };
        const observer = new win.MutationObserver(sync);
        observer.observe(urlbar, { attributes: true, attributeFilter: ["focused"] });
        observer.observe(sidebar, { attributes: true, attributeFilter: ["sidebar-launcher-expanded"] });
        doc.addEventListener("popuphidden", sync);

        // A click in the sidebar or the toolbar (outside the URL bar) ends an
        // edit, as a click on the page does. The sidebar never takes the
        // focus, so the bar stayed open with only its suggestions gone.
        const urlbarContainer = doc.getElementById("urlbar-container");
        const endEditOnClick = e => {
          if (e.button === 0 && win.gURLBar?.focused && !urlbarContainer?.contains(e.target)) {
            gBrowser.selectedBrowser.focus();
          }
        };
        sidebar.addEventListener("mousedown", endEditOnClick, true);
        doc.getElementById("navigator-toolbox")?.addEventListener("mousedown", endEditOnClick, true);

        // New tab bar (Arc-style): Cmd+T and + New Tab open the floating URL
        // bar instead of a tab; the tab is created only when Enter loads
        // something (picking an open tab switches to it). Esc, clicking away
        // or pressing again closes it. While it's open the window is marked
        // [arc-newtab-bar]: userChrome.css floats the bar even with the
        // sidebar shown and highlights + New Tab.
        // Cmd+T and the New Tab menu items use the second command
        const newTabCommands = ["cmd_newNavigatorTab", "cmd_newNavigatorTabNoEvent"]
          .map(id => doc.getElementById(id))
          .filter(Boolean);
        const gURLBar = win.gURLBar;
        if (newTabCommands.length && gURLBar?.controller) {
          const barOpen = () => root.hasAttribute("arc-newtab-bar");
          let startTab = null;
          let closeTimer = null;
          let closedAt = -1000;
          let loading = false;
          const closeBar = () => {
            win.clearTimeout(closeTimer);
            closeTimer = null;
            if (!barOpen()) {
              return;
            }
            root.removeAttribute("arc-newtab-bar");
            // back in the sidebar at once, without its width animation
            root.setAttribute("arc-newtab-closing", "");
            win.requestAnimationFrame(() => win.requestAnimationFrame(() =>
              root.removeAttribute("arc-newtab-closing")));
            closedAt = win.performance.now();
            // After Enter, LibreWolf handles the address and the focus
            if (!loading) {
              if (gURLBar.focused) {
                gBrowser.selectedBrowser.focus();
              }
              // Nothing was opened: show the current page's address again
              if (gBrowser.selectedTab === startTab) {
                gURLBar.handleRevert();
              }
            }
            startTab = null;
            loading = false;
          };
          const openBar = () => {
            startTab = gBrowser.selectedTab;
            root.setAttribute("arc-newtab-bar", "");
            gURLBar.focus();
            gURLBar.value = "";
            // As if typing: the current page's badges (Not Secure, star, ...)
            // don't belong to the new tab
            gURLBar.setPageProxyState("invalid", true);
          };
          // Our listener on the commands themselves runs before LibreWolf's
          // (on the command set), which would open a tab
          const toggleBar = e => {
            e.stopPropagation();
            if (barOpen()) {
              closeBar();
            } else if (win.performance.now() - closedAt > 300) {
              // (a click on + New Tab while the bar was open may have closed
              // it already by taking the focus; that press means "close")
              openBar();
            }
          };
          for (const command of newTabCommands) {
            command.addEventListener("command", toggleBar);
          }
          // Enter loads in a new tab (an empty current tab is still reused)
          const controller = gURLBar.controller;
          const whereToOpen = controller.whereToOpen.bind(controller);
          controller.whereToOpen = event => {
            let where = whereToOpen(event);
            if (!barOpen()) {
              return where;
            }
            if (where === "current" && !gBrowser.selectedTab.isEmpty && gBrowser.selectedTab !== startPage) {
              where = "tab";
            }
            // Loading in this tab (an empty one) selects no other tab, so
            // close the bar here once the load has started
            loading = true;
            win.setTimeout(closeBar, 0);
            return where;
          };
          // Esc closes it at once (unless it's closing the engine menu)
          urlbar.addEventListener("keydown", e => {
            if (e.key === "Escape" && barOpen() && !engineMenuOpen()) {
              e.preventDefault();
              e.stopPropagation();
              closeBar();
            }
          }, true);
          // Focus leaving for a moment (not just LibreWolf's brief drop while
          // the sidebar moves) closes it; so does switching tabs
          const syncBar = () => {
            if (!barOpen()) {
              return;
            }
            if (editInProgress()) {
              win.clearTimeout(closeTimer);
              closeTimer = null;
            } else if (closeTimer === null) {
              closeTimer = win.setTimeout(() => {
                closeTimer = null;
                if (!editInProgress()) {
                  closeBar();
                }
              }, END_DELAY_MS);
            }
          };
          new win.MutationObserver(syncBar).observe(urlbar, { attributes: true, attributeFilter: ["focused"] });
          doc.addEventListener("popuphidden", syncBar);
          gBrowser.tabContainer.addEventListener("TabSelect", () => {
            closeBar();
            leaveStartPage();
          });

          // A new window (the first one at launch too) starts with the bar
          // instead of a blank tab. Its empty first tab stays out of the
          // sidebar ([arc-start-page]) as the page behind the bar: whatever
          // loads in it makes it a normal tab (Enter loads there), and if
          // another tab is selected while it's still empty, it's closed.
          let startPage = null;
          const keepStartPage = () => {
            startPage?.removeAttribute("arc-start-page");
            startPage = null;
          };
          function leaveStartPage() {
            if (!startPage || gBrowser.selectedTab === startPage) {
              return;
            }
            const tab = startPage;
            startPage = null;
            if (tab.isConnected && tab.isEmptyIgnoringLoad) {
              gBrowser.removeTab(tab, { animate: false });
            } else {
              tab.removeAttribute("arc-start-page");
            }
          }
          gBrowser.addTabsProgressListener({
            onLocationChange(browser, webProgress, request, location) {
              if (startPage && browser === startPage.linkedBrowser &&
                  webProgress.isTopLevel && !win.isBlankPageURL(location.spec)) {
                keepStartPage();
              }
            },
          });
          // Closing the last open row or tile lands on such a page too (made
          // here, or the window's current one); the bar opens once it's shown
          openStartPage = () => {
            const tab = startPage?.isConnected ? startPage : gBrowser.addTrustedTab(win.BROWSER_NEW_TAB_URL);
            startPage = tab;
            tab.setAttribute("arc-start-page", "");
            win.setTimeout(() => {
              if (gBrowser.selectedTab === tab && !barOpen()) {
                openBar();
              }
            }, 0);
            return tab;
          };
          win.SessionStore.promiseAllWindowsRestored.then(() => win.setTimeout(() => {
            const tab = gBrowser.selectedTab;
            if (tab.pinned || isRow(tab) || !tab.isEmptyIgnoringLoad) {
              return;
            }
            startPage = tab;
            tab.setAttribute("arc-start-page", "");
            openBar();
          }, 0));
        }
      }
    }, "browser-delayed-startup-finished");
  })();
} catch (e) {
  // Never let a failure here break the rest of librewolf.cfg
  try {
    console.error("Arc sidebar shortcut:", e);
  } catch {}
}
// <<< ARC SIDEBAR SHORTCUT <<<
