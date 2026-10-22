      // --- folders opening and closing ---
      // A collapsed folder keeps showing its loaded tabs (unloaded ones hide;
      // LibreWolf showed only the selected one and a "+N" for the rest), and
      // its rows slide open and shut (as in the Finder's sidebar). The
      // folder icon's front tilts open with it (userChrome.css).
      const folderClass = win.customElements.get("tab-group");
      const isLoaded = tab => !tab.hasAttribute("pending");
      // (what LibreWolf's own code counts as shown: keyboard moves, drags)
      const showLoadedTabs = original => function (tab) {
        return original.call(this, tab) ||
          (this.collapsed && !this.isBeingDragged && !tab.splitview && isLoaded(tab));
      };
      // the rows that hide or show slide shut or open (see "motion" above)
      const slideFolderRows = collapsed => ({
        ...collapsed,
        set(val) {
          const group = this;
          const rows = () => [...group.querySelectorAll(":scope > .tabbrowser-tab, :scope > tab-split-view-wrapper")];
          // (shown rows and their heights)
          const shown = () => new Map(rows().map(el => [el, el.getBoundingClientRect().height]).filter(([, h]) => h > 0));
          const animate = !!val !== group.collapsed && group.isConnected && motionOK() &&
            !gBrowser.tabContainer.hasAttribute("movingtab") && !group.isBeingDragged;
          const before = animate ? shown() : null;
          collapsed.set.call(group, val);
          if (!animate) {
            return;
          }
          const after = shown();
          const changed = val ? [...before].filter(([el]) => !after.has(el)) : [...after].filter(([el]) => !before.has(el));
          for (const [el, height] of changed) {
            slideRow(el, !val, null, height);
          }
        },
      });
      // a tab in a collapsed folder loading or unloading shows or hides it:
      // LibreWolf's list of shown tabs must hear about it
      guard("folders: loaded tabs stay in view", () => {
        new win.MutationObserver(records => {
          if (records.some(r => r.target.group?.collapsed)) {
            gBrowser.tabContainer._invalidateCachedVisibleTabs?.();
          }
        }).observe(gBrowser.tabContainer, { attributes: true, attributeFilter: ["pending"], subtree: true });
      });

