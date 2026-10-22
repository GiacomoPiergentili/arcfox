      // --- split view by drag and drop (as in Arc) ---
      // Dragging a tab over the page shows two drop zones (#arc-split-drop,
      // over the page: the page itself can't receive tab drags); dropping
      // opens it beside the current page, on that side, with LibreWolf's own
      // split view. Normal tabs and pinned rows (a split view with a row sits
      // in the row's spot, see isSplit); not tiles: LibreWolf keeps its pinned
      // tabs out of split views. A tab can come from another window too.
      const splitView = guard("split view", () => {
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
            report("split view", err);
          }
        });
        win.addEventListener("dragend", hideSplitDrop, true);
        win.addEventListener("drop", () => win.setTimeout(() => splitForeign && hideSplitDrop(), 0), true);
        // However a split view is made (drop, right-click menu, LibreWolf's
        // "choose a tab" page): one with a row goes in the row's spot, and a
        // tile is left out (LibreWolf would make a split view of one page)
        // (and the two tabs, with whatever moves for them, glide into place:
        // see "motion" above)
        let splitAnchor = null; // the row whose spot a new split view takes
        const inRowSpot = original => (tabs, options = {}) => {
          const usable = (tabs || []).filter(t => !t.pinned);
          if (tabs?.length >= 2 && usable.length < 2) {
            return null;
          }
          const row = usable.filter(isRow).sort((a, b) => gBrowser.tabs.indexOf(a) - gBrowser.tabs.indexOf(b))[0];
          splitAnchor = row ?? null;
          const places = notePlaces();
          try {
            return original.call(gBrowser, usable, row ? { ...options, insertBefore: row } : options);
          } finally {
            splitAnchor = null;
            glideFrom(places);
          }
        };
        // (LibreWolf adds the tabs one by one through this, and its "choose a
        // tab" page through it too)
        const rowJoins = original => (tab, split, ...rest) => {
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
          return original.call(gBrowser, tab, split, ...rest);
        };
        return { inRowSpot, rowJoins };
      }) ?? {};

      // --- motion: split views ---
      // Two tabs joining or separating glide into place, with whatever moves
      // for them (see "motion" above; not during drags, which glide on their
      // own)
      // (joining: see "split view by drag and drop")
      const splitClass = win.customElements.get("tab-split-view-wrapper");
      const glideApart = original => function (...args) {
        const places = notePlaces();
        try {
          return original.apply(this, args);
        } finally {
          glideFrom(places);
        }
      };

