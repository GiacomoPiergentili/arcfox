#!/usr/bin/env python3
"""Real-mouse checks for arcfox: drag and drop, and Peek.

Drag and drop is where most bugs have been, and simulated events miss what
real ones do (Firefox's own drag code, timers, the pointer leaving the tab
list); Peek starts from a real click on a page. These cases move the real
mouse, in a throwaway test browser like run_tests.py's, and check where
everything lands, plus what must hold after each case: no window torn off,
no drag state or offsets left behind, no script errors, and the saved tiles
and rows matching the sidebar. The Peek cases use a small local web server
(127.0.0.1), no internet.

The mouse moves only through ~/.arc-drag/drag, which refuses unless the
test window is frontmost and on top at every point. Don't touch the mouse
or keyboard while it runs (about 4 minutes); not run by run_tests.py.

    python3 tests/drag_tests.py                  # all cases
    python3 tests/drag_tests.py --only folder    # cases whose name has "folder"
    python3 tests/drag_tests.py --record <dir>   # also film each drag (the
                                                 # test window only; needs
                                                 # Screen Recording)
    python3 tests/drag_tests.py --user-js <file> # on top of a user.js

Needs the script installed (arc-shortcut/install.sh). Exit code 1 on any failure.
"""
import os
import shutil
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import run_tests as T  # noqa: E402  (its browser launch, prefs and helpers)

DRAG = os.path.expanduser("~/.arc-drag/drag")

# Before each case: run_tests' layout (tiles Red, Green, Blue; rows Row A, Row
# B; an open folder with Folder A and Folder B; Normal 1 and Normal 2,
# selected). Then the case's own set-up (optional) and where to drag: a list
# of screen points, from the element to grab to the drop.
PRELUDE = r"""
const tab = label => gBrowser.tabs.find(t => t.label === label);
// a point on an element, in screen points (fx, fy: fractions of its box)
const at = (el, fx = 0.5, fy = 0.5) => { const b = el.getBoundingClientRect(); return [Math.round(mozInnerScreenX + b.left + b.width * fx), Math.round(mozInnerScreenY + b.top + b.height * fy)]; };
const between = (a, b) => { const p = at(a, 0.5, 1), q = at(b, 0.5, 0); return [p[0], Math.round((p[1] + q[1]) / 2)]; };
const hold = (p, n = 2) => Array(n).fill(p);
const labels = kind => gBrowser.tabs.filter(t => kind === "tile" ? t.pinned : kind === "row" ? !t.pinned && isRow(t) : !t.pinned && !isRow(t) && !t.hasAttribute("arc-start-page")).map(t => t.label);
"""

# name, set-up JS (returns the drag's points), check JS (pushes to fail via check())
CASES = [
    ("tab into the tiles, between the first two", r"""
return [at(tab("Normal 1")), ...hold(at(tab("Red"), 1, 0.5), 3)];
""", r"""
check(JSON.stringify(labels("tile")) === JSON.stringify(["Red", "Normal 1", "Green", "Blue"]), "it's a tile between Red and Green: " + labels("tile"));
"""),

    ("tiles reordered: the last one first", r"""
// (the dragged tile's height, every 50ms while it's dragged)
window.__heights = [];
clearInterval(window.__heightTimer);
window.__heightTimer = setInterval(() => {
  const d = gBrowser.tabContainer.querySelector(".tabbrowser-tab[dragtarget][pinned]");
  if (d) window.__heights.push(Math.round(d.querySelector(".tab-background").getBoundingClientRect().height));
}, 50);
return [at(tab("Blue")), ...hold(at(tab("Red"), 0.25, 0.5), 3)];
""", r"""
clearInterval(window.__heightTimer);
check(JSON.stringify(labels("tile")) === JSON.stringify(["Blue", "Red", "Green"]), "Blue comes first: " + labels("tile"));
const tileH = bg(tab("Red")).h;
check(window.__heights.length > 5, "the dragged tile was measured: " + window.__heights.length + " times");
check(window.__heights.every(h => near(h, tileH, 1)), "it keeps a tile's height while dragged (" + tileH + "px): " + [...new Set(window.__heights)].join(", "));
"""),

    ("tile into the rows, between Row A and Row B", r"""
return [at(tab("Blue")), at(tab("Blue"), 0.5, 2), ...hold(between(tab("Row A"), tab("Row B")), 3)];
""", r"""
check(!tab("Blue").pinned && isRow(tab("Blue")), "Blue is a pinned row");
check(JSON.stringify(labels("row").slice(0, 3)) === JSON.stringify(["Row A", "Blue", "Row B"]), "between Row A and Row B: " + labels("row"));
check(JSON.stringify(labels("tile")) === JSON.stringify(["Red", "Green"]), "the other tiles stay: " + labels("tile"));
"""),

    ("tile down to the normal tabs", r"""
return [at(tab("Green")), at(tab("Green"), 0.5, 2), ...hold(at(tab("Normal 2"), 0.5, 1.2), 3)];
""", r"""
check(!tab("Green").pinned && !isRow(tab("Green")), "Green is a normal tab");
check(labels("normal").includes("Green"), "with the normal tabs: " + labels("normal"));
"""),

    ("normal tab up into the rows", r"""
return [at(tab("Normal 2")), ...hold(between(tab("Row A"), tab("Row B")), 3)];
""", r"""
check(isRow(tab("Normal 2")), "Normal 2 is a pinned row");
check(JSON.stringify(labels("row").slice(0, 3)) === JSON.stringify(["Row A", "Normal 2", "Row B"]), "between Row A and Row B: " + labels("row"));
"""),

    ("row down to the normal tabs", r"""
return [at(tab("Row A")), ...hold(at(tab("Normal 2"), 0.5, 1.2), 3)];
""", r"""
check(!isRow(tab("Row A")) && !tab("Row A").pinned, "Row A is a normal tab");
check(labels("normal").includes("Row A"), "with the normal tabs: " + labels("normal"));
check(!labels("row").includes("Row A"), "and no longer a row: " + labels("row"));
"""),

    ("tab into the open folder", r"""
return [at(tab("Normal 1")), ...hold(between(tab("Folder A"), tab("Folder B")), 3)];
""", r"""
const f = tab("Normal 1");
check(!!f.group && f.group.label === "Folder", "Normal 1 is in the folder");
check(JSON.stringify(f.group?.tabs.map(t => t.label)) === JSON.stringify(["Folder A", "Normal 1", "Folder B"]), "between Folder A and Folder B: " + f.group?.tabs.map(t => t.label));
"""),

    ("detour over the page and back into the rows", r"""
const panels = document.getElementById("tabbrowser-tabpanels");
return [at(tab("Normal 1")), at(panels, 0.4, 0.5), at(panels, 0.6, 0.3), at(panels, 0.3, 0.6), ...hold(between(tab("Row A"), tab("Row B")), 3)];
""", r"""
check(isRow(tab("Normal 1")), "Normal 1 is a pinned row after its detour");
check(JSON.stringify(labels("row").slice(0, 3)) === JSON.stringify(["Row A", "Normal 1", "Row B"]), "between Row A and Row B: " + labels("row"));
"""),

    ("tab dropped on the page's right half: split view", r"""
const panels = document.getElementById("tabbrowser-tabpanels");
return [at(tab("Normal 1")), at(panels, 0.5, 0.5), ...hold(at(panels, 0.8, 0.5), 3)];
""", r"""
const sv = tab("Normal 1").splitview;
check(!!sv, "Normal 1 is in a split view");
check(sv && sv.tabs.map(t => t.label).join() === "Normal 2,Normal 1", "beside Normal 2, on the right: " + sv?.tabs.map(t => t.label));
"""),

    ("first tile, with no tiles yet: released over the toolbar", r"""
for (const t of gBrowser.tabs.filter(t => t.pinned)) gBrowser.unpinTab(t);
await wait(800);
const urlbar = document.getElementById("urlbar-container");
// up to the top, a beat for the slot to open, then over the toolbar
return [at(tab("Normal 2")), at(gBrowser.tabContainer, 0.5, 0.02), ...hold(at(urlbar, 0.5, 0.9), 3)];
""", r"""
check(tab("Normal 2").pinned, "Normal 2 is the first tile: " + labels("tile"));
check(!document.getElementById("pinned-drop-indicator").hasAttribute("visible"), "the slot closed");
"""),
]

# Peek, with real clicks: a case may have more steps after its first one,
# (action, check) pairs; an action returns either a drag's points or
# {"click": point, "mods": "alt"}. The page is one big link to another site,
# so any click on it follows the link.
# (served from 127.0.0.1, see serve_linker: a page needs a host for its links
# to count as going to another site; a data: page has none)
PEEK_PAGE = "__LINKER_URL__"
# Its link goes to another site on the same server (localhost, not
# 127.0.0.1), answered after a delay: the Peek's waiting phase, with the page
# underneath kept drawn, lasts long enough to see
LINKER_HTML = '<title>Linker</title><a href="http://localhost:%d/target" style="position:fixed;inset:0;display:block;background:#eef">target</a>'
TARGET_HTML = b'<title>Target</title><body style="background:#223;color:#fff;font:40px system-ui">Target'


def serve_linker():
    """A local web server for the Peek pages; returns the linker's address."""
    import http.server
    import threading

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path == "/target":
                time.sleep(1.5)
                body = TARGET_HTML
            else:
                body = (LINKER_HTML % self.server.server_address[1]).encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return "http://127.0.0.1:%d/linker" % server.server_address[1]
PEEK_PRELUDE = r"""
const peekTab = () => gBrowser.tabs.find(t => t.hasAttribute("arc-peek-tab"));
const linker = async how => {
  const t = gBrowser.addTab("%s", {triggeringPrincipal: P});
  if (how === "tile") gBrowser.pinTab(t);
  gBrowser.selectedTab = t; await wait(400);
  if (how === "row") { document.getElementById("addBookmarkAsKb").doCommand(); await wait(500); }
  await wait(1200);
  return t;
};
const onPage = (fx = 0.5, fy = 0.5) => at(gBrowser.selectedBrowser, fx, fy);
const peekOpen = () => {
  check(root.hasAttribute("arc-peek") && !!peekTab(), "a Peek is open");
  check(!!document.querySelector("#tabbrowser-tabpanels [arc-peek-card]"), "its card shows");
  check(document.getElementById("arc-peek-bar").hasAttribute("shown"), "its buttons show");
  check(peekTab() && R(peekTab()).h === 0, "the Peek isn't listed in the sidebar");
};
""" % PEEK_PAGE

CASES += [
    ("Peek from a tile, closed by a click on the dimmed page", PEEK_PRELUDE + r"""
window.__home = await linker("tile");
return {click: onPage()};
""", PEEK_PRELUDE + r"""
await wait(2500);
peekOpen();
check(window.__home.hasAttribute("arc-peek-home"), "the tile stays highlighted");
check(document.querySelector("#arc-peek-bar .arc-peek-split")?.hidden, "no Split View from a tile");
""", PEEK_PRELUDE + r"""
const tp = gBrowser.tabpanels.getBoundingClientRect();
return {click: [Math.round(mozInnerScreenX + tp.left + tp.width * 0.03), Math.round(mozInnerScreenY + tp.top + tp.height * 0.5)]};
""", PEEK_PRELUDE + r"""
await wait(1000);
check(!root.hasAttribute("arc-peek") && !peekTab(), "closed");
check(gBrowser.selectedTab === window.__home, "back on the tile");
check(!gBrowser.tabpanels.hasAttribute("splitview"), "one page on screen again");
"""),

    ("Option+click in a normal tab: Peek, then Open as Tab", PEEK_PRELUDE + r"""
window.__home = await linker("tab");
return {click: onPage(), mods: "alt"};
""", PEEK_PRELUDE + r"""
await wait(2500);
peekOpen();
""", PEEK_PRELUDE + r"""
return {click: at(document.querySelector("#arc-peek-bar .arc-peek-expand"))};
""", PEEK_PRELUDE + r"""
await wait(1000);
const t = gBrowser.selectedTab;
check(!root.hasAttribute("arc-peek"), "the Peek is gone");
check(/\/target$/.test(t.linkedBrowser.currentURI.spec) && !t.hasAttribute("arc-peek-tab"), "its page is the selected tab now");
check(!t.pinned && !isRow(t) && R(t).h > 0, "a normal tab, listed in the sidebar");
check(window.__home.isConnected, "the page it came from is still open");
"""),

    ("Peek from a pinned row, then Open in Split View", PEEK_PRELUDE + r"""
window.__home = await linker("row");
return {click: onPage()};
""", PEEK_PRELUDE + r"""
await wait(2500);
peekOpen();
check(!document.querySelector("#arc-peek-bar .arc-peek-split")?.hidden, "Split View is offered from a row");
""", PEEK_PRELUDE + r"""
return {click: at(document.querySelector("#arc-peek-bar .arc-peek-split"))};
""", PEEK_PRELUDE + r"""
await wait(1200);
const sv = window.__home.splitview;
check(!root.hasAttribute("arc-peek"), "the Peek is gone");
check(!!sv && sv.tabs.some(t => /\/target$/.test(t.linkedBrowser.currentURI.spec)), "the row and the linked page side by side");
check(isRow(window.__home), "the row is still a row");
"""),
]

# After every drag
INVARIANTS = r"""
check([...Services.wm.getEnumerator("navigator:browser")].length === 1, "no window torn off");
check(!gBrowser.tabContainer.querySelector("[dragtarget], [arc-make-room]"), "no drag marks left on tabs");
const leftover = ["arc-dragging", "arc-drop-row", "arc-drag-over-tiles", "arc-tab-over-tiles", "arc-drag-over-rows", "arc-folder-drag", "arc-snap-row", "arc-snap-tile"].filter(a => root.hasAttribute(a));
check(!leftover.length, "no drag state left on the window: " + leftover);
const moved = gBrowser.tabs.filter(t => (t.style.transform && t.style.transform !== "none") || t.style.translate);
check(!moved.length, "no tab left offset: " + moved.map(t => t.label));
const errs = scriptErrors().slice(window.__arcErrorMark || 0);
check(!errs.length, "no script errors: " + errs.join(" | "));
check(JSON.parse(Services.prefs.getStringPref("arc.tiles", "[]")).length === tiles().length, "the saved tiles match the sidebar");
const savedRows = Services.prefs.getStringPref("arc.pinnedRows", "[]");
check(rows().every(r => savedRows.includes(r.getAttribute("arc-id"))), "every row is saved");
"""


def frontmost(pid):
    subprocess.run(["osascript", "-e",
                    'tell application "System Events" to set frontmost of (first process whose unix id is %d) to true' % pid],
                   capture_output=True)
    # (long enough for the window to have come forward: a press while it's
    # still activating can be lost)
    time.sleep(1.2)


def window_rect(mn):
    return mn.js("return [mozInnerScreenX, mozInnerScreenY - (window.outerHeight - window.innerHeight), window.outerWidth, window.outerHeight].map(Math.round);")


def main():
    if not os.path.exists(DRAG):
        sys.exit("needs the drag tool at " + DRAG)
    if not os.path.exists(T.APP):
        sys.exit("Firefox not found at " + T.APP)
    only = sys.argv[sys.argv.index("--only") + 1] if "--only" in sys.argv else None
    record = sys.argv[sys.argv.index("--record") + 1] if "--record" in sys.argv else None
    if record:
        os.makedirs(record, exist_ok=True)
    cases = [c for c in CASES if not only or only in c[0]]
    print("Real mouse in a test window: don't touch the mouse or keyboard (about %ds)." % (len(cases) * 15 + 15))
    time.sleep(3)
    profile = tempfile.mkdtemp(prefix="arcfox-drag-")
    os.symlink(T.REPO, os.path.join(profile, "chrome"))
    T.write_prefs(profile)
    results = []
    try:
        proc, mn = T.launch(profile)
        # (nothing to test without the script: say so once, not in every case)
        res = mn.js(T.TESTS[0][1])
        if not res["ok"]:
            print("FAIL  " + T.TESTS[0][0])
            for f in res["fail"]:
                print("        - " + f)
            sys.exit(1)
        linker_url = serve_linker()
        for case in cases:
            name = case[0]
            steps = [(a.replace("__LINKER_URL__", linker_url), e) for a, e in zip(case[1::2], case[2::2])]
            start = time.time()
            fails = []
            try:
                res = mn.js(T.SETUP)
                if not res["ok"]:
                    raise RuntimeError("layout set-up failed: %s" % res["fail"])
                mn.js("window.__arcErrorMark = scriptErrors().length; return 1;")
                for i, (action, expect) in enumerate(steps):
                    # (the layout settled first: the press must land on what
                    # the points were measured on, not on something still gliding)
                    act = mn.js(PRELUDE + "await Promise.all(document.getAnimations().map(a => a.finished.catch(() => {}))); await wait(300);\n" + action)
                    # a drag's points, or a click (same point down and up)
                    click = isinstance(act, dict)
                    points = [act["click"], act["click"]] if click else act
                    env = dict(os.environ, DRAG_MODS=act.get("mods", "")) if click else None
                    frontmost(proc.pid)
                    rec = None
                    if record:
                        x, y, w, h = window_rect(mn)
                        movie = os.path.join(record, "".join(c if c.isalnum() else "-" for c in name) + ("-%d" % (i + 1) if len(steps) > 1 else "") + ".mov")
                        rec = subprocess.Popen(["screencapture", "-x", "-v", "-V", str(len(points) * 0.4 + 4), "-R%d,%d,%d,%d" % (x, y, w, h), movie])
                        time.sleep(0.6)
                    drag = subprocess.run([DRAG, str(proc.pid), "60" if click else "300", "16"] + ["%d,%d" % tuple(p) for p in points],
                                          capture_output=True, text=True, env=env)
                    if rec:
                        rec.wait()
                    if drag.returncode != 0:
                        raise RuntimeError("the drag tool refused: " + (drag.stdout + drag.stderr).strip())
                    last = i == len(steps) - 1
                    res = mn.js("await wait(1200);\n" + PRELUDE + expect + (INVARIANTS if last else "") + "\nreturn result({});")
                    fails = ["step %d: %s" % (i + 1, f) if len(steps) > 1 else f for f in res["fail"]]
                    if fails:
                        break
            except Exception as e:
                fails = ["error: " + str(e)[:300]]
            ok = not fails
            results.append((name, ok))
            print("%s  %s  (%.1fs)" % ("PASS" if ok else "FAIL", name, time.time() - start))
            for f in fails:
                print("        - " + f)
        T.quit(proc, mn)
    finally:
        T.close_all()
        shutil.rmtree(profile, ignore_errors=True)
    failed = [n for n, ok in results if not ok]
    print("\n%d passed, %d failed" % (len(results) - len(failed), len(failed)))
    if record:
        print("Recordings:", record)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
