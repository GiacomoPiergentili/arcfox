      // Floating edit: an edit in the floating (Cmd+T) bar stays there even if
      // the sidebar opens. Marks the window while such an edit is in
      // progress; userChrome.css does the rest.
      const commandBar = guard("floating edit and command bar", () => {
        const patches = {}; // the URL bar's own code it replaces (see the end)
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
            // Closing, it fades out where it is (as Spotlight does), then goes
            // back to the sidebar; the page has the focus at once
            let fading = null;
            const backInSidebar = revert => {
              fading?.cancel();
              fading = null;
              root.removeAttribute("arc-newtab-fading");
              // without the sidebar bar's width animation
              root.setAttribute("arc-newtab-closing", "");
              win.requestAnimationFrame(() => win.requestAnimationFrame(() =>
                root.removeAttribute("arc-newtab-closing")));
              // Nothing was opened, or another tab was picked: show the current
              // tab's address (held back while the bar was open)
              if (revert) {
                gURLBar.handleRevert();
              }
            };
            const closeBar = () => {
              win.clearTimeout(closeTimer);
              closeTimer = null;
              if (!barOpen()) {
                return;
              }
              const revert = !loading;
              root.removeAttribute("arc-newtab-bar");
              // After Enter, LibreWolf handles the address and the focus
              if (!loading && gURLBar.focused) {
                gBrowser.selectedBrowser.focus();
              }
              loading = false;
              const bar = doc.getElementById("urlbar");
              if (!bar || reducedMotion()) {
                backInSidebar(revert);
                return;
              }
              root.setAttribute("arc-newtab-fading", "");
              const anim = bar.animate([{ opacity: 1, scale: 1 }, { opacity: 0, scale: 0.97 }],
                { duration: 160, easing: CURVE.leave, fill: "forwards" });
              fading = anim;
              anim.finished.then(() => fading === anim && backInSidebar(revert), () => {});
            };
            const openBar = () => {
              // (opened again while still fading out: straight back)
              if (fading) {
                fading.cancel();
                fading = null;
                root.removeAttribute("arc-newtab-fading");
              }
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
            patches.holdAddress = original => function (...args) {
              if (barOpen()) {
                return undefined;
              }
              return original.apply(this, args);
            };
            // Enter loads in a new tab (an empty current tab is still reused)
            patches.enterOpensTab = original => function (event) {
              let where = original.call(this, event);
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
        return patches;
      }) ?? {};

