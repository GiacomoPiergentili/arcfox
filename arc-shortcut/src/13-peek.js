      // --- Peek (as in Arc) ---
      // A link to another site clicked in a tile or a pinned row opens in a
      // card floating over the pinned page (dimmed), instead of replacing it.
      // Firefox already opens such links in a new tab from pinned tabs (its
      // "app tab" flag); rows get the flag too. That new tab is the Peek:
      // it's selected (the URL bar shows its address) but hidden from the
      // sidebar, where the pinned item stays highlighted; Firefox's split
      // view machinery draws both pages. Esc, a click on the dimmed page, the
      // card's close button or switching tabs closes it (and it's gone, in
      // Recently Closed); it can also become a normal tab, or a split view
      // with a pinned row.
      const peekSection = guard("Peek", () => {
        const PEEK = "arc-peek-tab";
        const setAppTab = tab => {
          try {
            if (tab.linkedBrowser?.browsingContext) {
              tab.linkedBrowser.browsingContext.isAppTab = tab.pinned || isRow(tab);
            }
          } catch {}
        };
        for (const tab of gBrowser.tabs) {
          setAppTab(tab);
        }
        gBrowser.tabContainer.addEventListener("TabBrowserInserted", e => setAppTab(e.target));
        new win.MutationObserver(records => {
          for (const r of records) {
            setAppTab(r.target);
          }
        }).observe(gBrowser.tabContainer, { subtree: true, attributes: true, attributeFilter: [ROW] });

        const peekBar = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
        peekBar.id = "arc-peek-bar";
        const peekButton = (name, label) => {
          const b = doc.createElementNS("http://www.w3.org/1999/xhtml", "button");
          b.className = `arc-peek-${name}`;
          b.title = label;
          b.setAttribute("aria-label", label);
          peekBar.append(b);
          return b;
        };
        const splitButton = peekButton("split", "Open in Split View");
        const expandButton = peekButton("expand", "Open as Tab");
        const closeButton = peekButton("close", "Close");
        doc.body.append(peekBar);
        const peekSpinner = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
        peekSpinner.id = "arc-peek-spinner";
        doc.body.append(peekSpinner);
        let peek = null; // { tab, home, origin }
        // The page under a Peek stays drawn: Firefox drops what a tab it
        // switches away from has drawn (one black frame), unless told not to
        const keepDrawn = (tab, on) => {
          try {
            tab.linkedBrowser.preserveLayers(on);
            if (on) {
              tab.linkedBrowser.renderLayers = true;
              tab.linkedBrowser.docShellIsActive = true;
            }
          } catch {}
        };
        // where a page was last pressed: the card grows out of the link
        let lastPagePress = null;
        win.addEventListener("pointerdown", e => {
          if (e.target?.localName === "browser") {
            lastPagePress = { x: e.clientX, y: e.clientY, at: win.performance.now() };
          }
        }, true);
        // where the card ends up: 7.5% in from the page's edges
        const cardBox = () => {
          const r = gBrowser.tabpanels.getBoundingClientRect();
          return { left: r.left + r.width * 0.075, top: r.top + r.height * 0.075, width: r.width * 0.85, height: r.height * 0.85 };
        };
        // (from where the card ends up, 7.5% in from the page's edges: it's
        // still growing into place when this runs)
        const placePeekBar = () => {
          if (!peek) {
            return;
          }
          const r = gBrowser.tabpanels.getBoundingClientRect();
          const right = Math.round(r.right - r.width * 0.075);
          const top = Math.round(r.top + r.height * 0.075);
          peekBar.style.left = `${right - peekBar.offsetWidth}px`;
          peekBar.style.top = `${top - peekBar.offsetHeight - 8}px`;
        };
        win.addEventListener("resize", placePeekBar);
        const openPeek = (tab, home) => {
          peek = { tab, home };
          tab.setAttribute(PEEK, "");
          home.setAttribute("arc-peek-home", "");
          dragRoot.setAttribute("arc-peek", "");
          splitButton.hidden = home.pinned || !!home.splitview;
          const press = lastPagePress && win.performance.now() - lastPagePress.at < 3000 ? lastPagePress : null;
          const box = cardBox();
          peek.origin = press ? { x: press.x - box.left, y: press.y - box.top } : null;
          // The pinned page dims right away (and is kept drawn: Firefox puts
          // the page it switched away from to sleep); the card waits, hidden,
          // until its page has drawn (a spinner at the link if that takes a
          // moment), then grows out of the link: never an empty or black card
          const show = () => {
            if (peek?.tab !== tab) {
              return false;
            }
            gBrowser.showSplitViewPanels([home, tab]);
            doc.getElementById(home.linkedPanel)?.setAttribute("arc-peek-under", "");
            doc.getElementById(tab.linkedPanel)?.setAttribute("arc-peek-card", "");
            return true;
          };
          const card = doc.getElementById(tab.linkedPanel);
          card?.setAttribute("arc-peek-waiting", "");
          keepDrawn(home, true);
          show();
          const keepHomeDrawn = win.setInterval(() => {
            if (peek?.tab !== tab) {
              win.clearInterval(keepHomeDrawn);
              return;
            }
            try {
              home.linkedBrowser.docShellIsActive = true;
              home.linkedBrowser.renderLayers = true;
            } catch {}
          }, 50);
          const spinnerAt = press || { x: box.left + box.width / 2, y: box.top + box.height / 2 };
          peekSpinner.style.left = `${spinnerAt.x}px`;
          peekSpinner.style.top = `${spinnerAt.y}px`;
          const spinnerTimer = win.setTimeout(() => peek?.tab === tab && peekSpinner.setAttribute("shown", ""), 150);
          let revealed = false;
          const reveal = () => {
            if (revealed || !show()) {
              return;
            }
            revealed = true;
            win.clearTimeout(spinnerTimer);
            win.clearInterval(keepHomeDrawn);
            gBrowser.removeTabsProgressListener(listener);
            peekSpinner.removeAttribute("shown");
            card?.removeAttribute("arc-peek-waiting");
            if (card && !reducedMotion()) {
              // out of the link: from a tenth of its size at the press point (or
              // from the middle, a little smaller)
              card.style.transformOrigin = peek.origin ? `${peek.origin.x}px ${peek.origin.y}px` : "center";
              card.animate(peek.origin
                ? [{ transform: "scale(0.1)", opacity: 0 }, { opacity: 1, offset: 0.25 }, { transform: "scale(1)", opacity: 1 }]
                : [{ transform: "scale(0.96)", opacity: 0 }, { transform: "scale(1)", opacity: 1 }],
              { duration: peek.origin ? 340 : 220, easing: CURVE.pop });
            }
            peekBar.setAttribute("shown", "");
            placePeekBar();
            peekBar.animate?.([{ opacity: 0 }, { opacity: 0, offset: 0.6 }, { opacity: 1 }], { duration: 340, easing: "ease-out" });
            tab.linkedBrowser.focus();
          };
          // ready: its page's document has arrived (then a beat to draw it), or
          // it finished loading; at the latest after 4s
          const listener = {
            onLocationChange(browser, webProgress, request, location) {
              if (browser === tab.linkedBrowser && webProgress.isTopLevel && location && !win.isBlankPageURL(location.spec)) {
                win.setTimeout(() => win.requestAnimationFrame(() => win.requestAnimationFrame(reveal)), 120);
              }
            },
            onStateChange(browser, webProgress, request, flags) {
              const { STATE_STOP, STATE_IS_WINDOW } = Ci.nsIWebProgressListener;
              if (browser === tab.linkedBrowser && webProgress.isTopLevel && flags & STATE_STOP && flags & STATE_IS_WINDOW && !win.isBlankPageURL(browser.currentURI.spec)) {
                win.requestAnimationFrame(() => win.requestAnimationFrame(reveal));
              }
            },
          };
          gBrowser.addTabsProgressListener(listener);
          win.setTimeout(reveal, 4000);
        };
        // Firefox takes the two pages down when it finishes switching to the
        // Peek's tab (to it that's a tab outside any split view): put them back
        // before the next frame is drawn
        new win.MutationObserver(() => {
          if (peek && !closing && !gBrowser.tabpanels.hasAttribute("splitview")) {
            gBrowser.showSplitViewPanels([peek.home, peek.tab]);
          }
        }).observe(gBrowser.tabpanels, { attributes: true, attributeFilter: ["splitview"] });
        // how: "close" (gone), "tab" (a normal tab), "split" (beside the row),
        // "away" (another tab was selected: gone), "gone" (closed already)
        let closing = false;
        const closePeek = how => {
          if (!peek || closing) {
            return;
          }
          // "close": back into the link; "tab": out to the whole page; then put
          // away (switching tabs or a closed tab: at once)
          const card = doc.getElementById(peek.tab.linkedPanel);
          const under = doc.getElementById(peek.home.linkedPanel);
          if ((how === "close" || how === "tab") && card && !reducedMotion()) {
            closing = true;
            peekBar.removeAttribute("shown");
            let anim;
            if (how === "tab") {
              const box = cardBox();
              const r = gBrowser.tabpanels.getBoundingClientRect();
              card.style.transformOrigin = `${r.left + r.width / 2 - box.left}px ${r.top + r.height / 2 - box.top}px`;
              anim = card.animate([{ transform: "scale(1)" }, { transform: `scale(${r.width / box.width}, ${r.height / box.height})`, borderRadius: "0px" }], { duration: 240, easing: CURVE.pop, fill: "forwards" });
            } else {
              card.style.transformOrigin = peek.origin ? `${peek.origin.x}px ${peek.origin.y}px` : "center";
              anim = card.animate([{ transform: "scale(1)", opacity: 1 }, { opacity: 1, offset: 0.5 }, { transform: peek.origin ? "scale(0.1)" : "scale(0.96)", opacity: 0 }], { duration: 220, easing: CURVE.leave, fill: "forwards" });
            }
            under?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: "ease-out", fill: "forwards", pseudoElement: "::after" });
            anim.finished.catch(() => {}).then(() => {
              closing = false;
              card.getAnimations().forEach(a => a.cancel());
              under?.getAnimations({ subtree: true }).forEach(a => a.cancel());
              finishPeek(how);
            });
            return;
          }
          finishPeek(how);
        };
        const finishPeek = how => {
          if (!peek) {
            return;
          }
          const { tab, home } = peek;
          peek = null;
          doc.getElementById(tab.linkedPanel)?.style.removeProperty("transform-origin");
          doc.getElementById(tab.linkedPanel)?.removeAttribute("arc-peek-waiting");
          if (home.isConnected) {
            keepDrawn(home, false);
          }
          peekSpinner.removeAttribute("shown");
          peekBar.removeAttribute("shown");
          dragRoot.removeAttribute("arc-peek");
          home.removeAttribute("arc-peek-home");
          tab.removeAttribute(PEEK);
          for (const t of [home, tab]) {
            const panel = doc.getElementById(t.linkedPanel);
            panel?.removeAttribute("arc-peek-under");
            panel?.removeAttribute("arc-peek-card");
          }
          try {
            gBrowser.tabpanels.removeTabsFromSplitview([home, tab]);
          } catch {}
          if (how === "gone" && gBrowser.selectedTab === tab && home.isConnected) {
            gBrowser.selectedTab = home; // (Cmd+W on it: back to the pinned page)
          }
          if (how === "close" || how === "away") {
            if (gBrowser.selectedTab === tab && home.isConnected) {
              gBrowser.selectedTab = home;
            }
            if (tab.isConnected && !tab.closing) {
              closeOrReset(tab, { animate: false });
            }
          } else if (how === "tab") {
            moveToRowBlockEnd(tab); // the first normal tab
          } else if (how === "split" && home.isConnected) {
            gBrowser.addTabSplitView([home, tab], { insertBefore: home });
            gBrowser.selectedTab = tab;
          }
        };
        closeButton.addEventListener("click", () => closePeek("close"));
        expandButton.addEventListener("click", () => closePeek("tab"));
        splitButton.addEventListener("click", () => closePeek("split"));
        // a link from a pinned page that opens in front: the Peek
        gBrowser.tabContainer.addEventListener("TabOpen", e => {
          const tab = e.target;
          const opener = tab.openerTab;
          // (or any link Option+clicked a moment ago, from any tab)
          const asked = Date.now() - altPeekAt < 1500;
          if (!peek && opener && opener.selected && !opener.splitview && (isPinnedish(opener) || asked)) {
            tab._arcPeekFrom = { opener, at: win.performance.now() };
            keepDrawn(opener, true); // (before Firefox switches away from it)
            altPeekAt = 0;
          }
        });
        gBrowser.tabContainer.addEventListener("TabSelect", e => {
          const tab = e.target;
          if (peek && tab !== peek.tab) {
            closePeek("away");
          }
          const from = tab._arcPeekFrom;
          delete tab._arcPeekFrom;
          if (from && win.performance.now() - from.at < 2000 && e.detail?.previousTab === from.opener && from.opener.isConnected) {
            openPeek(tab, from.opener);
          }
        });
        // Closing the Peek's tab (Cmd+W) closes the Peek (see "closing a
        // pinned row or tile" above); any other way it goes, the Peek is put
        // away once Firefox is done closing it
        const peekCloses = tab => {
          if (peek && tab === peek.tab && !tab.closing) {
            closePeek("close");
            return true;
          }
          return false;
        };
        gBrowser.tabContainer.addEventListener("TabClose", e => {
          if (peek && (e.target === peek.tab || e.target === peek.home)) {
            const gone = e.target === peek.tab;
            win.setTimeout(() => closePeek(gone ? "gone" : "away"), 0);
          }
        });
        // a click on the dimmed page, or Esc, closes it
        doc.getElementById("tabbrowser-tabpanels")?.addEventListener("mousedown", e => {
          if (peek && e.button === 0 && e.target?.hasAttribute?.("arc-peek-under")) {
            e.preventDefault();
            e.stopPropagation();
            closePeek("close");
          }
        }, true);
        win.addEventListener("keydown", e => {
          if (peek && e.key === "Escape" && !e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
            e.preventDefault();
            closePeek("close");
          }
        }, true);
        return { peekCloses };
      }) ?? {};

