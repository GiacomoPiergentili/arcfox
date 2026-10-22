      // --- keeping the row block intact ---
      // A tile is never a row. A tab opened inside the block (a link from a
      // row or a folder tab: it has an opener) goes below it, as in Arc; one
      // added to a folder on purpose ("New Tab in Group") becomes a row of
      // that folder.
      guard("row block", () => {
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
      });

      // --- + New Tab right under the divider (as in Arc) ---
      // userChrome.css shows LibreWolf's end-of-list box (which holds the
      // button) there. While dragging, LibreWolf measures that box as the end
      // of the tab list, so it's told where the list really ends.
      const periphery = doc.getElementById("tabbrowser-arrowscrollbox-periphery");
      let listEndScreenY = null;
      const reportListEnd = screenY => ({
        get() {
          return listEndScreenY ?? screenY.get.call(this);
        },
      });

