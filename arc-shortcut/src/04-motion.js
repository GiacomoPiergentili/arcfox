      // --- motion: tabs opening, closing and being pinned ---
      // A tab's row slides open when it opens and shut when it closes (the
      // rows below follow, as folder rows do), and pinning or unpinning
      // glides it, and whatever makes room, to its new place. Not at launch,
      // during drags (they glide on their own) or with reduced motion.
      const motionOK = () => !reducedMotion() &&
        !dragRoot.hasAttribute("arc-starting") && !dragRoot.hasAttribute("arc-dragging");
      // ([arc-folding]: see userChrome.css; height: for a row already hidden,
      // as measured while it was shown)
      const slideRow = (el, open, done, height = el.getBoundingClientRect().height) => {
        if (!height) {
          done?.();
          return;
        }
        for (const a of el.getAnimations()) {
          if (a.id === "arc-fold") {
            a.cancel();
          }
        }
        el.setAttribute("arc-folding", "");
        const full = { height: `${height}px`, opacity: 1 };
        const none = { height: "0px", opacity: 0 };
        const finish = () => {
          el.removeAttribute("arc-folding");
          done?.();
        };
        el.animate(open ? [none, full] : [full, none], { id: "arc-fold", duration: open ? 280 : 220, easing: CURVE.settle })
          .finished.then(finish, finish);
      };
      // Closing: Firefox selects the next tab at once and removes the row
      // in _endRemoveTab, which it can call late (it does, after its own
      // closing animation, in the horizontal tab bar): the row slides shut
      // first. Asked again while sliding (closing a window, say), it goes now.
      const slidingShut = new Set();
      const adoptedTabs = new WeakSet(); // dragged into another window
      gBrowser.tabContainer.addEventListener("TabClose", e => e.detail?.adoptedBy && adoptedTabs.add(e.target));
      const slideShutBeforeRemoving = original => tab => {
        const endRemoveTab = t => original.call(gBrowser, t);
        if (!tab?._endRemoveArgs) {
          return endRemoveTab(tab);
        }
        if (slidingShut.delete(tab)) {
          return endRemoveTab(tab);
        }
        const [closeWindow, newTab] = tab._endRemoveArgs;
        if (closeWindow || newTab || tab.pinned || tab.splitview || adoptedTabs.has(tab) ||
            tab.hasAttribute("arc-peek-tab") || slidingShut.size >= 3 || !motionOK() ||
            !tab.getBoundingClientRect().height) {
          return endRemoveTab(tab);
        }
        slidingShut.add(tab);
        slideRow(tab, false, () => slidingShut.delete(tab) && endRemoveTab(tab));
        return undefined;
      };
      // Opening (a handful at a time: a whole session or folder opening at
      // once just appears)
      guard("tabs sliding open", () => {
        let openedLately = [];
        gBrowser.tabContainer.addEventListener("TabOpen", e => {
          const tab = e.target;
          const now = win.performance.now();
          openedLately = openedLately.filter(t => now - t < 150);
          openedLately.push(now);
          if (!motionOK() || openedLately.length > 3) {
            return;
          }
          // (from its very first frame; a Peek, the empty start page or a split
          // view's tab, known only once it's settled, don't slide after all)
          if (tab.pinned || tab.splitview) {
            return;
          }
          slideRow(tab, true);
          win.requestAnimationFrame(() => {
            if (!tab.isConnected || tab.pinned || tab.splitview ||
                tab.hasAttribute("arc-peek-tab") || tab.hasAttribute("arc-start-page")) {
              for (const a of tab.getAnimations()) {
                if (a.id === "arc-fold") {
                  a.finish();
                }
              }
            }
          });
        });
      });
      // Pinning and unpinning: every item's place is noted before, and each
      // glides from there to where it lands. A tab changing kind (a row
      // becoming a tile, or back) grows into its new place instead: the
      // tiles and the rows each clip to their own area, so it couldn't be
      // seen travelling between them.
      const glideItems = () => [
        ...gBrowser.tabContainer.querySelectorAll(".tabbrowser-tab:not([closing]), .tab-group-label-container, tab-split-view-wrapper"),
        doc.getElementById("tabbrowser-arrowscrollbox-periphery"),
      ].filter(Boolean);
      // (where each item is, and whether it's a tile. A drop glides too,
      // except the dropped tab, which Firefox moves into place itself.)
      const notePlaces = ({ dropping = false } = {}) => {
        if (reducedMotion() || dragRoot.hasAttribute("arc-starting") || (!dropping && dragRoot.hasAttribute("arc-dragging"))) {
          return null;
        }
        const items = glideItems().filter(el => !(dropping && el.hasAttribute("dragtarget") && !el.pinned));
        return new Map(items.map(el => [el, [el.getBoundingClientRect(), !!el.pinned]]));
      };
      // (measured right away, so the first frame drawn is already the start
      // of the glide, never the end; after a drop, a frame later: Firefox
      // moves the tabs once our drop handler is done)
      const glideFrom = (places, { nextFrame = false } = {}) => {
        if (!places) {
          return;
        }
        if (nextFrame) {
          win.requestAnimationFrame(() => glideFrom(places));
          return;
        }
        const moves = [];
        for (const [el, [a, wasTile]] of places) {
          const b = el.isConnected ? el.getBoundingClientRect() : null;
          if (b?.height && a.height) {
            moves.push([el, a, b, wasTile !== !!el.pinned]);
          }
        }
        // the item that moves furthest (it crosses others) is drawn over them,
        // on the sidebar's color ([arc-gliding], userChrome.css)
        const crossing = moves.reduce((best, m) => {
          const dy = Math.abs(m[1].top - m[2].top);
          return dy > m[2].height / 2 && dy > (best?.dy ?? 0) ? { el: m[0], dy } : best;
        }, null)?.el;
        for (const [el, a, b, changedKind] of moves) {
          if (changedKind) {
            // (once the others have mostly made room for it)
            // (opacity replaced, not added: added to 1 it would stay 1)
            el.animate([{ opacity: 0, transform: "scale(0.8)" }, { opacity: 1, transform: "none" }],
              { duration: 280, delay: 120, fill: "backwards", easing: CURVE.settle });
            continue;
          }
          // One that changed size too (a tile widening or narrowing as
          // another comes or goes, a tab joining a split view) glides by its
          // top left corner; one that grew starts at its old size and opens
          // out, so it never overlaps its neighbours
          const dx = a.left - b.left;
          const dy = a.top - b.top;
          const grewX = Math.max(0, b.width - a.width);
          const grewY = Math.max(0, b.height - a.height);
          if (Math.abs(dx) >= 1 || Math.abs(dy) >= 1 || grewX > 4 || grewY > 4) {
            const from = { transform: `translate(${dx}px, ${dy}px)` };
            const to = { transform: "none" };
            if (grewX > 4 || grewY > 4) {
              from.clipPath = `inset(0 ${grewX}px ${grewY}px 0)`;
              to.clipPath = "inset(0 0 0 0)";
            }
            const anim = el.animate([from, to], { duration: 320, easing: CURVE.settle, composite: "add" });
            if (el === crossing) {
              el.setAttribute("arc-gliding", "");
              const done = () => el.removeAttribute("arc-gliding");
              anim.finished.then(done, done);
            }
          }
        }
      };
      const withGlide = fn => () => {
        const places = notePlaces();
        fn();
        glideFrom(places);
      };
      guard("pin glide from the menu", () => {
        // (Firefox's own Pin Tab / Unpin Tab menu items too)
        for (const id of ["context_pinTab", "context_unpinTab", "context_pinSelectedTabs", "context_unpinSelectedTabs"]) {
          doc.getElementById(id)?.addEventListener("command", () => glideFrom(notePlaces()), true);
        }
      });

