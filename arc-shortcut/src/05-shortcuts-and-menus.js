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
            moveToRowBlockEnd(tab); // (Firefox puts it first, above the rows)
          }
        }
      };
      const rebind = (keyId, menuId, handler) => {
        const key = doc.getElementById(keyId);
        if (key) {
          key.removeAttribute("command");
          // (and not on to Firefox's own handler for the key set, which
          // opened "Bookmark All Tabs" too)
          key.addEventListener("command", e => {
            e.stopPropagation();
            handler();
          });
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
          report(via, e);
        }
      };
      guard("Cmd+D / Cmd+Shift+D", () => {
        rebind("addBookmarkAsKb", "menu_bookmarkThisPage", () => run(withGlide(toggleRow), "key-command"));   // Cmd+D (was Bookmark This Page)
        rebind("bookmarkAllTabsKb", "menu_bookmarkAllTabs", () => run(withGlide(toggleTile), "key-command")); // Cmd+Shift+D (was Bookmark All Tabs)
        // Direct route: catch the key press itself before anything else does
        win.addEventListener("keydown", e => {
          if (e.code === "KeyD" && e.metaKey && !e.ctrlKey && !e.altKey) {
            e.preventDefault();
            e.stopPropagation();
            run(withGlide(e.shiftKey ? toggleTile : toggleRow), "keydown");
          }
        }, true);
      });

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
      guard("Cmd+Shift+C", () => {
        doc.getElementById("key_inspectorMac")?.setAttribute("disabled", "true");
      });

      // Cmd+1…9 go to the tiles in order, then on to the pinned rows (a
      // collapsed folder's hidden rows don't count). Firefox's own (the 1st to 8th
      // tab, the last tab) counted every tab, rows and folders in between.
      const pinnedInOrder = () => [
        ...gBrowser.tabs.filter(t => t.pinned),
        ...gBrowser.tabs.filter(t => !t.pinned && isRow(t) && (!t.group?.collapsed || t.visible)),
      ];
      guard("Cmd+1…9 and Cmd+Shift+C", () => {
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
      });

      // --- the menu bar ---
      // Every command has its place in the menu bar with its shortcut, as
      // on any Mac app (they were keys only): Pin as Row / Tile in the Window
      // menu (where Safari has Pin Tab), the sidebar in View, Copy Link in
      // Edit. Their keys are new ones of ours, only there to show the
      // shortcut in the menu (Firefox's own for these keys are switched
      // off); the key presses themselves are caught above.
      guard("menu bar", () => {
        const keyset = doc.getElementById("mainKeyset");
        const menuKey = (id, key, modifiers) => {
          if (!doc.getElementById(id) && keyset) {
            const k = doc.createXULElement("key");
            k.id = id;
            k.setAttribute("key", key);
            k.setAttribute("modifiers", modifiers);
            keyset.append(k);
          }
          return id;
        };
        const menuItem = (id, keyId, action) => {
          const item = doc.createXULElement("menuitem");
          item.id = id;
          if (keyId) {
            item.setAttribute("key", keyId);
          }
          item.addEventListener("command", action);
          return item;
        };
        const windowMenu = doc.getElementById("windowPopup");
        if (windowMenu) {
          const rowItem = menuItem("arc-menu-row", menuKey("arc-key-row", "D", "accel"), () => run(withGlide(toggleRow), "menu"));
          const tileItem = menuItem("arc-menu-tile", menuKey("arc-key-tile", "D", "accel,shift"), () => run(withGlide(toggleTile), "menu"));
          windowMenu.prepend(rowItem, tileItem, doc.createXULElement("menuseparator"));
          windowMenu.addEventListener("popupshowing", e => {
            if (e.target !== windowMenu) {
              return;
            }
            const tab = gBrowser.selectedTab;
            const blank = tab.hasAttribute("arc-start-page");
            rowItem.setAttribute("label", isRow(tab) ? "Unpin Row" : "Pin as Row");
            tileItem.setAttribute("label", tab.pinned ? "Unpin Tile" : "Pin as Tile");
            rowItem.toggleAttribute("disabled", blank);
            tileItem.toggleAttribute("disabled", blank);
          });
        }
        const viewMenu = doc.getElementById("menu_viewPopup");
        if (viewMenu) {
          const sidebarItem = menuItem("arc-menu-sidebar", "key_savePage", toggleSidebarMode);
          doc.getElementById("viewSidebarMenuMenu")?.after(sidebarItem);
          viewMenu.addEventListener("popupshowing", e => {
            if (e.target === viewMenu) {
              sidebarItem.setAttribute("label",
                prefs.getStringPref(PREF, "always-show") === "expand-on-hover" ? "Always Show Sidebar" : "Auto-Hide Sidebar");
            }
          });
        }
        const editMenu = doc.getElementById("menu_EditPopup");
        if (editMenu) {
          const copyItem = menuItem("arc-menu-copy-link", menuKey("arc-key-copy-link", "C", "accel,shift"), copyAddress);
          copyItem.setAttribute("label", "Copy Link");
          (doc.getElementById("menu_delete") || doc.getElementById("menu_paste"))?.after(copyItem);
          editMenu.addEventListener("popupshowing", e => {
            if (e.target === editMenu) {
              const url = gBrowser.selectedBrowser.currentURI?.spec;
              copyItem.toggleAttribute("disabled", !url || win.isBlankPageURL(url) || gBrowser.selectedTab.hasAttribute("arc-start-page"));
            }
          });
        }
      });

