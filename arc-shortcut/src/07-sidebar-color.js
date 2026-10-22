      // --- the auto-hide sidebar's color ---
      // The pinned sidebar shows macOS's window background (from the theme,
      // tinted by the wallpaper), which CSS can't read; LibreWolf paints the
      // auto-hide one near-black. So the pinned sidebar is measured (one
      // pixel of empty tab-list space in its middle column, where the eye is:
      // some themes shade it from edge to edge; from a snapshot), per
      // appearance, into arc.sidebarColor.dark / .light, and every window gets
      // it as --arc-sidebar-dark / --arc-sidebar-light (userChrome.css falls
      // back to fixed values). Measured at launch, on theme and light/dark
      // changes, when the window becomes active (a new wallpaper) and when the
      // sidebar gets pinned; only while it is pinned (in auto-hide mode it
      // isn't on screen: the last measurement stays).
      const SIDEBAR_COLOR_PREF = "arc.sidebarColor.";
      const applySidebarColors = () => {
        for (const scheme of ["dark", "light"]) {
          const rgb = prefs.getStringPref(SIDEBAR_COLOR_PREF + scheme, "");
          if (/^\d{1,3}, \d{1,3}, \d{1,3}$/.test(rgb)) {
            doc.documentElement.style.setProperty(`--arc-sidebar-${scheme}`, `rgb(${rgb})`);
          }
        }
      };
      const sidebarBox = doc.getElementById("sidebar-container");
      let measureTimer = null;
      const measureSidebar = (delay = 300) => {
        win.clearTimeout(measureTimer);
        measureTimer = win.setTimeout(async () => {
          const box = sidebarBox?.getBoundingClientRect();
          const pinned = box && box.width > 100 && !doc.documentElement.hasAttribute("sidebar-expand-on-hover") &&
            !sidebarBox.hasAttribute("sidebar-ongoing-animations") && !win.fullScreen;
          if (!pinned) {
            return;
          }
          // an empty spot of the tab list: its middle column, from the bottom
          // of the list up (skipped if tabs fill it)
          const list = doc.getElementById("vertical-tabs")?.getBoundingClientRect();
          const x = Math.round(box.left + box.width / 2);
          let y = null;
          for (let probe = Math.round((list?.bottom ?? 0) - 4); list && probe > list.top + 40 && y === null; probe -= 16) {
            const el = doc.elementFromPoint(x, probe);
            if (el && ["tabbrowser-arrowscrollbox", "vertical-tabs", "tabbrowser-tabs"].includes(el.id)) {
              y = probe;
            }
          }
          if (y === null) {
            return;
          }
          try {
            const rect = new win.DOMRect(x, y, 1, 1);
            const bitmap = await win.browsingContext.currentWindowGlobal.drawSnapshot(rect, 1, "transparent");
            const canvas = doc.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
            canvas.width = canvas.height = 1;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(bitmap, 0, 0);
            const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
            if (a === 255) {
              const scheme = win.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
              prefs.setStringPref(SIDEBAR_COLOR_PREF + scheme, `${r}, ${g}, ${b}`);
            }
          } catch (e) {
            report("sidebar color", e);
          }
        }, delay);
      };
      guard("sidebar color", () => {
        applySidebarColors();
        // every window follows a new measurement (from any window)
        const sidebarColorObserver = { observe: () => applySidebarColors() };
        prefs.addObserver(SIDEBAR_COLOR_PREF, sidebarColorObserver);
        // theme changes
        const themeObserver = { observe: () => measureSidebar(500) };
        obs.addObserver(themeObserver, "lightweight-theme-styling-update");
        win.addEventListener("unload", () => {
          prefs.removeObserver(SIDEBAR_COLOR_PREF, sidebarColorObserver);
          obs.removeObserver(themeObserver, "lightweight-theme-styling-update");
        }, { once: true });
        win.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => measureSidebar(500));
        win.addEventListener("activate", () => measureSidebar(300));
        new win.MutationObserver(() => measureSidebar(600))
          .observe(doc.documentElement, { attributes: true, attributeFilter: ["sidebar-expand-on-hover"] });
        SessionStore.promiseAllWindowsRestored.then(() => measureSidebar(1000));
      });

