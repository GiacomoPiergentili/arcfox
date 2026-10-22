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
      guard("auto-archive", () => {
        // shortly after launch (once the session is back), then every 10 minutes
        SessionStore.promiseAllWindowsRestored.then(() => win.setTimeout(archiveOldTabs, 30 * 1000));
        win.setInterval(archiveOldTabs, 10 * 60 * 1000);
      });

