      // --- LibreWolf's own code, replaced ---
      // Everything this script replaces in LibreWolf, in one list: what it
      // is for, LibreWolf's method, and the new version (in its section
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
      // (LibreWolf makes the preview cards on first hover)
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

      // Everything's in place (rows and folders restored or synced, the
      // start page marked: those run on the same signal, earlier): the tab
      // list fades in (see "browser-window-before-show" above)
      // (without it, the 4s fallback above shows the list)
      guard("start-up fade", () => {
        SessionStore.promiseAllWindowsRestored.then(() => win.setTimeout(() => {
          win.requestAnimationFrame(() => win.requestAnimationFrame(() => doc.documentElement.removeAttribute("arc-starting")));
        }, 0));
      });
    }, "browser-delayed-startup-finished");
  })();
} catch (e) {
  // Never let a failure here break the rest of librewolf.cfg
  try {
    Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService)
      .logStringMessage(`Arc sidebar: ${e}`);
  } catch {}
}
// <<< ARC SIDEBAR SHORTCUT <<<
