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
// Normal tabs unused for a day close by themselves (arc.archiveAfterHours).
// The auto-hide sidebar takes the pinned sidebar's measured color (theme, wallpaper).
// Every window shows the same tiles, rows and folders, kept in sync.
// Dragging a tab onto the page opens it in split view, on that side.
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
    const defaults = Cc["@mozilla.org/preferences-service;1"]
      .getService(Ci.nsIPrefService)
      .getDefaultBranch("");
    defaults.setBoolPref("browser.tabs.dragDrop.createGroup.enabled", false);
    // Auto-archive (see below): hours a normal tab may stay unused; 0 = off
    const ARCHIVE_PREF = "arc.archiveAfterHours";
    defaults.setIntPref(ARCHIVE_PREF, 24);

    // Option+click on a link in a page opens it in Peek, from any tab (as in
    // Zen). LibreWolf does nothing with it otherwise (no navigation, no
    // download): where a clicked link opens is decided in BrowserUtils, so
    // the click asks for a new tab in front, which the window then shows as a
    // Peek (see "Peek" below). Only clicks in pages: bookmarks, menus and the
    // URL bar keep their own meaning for Option. Set up once the first
    // window is open: loading LibreWolf's modules this early in start-up
    // (this file runs before almost anything) could stall it.
    let altPeekAt = 0;
    let altPeekHooked = false;
    const hookAltPeek = () => {
      if (altPeekHooked) {
        return;
      }
      altPeekHooked = true;
      try {
        const { BrowserUtils } = ChromeUtils.importESModule("resource://gre/modules/BrowserUtils.sys.mjs");
        const whereToOpenLink = BrowserUtils.whereToOpenLink;
        BrowserUtils.whereToOpenLink = function (e, ignoreButton, ignoreAlt) {
          const where = whereToOpenLink.call(this, e, ignoreButton, ignoreAlt);
          const fromPage = !!e && typeof e.href === "string" && "referrerInfo" in e;
          if (where === "current" && fromPage && e.altKey && !ignoreAlt && !e.shiftKey && !e.ctrlKey && !e.metaKey && e.button === 0) {
            altPeekAt = Date.now();
            return prefs.getBoolPref("browser.tabs.loadInBackground", true) ? "tabshifted" : "tab";
          }
          return where;
        };
      } catch (e) {
        console.error("Arc sidebar (Option+click Peek):", e);
      }
    };

    function toggleSidebarMode() {
      const current = prefs.getStringPref(PREF, "always-show");
      prefs.setStringPref(PREF, current === "expand-on-hover" ? "always-show" : "expand-on-hover");
    }

    obs.addObserver(win => {
      const doc = win.document;
      // Marks the window as running this script: userChrome.css shows a
      // notice when it's missing (e.g. after a LibreWolf update replaced it)
      doc.documentElement.setAttribute("arc-script", "");
      // (a window is open: LibreWolf is far enough along for this)
      win.setTimeout(hookAltPeek, 0);
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
        // its name for VoiceOver (toolbar buttons show only their icon)
        sidebarButton.setAttribute("label", "Sidebar");
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
          }
          /* a tile sliding into a new line while a tab is dragged over the
             tiles (LibreWolf fixes this box's height during drags) */
          :host([arc-tiles-growing]) [part~="scrollbox"] {
            overflow: visible !important;
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
      // Split views (two pages side by side) are LibreWolf's
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
      // without LibreWolf's end-of-list box
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
      // Tiles, rows and folders are the same in every window (as in Arc):
      // one shared list (prefs arc.tiles and arc.pinnedRows), in which each
      // item has an id ([arc-id] on its tab in every window, [arc-folder-id]
      // on a folder). A window where something changes saves the list; the
      // others follow it (see "the same sidebar in every window" below).
      // Private windows keep to themselves.
      const TILES_PREF = "arc.tiles";
      const ITEM_ID = "arc-id";
      const isPrivate = win.PrivateBrowsingUtils.isWindowPrivate(win);
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
      const savedSnapshot = keep => ({
        tiles: gBrowser.tabs.filter(t => t.pinned).map(t => ({ id: itemId(t), ...tabEntry(t) })),
        // (a split view's rows are saved as rows; its guest isn't saved)
        block: listItems().filter(inBlock).flatMap(item =>
          isGroup(item)
            ? {
                folder: { id: folderId(item), label: item.label, color: item.color, collapsed: item.collapsed },
                tabs: item.tabs.filter(t => isRow(t) && keep(t)).map(t => ({ id: itemId(t), ...tabEntry(t) })),
              }
            : isSplit(item)
              ? item.tabs.filter(t => isRow(t) && keep(t)).map(t => ({ id: itemId(t), ...tabEntry(t) }))
              : { id: itemId(item), ...tabEntry(item) }
        ),
      });
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
          // LibreWolf restores split views too: a row comes back on its own,
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
            let group = null;
            try {
              group = gBrowser.addTabGroup(tabs, { id: gBrowser.getTabGroupById?.(id) ? null : id, label, color });
            } catch {
              group = gBrowser.addTabGroup(tabs, { label, color });
            }
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
      // Restored once LibreWolf's own session restore (the tiles) is done: it
      // dissolved folders made before it, leaving their tabs as plain rows.
      // Another window builds the list from the shared one instead.
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
          const split = tab.splitview;
          if (makeRow) {
            if (tab.pinned) {
              gBrowser.unpinTab(tab);
            }
            // a split view goes along, unless it's in the block already
            const placed = split && inBlock(split.group ?? split);
            setRow(tab, true);
            if (!placed) {
              moveToRowBlockEnd(split ?? tab);
            }
          } else if (split) {
            setRow(tab, false);
            if (!hasRow(split)) {
              if (split.group) {
                gBrowser.ungroupSplitView(split);
              }
              moveToRowBlockEnd(split); // first place below the rows
            }
            scheduleNormalize();
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
            moveToRowBlockEnd(tab); // (LibreWolf puts it first, above the rows)
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

      // --- the auto-hide sidebar's color ---
      // The pinned sidebar shows macOS's window background (from the theme,
      // tinted by the wallpaper), which CSS can't read; LibreWolf paints the
      // auto-hide one near-black. So the pinned sidebar is measured (one
      // pixel of empty tab-list space in its middle column, where the eye is:
      // some themes shade it from edge to edge; from a snapshot), per
      // appearance, into arc.sidebarColor.dark / .light, and every window gets
      // it as --arc-sidebar-dark / --arc-sidebar-light (userChrome.css falls
      // back to fixed values). Measured at launch, on theme and light/dark
      // changes, when the window becomes active (a new wallpaper) and when the
      // sidebar gets pinned; only while it is pinned (in auto-hide mode it
      // isn't on screen: the last measurement stays).
      const SIDEBAR_COLOR_PREF = "arc.sidebarColor.";
      const applySidebarColors = () => {
        for (const scheme of ["dark", "light"]) {
          const rgb = prefs.getStringPref(SIDEBAR_COLOR_PREF + scheme, "");
          if (/^\d{1,3}, \d{1,3}, \d{1,3}$/.test(rgb)) {
            doc.documentElement.style.setProperty(`--arc-sidebar-${scheme}`, `rgb(${rgb})`);
          }
        }
      };
      const sidebarBox = doc.getElementById("sidebar-container");
      let measureTimer = null;
      const measureSidebar = (delay = 300) => {
        win.clearTimeout(measureTimer);
        measureTimer = win.setTimeout(async () => {
          const box = sidebarBox?.getBoundingClientRect();
          const pinned = box && box.width > 100 && !doc.documentElement.hasAttribute("sidebar-expand-on-hover") &&
            !sidebarBox.hasAttribute("sidebar-ongoing-animations") && !win.fullScreen;
          if (!pinned) {
            return;
          }
          // an empty spot of the tab list: its middle column, from the bottom
          // of the list up (skipped if tabs fill it)
          const list = doc.getElementById("vertical-tabs")?.getBoundingClientRect();
          const x = Math.round(box.left + box.width / 2);
          let y = null;
          for (let probe = Math.round((list?.bottom ?? 0) - 4); list && probe > list.top + 40 && y === null; probe -= 16) {
            const el = doc.elementFromPoint(x, probe);
            if (el && ["tabbrowser-arrowscrollbox", "vertical-tabs", "tabbrowser-tabs"].includes(el.id)) {
              y = probe;
            }
          }
          if (y === null) {
            return;
          }
          try {
            const rect = new win.DOMRect(x, y, 1, 1);
            const bitmap = await win.browsingContext.currentWindowGlobal.drawSnapshot(rect, 1, "transparent");
            const canvas = doc.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
            canvas.width = canvas.height = 1;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(bitmap, 0, 0);
            const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
            if (a === 255) {
              const scheme = win.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
              prefs.setStringPref(SIDEBAR_COLOR_PREF + scheme, `${r}, ${g}, ${b}`);
            }
          } catch (e) {
            console.error("Arc sidebar (sidebar color):", e);
          }
        }, delay);
      };
      applySidebarColors();
      // every window follows a new measurement (from any window)
      const sidebarColorObserver = { observe: () => applySidebarColors() };
      prefs.addObserver(SIDEBAR_COLOR_PREF, sidebarColorObserver);
      // theme changes
      const themeObserver = { observe: () => measureSidebar(500) };
      obs.addObserver(themeObserver, "lightweight-theme-styling-update");
      win.addEventListener("unload", () => {
        prefs.removeObserver(SIDEBAR_COLOR_PREF, sidebarColorObserver);
        obs.removeObserver(themeObserver, "lightweight-theme-styling-update");
      }, { once: true });
      win.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => measureSidebar(500));
      win.addEventListener("activate", () => measureSidebar(300));
      new win.MutationObserver(() => measureSidebar(600))
        .observe(doc.documentElement, { attributes: true, attributeFilter: ["sidebar-expand-on-hover"] });
      SessionStore.promiseAllWindowsRestored.then(() => measureSidebar(1000));

      // --- auto-archive (as in Arc) ---
      // Normal tabs left unused for arc.archiveAfterHours (24 by default, 0 =
      // off) close by themselves, quietly; they're in LibreWolf's recently
      // closed tabs (Cmd+Shift+T). Never: tiles, pinned rows and folders, the
      // current tab, the empty page, or tabs playing sound, in
      // picture-in-picture, sharing the camera / mic / screen or loading.
      const archiveOldTabs = () => {
        const hours = prefs.getIntPref(ARCHIVE_PREF, 24);
        if (!(hours > 0)) {
          return;
        }
        const cutoff = Date.now() - hours * 3600 * 1000;
        const old = gBrowser.tabs.filter(tab =>
          !tab.pinned && !isRow(tab) && !tab.group && !tab.selected && !tab.multiselected && !tab.closing &&
          !tab.hasAttribute("arc-start-page") &&
          !["soundplaying", "pictureinpicture", "sharing", "busy"].some(a => tab.hasAttribute(a)) &&
          tab.lastAccessed < cutoff);
        for (const tab of old) {
          gBrowser.removeTab(tab, { animate: false, skipPermitUnload: true });
        }
      };
      // shortly after launch (once the session is back), then every 10 minutes
      SessionStore.promiseAllWindowsRestored.then(() => win.setTimeout(archiveOldTabs, 30 * 1000));
      win.setInterval(archiveOldTabs, 10 * 60 * 1000);

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
          // (one opened into a split view, e.g. LibreWolf's "choose a tab"
          // page or a restored split view, stays there)
          if (!tab.isConnected || tab.pinned || isRow(tab) || tab.splitview) {
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
      let newTabTop = null; // where + New Tab was when a folder drag started
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
      // A tab dropped on the tiles becomes a tile there, not at the end
      // (LibreWolf just pins it): the place under the pointer, in reading
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
      // Whatever still moves when a drop lands (the tile grid shrinking, a
      // folder opening again) glides there instead of jumping
      const glide = () => {
        const items = [
          // (the dropped item too when LibreWolf doesn't animate it into place
          // itself: a tile becoming a row, a folder)
          ...gBrowser.tabContainer.querySelectorAll(".tabbrowser-tab:not([pinned]):not([dragtarget]), .tabbrowser-tab[pinned][dragtarget], .tab-group-label-container, tab-split-view-wrapper"),
          periphery,
        ].filter(Boolean);
        const before = new Map(items.map(el => [el, el.getBoundingClientRect().top]));
        // (before the next frame is drawn; transform, as + New Tab's translate
        // is fixed in userChrome.css)
        win.requestAnimationFrame(() => {
          for (const [el, top] of before) {
            const dy = top - el.getBoundingClientRect().top;
            if (el.isConnected && Math.abs(dy) >= 4 && Math.abs(dy) < 400) {
              el.animate([{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }], {
                duration: 200,
                easing: "cubic-bezier(0.2, 0, 0, 1)",
                composite: "add",
              });
            }
          }
        });
      };
      const placeAt = (tab, y, moving) => {
        // between two items of an open folder: into the folder, there
        const groupOf = el => el.localName === "tab" ? el.group : el.closest("tab-group");
        const marks = startMids.filter(m => !moving.includes(m.tab)).sort((a, b) => a.mid - b.mid);
        const after = marks.find(m => m.mid >= y)?.tab;
        const before = marks.filter(m => m.mid < y).at(-1)?.tab;
        if (after?.localName === "tab" && after.group && !after.group.collapsed && before && groupOf(before) === after.group) {
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
      // Place it in the same frame LibreWolf unpins it, so it never shows up
      // at the top first
      gBrowser.tabContainer.addEventListener("TabPinned", e => {
        const drop = pendingDrop;
        if (drop?.tileBefore && drop.moving.includes(e.target)) {
          // once LibreWolf is done with the drop (it moves the tab itself
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
          // again once LibreWolf is done with the drop: it moves the tab
          // itself after unpinning it (into a folder only we know about)
          Promise.resolve().then(() => tab.isConnected && !tab.pinned && placeAt(tab, drop.y, drop.moving));
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
        newTabTop = null;
        if (folderLabel) {
          // it's lifted out of the layout while dragged: + New Tab keeps its place
          const cs = win.getComputedStyle(folderLabel);
          folderSlot = folderLabel.getBoundingClientRect().height + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom);
          // LibreWolf folds the folder up while it's dragged: + New Tab and
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
        glide();
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
        // + New Tab follows the rows: as far as LibreWolf has moved the last
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
      gBrowser.tabContainer.addEventListener("dragend", endDrag, true);
      // Tab preview cards: none while dragging, nor right after a drop (the
      // pointer comes to rest on a tab)
      const previews = gBrowser.tabContainer.previewPanel;
      if (previews?.shouldActivate) {
        const shouldActivate = previews.shouldActivate.bind(previews);
        previews.shouldActivate = () =>
          !dragRoot.hasAttribute("arc-dragging") && win.performance.now() > quietPreviewsUntil && shouldActivate();
      }
      gBrowser.tabContainer.addEventListener("drop", endDrag, true);
      // Leaving the sidebar doesn't end the drag (it may come back, e.g.
      // after a detour over the page): only the cues that follow the pointer
      // go; LibreWolf keeps everything else as it was until the drop
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
      // cancelled): the next click proves it's over, as LibreWolf assumes too
      win.addEventListener("mousedown", e => {
        if (e.button === 0 && dragRoot.hasAttribute("arc-dragging")) {
          endDrag();
        }
      }, true);

      // --- split view by drag and drop (as in Arc) ---
      // Dragging a tab over the page shows two drop zones (#arc-split-drop,
      // over the page: the page itself can't receive tab drags); dropping
      // opens it beside the current page, on that side, with LibreWolf's own
      // split view. Normal tabs and pinned rows (a split view with a row sits
      // in the row's spot, see isSplit); not tiles: LibreWolf keeps its pinned
      // tabs out of split views. A tab can come from another window too.
      const splitDrop = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
      splitDrop.id = "arc-split-drop";
      for (const side of ["left", "right"]) {
        const zone = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
        zone.setAttribute("side", side);
        splitDrop.append(zone);
      }
      doc.body.append(splitDrop);
      // Pressing on a tab already selects it, so the page shown before the
      // press is the one to split with: it comes back under the drop zones
      // when the drag reaches the page, and a drag dropped elsewhere leaves
      // the dragged tab selected, as without split view.
      let splitDragged = null;
      let splitPartner = null;
      let splitForeign = false; // dragged from another window
      let beforePress = null;
      const canSplit = tab => !!tab && !tab.pinned && !tab.splitview && !tab.closing &&
        !tab.hasAttribute("arc-start-page");
      const showSplitDrop = (dragged, partner, foreign) => {
        // over the page, but not over the sidebar floating above it
        const page = doc.getElementById("tabbrowser-tabbox").getBoundingClientRect();
        const sidebarBox = doc.querySelector("sidebar-main").getBoundingClientRect();
        const left = Math.max(page.left, sidebarBox.width > 100 ? sidebarBox.right : 0);
        Object.assign(splitDrop.style, {
          left: `${left}px`,
          top: `${page.top}px`,
          width: `${page.right - left}px`,
          height: `${page.height}px`,
        });
        splitDragged = dragged;
        splitPartner = partner;
        splitForeign = foreign;
        if (dragged) {
          splitDrop.setAttribute("active", "");
        }
      };
      const hideSplitDrop = () => {
        splitDrop.removeAttribute("active");
        splitDrop.removeAttribute("catch");
        splitDrop.removeAttribute("side");
        if (splitDragged && !splitForeign && gBrowser.selectedTab === splitPartner && !splitDragged.closing) {
          gBrowser.selectedTab = splitDragged;
        }
        splitDragged = splitPartner = null;
        splitForeign = false;
      };
      gBrowser.tabContainer.addEventListener("mousedown", e => {
        if (e.button === 0) {
          beforePress = gBrowser.selectedTab;
        }
      }, true);
      gBrowser.tabContainer.addEventListener("dragstart", e => {
        const target = e.target?.nodeType === 1 ? e.target : e.target?.parentElement;
        const tab = target?.closest(".tabbrowser-tab");
        const partner = tab === gBrowser.selectedTab ? beforePress : gBrowser.selectedTab;
        beforePress = null;
        if (partner && partner !== tab && canSplit(tab) && canSplit(partner)) {
          showSplitDrop(tab, partner, false);
        } else {
          // No split possible (or a folder, a split pair): the page still takes the drop and does nothing
          // with it (LibreWolf would tear the tab off into a new window when
          // it's dropped anywhere past the sidebar; as in Arc and Safari, only
          // a drop outside the window does)
          showSplitDrop(null, null, false);
          splitDrop.setAttribute("catch", "");
        }
      });
      // A tab dragged in from another window: the zones show once the drag
      // is over this window. A row there is a row here too (this window's own
      // copy is used); a normal tab moves over.
      const foreignDrag = e => {
        const dt = e.dataTransfer;
        if (splitDragged || splitDrop.hasAttribute("catch") || dt?.mozTypesAt(0)?.[0] !== TAB_DROP_TYPE) {
          return;
        }
        let tab = null;
        try {
          tab = dt.mozGetDataAt(TAB_DROP_TYPE, 0);
        } catch {}
        if (!tab || gBrowser.tabs.includes(tab) || !canSplit(tab) || !canSplit(gBrowser.selectedTab)) {
          return;
        }
        if (isRow(tab)) {
          const own = findItem(tab.getAttribute(ITEM_ID));
          if (!own || own === gBrowser.selectedTab || !canSplit(own)) {
            return;
          }
        }
        showSplitDrop(tab, gBrowser.selectedTab, true);
      };
      win.addEventListener("dragenter", foreignDrag, true);
      win.addEventListener("dragover", foreignDrag, true);
      win.addEventListener("dragleave", e => {
        // (the drag left the window; dragend only reaches the window it
        // started in)
        if (splitForeign && !e.relatedTarget) {
          hideSplitDrop();
        }
      }, true);
      splitDrop.addEventListener("dragover", e => {
        if (!splitDragged) {
          if (splitDrop.hasAttribute("catch")) {
            e.preventDefault();
            if (e.dataTransfer) {
              e.dataTransfer.dropEffect = "move";
            }
          }
          return;
        }
        e.preventDefault();
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = "move";
        }
        if (gBrowser.selectedTab !== splitPartner) {
          gBrowser.selectedTab = splitPartner;
        }
        const box = splitDrop.getBoundingClientRect();
        splitDrop.setAttribute("side", e.clientX < box.left + box.width / 2 ? "left" : "right");
      });
      splitDrop.addEventListener("dragleave", e => {
        if (!splitDrop.contains(e.relatedTarget)) {
          splitDrop.removeAttribute("side");
        }
      });
      splitDrop.addEventListener("drop", e => {
        let dragged = splitDragged;
        const partner = splitPartner;
        const foreign = splitForeign;
        if (!dragged) {
          if (splitDrop.hasAttribute("catch")) {
            e.preventDefault();
            e.stopPropagation();
            hideSplitDrop();
          }
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        const onLeft = splitDrop.getAttribute("side") === "left";
        splitDragged = splitPartner = null;
        hideSplitDrop();
        try {
          if (foreign) {
            dragged = isRow(dragged)
              ? findItem(dragged.getAttribute(ITEM_ID))
              : gBrowser.adoptTab(dragged, { tabIndex: gBrowser.tabs.length, selectTab: false });
          }
          if (canSplit(dragged) && canSplit(partner) && dragged !== partner) {
            gBrowser.addTabSplitView(onLeft ? [dragged, partner] : [partner, dragged], { insertBefore: partner });
            gBrowser.selectedTab = dragged;
            // LibreWolf clears the offset a dragged tab follows the pointer
            // with only from tabs outside split views
            const tabs = [dragged, partner];
            const clear = () => tabs.forEach(t => t.style.removeProperty("transform"));
            win.addEventListener("dragend", () => win.setTimeout(clear, 0), { once: true, capture: true });
            win.setTimeout(clear, 600);
          }
        } catch (err) {
          console.error("Arc sidebar (split view):", err);
        }
      });
      win.addEventListener("dragend", hideSplitDrop, true);
      win.addEventListener("drop", () => win.setTimeout(() => splitForeign && hideSplitDrop(), 0), true);
      // However a split view is made (drop, right-click menu, LibreWolf's
      // "choose a tab" page): one with a row goes in the row's spot, and a
      // tile is left out (LibreWolf would make a split view of one page)
      let splitAnchor = null; // the row whose spot a new split view takes
      const addTabSplitView = gBrowser.addTabSplitView.bind(gBrowser);
      gBrowser.addTabSplitView = (tabs, options = {}) => {
        const usable = (tabs || []).filter(t => !t.pinned);
        if (tabs?.length >= 2 && usable.length < 2) {
          return null;
        }
        const row = usable.filter(isRow).sort((a, b) => gBrowser.tabs.indexOf(a) - gBrowser.tabs.indexOf(b))[0];
        splitAnchor = row ?? null;
        try {
          return addTabSplitView(usable, row ? { ...options, insertBefore: row } : options);
        } finally {
          splitAnchor = null;
        }
      };
      // (LibreWolf adds the tabs one by one through this, and its "choose a
      // tab" page through it too)
      const moveTabToSplitView = gBrowser.moveTabToSplitView.bind(gBrowser);
      gBrowser.moveTabToSplitView = (tab, split, ...rest) => {
        if (tab && split && isRow(tab) && !tab.splitview) {
          if (splitAnchor ? tab !== splitAnchor : hasRow(split)) {
            noteOrigin(tab);
          } else if (!splitAnchor && !split.group) {
            // a split view of normal tabs that a row joins goes to its spot
            try {
              gBrowser.moveTabBefore(split, tab);
            } catch {}
          }
        }
        return moveTabToSplitView(tab, split, ...rest);
      };

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
        // closing one half of a split view shows the other one
        const otherHalf = tab?.selected && tab.splitview?.tabs.find(t => t !== tab && !t.closing);
        if (!tab || !isPinnedish(tab) || closingFolderTabs.has(tab)) {
          if (otherHalf && !otherHalf.pinned) {
            gBrowser.selectedTab = otherHalf;
          }
          return removeTab(tab, options);
        }
        // A row in a split view leaves it first (the other page stays open,
        // full width) and is reset in its own spot
        if (tab.splitview) {
          const others = tab.splitview.tabs.filter(t => t !== tab);
          const selected = tab.selected;
          separate(tab.splitview);
          const next = others.find(t => t.isConnected && !t.closing);
          if (selected) {
            whenSwitched(() => resetClosed(tab));
            gBrowser.selectedTab = next || nextAfterClose(tab);
          } else {
            resetClosed(tab);
          }
          return undefined;
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

      // --- Peek (as in Arc) ---
      // A link to another site clicked in a tile or a pinned row opens in a
      // card floating over the pinned page (dimmed), instead of replacing it.
      // LibreWolf already opens such links in a new tab from pinned tabs (its
      // "app tab" flag); rows get the flag too. That new tab is the Peek:
      // it's selected (the URL bar shows its address) but hidden from the
      // sidebar, where the pinned item stays highlighted; LibreWolf's split
      // view machinery draws both pages. Esc, a click on the dimmed page, the
      // card's close button or switching tabs closes it (and it's gone, in
      // Recently Closed); it can also become a normal tab, or a split view
      // with a pinned row.
      const PEEK = "arc-peek-tab";
      const setAppTab = tab => {
        try {
          if (tab.linkedBrowser?.browsingContext) {
            tab.linkedBrowser.browsingContext.isAppTab = tab.pinned || isRow(tab);
          }
        } catch {}
      };
      for (const tab of gBrowser.tabs) {
        setAppTab(tab);
      }
      gBrowser.tabContainer.addEventListener("TabBrowserInserted", e => setAppTab(e.target));
      gBrowser.tabContainer.addEventListener("TabAttrModified", e => {
        if (e.detail?.changed?.includes(ROW)) {
          setAppTab(e.target);
        }
      });
      new win.MutationObserver(records => {
        for (const r of records) {
          setAppTab(r.target);
        }
      }).observe(gBrowser.tabContainer, { subtree: true, attributes: true, attributeFilter: [ROW] });

      const peekBar = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
      peekBar.id = "arc-peek-bar";
      const peekButton = (name, label) => {
        const b = doc.createElementNS("http://www.w3.org/1999/xhtml", "button");
        b.className = `arc-peek-${name}`;
        b.title = label;
        b.setAttribute("aria-label", label);
        peekBar.append(b);
        return b;
      };
      const splitButton = peekButton("split", "Open in Split View");
      const expandButton = peekButton("expand", "Open as Tab");
      const closeButton = peekButton("close", "Close");
      doc.body.append(peekBar);
      const peekSpinner = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
      peekSpinner.id = "arc-peek-spinner";
      doc.body.append(peekSpinner);
      let peek = null; // { tab, home, origin }
      // The page under a Peek stays drawn: LibreWolf drops what a tab it
      // switches away from has drawn (one black frame), unless told not to
      const keepDrawn = (tab, on) => {
        try {
          tab.linkedBrowser.preserveLayers(on);
          if (on) {
            tab.linkedBrowser.renderLayers = true;
            tab.linkedBrowser.docShellIsActive = true;
          }
        } catch {}
      };
      // where a page was last pressed: the card grows out of the link
      let lastPagePress = null;
      win.addEventListener("pointerdown", e => {
        if (e.target?.localName === "browser") {
          lastPagePress = { x: e.clientX, y: e.clientY, at: win.performance.now() };
        }
      }, true);
      // where the card ends up: 7.5% in from the page's edges
      const cardBox = () => {
        const r = gBrowser.tabpanels.getBoundingClientRect();
        return { left: r.left + r.width * 0.075, top: r.top + r.height * 0.075, width: r.width * 0.85, height: r.height * 0.85 };
      };
      const reducedMotion = () => win.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const EASE = "cubic-bezier(0.2, 0.9, 0.3, 1)"; // fast start, soft landing
      // (from where the card ends up, 7.5% in from the page's edges: it's
      // still growing into place when this runs)
      const placePeekBar = () => {
        if (!peek) {
          return;
        }
        const r = gBrowser.tabpanels.getBoundingClientRect();
        const right = Math.round(r.right - r.width * 0.075);
        const top = Math.round(r.top + r.height * 0.075);
        peekBar.style.left = `${right - peekBar.offsetWidth}px`;
        peekBar.style.top = `${top - peekBar.offsetHeight - 8}px`;
      };
      win.addEventListener("resize", placePeekBar);
      const openPeek = (tab, home) => {
        peek = { tab, home };
        tab.setAttribute(PEEK, "");
        home.setAttribute("arc-peek-home", "");
        dragRoot.setAttribute("arc-peek", "");
        splitButton.hidden = home.pinned || !!home.splitview;
        const press = lastPagePress && win.performance.now() - lastPagePress.at < 3000 ? lastPagePress : null;
        const box = cardBox();
        peek.origin = press ? { x: press.x - box.left, y: press.y - box.top } : null;
        // The pinned page dims right away (and is kept drawn: LibreWolf puts
        // the page it switched away from to sleep); the card waits, hidden,
        // until its page has drawn (a spinner at the link if that takes a
        // moment), then grows out of the link: never an empty or black card
        const show = () => {
          if (peek?.tab !== tab) {
            return false;
          }
          gBrowser.showSplitViewPanels([home, tab]);
          doc.getElementById(home.linkedPanel)?.setAttribute("arc-peek-under", "");
          doc.getElementById(tab.linkedPanel)?.setAttribute("arc-peek-card", "");
          return true;
        };
        const card = doc.getElementById(tab.linkedPanel);
        card?.setAttribute("arc-peek-waiting", "");
        keepDrawn(home, true);
        show();
        const keepHomeDrawn = win.setInterval(() => {
          if (peek?.tab !== tab) {
            win.clearInterval(keepHomeDrawn);
            return;
          }
          try {
            home.linkedBrowser.docShellIsActive = true;
            home.linkedBrowser.renderLayers = true;
          } catch {}
        }, 50);
        const spinnerAt = press || { x: box.left + box.width / 2, y: box.top + box.height / 2 };
        peekSpinner.style.left = `${spinnerAt.x}px`;
        peekSpinner.style.top = `${spinnerAt.y}px`;
        const spinnerTimer = win.setTimeout(() => peek?.tab === tab && peekSpinner.setAttribute("shown", ""), 150);
        let revealed = false;
        const reveal = () => {
          if (revealed || !show()) {
            return;
          }
          revealed = true;
          win.clearTimeout(spinnerTimer);
          win.clearInterval(keepHomeDrawn);
          gBrowser.removeTabsProgressListener(listener);
          peekSpinner.removeAttribute("shown");
          card?.removeAttribute("arc-peek-waiting");
          if (card && !reducedMotion()) {
            // out of the link: from a tenth of its size at the press point (or
            // from the middle, a little smaller)
            card.style.transformOrigin = peek.origin ? `${peek.origin.x}px ${peek.origin.y}px` : "center";
            card.animate(peek.origin
              ? [{ transform: "scale(0.1)", opacity: 0 }, { opacity: 1, offset: 0.25 }, { transform: "scale(1)", opacity: 1 }]
              : [{ transform: "scale(0.96)", opacity: 0 }, { transform: "scale(1)", opacity: 1 }],
            { duration: peek.origin ? 340 : 220, easing: EASE });
          }
          peekBar.setAttribute("shown", "");
          placePeekBar();
          peekBar.animate?.([{ opacity: 0 }, { opacity: 0, offset: 0.6 }, { opacity: 1 }], { duration: 340, easing: "ease-out" });
          tab.linkedBrowser.focus();
        };
        // ready: its page's document has arrived (then a beat to draw it), or
        // it finished loading; at the latest after 4s
        const listener = {
          onLocationChange(browser, webProgress, request, location) {
            if (browser === tab.linkedBrowser && webProgress.isTopLevel && location && !win.isBlankPageURL(location.spec)) {
              win.setTimeout(() => win.requestAnimationFrame(() => win.requestAnimationFrame(reveal)), 120);
            }
          },
          onStateChange(browser, webProgress, request, flags) {
            const { STATE_STOP, STATE_IS_WINDOW } = Ci.nsIWebProgressListener;
            if (browser === tab.linkedBrowser && webProgress.isTopLevel && flags & STATE_STOP && flags & STATE_IS_WINDOW && !win.isBlankPageURL(browser.currentURI.spec)) {
              win.requestAnimationFrame(() => win.requestAnimationFrame(reveal));
            }
          },
        };
        gBrowser.addTabsProgressListener(listener);
        win.setTimeout(reveal, 4000);
      };
      // LibreWolf takes the two pages down when it finishes switching to the
      // Peek's tab (to it that's a tab outside any split view): put them back
      // before the next frame is drawn
      new win.MutationObserver(() => {
        if (peek && !closing && !gBrowser.tabpanels.hasAttribute("splitview")) {
          gBrowser.showSplitViewPanels([peek.home, peek.tab]);
        }
      }).observe(gBrowser.tabpanels, { attributes: true, attributeFilter: ["splitview"] });
      // how: "close" (gone), "tab" (a normal tab), "split" (beside the row),
      // "away" (another tab was selected: gone), "gone" (closed already)
      let closing = false;
      const closePeek = how => {
        if (!peek || closing) {
          return;
        }
        // "close": back into the link; "tab": out to the whole page; then put
        // away (switching tabs or a closed tab: at once)
        const card = doc.getElementById(peek.tab.linkedPanel);
        const under = doc.getElementById(peek.home.linkedPanel);
        if ((how === "close" || how === "tab") && card && !reducedMotion()) {
          closing = true;
          peekBar.removeAttribute("shown");
          let anim;
          if (how === "tab") {
            const box = cardBox();
            const r = gBrowser.tabpanels.getBoundingClientRect();
            card.style.transformOrigin = `${r.left + r.width / 2 - box.left}px ${r.top + r.height / 2 - box.top}px`;
            anim = card.animate([{ transform: "scale(1)" }, { transform: `scale(${r.width / box.width}, ${r.height / box.height})`, borderRadius: "0px" }], { duration: 240, easing: EASE, fill: "forwards" });
          } else {
            card.style.transformOrigin = peek.origin ? `${peek.origin.x}px ${peek.origin.y}px` : "center";
            anim = card.animate([{ transform: "scale(1)", opacity: 1 }, { opacity: 1, offset: 0.5 }, { transform: peek.origin ? "scale(0.1)" : "scale(0.96)", opacity: 0 }], { duration: 220, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" });
          }
          under?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: "ease-out", fill: "forwards", pseudoElement: "::after" });
          anim.finished.catch(() => {}).then(() => {
            closing = false;
            card.getAnimations().forEach(a => a.cancel());
            under?.getAnimations({ subtree: true }).forEach(a => a.cancel());
            finishPeek(how);
          });
          return;
        }
        finishPeek(how);
      };
      const finishPeek = how => {
        if (!peek) {
          return;
        }
        const { tab, home } = peek;
        peek = null;
        doc.getElementById(tab.linkedPanel)?.style.removeProperty("transform-origin");
        doc.getElementById(tab.linkedPanel)?.removeAttribute("arc-peek-waiting");
        if (home.isConnected) {
          keepDrawn(home, false);
        }
        peekSpinner.removeAttribute("shown");
        peekBar.removeAttribute("shown");
        dragRoot.removeAttribute("arc-peek");
        home.removeAttribute("arc-peek-home");
        tab.removeAttribute(PEEK);
        for (const t of [home, tab]) {
          const panel = doc.getElementById(t.linkedPanel);
          panel?.removeAttribute("arc-peek-under");
          panel?.removeAttribute("arc-peek-card");
        }
        try {
          gBrowser.tabpanels.removeTabsFromSplitview([home, tab]);
        } catch {}
        if (how === "gone" && gBrowser.selectedTab === tab && home.isConnected) {
          gBrowser.selectedTab = home; // (Cmd+W on it: back to the pinned page)
        }
        if (how === "close" || how === "away") {
          if (gBrowser.selectedTab === tab && home.isConnected) {
            gBrowser.selectedTab = home;
          }
          if (tab.isConnected && !tab.closing) {
            removeTabForPeek(tab, { animate: false });
          }
        } else if (how === "tab") {
          moveToRowBlockEnd(tab); // the first normal tab
        } else if (how === "split" && home.isConnected) {
          gBrowser.addTabSplitView([home, tab], { insertBefore: home });
          gBrowser.selectedTab = tab;
        }
      };
      closeButton.addEventListener("click", () => closePeek("close"));
      expandButton.addEventListener("click", () => closePeek("tab"));
      splitButton.addEventListener("click", () => closePeek("split"));
      // a link from a pinned page that opens in front: the Peek
      gBrowser.tabContainer.addEventListener("TabOpen", e => {
        const tab = e.target;
        const opener = tab.openerTab;
        // (or any link Option+clicked a moment ago, from any tab)
        const asked = Date.now() - altPeekAt < 1500;
        if (!peek && opener && opener.selected && !opener.splitview && (isPinnedish(opener) || asked)) {
          tab._arcPeekFrom = { opener, at: win.performance.now() };
          keepDrawn(opener, true); // (before LibreWolf switches away from it)
          altPeekAt = 0;
        }
      });
      gBrowser.tabContainer.addEventListener("TabSelect", e => {
        const tab = e.target;
        if (peek && tab !== peek.tab) {
          closePeek("away");
        }
        const from = tab._arcPeekFrom;
        delete tab._arcPeekFrom;
        if (from && win.performance.now() - from.at < 2000 && e.detail?.previousTab === from.opener && from.opener.isConnected) {
          openPeek(tab, from.opener);
        }
      });
      // Closing the Peek's tab (Cmd+W) closes the Peek; any other way it
      // goes, the Peek is put away once LibreWolf is done closing it
      const removeTabForPeek = gBrowser.removeTab;
      gBrowser.removeTab = (tab, options) => {
        if (peek && tab === peek.tab && !tab.closing) {
          closePeek("close");
          return undefined;
        }
        return removeTabForPeek(tab, options);
      };
      gBrowser.tabContainer.addEventListener("TabClose", e => {
        if (peek && (e.target === peek.tab || e.target === peek.home)) {
          const gone = e.target === peek.tab;
          win.setTimeout(() => closePeek(gone ? "gone" : "away"), 0);
        }
      });
      // a click on the dimmed page, or Esc, closes it
      doc.getElementById("tabbrowser-tabpanels")?.addEventListener("mousedown", e => {
        if (peek && e.button === 0 && e.target?.hasAttribute?.("arc-peek-under")) {
          e.preventDefault();
          e.stopPropagation();
          closePeek("close");
        }
      }, true);
      win.addEventListener("keydown", e => {
        if (peek && e.key === "Escape" && !e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
          e.preventDefault();
          closePeek("close");
        }
      }, true);

      // --- the same sidebar in every window (as in Arc) ---
      // When another window saves the shared list, this window makes its own
      // tiles, rows and folders match it: missing ones are created (unloaded),
      // removed ones closed, order, folder names / colors and pinned pages
      // updated. Pages open here are never reloaded or navigated; whether a
      // folder is open or closed stays per window.
      const readShared = () => {
        try {
          return {
            tiles: JSON.parse(prefs.getStringPref(TILES_PREF, "[]")),
            block: JSON.parse(prefs.getStringPref(ROWS_PREF, "[]")),
          };
        } catch {
          return null;
        }
      };
      const comparable = ({ tiles, block }) => JSON.stringify({
        tiles: tiles.map(({ id, url, title }) => ({ id, url, title })),
        block: block.map(item => item.folder
          ? { folder: [item.folder.id, item.folder.label, item.folder.color], tabs: item.tabs.map(({ id, url, title }) => ({ id, url, title })) }
          : { id: item.id, url: item.url, title: item.title }),
      });
      const findItem = id => gBrowser.tabs.find(t => isPinnedish(t) && itemId(t) === id);
      const reallyClose = tab => {
        closingFolderTabs.add(tab);
        if (tab.pinned) {
          gBrowser.unpinTab(tab);
        }
        tab.removeAttribute(ROW);
        gBrowser.removeTab(tab, { animate: false, skipPermitUnload: true });
      };
      const followHome = (tab, entry) => {
        const home = getHome(tab);
        if (!home || home.url !== entry.url || home.title !== entry.title || home.icon !== entry.icon) {
          const principal = home && home.url === entry.url ? home.principal : null;
          try {
            SessionStore.setCustomTabValue(tab, HOME, JSON.stringify({ url: entry.url, title: entry.title, icon: entry.icon, principal }));
          } catch {}
          if (entry.icon && tab.hasAttribute("pending")) {
            try {
              gBrowser.setIcon(tab, entry.icon);
            } catch {}
          }
          updateAway(tab);
        }
      };
      const asRow = (entry, folder) => {
        const tab = findItem(entry.id) || createItem(entry, false);
        if (tab.pinned) {
          gBrowser.unpinTab(tab);
        }
        if (!isRow(tab)) {
          markRow(tab);
        }
        if (tab.group && tab.group !== folder) {
          gBrowser.ungroupTab(tab);
        }
        followHome(tab, entry);
        return tab;
      };
      function reconcile() {
        const shared = readShared();
        if (isPrivate || !shared || comparable(snapshot()) === comparable(shared)) {
          return;
        }
        syncing = true;
        try {
          const wanted = new Set([
            ...shared.tiles.map(e => e.id),
            ...shared.block.flatMap(item => (item.folder ? item.tabs.map(e => e.id) : [item.id])),
          ]);
          const wantedFolders = new Set(shared.block.filter(item => item.folder).map(item => item.folder.id));
          // removed in another window
          for (const tab of gBrowser.tabs.filter(isPinnedish)) {
            if (!wanted.has(itemId(tab))) {
              reallyClose(tab);
            }
          }
          for (const group of [...gBrowser.tabGroups]) {
            if (!wantedFolders.has(folderId(group))) {
              for (const tab of [...group.tabs]) {
                gBrowser.ungroupTab(tab);
              }
            }
          }
          // tiles, in order
          shared.tiles.forEach((entry, i) => {
            let tab = findItem(entry.id);
            if (!tab) {
              tab = createItem(entry, true);
            } else if (!tab.pinned) {
              if (tab.group) {
                gBrowser.ungroupTab(tab);
              }
              tab.removeAttribute(ROW);
              try {
                SessionStore.deleteCustomTabValue(tab, ROW);
              } catch {}
              gBrowser.pinTab(tab);
            }
            followHome(tab, entry);
            const pinned = gBrowser.tabs.filter(t => t.pinned);
            if (pinned[i] && pinned[i] !== tab) {
              gBrowser.moveTabBefore(tab, pinned[i]);
            }
          });
          // rows and folders, in order (a split view with rows in it counts
          // once, in its first row's place)
          let next = 0;
          shared.block.forEach(item => {
            let el;
            if (item.folder) {
              let group = gBrowser.tabGroups.find(g => folderId(g) === item.folder.id);
              const tabs = item.tabs.map(entry => asRow(entry, group));
              if (!tabs.length) {
                return;
              }
              if (!group) {
                group = gBrowser.addTabGroup(tabs, { label: item.folder.label, color: item.folder.color });
                group.setAttribute("arc-folder-id", item.folder.id);
              } else {
                if (group.label !== item.folder.label) {
                  group.label = item.folder.label;
                }
                if (group.color !== item.folder.color) {
                  group.color = item.folder.color;
                }
                tabs.forEach((tab, j) => {
                  if (tab.group !== group) {
                    group.addTabs([tab]);
                  }
                  // (rows in a split view stay in it)
                  const rowsNow = group.tabs.filter(isRow);
                  if (!tab.splitview && rowsNow[j] && rowsNow[j] !== tab && !rowsNow[j].splitview) {
                    gBrowser.moveTabBefore(tab, rowsNow[j]);
                  }
                });
              }
              el = group;
            } else {
              el = asRow(item, null);
              el = el.splitview && !el.splitview.group ? el.splitview : el;
            }
            const block = listItems().filter(inBlock);
            const at = block.indexOf(el);
            if (at !== -1 && at < next) {
              return; // (a split view's second row)
            }
            if (block[next] !== el) {
              if (block[next]) {
                gBrowser.moveTabBefore(el, block[next]);
              } else {
                moveToRowBlockEnd(el);
              }
            }
            next++;
          });
        } catch (e) {
          console.error("Arc sidebar (sync):", e);
        } finally {
          syncing = false;
        }
      }
      if (!isPrivate) {
        let followTimer = null;
        // (not this window's own save, and not while this window has changes
        // of its own waiting to be saved: they're newer)
        const sharedObserver = {
          observe: () => {
            if (writing) {
              return;
            }
            win.clearTimeout(followTimer);
            followTimer = win.setTimeout(() => rowsRestored && saveTimer === null && reconcile(), 150);
          },
        };
        prefs.addObserver(ROWS_PREF, sharedObserver);
        prefs.addObserver(TILES_PREF, sharedObserver);
        win.addEventListener("unload", () => {
          prefs.removeObserver(ROWS_PREF, sharedObserver);
          prefs.removeObserver(TILES_PREF, sharedObserver);
        }, { once: true });
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
          let closeTimer = null;
          let blurClosedAt = -1000; // when the bar last closed because focus left it
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
            // After Enter, LibreWolf handles the address and the focus
            if (!loading) {
              if (gURLBar.focused) {
                gBrowser.selectedBrowser.focus();
              }
              // Nothing was opened, or another tab was picked: show the
              // current tab's address (held back while the bar was open)
              gURLBar.handleRevert();
            }
            loading = false;
          };
          const openBar = () => {
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
            // A click on + New Tab while the bar is open may already have
            // closed it by taking the focus: that click means "close". Only
            // then (a keyboard Cmd+T right after Enter or Esc always opens).
            // (a click comes from the + New Tab button, a key press from its
            // key; LibreWolf doesn't reliably say which input it was, so look
            // at what sent the command, through the chain of source events)
            let byMouse = false;
            for (let ev = e, depth = 0; ev && depth < 4; ev = ev.sourceEvent, depth++) {
              if (ev.target?.localName === "toolbarbutton" || /^(mouse|click|pointer)/.test(ev.type)) {
                byMouse = true;
              }
            }
            if (barOpen()) {
              closeBar();
            } else if (!byMouse || win.performance.now() - blurClosedAt > 300) {
              openBar();
            }
          };
          for (const command of newTabCommands) {
            command.addEventListener("command", toggleBar);
          }
          // While the bar is open, LibreWolf's address updates (e.g. the tab
          // opened by the previous Enter finishing its load) would fill the
          // empty bar with that tab's address: they wait until it closes
          const setURI = gURLBar.setURI.bind(gURLBar);
          gURLBar.setURI = (...args) => {
            if (barOpen()) {
              return undefined;
            }
            return setURI(...args);
          };
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
                  blurClosedAt = win.performance.now();
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
