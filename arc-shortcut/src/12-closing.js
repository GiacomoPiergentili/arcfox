      // --- closing a pinned row or tile resets it instead ---
      // It goes back to its pinned page, unloaded (except when its whole
      // folder is deleted: then its tabs really close)
      const closingFolderTabs = new WeakSet();
      const folderTabsReallyClose = original => (group, options) => {
        for (const tab of group.tabs) {
          closingFolderTabs.add(tab);
        }
        return original.call(gBrowser, group, options);
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
        // it settles back in place, so it reads as put back, not closed
        if (motionOK()) {
          tab.querySelector(".tab-stack")?.animate(
            [{ opacity: 0.2, transform: "scale(0.94)" }, { opacity: 1, transform: "none" }],
            { duration: 360, easing: CURVE.settle });
        }
        // never left marked as the tab on screen (see below)
        if (!tab.selected && tab.hasAttribute("visuallyselected")) {
          tab.removeAttribute("visuallyselected");
        }
      };
      // Firefox switches tabs asynchronously and keeps the old tab marked
      // as the one on screen ([visuallyselected]) until the new one is drawn.
      // A tab unloaded before that kept the mark for good, and was drawn with
      // Firefox's own selected style (black in dark themes). So the closed
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
      // (Closing the Peek's tab closes the Peek first, see "Peek" below. The
      // rest is this, which the Peek uses to close its own tab.)
      let closeOrReset = (tab, options) => gBrowser.removeTab(tab, options);
      const resetInsteadOfClosing = original => {
        const removeTab = (tab, options) => original.call(gBrowser, tab, options);
        closeOrReset = (tab, options) => {
          // The empty page (no tab open) isn't closed like a tab: Firefox would
          // go to the tab next to it, often an unloaded pinned row, and load
          // it. It stays (the script removes it itself once another tab is
          // selected); Cmd+W on it closes the window instead (see below).
          if (tab?.selected && tab.hasAttribute("arc-start-page")) {
            gBrowser.selectedBrowser.focus(); // closes the floating URL bar
            return undefined;
          }
          // Closing the last normal tab: Firefox would go to the tab next to
          // it, often an unloaded pinned row, and load it. Go where closing a
          // pinned row goes instead (an open row, else the empty page with the
          // floating URL bar). With other normal tabs open, Firefox decides.
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
        return (tab, options) => (peekSection.peekCloses?.(tab) ? undefined : closeOrReset(tab, options));
      };

      // Cmd+W on a tile: Firefox never closes a tile from the keyboard (it
      // just jumps to the first unpinned tab); here it closes like a pinned
      // row does (reset, unloaded) and goes where nextAfterClose says.
      // Cmd+W on the empty page (no tab open) closes the window, as in Arc
      // and other Mac apps.
      const closeTilesToo = original => function (event) {
        if (!gBrowser.multiSelectedTabsCount && gBrowser.selectedTab.hasAttribute("arc-start-page")) {
          win.BrowserCommands.tryToCloseWindow(event);
          return undefined;
        }
        if (!gBrowser.multiSelectedTabsCount && gBrowser.selectedTab.pinned) {
          gBrowser.removeTab(gBrowser.selectedTab);
          return undefined;
        }
        return original.call(this, event);
      };

