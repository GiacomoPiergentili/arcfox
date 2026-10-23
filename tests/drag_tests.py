#!/usr/bin/env python3
"""Real drag-and-drop checks for arcfox.

Drag and drop is where most bugs have been, and simulated events miss what
real ones do (Firefox's own drag code, timers, the pointer leaving the tab
list). These cases move the real mouse, in a throwaway test browser like
run_tests.py's, and check where everything lands, plus what must hold after
any drag: no window torn off, no drag state or offsets left behind, no
script errors, and the saved tiles and rows matching the sidebar.

The mouse moves only through ~/.arc-drag/drag, which refuses unless the
test window is frontmost and on top at every point. Don't touch the mouse
or keyboard while it runs (about 2½ minutes); not run by run_tests.py.

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
return [at(tab("Blue")), ...hold(at(tab("Red"), 0.25, 0.5), 3)];
""", r"""
check(JSON.stringify(labels("tile")) === JSON.stringify(["Blue", "Red", "Green"]), "Blue comes first: " + labels("tile"));
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
    time.sleep(0.8)


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
    print("Real mouse drags in a test window: don't touch the mouse or keyboard (about %ds)." % (len(cases) * 12 + 15))
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
        for name, setup, expect in cases:
            start = time.time()
            fails = []
            try:
                res = mn.js(T.SETUP)
                if not res["ok"]:
                    raise RuntimeError("layout set-up failed: %s" % res["fail"])
                points = mn.js(PRELUDE + "window.__arcErrorMark = scriptErrors().length;\n" + setup)
                frontmost(proc.pid)
                rec = None
                if record:
                    x, y, w, h = window_rect(mn)
                    movie = os.path.join(record, "".join(c if c.isalnum() else "-" for c in name) + ".mov")
                    rec = subprocess.Popen(["screencapture", "-x", "-v", "-V", str(len(points) * 0.4 + 4), "-R%d,%d,%d,%d" % (x, y, w, h), movie])
                    time.sleep(0.6)
                drag = subprocess.run([DRAG, str(proc.pid), "300", "16"] + ["%d,%d" % tuple(p) for p in points],
                                      capture_output=True, text=True)
                if rec:
                    rec.wait()
                if drag.returncode != 0:
                    raise RuntimeError("the drag tool refused: " + (drag.stdout + drag.stderr).strip())
                res = mn.js("await wait(1200);\n" + PRELUDE + expect + INVARIANTS + "\nreturn result({});")
                fails = res["fail"]
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
