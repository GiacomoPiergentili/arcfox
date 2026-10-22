      // --- Firefox's own code, replaced ---
      // Everything this script replaces in Firefox, in one list: what it
      // is for, Firefox's method, and the new version (in its section
      // above). If an update renames one, only that feature is off and the
      // browser console says "Arc sidebar (...): not set up". (Option+click's
      // link handling is replaced once for the whole app, at the top.)
      patch("tabs slide shut", gBrowser, "_endRemoveTab", slideShutBeforeRemoving);
      patch("closing a pinned row or tile resets it", gBrowser, "removeTab", resetInsteadOfClosing);
      patch("deleting a folder closes its tabs", gBrowser, "removeTabGroup", folderTabsReallyClose);
      patch("Cmd+W on a tile", win.BrowserCommands, "closeTabOrWindow", closeTilesToo);
      patch("split view: in the row's spot", gBrowser, "addTabSplitView", splitView.inRowSpot);
      patch("split view: a row joining", gBrowser, "moveTabToSplitView", splitView.rowJoins);
      patch("split view: separating glides", splitClass?.prototype, "unsplitTabs", glideApart);
      patch("folders: loaded tabs stay in view", folderClass?.prototype, "isTabVisibleInGroup", showLoadedTabs);
      patchProperty("folders: rows slide", folderClass?.prototype, "collapsed", slideFolderRows);
      patchProperty("+ New Tab while dragging", periphery, "screenY", reportListEnd);
      patch("drag and drop: no page thumbnail", win.DataTransfer?.prototype, "updateDragImage", noThumbnailForTabs);
      // (Firefox makes the preview cards on first hover)
      guard("no tab previews while dragging", () => {
        let patched = false;
        const whenThere = () => {
          const panel = gBrowser.tabContainer.previewPanel;
          if (panel && !patched) {
            patched = true;
            gBrowser.tabContainer.removeEventListener("mouseover", whenThere, true);
            patch("no tab previews while dragging", panel, "shouldActivate", noPreviewsWhileDragging);
          }
        };
        gBrowser.tabContainer.addEventListener("mouseover", whenThere, true);
        whenThere();
      });
      patch("command bar: the address waits", win.gURLBar, "setURI", commandBar.holdAddress);
      patch("command bar: Enter opens a tab", win.gURLBar?.controller, "whereToOpen", commandBar.enterOpensTab);

      // Everything's in place (rows and folders restored or synced and the
      // start page marked, which run on the same signal, earlier; every
      // icon shown loaded and the profiles drawn, for half a second at
      // most): the sidebar's contents and the command bar fade in together,
      // in one go (see "browser-window-before-show" at the top; without
      // this, its 4s fallback shows them)
      guard("start-up fade", () => {
        const root = doc.documentElement;
        const iconsLoaded = () => Promise.allSettled(
          [...gBrowser.tabContainer.querySelectorAll(".tab-icon-image[src]")]
            .filter(img => !img.complete && img.getBoundingClientRect().width > 0)
            .map(img => img.decode()));
        const fadeIn = () => {
          if (!root.hasAttribute("arc-starting")) {
            return;
          }
          // (the attribute goes in the same frame the fade starts: the first
          // frame drawn is its start)
          root.removeAttribute("arc-starting");
          if (reducedMotion()) {
            return;
          }
          const parts = [
            [doc.getElementById("nav-bar-customization-target")],
            [doc.getElementById("arc-sidebar-button")],
            [gBrowser.tabContainer],
            [doc.getElementById("nav-bar"), "::after"],
          ];
          for (const [el, pseudoElement] of parts) {
            el?.animate({ opacity: [0, 1] }, { duration: 250, easing: "ease-out", pseudoElement });
          }
        };
        SessionStore.promiseAllWindowsRestored.then(async () => {
          await new Promise(done => win.setTimeout(done, 0));
          await Promise.race([
            Promise.allSettled([iconsLoaded(), ...startupWaits]),
            new Promise(done => win.setTimeout(done, 500)),
          ]);
          win.requestAnimationFrame(() => win.requestAnimationFrame(fadeIn));
        });
      });
    }, "browser-delayed-startup-finished");
  })();
} catch (e) {
  // Never let a failure here break the rest of firefox.cfg
  try {
    Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService)
      .logStringMessage(`Arc sidebar: ${e}`);
  } catch {}
}
// <<< ARC SIDEBAR SHORTCUT <<<
