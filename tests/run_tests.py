#!/usr/bin/env python3
"""Regression tests for librewolf-arc.

Launches LibreWolf with a fresh, throwaway profile that uses this repo's
userChrome.css, drives it through Marionette (LibreWolf's built-in remote
control) and checks the key behaviors: layout and spacing, tile colors, the
Cmd+T bar, shortcuts, closing rules, auto-hide tiles, the sidebar color
measurement, rows and folders across a restart, and auto-archive.

Requirements: LibreWolf in /Applications and the script installed into it
(arc-shortcut/install.sh). Nothing else: Python 3 standard library only.
Your own profile is never touched; the test profile is deleted afterwards.

    python3 tests/run_tests.py            # all tests, about 2 minutes
    python3 tests/run_tests.py --keep     # keep the test profile (prints its path)

Exit code 0 when everything passes, 1 otherwise.
"""
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time

APP = "/Applications/LibreWolf.app/Contents/MacOS/librewolf"
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 2839  # its own port, so it never talks to another LibreWolf

PREFS = {
    "marionette.port": PORT,
    "toolkit.legacyUserProfileCustomizations.stylesheets": True,
    "sidebar.revamp": True,
    "sidebar.verticalTabs": True,
    "sidebar.visibility": "always-show",
    "browser.shell.checkDefaultBrowser": False,
    "browser.aboutwelcome.enabled": False,
    "browser.tabs.warnOnClose": False,
    "browser.translations.automaticallyPopup": False,
    "datareporting.policy.dataSubmissionEnabled": False,
}


# ---------------------------------------------------------------- Marionette
class Marionette:
    def __init__(self):
        self.sock = socket.create_connection(("127.0.0.1", PORT), timeout=200)
        self.buf = b""
        self.msgid = 0
        self._read()  # server hello
        self.cmd("WebDriver:NewSession", {"capabilities": {}})
        self.cmd("WebDriver:SetTimeouts", {"script": 180000})
        self.cmd("Marionette:SetContext", {"value": "chrome"})

    def _read(self):
        while b":" not in self.buf:
            self.buf += self.sock.recv(65536)
        size, rest = self.buf.split(b":", 1)
        size = int(size)
        while len(rest) < size:
            rest += self.sock.recv(65536)
        self.buf = rest[size:]
        return json.loads(rest[:size])

    def cmd(self, name, params):
        self.msgid += 1
        data = json.dumps([0, self.msgid, name, params]).encode()
        self.sock.sendall(str(len(data)).encode() + b":" + data)
        while True:
            msg = self._read()
            if msg[1] == self.msgid:
                if msg[2]:
                    raise RuntimeError(json.dumps(msg[2])[:800])
                return msg[3]

    def js(self, body):
        """Runs `body` (async function body) in the browser window; returns its result."""
        script = "return (async () => {\n" + HELPERS + "\n" + body + "\n})();"
        return self.cmd("WebDriver:ExecuteScript", {"script": script, "args": []})["value"]

    def close(self):
        try:
            self.sock.close()
        except OSError:
            pass


# Shared helpers available to every test
HELPERS = r"""
const wait = ms => new Promise(k => setTimeout(k, ms));
const root = document.documentElement;
const P = Services.scriptSecurityManager.getSystemPrincipal();
const R = e => { const b = e.getBoundingClientRect(); return {x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom}; };
const bg = t => R(t.querySelector(".tab-background"));
const isRow = t => t.hasAttribute("arc-pinned-row");
const tiles = () => gBrowser.tabs.filter(t => t.pinned);
const rows = () => gBrowser.tabs.filter(t => !t.pinned && isRow(t));
const normals = () => gBrowser.tabs.filter(t => !t.pinned && !isRow(t) && !t.hasAttribute("arc-start-page"));
const near = (a, b, tol = 0.6) => Math.abs(a - b) <= tol;
const icon = color => "data:image/svg+xml," + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><circle cx='8' cy='8' r='8' fill='${color}'/></svg>`);
const page = (title, color) => "data:text/html," + encodeURIComponent(`<title>${title}</title>` + (color ? `<link rel="icon" href="${icon(color)}">` : "") + `<body style="background:#fff">${title}</body>`);
const barOpen = () => root.hasAttribute("arc-newtab-bar");
const newTabKey = () => document.getElementById("key_newNavigatorTab").doCommand();
const fail = [];
const check = (cond, what) => { if (!cond) fail.push(what); };
const result = info => ({ok: fail.length === 0, fail, info});
"""


# ---------------------------------------------------------------- tests
SETUP = r"""
document.getElementById("sidebar-container").style.width = "260px";
for (const t of [...gBrowser.tabs].filter(t => !t.pinned)) { t.removeAttribute("arc-pinned-row"); }
const keep = gBrowser.addTab(page("Keep", null), {triggeringPrincipal: P});
gBrowser.selectedTab = keep; await wait(300);
for (const t of [...gBrowser.tabs].filter(t => t !== keep)) { if (t.pinned) gBrowser.unpinTab(t); gBrowser.removeTab(t, {animate: false}); }
const add = (title, color) => gBrowser.addTab(page(title, color), {triggeringPrincipal: P});
const tileTabs = [add("Red", "#e33"), add("Green", "#2a5"), add("Blue", "#36e")];
for (const t of tileTabs) gBrowser.pinTab(t);
const rowTabs = [add("Row A"), add("Row B"), add("Folder A"), add("Folder B")];
const rowKey = document.getElementById("addBookmarkAsKb");
for (const t of rowTabs) { gBrowser.selectedTab = t; await wait(350); rowKey.doCommand(); await wait(450); }
gBrowser.addTabGroup(rowTabs.slice(2), {label: "Folder", color: "blue"});
add("Normal 1"); add("Normal 2");
gBrowser.removeTab(keep, {animate: false});
await wait(1500);
gBrowser.selectedTab = gBrowser.tabs.find(t => t.label === "Normal 2"); await wait(1000);
return result({tabs: gBrowser.tabs.map(t => (t.pinned ? "tile:" : isRow(t) ? "row:" : "tab:") + t.label)});
"""

TESTS = [
    ("script is installed and running", r"""
check(root.hasAttribute("arc-script"), "the window isn't marked [arc-script]: run arc-shortcut/install.sh");
return result({});
"""),

    ("setup: tiles, rows, folder, tabs", SETUP),

    ("layout: rows, gaps, divider, columns", r"""
const sb = R(document.getElementById("sidebar-container"));
const urlbar = R(document.querySelector("#urlbar .urlbar-background"));
const t = tiles(), rw = rows(), n = normals();
const label = document.querySelector("tab-group .tab-group-label-container");
const nt = R(document.getElementById("tabs-newtab-button"));
check(t.every(x => near(bg(x).h, 40)), "tiles are 40px tall");
check(near(bg(t[1]).x - bg(t[0]).r, 8), "8px between tiles: " + (bg(t[1]).x - bg(t[0]).r).toFixed(1));
check(near(bg(t[0]).y - urlbar.b, 16), "16px from the URL bar to the tiles: " + (bg(t[0]).y - urlbar.b).toFixed(1));
check(near(bg(rw[0]).y - bg(t[0]).b, 16), "16px from the tiles to the first row: " + (bg(rw[0]).y - bg(t[0]).b).toFixed(1));
check([...rw, ...n].every(x => near(bg(x).h, 32)), "rows and tabs are 32px tall");
check(near(bg(rw[1]).y - bg(rw[0]).b, 4), "4px between rows: " + (bg(rw[1]).y - bg(rw[0]).b).toFixed(1));
check(near(R(label).y - bg(rw[1]).b, 4), "4px above the folder name");
check(near(nt.y - bg(rw.at(-1)).b, 17), "8px, the divider, 8px above + New Tab: " + (nt.y - bg(rw.at(-1)).b).toFixed(1));
check(near(bg(n[0]).y - nt.b, 4), "4px from + New Tab to the first tab: " + (bg(n[0]).y - nt.b).toFixed(1));
for (const x of [rw[0], n[0]]) {
  const ic = R(x.querySelector(".tab-icon-image")), lb = x.querySelector(".tab-label").getBoundingClientRect();
  check(near(ic.x - sb.x, 20), x.label + ": icon at 20px: " + (ic.x - sb.x).toFixed(1));
  check(near(lb.x - sb.x, 44, 1), x.label + ": title at 44px: " + (lb.x - sb.x).toFixed(1));
}
return result({});
"""),

    ("tile colors", r"""
await wait(1000);
const [red, green, blue] = tiles();
check(red.hasAttribute("arc-tile-colored"), "the red tile has colors");
const c1 = red.style.getPropertyValue("--arc-tile-c1");
check(/^rgb\((2[0-9]{2}|1[5-9][0-9]), ([0-9]{1,2}), ([0-9]{1,2})\)$/.test(c1), "the red tile's main color is red: " + c1);
check(green.style.getPropertyValue("--arc-tile-c1") !== c1, "tiles get their own colors");
return result({c1});
"""),

    ("Cmd+T bar: open, Esc, Enter, quick Cmd+T", r"""
gBrowser.selectedTab = gBrowser.tabs.find(t => t.label === "Normal 2"); await wait(500);
const count = gBrowser.tabs.length;
newTabKey(); await wait(400);
check(barOpen(), "Cmd+T opens the bar");
check(gURLBar.value === "", "the bar starts empty");
check(gBrowser.tabs.length === count, "Cmd+T creates no tab");
check(getComputedStyle(document.getElementById("tabs-newtab-button")).backgroundColor !== "rgba(0, 0, 0, 0)", "+ New Tab is highlighted");
gURLBar.inputField.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true})); await wait(400);
check(!barOpen(), "Esc closes it");
check(gURLBar.value !== "", "Esc shows the page's address again");
newTabKey(); await wait(400);
gURLBar.value = "about:robots"; gURLBar.inputField.dispatchEvent(new Event("input", {bubbles: true})); await wait(400);
gURLBar.handleCommand(new KeyboardEvent("keydown", {key: "Enter"}));
await wait(150);
newTabKey(); await wait(300);
check(barOpen(), "Cmd+T right after Enter opens the bar");
await wait(2000);
check(gBrowser.tabs.length === count + 1, "Enter opened one new tab");
check(gURLBar.value === "", "the bar stays empty while the other tab loads: '" + gURLBar.value + "'");
newTabKey(); await wait(400);
check(!barOpen(), "Cmd+T again closes it");
const robots = gBrowser.tabs.find(t => t.linkedBrowser.currentURI.spec === "about:robots");
if (robots) gBrowser.removeTab(robots, {animate: false});
return result({});
"""),

    ("shortcuts: Cmd+1…9, Cmd+Shift+C", r"""
const press = (code, shift) => window.dispatchEvent(new KeyboardEvent("keydown", {code, metaKey: true, shiftKey: !!shift, bubbles: true, cancelable: true}));
press("Digit1"); await wait(300);
check(gBrowser.selectedTab === tiles()[0], "Cmd+1 goes to the first tile");
press("Digit4"); await wait(300);
check(gBrowser.selectedTab === rows()[0], "Cmd+4 goes to the first row (after 3 tiles)");
const cb = Services.clipboard;
const read = () => { const t = Cc["@mozilla.org/widget/transferable;1"].createInstance(Ci.nsITransferable); t.init(null); t.addDataFlavor("text/plain"); try { cb.getData(t, cb.kGlobalClipboard, null); const o = {}; t.getTransferData("text/plain", o); return o.value.QueryInterface(Ci.nsISupportsString).data; } catch { return null; } };
const saved = read();
gBrowser.selectedTab = gBrowser.tabs.find(t => t.label === "Normal 1"); await wait(500);
press("KeyC", true); await wait(200);
check(read() === gBrowser.currentURI.spec, "Cmd+Shift+C copies the address");
check(document.getElementById("arc-toast")?.hasAttribute("shown"), "\"Link Copied\" shows");
if (saved !== null) Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper).copyString(saved);
return result({});
"""),

    ("closing: tiles reset, unloaded rows stay unloaded", r"""
const tile = tiles()[1];
gBrowser.selectedTab = tile; await wait(800);
BrowserCommands.closeTabOrWindow(); await wait(1500);
check(tile.isConnected && tile.pinned, "Cmd+W keeps the tile");
check(gBrowser.selectedTab !== tile, "Cmd+W leaves the tile");
check(!tile.hasAttribute("visuallyselected"), "no stale 'on screen' mark on the tile");
for (const r of rows()) gBrowser.discardBrowser(r, true);
await wait(500);
const last = gBrowser.addTab(page("Last"), {triggeringPrincipal: P});
for (const t of normals().filter(t => t !== last)) gBrowser.removeTab(t, {animate: false});
gBrowser.selectedTab = last; await wait(800);
for (const r of rows()) if (!r.hasAttribute("pending")) gBrowser.discardBrowser(r, true);
await wait(300);
gBrowser.removeTab(last); await wait(1200);
check(rows().every(r => r.hasAttribute("pending")), "closing the last tab loads no unloaded row");
for (const n of ["Normal 1", "Normal 2"]) gBrowser.addTab(page(n), {triggeringPrincipal: P});
await wait(800);
return result({selectedAfter: gBrowser.selectedTab.label});
"""),

    ("split view: drag a tab onto the page", r"""
const a = gBrowser.addTab(page("Split A"), {triggeringPrincipal: P});
const b = gBrowser.addTab(page("Split B"), {triggeringPrincipal: P});
gBrowser.selectedTab = a; await wait(800);
const ov = document.getElementById("arc-split-drop");
const drag = (tab, type, x = 0.5) => { const box = ov.getBoundingClientRect();
  const e = new DragEvent(type, {bubbles: true, cancelable: true, dataTransfer: new DataTransfer(), clientX: box.x + box.width * x, clientY: box.y + 100});
  (type === "dragstart" ? tab : ov.lastElementChild).dispatchEvent(e); return e; };
drag(tiles()[0], "dragstart");
check(!ov.hasAttribute("active"), "a tile can't be split");
window.dispatchEvent(new DragEvent("dragend"));
gBrowser.selectedTab = a; await wait(300);
b.dispatchEvent(new MouseEvent("mousedown", {bubbles: true, button: 0}));
gBrowser.selectedTab = b; await wait(300);  // pressing on a tab selects it
drag(b, "dragstart");
check(ov.hasAttribute("active"), "dragging a tab shows the drop zones");
const tb = R(document.getElementById("tabbrowser-tabbox")), o = R(ov);
check(near(o.x, tb.x) && near(o.w, tb.w) && near(o.h, tb.h), "the drop zones cover the page");
check(drag(b, "dragover", 0.25).defaultPrevented && ov.getAttribute("side") === "left", "the left half lights up");
check(gBrowser.selectedTab === a, "the page shown before the press is back under the drop zones");
drag(b, "drop", 0.25); await wait(800);
check(!ov.hasAttribute("active"), "the drop zones hide after the drop");
check(a.splitview && a.splitview === b.splitview, "the two tabs are in a split view");
const order = gBrowser.tabs.filter(t => t.splitview);
check(order[0] === b && order[1] === a, "the dragged tab is on the side it was dropped on");
const panes = [...document.querySelectorAll("#tabbrowser-tabpanels .split-view-panel")].map(R).sort((p, q) => p.x - q.x);
const tp = R(document.getElementById("tabbrowser-tabpanels"));
check(panes.length === 2, "two pages on screen");
if (panes.length === 2) {
  check(near(panes[1].x - panes[0].r, 8), "8px between the pages: " + (panes[1].x - panes[0].r).toFixed(1));
  check(near(panes[0].x, tp.x) && near(panes[1].r, tp.r), "the pages are flush with the gutter");
  check(near(panes[0].w, panes[1].w, 1), "the pages are the same width");
}
gBrowser.removeTabs([a, b], {animate: false}); await wait(500);
return result({panes});
"""),

    ("split view with a pinned row: in its spot, saved, Cmd+W", r"""
const saved = () => Services.prefs.getStringPref("arc.pinnedRows", "");
const before = saved();
const row = rows()[1], guest = gBrowser.addTab(page("Guest"), {triggeringPrincipal: P});
await wait(500);
gBrowser.selectedTab = row; await wait(600);
const ov = document.getElementById("arc-split-drop");
const dt = new DataTransfer(); dt.mozSetDataAt("application/x-moz-tabbrowser-tab", guest, 0);
const at = (type, target) => { const box = ov.getBoundingClientRect();
  target.dispatchEvent(new DragEvent(type, {bubbles: true, cancelable: true, dataTransfer: dt, clientX: box.x + box.width * 0.75, clientY: box.y + 100})); };
guest.dispatchEvent(new MouseEvent("mousedown", {bubbles: true, button: 0}));
gBrowser.selectedTab = guest; await wait(300);  // pressing on a tab selects it
at("dragstart", guest); at("dragover", ov.lastElementChild); at("drop", ov.lastElementChild);
dt.dropEffect = "move"; at("dragend", guest);
await wait(1500);
check(row.splitview && row.splitview === guest.splitview, "a normal tab dropped on a row's page splits with it");
const nt = R(document.getElementById("tabs-newtab-button"));
check(row.splitview && R(row.splitview).b < nt.y, "the pair sits in the pinned block, above + New Tab");
check(row.splitview && R(row.splitview).y > R(rows()[0]).y, "...in the row's spot");
check(saved() === before, "the saved rows don't change (the guest isn't saved)");
BrowserCommands.closeTabOrWindow(); await wait(300);  // the guest is selected
gBrowser.selectedTab = row; await wait(600);
const g2 = gBrowser.addTab(page("Guest 2"), {triggeringPrincipal: P}); await wait(500);
gBrowser.addTabSplitView([row, g2]); await wait(800);
gBrowser.selectedTab = row; await wait(500);
BrowserCommands.closeTabOrWindow(); await wait(1500);
check(!row.splitview && isRow(row) && row.isConnected, "Cmd+W on the row: it leaves the split view and stays a row");
check(gBrowser.selectedTab === g2, "...and the other page stays on screen");
check(R(g2).y > nt.y, "...which goes back down to the normal tabs");
check(saved() === before, "the saved rows are as before");
gBrowser.removeTab(g2, {animate: false}); await wait(500);
return result({});
"""),

    ("auto-hide mode: tiles stay a centered grid", r"""
Services.prefs.setStringPref("sidebar.visibility", "expand-on-hover"); await wait(1500);
SidebarController._state.launcherExpanded = true; await wait(1500);
const t = tiles();
const wrap = document.getElementById("pinned-tabs-container").shadowRoot?.querySelector('[part~="items-wrapper"]');
check(wrap && getComputedStyle(wrap).display === "grid", "the tiles are a grid");
check(near(bg(t[0]).y, bg(t[1]).y), "tiles side by side");
const tile = t[0], b = bg(tile), ic = R(tile.querySelector(".tab-icon-image"));
check(near(ic.x + ic.w / 2, b.x + b.w / 2, 1), "the icon is centered");
InspectorUtils.addPseudoClassLock(tile, ":hover"); await wait(300);
check(R(tile.querySelector(".tab-close-button")).w === 0, "no close button on hover");
InspectorUtils.removePseudoClassLock(tile, ":hover");
SidebarController._state.launcherExpanded = false;
Services.prefs.setStringPref("sidebar.visibility", "always-show"); await wait(1500);
return result({});
"""),

    ("sidebar color is measured", r"""
await wait(1500);
const scheme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
const saved = Services.prefs.getStringPref("arc.sidebarColor." + scheme, "");
check(/^\d{1,3}, \d{1,3}, \d{1,3}$/.test(saved), "arc.sidebarColor." + scheme + " is set: '" + saved + "'");
check(root.style.getPropertyValue("--arc-sidebar-" + scheme) === "rgb(" + saved + ")", "the window uses it");
return result({scheme, saved});
"""),
]

# After a restart (same profile)
AFTER_RESTART = [
    ("restart: rows and folder come back, launch starts on the empty page", r"""
await wait(1500);
const names = rows().map(t => t.label);
check(["Row A", "Row B", "Folder A", "Folder B"].every(n => names.includes(n)), "all 4 rows are back: " + names.join(", "));
const g = gBrowser.tabGroups[0];
check(g && g.label === "Folder" && g.tabs.length === 2, "the folder is back with its 2 rows");
check(tiles().length === 3, "the 3 tiles are back");
check(gBrowser.selectedTab.hasAttribute("arc-start-page"), "launch starts on the empty page");
// (the bar itself only stays open in a window that's in front, which the
// test window isn't: it closes as soon as the URL bar can't hold the focus)
check(rows().every(r => r.hasAttribute("pending")), "rows come back unloaded");
newTabKey(); await wait(300);
return result({rows: names});
"""),

    ("auto-archive: an old tab closes, others stay", r"""
Services.prefs.setIntPref("arc.archiveAfterHours", 1);
const old = gBrowser.addTab(page("Old"), {triggeringPrincipal: P});
const fresh = gBrowser.addTab(page("Fresh"), {triggeringPrincipal: P});
await wait(800);
old.updateLastAccessed(Date.now() - 2 * 3600 * 1000);
const r0 = rows()[0]; r0.updateLastAccessed(Date.now() - 2 * 3600 * 1000);
// the first check runs 30s after launch
const deadline = Date.now() + 45000;
while (old.isConnected && Date.now() < deadline) await wait(1000);
check(!old.isConnected, "the tab unused for 2 hours was archived");
check(fresh.isConnected, "a recently used tab stays");
check(r0.isConnected, "a pinned row is never archived");
Services.prefs.clearUserPref("arc.archiveAfterHours");
return result({});
"""),

    ("multiple windows: the same sidebar, kept in sync", r"""
const openWindow = async opts => {
  const w = OpenBrowserWindow(opts);
  await new Promise(k => Services.obs.addObserver(function o(s) { if (s === w) { Services.obs.removeObserver(o, "browser-delayed-startup-finished"); k(); } }, "browser-delayed-startup-finished"));
  await wait(3000);
  return w;
};
const labels = (g, kind) => g.gBrowser.tabs.filter(t => kind === "tile" ? t.pinned : !t.pinned && t.hasAttribute("arc-pinned-row")).map(t => t.label);
const folderOf = g => g.gBrowser.tabGroups[0];
const w2 = await openWindow();
const g2 = w2;
check(JSON.stringify(labels(g2, "tile")) === JSON.stringify(labels(window, "tile")), "window 2 has the same tiles: " + labels(g2, "tile").join(", "));
check(JSON.stringify(labels(g2, "row")) === JSON.stringify(labels(window, "row")), "window 2 has the same rows: " + labels(g2, "row").join(", "));
check(folderOf(g2)?.label === folderOf(window)?.label && folderOf(g2)?.tabs.length === folderOf(window)?.tabs.length, "window 2 has the same folder");
check(g2.gBrowser.tabs.filter(t => t.pinned || t.hasAttribute("arc-pinned-row")).every(t => t.hasAttribute("pending")), "its copies are unloaded");
// a new row in window 1
const t = gBrowser.addTab(page("Row New"), {triggeringPrincipal: P});
gBrowser.selectedTab = t; await wait(500);
document.getElementById("addBookmarkAsKb").doCommand(); await wait(1500);
check(labels(g2, "row").includes("Row New"), "a new row shows up in window 2");
// renaming the folder, reordering tiles, a new tile
folderOf(window).label = "Renamed"; await wait(1500);
check(folderOf(g2)?.label === "Renamed", "renaming a folder carries over: " + folderOf(g2)?.label);
const tl = tiles();
gBrowser.moveTabBefore(tl[2], tl[0]); await wait(1500);
check(JSON.stringify(labels(g2, "tile")) === JSON.stringify(labels(window, "tile")), "reordering tiles carries over: " + labels(g2, "tile").join(", "));
const nt = gBrowser.addTab(page("Tile New", "#fa0"), {triggeringPrincipal: P}); await wait(500);
gBrowser.pinTab(nt); await wait(1500);
check(labels(g2, "tile").includes("Tile New"), "a new tile shows up in window 2");
// un-pinning a row in window 2 removes it in window 1
const r2 = g2.gBrowser.tabs.find(x => x.label === "Row New");
g2.gBrowser.selectedTab = r2; await wait(500);
g2.document.getElementById("addBookmarkAsKb").doCommand(); await wait(1500);
check(!labels(window, "row").includes("Row New"), "a row removed in window 2 goes in window 1 too");
w2.close(); await wait(800);
// a private window stays empty
const pw = await openWindow({private: true});
check(pw.gBrowser.tabs.filter(x => x.pinned || x.hasAttribute("arc-pinned-row")).length === 0, "a private window has no tiles or rows");
pw.close(); await wait(500);
return result({});
"""),
]


# ---------------------------------------------------------------- runner
def write_prefs(profile):
    with open(os.path.join(profile, "user.js"), "w") as f:
        for key, value in PREFS.items():
            f.write("user_pref(%s, %s);\n" % (json.dumps(key), json.dumps(value)))


def launch(profile):
    log = open(os.path.join(profile, "librewolf.log"), "w")
    proc = subprocess.Popen([APP, "-profile", profile, "-no-remote", "--marionette",
                             "--remote-allow-system-access", "about:blank"],
                            stdout=log, stderr=subprocess.STDOUT)
    for _ in range(60):
        try:
            socket.create_connection(("127.0.0.1", PORT), timeout=1).close()
            break
        except OSError:
            time.sleep(0.5)
    time.sleep(4)
    return proc, Marionette()


def quit(proc, mn):
    try:
        mn.js("setTimeout(() => Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit), 100); return 1;")
    except Exception:
        pass
    mn.close()
    try:
        proc.wait(timeout=20)
    except subprocess.TimeoutExpired:
        proc.kill()


def run(mn, tests, results):
    for name, body in tests:
        start = time.time()
        try:
            res = mn.js(body)
            ok, fails = res["ok"], res["fail"]
        except Exception as e:
            ok, fails = False, ["error: " + str(e)[:300]]
        results.append((name, ok))
        mark = "PASS" if ok else "FAIL"
        print("%s  %s  (%.1fs)" % (mark, name, time.time() - start))
        for f in fails:
            print("        - " + f)
        if name.startswith("script is installed") and not ok:
            return False
    return True


def main():
    if not os.path.exists(APP):
        sys.exit("LibreWolf not found at " + APP)
    profile = tempfile.mkdtemp(prefix="librewolf-arc-test-")
    os.symlink(REPO, os.path.join(profile, "chrome"))
    write_prefs(profile)
    print("Test profile:", profile)
    results = []
    try:
        proc, mn = launch(profile)
        go_on = run(mn, TESTS, results)
        quit(proc, mn)
        if go_on:
            proc, mn = launch(profile)
            run(mn, AFTER_RESTART, results)
            quit(proc, mn)
    finally:
        if "--keep" not in sys.argv:
            shutil.rmtree(profile, ignore_errors=True)
    failed = [n for n, ok in results if not ok]
    print("\n%d passed, %d failed" % (len(results) - len(failed), len(failed)))
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
