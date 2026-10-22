#!/usr/bin/env python3
"""Regression tests for arcfox.

Launches Firefox with a fresh, throwaway profile that uses this repo's
userChrome.css, drives it through Marionette (Firefox's built-in remote
control) and checks the key behaviors: layout and spacing, tile colors, the
Cmd+T bar, shortcuts, closing rules, auto-hide tiles, the sidebar color
measurement, rows and folders across a restart, and auto-archive.

Requirements: Firefox in /Applications and the script installed into it
(arc-shortcut/install.sh). Nothing else: Python 3 standard library only.
Your own profile is never touched; the test profile is deleted afterwards.

    python3 tests/run_tests.py            # all tests, about 2 minutes
    python3 tests/run_tests.py --keep     # keep the test profile (prints its path)
    python3 tests/run_tests.py --user-js path/to/user.js
                                          # on top of a user.js (e.g. Betterfox's)

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

APP = "/Applications/Firefox.app/Contents/MacOS/firefox"
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 2839  # its own port, so it never talks to another Firefox

# (what a profile needs for the look; the script turns them on itself in a
# new profile)
LOOK_PREFS = ("toolkit.legacyUserProfileCustomizations.stylesheets", "sidebar.revamp", "sidebar.verticalTabs")

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
    # (Firefox's first-run pages and prompts, which LibreWolf doesn't have)
    "browser.startup.homepage_override.mstone": "ignore",
    "startup.homepage_welcome_url": "",
    "startup.homepage_welcome_url.additional": "",
    "datareporting.policy.firstRunURL": "",
    "datareporting.policy.dataSubmissionPolicyBypassNotification": True,
    "toolkit.telemetry.reportingpolicy.firstRun": False,
    "termsofuse.bypassNotification": True,
    "app.update.auto": False,
    "app.normandy.enabled": False,
    "messaging-system.rsexperimentloader.enabled": False,
    "browser.newtabpage.activity-stream.asrouter.userprefs.cfr.features": False,
    "browser.newtabpage.activity-stream.asrouter.userprefs.cfr.addons": False,
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
const notSetUp = Services.console.getMessageArray().map(m => m.message || "").filter(m => /^Arc sidebar \(.*: not set up\)/.test(m));
check(!notSetUp.length, "every feature set up (none failed): " + notSetUp.map(m => m.split("\n")[0]).join(" | "));
check(Services.prefs.getBoolPref("arc.profileDefaultsApplied", false), "a new profile gets the settings the layout relies on");
check(Services.prefs.getStringPref("browser.toolbars.bookmarks.visibility", "") === "never", "...bookmarks toolbar off");
check(!gNotificationBox.getNotificationWithValue("arc-restart"), "a profile that has the look isn't asked to restart");
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
gURLBar.inputField.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true}));
// (its curve starts slowly: look over a few frames)
const fade = [];
for (let i = 0; i < 6; i++) { await new Promise(k => requestAnimationFrame(k)); fade.push(root.hasAttribute("arc-newtab-fading") ? Number(getComputedStyle(document.getElementById("urlbar")).opacity) : -1); }
check(fade.some(o => o > 0 && o < 0.95), "it fades out where it is: " + fade.map(o => o.toFixed(2)).join(","));
await wait(400);
check(!barOpen() && !root.hasAttribute("arc-newtab-fading"), "Esc closes it");
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
if (row.splitview) {
  const w = R(row.splitview), ref = bg(rows()[0]), halves = row.splitview.tabs.map(bg);
  check(near(w.h, 32) && near(w.x, ref.x) && near(w.r, ref.r), "the pair is one row: 32px, flush with the rows: " + JSON.stringify(w));
  check(halves.every(h => near(h.h, 28) && Number.isInteger(h.x) && Number.isInteger(h.w)), "its halves: 28px fills on whole pixels");
  check(near(halves[1].x - halves[0].r, 4), "4px between the halves: " + (halves[1].x - halves[0].r));
}
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

    ("Peek: links from a tile open in a card", r"""
const tile = tiles()[0];
const { BrowserUtils } = ChromeUtils.importESModule("resource://gre/modules/BrowserUtils.sys.mjs");
const pageClick = mods => ({href: "https://example.org/", referrerInfo: "", button: 0, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...mods});
check(/^tab/.test(BrowserUtils.whereToOpenLink(pageClick({altKey: true}))), "Option+click on a link in a page opens it in front (as a Peek)");
check(BrowserUtils.whereToOpenLink(pageClick({})) === "current", "a plain click stays in the page");
check(BrowserUtils.whereToOpenLink({altKey: true, button: 0}) === "current", "Option elsewhere (menus, bookmarks) keeps its meaning");
check(tile.linkedBrowser.browsingContext.isAppTab, "a tile opens other sites' links elsewhere");
check(rows().every(r => !r.linkedBrowser?.browsingContext || r.linkedBrowser.browsingContext.isAppTab), "so do pinned rows");
const open = async () => {
  gBrowser.selectedTab = tile; await wait(600);
  // what a link to another site does in a pinned page: a new tab from it, in front
  const t = gBrowser.addTab(page("Peeked"), {triggeringPrincipal: P, openerBrowser: tile.linkedBrowser});
  gBrowser.selectedTab = t; await wait(1200);
  return t;
};
let t = await open();
const tp = R(gBrowser.tabpanels);
const card = document.querySelector("#tabbrowser-tabpanels [arc-peek-card]");
const under = document.querySelector("#tabbrowser-tabpanels [arc-peek-under]");
check(root.hasAttribute("arc-peek") && card && under, "the new tab opens as a Peek");
if (card && under) {
  const c = R(card), u = R(under);
  check(near(u.w, tp.w, 1) && near(u.h, tp.h, 1), "the pinned page stays full size underneath");
  check(near(c.x - tp.x, tp.w * 0.075, 1) && near(tp.r - c.r, tp.w * 0.075, 1) && near(c.y - tp.y, tp.h * 0.075, 1), "the card is centered, 7.5% in");
}
check(R(t).h === 0, "the Peek isn't listed in the sidebar");
check(tile.hasAttribute("arc-peek-home"), "the tile stays highlighted");
const bar = document.getElementById("arc-peek-bar");
check(bar.hasAttribute("shown") && bar.querySelector(".arc-peek-split").hidden, "its buttons show (no split from a tile)");
window.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true})); await wait(800);
check(!root.hasAttribute("arc-peek") && !t.isConnected && gBrowser.selectedTab === tile, "Esc closes it, back to the tile");
check(!gBrowser.tabpanels.hasAttribute("splitview"), "one page on screen again");
t = await open();
bar.querySelector(".arc-peek-expand").click(); await wait(800);
check(!root.hasAttribute("arc-peek") && t.isConnected && gBrowser.selectedTab === t && R(t).h > 0, "Open as Tab keeps it as a normal tab");
gBrowser.removeTab(t, {animate: false}); await wait(500);
return result({});
"""),

    ("profile switcher: bottom row, centered", r"""
const box = document.getElementById("arc-profiles");
check(box && box.hidden, "hidden when Firefox's profiles are off (a test profile isn't registered)");
const fake = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => ({id: i, name: "P" + i, avatar: "book", hasCustomAvatar: false, theme: {themeBg: "rgb(120, 190, 255)", themeFg: "rgb(0, 30, 60)"}}));
await box._arcRender(fake, fake[8]); await wait(300);
const sb = R(document.querySelector("sidebar-main")), dl = R(document.getElementById("downloads-button")), ext = R(document.getElementById("unified-extensions-button"));
const b = [...box.children].map(R);
check(box.children.length >= 2 && box.children.length < 9 && !box.querySelector(".arc-profile-new"), "as many profiles as fit, no +: " + box.children.length);
check([...box.children].some(c => c.hasAttribute("current") && c.title === "P9"), "the current profile is always shown, and marked");
check(Math.abs((b[0].x + b.at(-1).r) / 2 - (sb.x + sb.w / 2)) <= 1, "centered in the sidebar");
check(b.every(x => Number.isInteger(x.x)), "on whole pixels");
check(near(b[0].y + b[0].h / 2, dl.y + dl.h / 2, 1), "in line with Downloads");
check(dl.x - sb.x < 20 && sb.r - ext.r < 20, "Downloads at the left end, Extensions at the right");
check(b[0].x > dl.r && b.at(-1).r < ext.x, "between them, clear of both");
const tools = [...(document.querySelector("sidebar-main").shadowRoot?.querySelectorAll(".tools-and-extensions moz-button") || [])];
check(tools.every(t => getComputedStyle(t).visibility === "hidden"), "Firefox's tool buttons (Bookmarks, History) aren't shown: " + tools.length);
check(!/(^|,)(bookmarks|history|syncedtabs|aichat)(,|$)/.test(Services.prefs.getStringPref("sidebar.main.tools", "")), "...and aren't even made (they flashed at launch): " + Services.prefs.getStringPref("sidebar.main.tools", ""));
check(!document.getElementById("downloads-button").hidden || getComputedStyle(document.getElementById("downloads-button")).display !== "none", "Downloads is shown from the start");
InspectorUtils.addPseudoClassLock(document.getElementById("downloads-button"), ":hover"); await wait(300);
const dlFill = getComputedStyle(document.querySelector("#downloads-button .toolbarbutton-badge-stack")).backgroundColor;
check(/^rgba\((0, 0, 0, 0\.04|255, 255, 255, 0\.06)\)$/.test(dlFill), "icon buttons hover with the tab rows' soft grey: " + dlFill);
InspectorUtils.clearPseudoClassLocks(document.getElementById("downloads-button"));
const avatar = box.querySelector(".arc-profile:not([current])");
InspectorUtils.addPseudoClassLock(avatar, ":hover"); await wait(300);
const hov = getComputedStyle(avatar);
check(hov.backgroundColor !== "rgba(0, 0, 0, 0)" && hov.borderRadius === getComputedStyle(document.querySelector("#downloads-button .toolbarbutton-badge-stack")).borderRadius, "a hovered profile gets Downloads' rounded-square fill: " + hov.backgroundColor + " " + hov.borderRadius);
const cur = box.querySelector("[current]"), other = box.querySelector(".arc-profile:not([current])");
check(getComputedStyle(cur).boxShadow === "none" && getComputedStyle(cur.firstChild).filter === "none" && getComputedStyle(other.firstChild).filter.includes("grayscale"), "no ring on the current profile; the others greyed out");
InspectorUtils.clearPseudoClassLocks(avatar);
const wide = box.children.length;
document.getElementById("sidebar-container").style.width = "300px"; await wait(400);
check(box.children.length > wide, "a wider sidebar fits more: " + wide + " -> " + box.children.length);
check(R(box.lastElementChild).r < R(document.getElementById("unified-extensions-button")).x && R(box.firstElementChild).x > R(document.getElementById("downloads-button")).r, "still clear of both");
document.getElementById("sidebar-container").style.width = "260px"; await wait(400);
box.hidden = true;
return result({});
"""),

    ("folders: collapsed keeps loaded tabs, rows slide, icon opens", r"""
const g = gBrowser.tabGroups[0];
g.collapsed = false; await wait(400);
gBrowser.selectedTab = gBrowser.tabs.find(t => t.label === "Normal 2"); await wait(300);
for (const t of g.tabs) if (t.hasAttribute("pending")) { gBrowser.selectedTab = t; await wait(600); }
gBrowser.selectedTab = gBrowser.tabs.find(t => t.label === "Normal 2"); await wait(300);
const folderIcon = g.querySelector(".tab-group-label");
const openIcon = getComputedStyle(folderIcon, "::after").transform;
const last = g.tabs.at(-1);
gBrowser.discardBrowser(last); await wait(300);
check(last.hasAttribute("pending"), "the last row is unloaded");
const h0 = R(last).h;
g.collapsed = true;
const frames = [];
for (let i = 0; i < 20; i++) { await new Promise(k => requestAnimationFrame(k)); frames.push(Math.round(R(last).h)); }
check(frames.some(h => h > 2 && h < h0 - 2), "the unloaded row slides shut: " + frames.join(","));
check(frames.at(-1) === 0, "...all the way");
await wait(300);
check(g.tabs.slice(0, -1).every(t => R(t).h > 0 && t.visible), "the loaded rows stay shown (and count as shown)");
check(!last.visible, "the unloaded one is hidden");
check(getComputedStyle(g.querySelector(".tab-group-overflow-count-container")).display === "none", "no +N bubble");
check(getComputedStyle(folderIcon, "::after").transform !== openIcon, "the folder icon shuts");
g.collapsed = false;
const opening = [];
for (let i = 0; i < 24; i++) { await new Promise(k => requestAnimationFrame(k)); opening.push(Math.round(R(last).h)); }
check(opening.some(h => h > 2 && h < h0 - 2) && near(opening.at(-1), h0, 0.6), "it slides open again: " + opening.join(","));
await wait(300);
check(!last.hasAttribute("arc-folding") && getComputedStyle(folderIcon, "::after").transform === openIcon, "back to normal, icon open");
return result({});
"""),

    ("motion: tabs slide open and shut, pinning glides, a reset settles", r"""
const frame = () => new Promise(k => requestAnimationFrame(k));
const heights = async (el, n) => { const h = []; for (let i = 0; i < n; i++) { await frame(); h.push(el.isConnected ? Math.round(R(el).h) : -1); } return h; };
const t = gBrowser.addTab("about:robots", {triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal()});
const opening = await heights(t, 22);
check(opening.some(h => h > 2 && h < 34) && opening.at(-1) >= 34, "a new tab's row slides open: " + opening.join(","));
await wait(300);
const count = gBrowser.tabs.length;
gBrowser.removeTab(t);
check(gBrowser.tabs.length === count - 1 || t.closing, "a closing tab leaves the list at once, or is marked closing (only its row lingers): " + count + " " + gBrowser.tabs.length + " " + t.closing);
const closing = await heights(t, 22);
check(closing.some(h => h > 2 && h < 34), "its row slides shut: " + closing.join(","));
check(!t.isConnected, "...and is gone after");
const n = gBrowser.tabs.find(x => x.label === "Normal 1");
gBrowser.selectedTab = n; await wait(400);
const y0 = R(n).y;
document.getElementById("addBookmarkAsKb").doCommand();
const ys = []; for (let i = 0; i < 20; i++) { await frame(); ys.push(Math.round(R(n).y)); }
check(isRow(n) && ys.some(y => y < y0 - 2 && y > ys.at(-1) + 2), "Cmd+D glides the tab up into the rows: " + y0 + " " + ys.join(","));
await wait(400);
document.getElementById("addBookmarkAsKb").doCommand(); await wait(600);
check(!isRow(n), "...and back");
const row = gBrowser.tabs.find(x => x.label === "Row B");
gBrowser.selectedTab = row; await wait(500);
gBrowser.removeTab(row);
const op = []; for (let i = 0; i < 30; i++) { await frame(); op.push(Number(getComputedStyle(row.querySelector(".tab-stack")).opacity)); }
check(row.isConnected && op.some(o => o < 0.6) && op.at(-1) === 1, "closing a pinned row resets it with a settle: " + op.map(o => o.toFixed(1)).join(","));
const red = tiles().find(t => t.hasAttribute("arc-tile-colored"));
const tint = () => Number(getComputedStyle(red.querySelector(".tab-background"), "::after").opacity);
gBrowser.selectedTab = gBrowser.tabs.find(x => x.label === "Normal 2"); await wait(500);
gBrowser.selectedTab = red;
const fade = []; for (let i = 0; i < 20; i++) { await frame(); fade.push(tint()); }
check(fade.some(o => o > 0.05 && o < 0.95) && fade.at(-1) === 1, "a selected tile's colors fade in: " + fade.map(o => o.toFixed(2)).join(","));
gBrowser.selectedTab = gBrowser.tabs.find(x => x.label === "Normal 2"); await wait(500);
check(tint() === 0, "...and out");
check(getComputedStyle(document.querySelector(".arc-home-dot") || document.documentElement, "::before").animationName.includes("arc-dot-in") || !document.querySelector(".arc-home-dot"), "the away dot pops in");
const a = gBrowser.addTab("about:robots", {triggeringPrincipal: P}), b = gBrowser.addTab("about:mozilla", {triggeringPrincipal: P});
await wait(800);
gBrowser.addTabSplitView([a, b]);
await frame(); await frame();
check(a.getAnimations().length + b.getAnimations().length > 0, "two tabs splitting grow into place");
await wait(500);
a.splitview.unsplitTabs();
await frame(); await frame();
check(a.getAnimations().length + b.getAnimations().length > 0, "...and separating too");
await wait(500);
gBrowser.removeTab(a, {animate: false}); gBrowser.removeTab(b, {animate: false}); await wait(500);
return result({});
"""),

    ("Apple guidelines: menu bar commands, Increase Contrast, Reduce Motion", r"""
const show = id => document.getElementById(id).dispatchEvent(new Event("popupshowing"));
const n = gBrowser.tabs.find(x => x.label === "Normal 2");
gBrowser.selectedTab = n; await wait(400);
for (const id of ["windowPopup", "menu_viewPopup", "menu_EditPopup"]) show(id);
const item = id => document.getElementById(id);
check(item("arc-menu-row")?.parentNode.id === "windowPopup" && item("arc-menu-row").getAttribute("label") === "Pin as Row", "Window menu: Pin as Row");
check(item("arc-menu-tile")?.getAttribute("label") === "Pin as Tile", "Window menu: Pin as Tile");
check(document.getElementById(item("arc-menu-row").getAttribute("key"))?.getAttribute("modifiers") === "accel", "...with ⌘D shown");
check(item("arc-menu-sidebar")?.parentNode.id === "menu_viewPopup" && /Sidebar$/.test(item("arc-menu-sidebar").getAttribute("label")), "View menu: the sidebar, with ⌘S");
check(item("arc-menu-copy-link")?.parentNode.id === "menu_EditPopup", "Edit menu: Copy Link");
item("arc-menu-row").doCommand(); await wait(700);
show("windowPopup");
check(isRow(n) && item("arc-menu-row").getAttribute("label") === "Unpin Row", "the menu item pins, and then offers to unpin");
item("arc-menu-row").doCommand(); await wait(700);
check(!isRow(n), "...and unpins");
const hair = () => getComputedStyle(root).getPropertyValue("--arc-hairline");
const normal = hair();
Services.prefs.setIntPref("ui.useAccessibilityTheme", 1); await wait(500);
check(hair() !== normal, "Increase Contrast strengthens the lines: " + hair());
Services.prefs.clearUserPref("ui.useAccessibilityTheme"); await wait(300);
Services.prefs.setIntPref("ui.prefersReducedMotion", 1); await wait(400);
check(getComputedStyle(root).getPropertyValue("--arc-drag-duration").trim() === "0ms", "Reduce Motion stops the drag animations");
check(getComputedStyle(gBrowser.tabGroups[0].querySelector(".tab-group-label"), "::after").transitionDuration.split(",").every(d => parseFloat(d) === 0), "...and the folder icon's tilt");
Services.prefs.clearUserPref("ui.prefersReducedMotion"); await wait(300);
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

    ("toolbar: back, forward, reload in order", r"""
const order = w => [...w.document.getElementById("nav-bar-customization-target").children].map(e => e.id).filter(id => /^(back|forward|stop-reload)-button$/.test(id)).join(",");
const want = "back-button,forward-button,stop-reload-button";
check(order(window) === want, "in order: " + order(window));
// a saved toolbar as a real profile had it: reload, forward, back
CustomizableUI.moveWidgetWithinArea("stop-reload-button", CustomizableUI.getPlacementOfWidget("back-button").position);
CustomizableUI.moveWidgetWithinArea("back-button", CustomizableUI.getPlacementOfWidget("forward-button").position + 1);
check(order(window) !== want, "(scrambled for the test)");
const w2 = OpenBrowserWindow(); await new Promise(k => w2.addEventListener("load", k, {once: true})); await wait(2500);
check(order(w2) === want && order(window) === want, "a scrambled toolbar is put back in order: " + order(w2));
w2.close(); await wait(800);
return result({});
"""),

    ("first tile: dropped above the empty slot (no tiles yet)", r"""
const before = tiles();
for (const t of before) gBrowser.unpinTab(t);
await wait(800);
const slot = document.getElementById("pinned-drop-indicator");
const tab = normals()[0];
// what Firefox shows when a tab is dragged to the top with no tiles
slot.setAttribute("visible", ""); await wait(400);
const list = R(gBrowser.tabContainer), s = R(slot);
check(near(s.h, 40, 1), "the slot is a tile's height: " + s.h);
const target = document.elementFromPoint(list.x + 60, s.y - 8);
check(!gBrowser.tabContainer.contains(target), "just above the slot is outside the tab list (the toolbar or the sidebar's edge): " + target?.id);
const dt = new DataTransfer(); dt.mozSetDataAt("application/x-moz-tabbrowser-tab", tab, 0);
const ev = type => { const e = new DragEvent(type, {bubbles: true, cancelable: true, dataTransfer: dt, clientX: list.x + 60, clientY: s.y - 8}); target.dispatchEvent(e); return e; };
check(ev("dragover").defaultPrevented, "a drop there is accepted");
ev("drop"); await wait(600);
slot.removeAttribute("visible");
check(tab.pinned, "...and makes the tab the first tile");
// back as they were
gBrowser.unpinTab(tab); await wait(300);
for (const t of before) gBrowser.pinTab(t);
await wait(800);
check(tiles().map(t => t.label).join() === before.map(t => t.label).join(), "(tiles restored)");
return result({});
"""),

    ("vertical tabs kept on: the profile's user.js (1/2)", r"""
// (the next launch puts them back, see after the restart)
const path = PathUtils.join(PathUtils.profileDir, "user.js");
const text = await IOUtils.readUTF8(path);
check(/user_pref\("sidebar\.verticalTabs", true\);/.test(text), "a profile's user.js turns vertical tabs on");
await IOUtils.writeUTF8(path, text.split("\n").filter(l => !/"sidebar\.(verticalTabs|revamp)"/.test(l)).join("\n"));
return result({});
"""),
]

# After a restart (same profile)
AFTER_RESTART = [
    ("vertical tabs kept on: the profile's user.js (2/2)", r"""
await wait(500);
const text = await IOUtils.readUTF8(PathUtils.join(PathUtils.profileDir, "user.js"));
check(text.includes('user_pref("sidebar.verticalTabs", true);') && text.includes('user_pref("sidebar.revamp", true);'), "taken out, they're back after a launch");
check(text.includes('"marionette.port"'), "the rest of user.js is kept");
return result({});
"""),
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
check(tiles().every(t => t.hasAttribute("pending")), "tiles come back unloaded too (they load when opened)");
check(!root.hasAttribute("arc-starting") && getComputedStyle(gBrowser.tabContainer).opacity === "1", "the tab list is shown once start-up is done");
check(["nav-bar-customization-target", "arc-sidebar-button"].every(id => getComputedStyle(document.getElementById(id)).opacity === "1"), "...and with it the toolbar, the bottom row and the sidebar button");
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


# A brand-new profile without the look (as made from Firefox's Profiles
# menu): no chrome folder, nothing pinned. Its first run...
FIRST_RUN = [
    ("new profile: linked to this repo on its first run", r"""
await wait(2500);
const chrome = Services.dirsvc.get("UChrm", Ci.nsIFile);
check(chrome.exists() && chrome.isSymlink(), "its chrome folder is now a link");
check(chrome.isSymlink() && chrome.target === "__REPO_PLACEHOLDER__", "...to this repo: " + (chrome.isSymlink() ? chrome.target : ""));
for (const name of ["toolkit.legacyUserProfileCustomizations.stylesheets", "sidebar.revamp", "sidebar.verticalTabs"]) {
  check(Services.prefs.getBoolPref(name, false), name + " is on");
}
check(Services.prefs.getBoolPref("arc.profileDefaultsApplied", false), "the layout's settings are applied");
check(!!gNotificationBox.getNotificationWithValue("arc-restart"), "a bar offers to restart");
const text = await IOUtils.readUTF8(PathUtils.join(PathUtils.profileDir, "user.js"));
check(text.includes('user_pref("sidebar.verticalTabs", true);'), "its user.js keeps vertical tabs on");
const notSetUp = Services.console.getMessageArray().map(m => m.message || "").filter(m => /^Arc sidebar \(/.test(m));
check(!notSetUp.length, "no errors: " + notSetUp.map(m => m.split("\n")[0]).join(" | "));
return result({});
"""),
]

# ...and after the restart it offered, the same profile: empty states
EMPTY = [
    ("new profile, restarted: the look, nothing pinned", r"""
await wait(1500);
check(!!getComputedStyle(root).getPropertyValue("--arc-tab-height"), "userChrome.css loaded");
check(root.hasAttribute("arc-script"), "the script runs");
check(!tiles().length && !rows().length, "no tiles or rows");
check(gBrowser.tabs.length === 1 && gBrowser.selectedTab.hasAttribute("arc-start-page"), "just the empty page: " + gBrowser.tabs.map(t => t.label).join(", "));
check(barOpen(), "with the command bar open");
const per = document.getElementById("tabbrowser-arrowscrollbox-periphery");
check(getComputedStyle(per, "::before").display === "none", "no divider: nothing to divide");
return result({});
"""),

    ("nothing pinned: one tab, its place, Cmd+W", r"""
const t = gBrowser.addTab(page("Only", "#36e"), {triggeringPrincipal: P});
gBrowser.selectedTab = t; await wait(1200);
check(!barOpen(), "the command bar closed");
const per = document.getElementById("tabbrowser-arrowscrollbox-periphery");
check(getComputedStyle(per, "::before").display === "none", "still no divider");
const url = R(document.getElementById("urlbar-container")), nt = R(document.getElementById("tabs-newtab-button"));
check(near(nt.y - url.b, 16, 1), "+ New Tab 16px under the URL bar, as tiles would be: " + (nt.y - url.b));
document.getElementById("key_close").doCommand(); await wait(1500);
check(!window.closed && gBrowser.tabs.length === 1 && gBrowser.selectedTab.hasAttribute("arc-start-page"), "Cmd+W on the only tab leaves the empty page (the window stays): " + gBrowser.tabs.map(x => x.label).join(", "));
check(barOpen(), "...with the command bar");
document.getElementById("key_close").doCommand(); await wait(1000);
check(!window.closed && gBrowser.tabs.length === 1 && gBrowser.selectedTab.hasAttribute("arc-start-page"), "Cmd+W on the empty page does nothing");
return result({});
"""),

    ("tiles only: the divider 8px under them, 9px above + New Tab", r"""
const made = [page("Red", "#e33"), page("Green", "#2a5")].map(u => gBrowser.addTab(u, {triggeringPrincipal: P}));
for (const t of made) gBrowser.pinTab(t);
gBrowser.selectedTab = made[0]; await wait(1200);
const per = document.getElementById("tabbrowser-arrowscrollbox-periphery");
const sp = document.getElementById("vertical-pinned-tabs-splitter");
check(getComputedStyle(per, "::before").display === "none" && /gradient/.test(getComputedStyle(sp).backgroundImage), "the line is drawn by the splitter (the list's top would clip it)");
const lineY = R(sp).y + 3;
const tilesBottom = Math.max(...tiles().map(x => bg(x).b));
check(near(lineY - tilesBottom, 8), "8px under the tiles: " + (lineY - tilesBottom));
check(near(R(document.getElementById("tabs-newtab-button")).y - lineY, 9), "9px above + New Tab: " + (R(document.getElementById("tabs-newtab-button")).y - lineY));
// (a tab to stay on first: removing a window's last tab closes the window)
gBrowser.selectedTab = gBrowser.addTab(page("Next", "#999"), {triggeringPrincipal: P}); await wait(300);
for (const t of made) { gBrowser.unpinTab(t); }
await wait(300);
for (const t of made) gBrowser.removeTab(t, {animate: false});
await wait(800);
return result({});
"""),

    ("rows only: the divider 8px under them, 9px above + New Tab", r"""
const made = [page("Row A", "#e33"), page("Row B", "#2a5")].map(u => gBrowser.addTab(u, {triggeringPrincipal: P}));
const key = document.getElementById("addBookmarkAsKb");
for (const t of made) { gBrowser.selectedTab = t; await wait(350); key.doCommand(); await wait(450); }
await wait(800);
check(rows().length === 2 && !tiles().length, "two rows, no tiles");
const per = document.getElementById("tabbrowser-arrowscrollbox-periphery");
check(getComputedStyle(per, "::before").display !== "none", "the divider's own line");
const lineY = R(per).y - 9;
const rowsBottom = Math.max(...rows().map(x => bg(x).b));
check(near(lineY - rowsBottom, 8), "8px under the rows: " + (lineY - rowsBottom));
check(near(R(document.getElementById("tabs-newtab-button")).y - lineY, 9), "9px above + New Tab: " + (R(document.getElementById("tabs-newtab-button")).y - lineY));
return result({});
"""),
]


# ---------------------------------------------------------------- runner
def write_prefs(profile, prefs=None):
    prefs = PREFS if prefs is None else prefs
    with open(os.path.join(profile, "user.js"), "w") as f:
        # (the tests' own prefs come after, so they win)
        if "--user-js" in sys.argv:
            with open(sys.argv[sys.argv.index("--user-js") + 1]) as base:
                f.write(base.read() + "\n")
        for key, value in prefs.items():
            f.write("user_pref(%s, %s);\n" % (json.dumps(key), json.dumps(value)))


def launch(profile, attempt=1, needs_look=True):
    log = open(os.path.join(profile, "firefox.log"), "w")
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
    mn = Marionette()
    # A brand-new profile now and then starts without userChrome.css (a
    # Firefox start-up quirk, not ours): start it again rather than test
    # without the look
    loaded = mn.js("return !!getComputedStyle(root).getPropertyValue('--arc-tab-height');")
    if needs_look and not loaded and attempt < 3:
        print("(userChrome.css didn't load in the test browser; starting it again)")
        quit(proc, mn)
        return launch(profile, attempt + 1)
    return proc, mn


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
        sys.exit("Firefox not found at " + APP)
    profile = tempfile.mkdtemp(prefix="arcfox-test-")
    os.symlink(REPO, os.path.join(profile, "chrome"))
    write_prefs(profile)
    print("Test profile:", profile)
    profiles = [profile]
    results = []
    try:
        proc, mn = launch(profile)
        go_on = run(mn, TESTS, results)
        quit(proc, mn)
        if go_on:
            proc, mn = launch(profile)
            run(mn, AFTER_RESTART, results)
            quit(proc, mn)
        if go_on:
            # a brand-new profile without the look (no chrome folder, nor the
            # settings that load it): its first run, then empty states
            fresh = tempfile.mkdtemp(prefix="arcfox-test-new-")
            profiles.append(fresh)
            write_prefs(fresh, {k: v for k, v in PREFS.items() if k not in LOOK_PREFS})
            proc, mn = launch(fresh, needs_look=False)
            run(mn, [(n, b.replace("__REPO_PLACEHOLDER__", REPO)) for n, b in FIRST_RUN], results)
            quit(proc, mn)
            proc, mn = launch(fresh)
            run(mn, EMPTY, results)
            quit(proc, mn)
    finally:
        if "--keep" not in sys.argv:
            for p in profiles:
                shutil.rmtree(p, ignore_errors=True)
    failed = [n for n, ok in results if not ok]
    print("\n%d passed, %d failed" % (len(results) - len(failed), len(failed)))
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
