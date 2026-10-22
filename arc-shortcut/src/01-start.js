// >>> ARC SIDEBAR SHORTCUT >>>
// Appended to firefox.cfg by arc-shortcut/install.sh, which joins
// arc-shortcut/src/*.js in order into this one script. The files are pieces
// of it, not modules: 01 opens the per-window set-up (and its guard /
// patch helpers), each following file is one feature's section of it, and
// the last lists every replacement of Firefox's code and closes it.
// Cmd+S switches the sidebar between "always show" and "expand on hover".
// A sidebar button next to the window buttons does the same; no sidebar gear.
// Cmd+D toggles a pinned row, Cmd+Shift+D a favorite tile (Arc-style).
// Tab groups are kept as pinned folders (saved and restored with the rows).
// Keeps an edit in the floating URL bar floating when the sidebar opens.
// Cmd+T / + New Tab open the floating URL bar; Enter opens the new tab.
// New windows (and launch) start with that bar instead of a blank tab.
// Closing a row, a tile or the last tab never loads an unloaded row; Cmd+W
// on the empty page does nothing.
// Pinned rows and tiles remember their pinned page (dot while away).
// Selected tiles take their icon's colors (as in Zen).
// Cmd+Shift+C copies the page's address; Cmd+1…9 go to the tiles, then the rows.
// Normal tabs unused for a day close by themselves (arc.archiveAfterHours).
// The auto-hide sidebar takes the pinned sidebar's measured color (theme, wallpaper).
// Every window shows the same tiles, rows and folders, kept in sync.
// Dragging a tab onto the page opens it in split view, on that side.
try {
  (() => {
    const Cc = Components.classes;
    const Ci = Components.interfaces;
    const prefs = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch);
    const obs = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
    const PREF = "sidebar.visibility";
    // Errors go to the browser console (Tools > Browser Tools). Not through
    // console.error: this file runs where there is no console, so that
    // threw instead (and a throw in a catch escapes it).
    const report = (what, e) => {
      try {
        Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService)
          .logStringMessage(`Arc sidebar (${what}): ${e}${e?.stack ? "\n" + e.stack : ""}`);
      } catch {}
    };
    // Dragging a tab onto another one reorders it (as in Arc) instead of
    // pausing to create a tab group. (Defaults the script relies on are set
    // here, so they come with it and need no pref file of their own.)
    const defaults = Cc["@mozilla.org/preferences-service;1"]
      .getService(Ci.nsIPrefService)
      .getDefaultBranch("");
    defaults.setBoolPref("browser.tabs.dragDrop.createGroup.enabled", false);
    // With no tiles yet, the slot for the first one opens as soon as a tab
    // is dragged to the top (Firefox waits half a second)
    defaults.setIntPref("browser.tabs.dragDrop.pinInteractionCue.delayMS", 150);
    // Auto-archive (see below): hours a normal tab may stay unused; 0 = off
    const ARCHIVE_PREF = "arc.archiveAfterHours";
    // This repo's folder (the look), filled in by install.sh: a profile
    // without it gets it linked as its chrome folder on its first run
    const ARC_CHROME_DIR = "__ARC_CHROME_DIR__";
    defaults.setIntPref(ARCHIVE_PREF, 24);
    // Tiles load when first opened, like the pinned rows: loading every
    // tile's page at launch made start-up slow and busy (and left the tiles
    // blank while they loaded)
    defaults.setBoolPref("browser.sessionstore.restore_pinned_tabs_on_demand", true);
    // No Firefox tool buttons (Bookmarks, History...) in the sidebar's
    // bottom row: it has Downloads, the profiles and Extensions. Taken out
    // of the list before the first window is drawn, so they're never made
    // (hiding them from the window's own set-up let them flash at launch).
    // Extensions' sidebar buttons (ids with @ or {) stay listed. (And a new
    // profile doesn't get Firefox's starter set of them: that's for
    // profiles that haven't "used the new sidebar" yet.)
    defaults.setBoolPref("sidebar.new-sidebar.has-used", true);
    // Downloads always sits at the left of the sidebar's bottom row (Firefox
    // would hide it until there's a download)
    defaults.setBoolPref("browser.download.autohideButton", false);
    try {
      const userPrefs = Cc["@mozilla.org/preferences-service;1"]
        .getService(Ci.nsIPrefService)
        .getBranch("");
      const tools = userPrefs.getStringPref("sidebar.main.tools", "");
      const kept = tools.split(",").filter(t => /[@{]/.test(t)).join(",");
      if (kept !== tools) {
        userPrefs.setStringPref("sidebar.main.tools", kept);
      }
    } catch (e) {}

    // No "Customize sidebar" gear or Firefox tool buttons in the sidebar's
    // bottom row (they live in the sidebar's shadow DOM, which userChrome.css
    // can't reach). Its settings stay in Settings > General > Browser layout.
    // Without the gear Firefox shows a "More tools" button, with nothing to
    // show in it. Done before the window is first shown (doing it in the
    // window's own set-up, after it's drawn, let the gear flash at launch).
    // Any tool button that still turns up (an extension's) is invisible but
    // keeps the row's height, so the tab list stops above the row.
    const styleSidebarMain = doc => {
      const sidebarMain = doc.querySelector("sidebar-main");
      if (!sidebarMain) {
        return;
      }
      const add = () => {
        const root = sidebarMain.shadowRoot;
        if (!root || root.getElementById("arc-sidebar-main-style")) {
          return !!root;
        }
        const style = doc.createElementNS("http://www.w3.org/1999/xhtml", "style");
        style.id = "arc-sidebar-main-style";
        style.textContent = `
          moz-button[view="viewCustomizeSidebar"], .more-tools-button { display: none !important; }
          .tools-and-extensions moz-button { visibility: hidden !important; }
          .tools-and-extensions { gap: 4px !important; padding-inline-start: 9px !important; }
          .tools-and-extensions moz-button {
            --button-size-icon: 30px !important; /* Firefox sizes them from the tab height */
            --button-border-radius: var(--arc-radius-inner) !important;
            --button-background-color-ghost-hover: var(--arc-fill-hover) !important;
            --button-background-color-ghost-active: var(--arc-fill-selected) !important;
          }`;
        root.append(style);
        return true;
      };
      if (!add()) {
        doc.defaultView.customElements.whenDefined("sidebar-main").then(add);
      }
    };

    // A starting window's tab list stays hidden ([arc-starting]) until its
    // tiles, rows, folders and start page are in place, then fades in:
    // otherwise they popped in one by one (a stray "New Tab" row, blank
    // tiles, icons arriving late). Set before the window is first shown;
    // cleared by the window's own set-up below, or after 4s whatever happens.
    obs.addObserver(win => {
      try {
        if (win.toolbar?.visible === false) {
          return;
        }
        styleSidebarMain(win.document);
        const root = win.document.documentElement;
        root.setAttribute("arc-starting", "");
        win.setTimeout(() => root.removeAttribute("arc-starting"), 4000);
      } catch {}
    }, "browser-window-before-show");

    // Option+click on a link in a page opens it in Peek, from any tab (as in
    // Zen). Firefox does nothing with it otherwise (no navigation, no
    // download): where a clicked link opens is decided in BrowserUtils, so
    // the click asks for a new tab in front, which the window then shows as a
    // Peek (see "Peek" below). Only clicks in pages: bookmarks, menus and the
    // URL bar keep their own meaning for Option. Set up once the first
    // window is open: loading Firefox's modules this early in start-up
    // (this file runs before almost anything) could stall it.
    let altPeekAt = 0;
    let altPeekHooked = false;
    // (the profile's user.js is checked once a launch, see below)
    let verticalTabsKept = false;
    const hookAltPeek = () => {
      if (altPeekHooked) {
        return;
      }
      altPeekHooked = true;
      try {
        const { BrowserUtils } = ChromeUtils.importESModule("resource://gre/modules/BrowserUtils.sys.mjs");
        const whereToOpenLink = BrowserUtils.whereToOpenLink;
        BrowserUtils.whereToOpenLink = function (e, ignoreButton, ignoreAlt) {
          const where = whereToOpenLink.call(this, e, ignoreButton, ignoreAlt);
          const fromPage = !!e && typeof e.href === "string" && "referrerInfo" in e;
          if (where === "current" && fromPage && e.altKey && !ignoreAlt && !e.shiftKey && !e.ctrlKey && !e.metaKey && e.button === 0) {
            altPeekAt = Date.now();
            return prefs.getBoolPref("browser.tabs.loadInBackground", true) ? "tabshifted" : "tab";
          }
          return where;
        };
      } catch (e) {
        report("Option+click Peek", e);
      }
    };

    function toggleSidebarMode() {
      const current = prefs.getStringPref(PREF, "always-show");
      prefs.setStringPref(PREF, current === "expand-on-hover" ? "always-show" : "expand-on-hover");
    }

    obs.addObserver(win => {
      const doc = win.document;
      // Each feature sets itself up on its own: if a Firefox update breaks
      // one (a renamed element or function), only that feature is missing,
      // and the browser console says which. (Its helpers are plain
      // definitions, which can't fail, so they stay outside.)
      // What the start-up fade waits for besides the tabs and their icons
      // (promises; half a second at most, see the end)
      const startupWaits = [];
      const guard = (name, setUp) => {
        try {
          return setUp();
        } catch (e) {
          report(`${name}: not set up`, e);
          return undefined;
        }
      };
      // Motion, shared by every animation here: the system's Reduce Motion,
      // and the curves (settle and leave are userChrome.css's
      // --arc-ease-open and --arc-ease-close)
      const reducedMotion = () => win.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const CURVE = {
        settle: "cubic-bezier(0.32, 0.72, 0, 1)", // arriving: fast start, soft landing
        leave: "cubic-bezier(0.4, 0, 1, 1)", // leaving: accelerates away
        pop: "cubic-bezier(0.2, 0.9, 0.3, 1)", // Peek's card growing out of a link
      };
      // Firefox's own code that this script replaces goes through here, a
      // method at a time: replace(original) gives the new version, which
      // calls the original as it needs. If an update renamed it, Firefox's
      // stays as it is and only that feature is off.
      const patch = (name, owner, method, replace) => guard(name, () => {
        const original = owner?.[method];
        if (typeof replace !== "function") {
          throw new Error("its section isn't set up");
        }
        if (typeof original !== "function") {
          throw new Error(`Firefox's ${method} isn't there any more`);
        }
        owner[method] = replace(original);
      });
      // (the same for a property Firefox gives a getter and setter, looked
      // up along the owner's prototypes: replace(descriptor) gives the new one)
      const patchProperty = (name, owner, prop, replace) => guard(name, () => {
        if (typeof replace !== "function") {
          throw new Error("its section isn't set up");
        }
        let descriptor = null;
        for (let o = owner; o && !descriptor; o = Object.getPrototypeOf(o)) {
          descriptor = Object.getOwnPropertyDescriptor(o, prop);
        }
        if (!descriptor?.get) {
          throw new Error(`Firefox's ${prop} isn't there any more`);
        }
        Object.defineProperty(owner, prop, { configurable: true, ...replace(descriptor) });
      });
      // Marks the window as running this script: userChrome.css shows a
      // notice when it's missing (e.g. after a Firefox update replaced it)
      doc.documentElement.setAttribute("arc-script", "");
      // (a window is open: Firefox is far enough along for this)
      win.setTimeout(hookAltPeek, 0);
      // A profile's first run with this setup: the settings the layout relies
      // on, once; what you change later stays. (A profile without the look
      // gets it linked here too, see below.)
      guard("profile defaults", () => {
        if (!prefs.getBoolPref("arc.profileDefaultsApplied", false)) {
          const setIfDefault = (name, value) => {
            try {
              if (prefs.prefHasUserValue(name)) {
                return;
              }
              if (typeof value === "boolean") {
                prefs.setBoolPref(name, value);
              } else {
                prefs.setStringPref(name, value);
              }
            } catch {}
          };
          setIfDefault("browser.toolbars.bookmarks.visibility", "never"); // no room for it in the sidebar
          setIfDefault("browser.startup.homepage", "chrome://browser/content/blanktab.html"); // launch: the empty page with the command bar
          setIfDefault("browser.newtabpage.enabled", false);
          setIfDefault("sidebar.verticalTabs.dragToPinPromo.dismissed", true); // (a card in the tiles' place)
          setIfDefault("sidebar.new-sidebar.has-used", true);
          // The toolbar buttons the layout places (back, forward and reload
          // at the top, Downloads and Extensions in the bottom row): a new
          // Firefox profile with vertical tabs leaves reload and Downloads out
          try {
            const { CustomizableUI } = win;
            const place = (id, before) => {
              if (!CustomizableUI.getPlacementOfWidget(id)) {
                const at = before && CustomizableUI.getPlacementOfWidget(before);
                CustomizableUI.addWidgetToArea(id, CustomizableUI.AREA_NAVBAR, at?.area === CustomizableUI.AREA_NAVBAR ? at.position : undefined);
              }
            };
            place("back-button", "urlbar-container");
            place("forward-button", "urlbar-container");
            place("stop-reload-button", "urlbar-container");
            place("downloads-button");
            place("unified-extensions-button");
          } catch (e) {
            report("toolbar buttons", e);
          }
          prefs.setBoolPref("arc.profileDefaultsApplied", true);
          // A profile without the look (made from Firefox's Profiles menu):
          // its chrome folder becomes a link to this repo, and the settings
          // that load it go on; it shows from the next start (offered below)
          try {
            const chrome = win.Services.dirsvc.get("UChrm", Ci.nsIFile);
            const sheet = chrome.clone();
            sheet.append("userChrome.css");
            if (!sheet.exists() && !ARC_CHROME_DIR.startsWith("__")) {
              if (chrome.exists() && chrome.isDirectory() && !chrome.directoryEntries.hasMoreElements()) {
                chrome.remove(false);
              }
              if (!chrome.exists()) {
                const ln = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
                ln.initWithPath("/bin/ln");
                const proc = Cc["@mozilla.org/process/util;1"].createInstance(Ci.nsIProcess);
                proc.init(ln);
                proc.run(true, ["-s", ARC_CHROME_DIR, chrome.path], 3);
              }
              for (const name of ["toolkit.legacyUserProfileCustomizations.stylesheets", "sidebar.revamp", "sidebar.verticalTabs"]) {
                prefs.setBoolPref(name, true);
              }
              win.setTimeout(() => {
                win.gNotificationBox?.appendNotification("arc-restart", {
                  label: "This profile is set up for the Arc sidebar. Restart Firefox to see it.",
                  priority: win.gNotificationBox.PRIORITY_INFO_HIGH,
                }, [{
                  label: "Restart",
                  callback: () => win.Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit | Ci.nsIAppStartup.eRestart),
                }]);
              }, 1500);
            }
          } catch (e) {
            report("profile set-up", e);
          }
        }
      });
      // Back, forward and reload stay in that order, together (a profile's
      // saved toolbar can have them otherwise: reload, forward, back)
      guard("toolbar button order", () => {
        const { CustomizableUI } = win;
        const ids = ["back-button", "forward-button", "stop-reload-button"];
        const at = id => CustomizableUI.getPlacementOfWidget(id);
        const inOrder = () => ids.every((id, i) => at(id)?.area === CustomizableUI.AREA_NAVBAR &&
          (i === 0 || at(id).position === at(ids[i - 1]).position + 1));
        if (!ids.every(id => at(id)?.area === CustomizableUI.AREA_NAVBAR) || inOrder()) {
          return;
        }
        const start = Math.min(...ids.map(id => at(id).position));
        ids.forEach((id, i) => CustomizableUI.moveWidgetWithinArea(id, start + i));
        if (!inOrder()) {
          throw new Error("couldn't put back, forward and reload in order");
        }
      });
      // Vertical tabs stay on even without this script or Betterfox's
      // defaults (a Firefox update can take both out of the app; Firefox's
      // own default is horizontal tabs): the profile's user.js, which
      // Firefox applies at every start, turns them on. Checked once a launch.
      guard("vertical tabs kept on", () => {
        if (verticalTabsKept) {
          return;
        }
        verticalTabsKept = true;
        const userJs = win.Services.dirsvc.get("ProfD", Ci.nsIFile);
        userJs.append("user.js");
        const lines = ['user_pref("sidebar.revamp", true);', 'user_pref("sidebar.verticalTabs", true);'];
        win.IOUtils.readUTF8(userJs.path).catch(() => "").then(text => {
          const missing = lines.filter(line => !text.includes(line));
          if (missing.length) {
            const start = text && !text.endsWith("\n") ? "\n" : "";
            return win.IOUtils.writeUTF8(userJs.path, text + start +
              "// arcfox: the Arc sidebar is built on vertical tabs (kept on even if a\n" +
              "// Firefox update removes arc-shortcut/install.sh's files from the app)\n" +
              missing.join("\n") + "\n");
          }
          return undefined;
        }).catch(e => report("vertical tabs kept on", e));
      });
      // Reuse the existing Cmd+S key: detach it from "Save Page" and run our
      // toggle instead (without it, just this is missing)
      guard("Cmd+S", () => {
        const key = doc.getElementById("key_savePage");
        if (!key) {
          return;
        }
        key.removeAttribute("command");
        key.addEventListener("command", toggleSidebarMode);
        // Drop the now-wrong "⌘S" hint next to File > Save Page As (the menu item still works)
        doc.getElementById("menu_savePage")?.removeAttribute("key");
      });

      // A sidebar button right after the window buttons does the same as
      // Cmd+S (its icon comes from userChrome.css)
      guard("sidebar button", () => {
        const buttonbox = doc.querySelector("#nav-bar > .titlebar-buttonbox-container");
        if (buttonbox) {
          const sidebarButton = doc.createXULElement("toolbarbutton");
          sidebarButton.id = "arc-sidebar-button";
          sidebarButton.className = "toolbarbutton-1";
          sidebarButton.setAttribute("tooltiptext", "Show or Auto-Hide Sidebar (⌘S)");
          // its name for VoiceOver (toolbar buttons show only their icon)
          sidebarButton.setAttribute("label", "Sidebar");
          sidebarButton.addEventListener("command", toggleSidebarMode);
          buttonbox.after(sidebarButton);
        }
      });

      // (the sidebar's bottom row: see styleSidebarMain above; normally done
      // before the window was shown)
      guard("bottom row", () => styleSidebarMain(doc));

      // Tiles stay a grid with the sidebar on auto-hide too (Firefox turns
      // them into a list there): the grid lives inside the pinned area's
      // shadow DOM, which userChrome.css can't reach. Same values Firefox
      // uses for the pinned sidebar.
      guard("tile grid", () => {
        const pinnedArea = doc.getElementById("pinned-tabs-container");
        if (pinnedArea?.shadowRoot) {
          const style = doc.createElementNS("http://www.w3.org/1999/xhtml", "style");
          style.textContent = `
            :host([orient="vertical"]) [part~="items-wrapper"] {
              display: grid !important;
              grid-template-columns: repeat(auto-fit, minmax(var(--tab-pinned-min-width), auto)) !important;
              grid-auto-rows: var(--tab-height-with-margin-padding) !important;
              padding-inline: var(--tab-container-margin-inline-pinned-expanded) !important;
            }
            /* a tile sliding into a new line while a tab is dragged over the
               tiles (Firefox fixes this box's height during drags) */
            :host([arc-tiles-growing]) [part~="scrollbox"] {
              overflow: visible !important;
            }`;
          pinnedArea.shadowRoot.append(style);
        }
      });

