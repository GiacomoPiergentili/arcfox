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
          report("sync", e);
        } finally {
          syncing = false;
        }
      }
      guard("following other windows", () => {
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
              // (what moves here glides there, as for a change made here)
              followTimer = win.setTimeout(() => {
                if (rowsRestored && saveTimer === null) {
                  const places = notePlaces();
                  reconcile();
                  glideFrom(places);
                }
              }, 150);
            },
          };
          prefs.addObserver(ROWS_PREF, sharedObserver);
          prefs.addObserver(TILES_PREF, sharedObserver);
          win.addEventListener("unload", () => {
            prefs.removeObserver(ROWS_PREF, sharedObserver);
            prefs.removeObserver(TILES_PREF, sharedObserver);
          }, { once: true });
        }
      });

      // Right-click: "Back to Pinned Page" / "Set Pinned Page to This Page",
      // on a pinned row or tile that's away from its pinned page
      guard("pinned page menu items", () => {
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
      });

