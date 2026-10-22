      // --- Tile colors (as in Zen) ---
      // A tile's icon gives it up to three colors (the most common saturated
      // ones; white, black, gray and transparent pixels don't count), set as
      // --arc-tile-c1..c3 with [arc-tile-colored]. userChrome.css paints the
      // selected tile with them; an icon without a clear color leaves the
      // tile neutral.
      const tileColorCache = new Map();
      const iconColors = url => {
        if (tileColorCache.has(url)) {
          return Promise.resolve(tileColorCache.get(url));
        }
        return new Promise(resolve => {
          const done = colors => {
            // (keyed by the icon itself, often a large data: address)
            if (tileColorCache.size >= 64) {
              tileColorCache.delete(tileColorCache.keys().next().value);
            }
            tileColorCache.set(url, colors);
            resolve(colors);
          };
          const img = doc.createElementNS("http://www.w3.org/1999/xhtml", "img");
          img.onerror = () => done(null);
          img.onload = () => {
            try {
              const size = 32;
              const canvas = doc.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
              canvas.width = canvas.height = size;
              const ctx = canvas.getContext("2d", { willReadFrequently: true });
              ctx.drawImage(img, 0, 0, size, size);
              const data = ctx.getImageData(0, 0, size, size).data;
              // group the colored pixels by hue (12 families, so a gradient
              // counts as one color), averaging each group
              const hue = (r, g, b) => {
                const max = Math.max(r, g, b);
                const d = max - Math.min(r, g, b) || 1;
                const h = max === r ? (g - b) / d : max === g ? 2 + (b - r) / d : 4 + (r - g) / d;
                return ((h * 60) + 360) % 360;
              };
              const groups = new Map();
              let colored = 0;
              for (let i = 0; i < data.length; i += 4) {
                const [r, g, b, alpha] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
                const max = Math.max(r, g, b);
                const min = Math.min(r, g, b);
                if (alpha < 128 || max < 48 || max - min < 0.25 * max || min > 220) {
                  continue;
                }
                colored++;
                const key = Math.round(hue(r, g, b) / 30) % 12;
                const group = groups.get(key) || { r: 0, g: 0, b: 0, n: 0 };
                group.r += r;
                group.g += g;
                group.b += b;
                group.n++;
                groups.set(key, group);
              }
              const ranked = [...groups.values()]
                .map(c => ({ r: c.r / c.n, g: c.g / c.n, b: c.b / c.n, n: c.n }))
                .sort((x, y) => y.n - x.n);
              // each color: at least 8% of the colored pixels (and 1.5% of the
              // icon, so a few stray pixels don't count), hues 35deg apart
              const minPixels = Math.max(colored * 0.08, size * size * 0.015);
              const hueGap = (x, y) => {
                const d = Math.abs(hue(x.r, x.g, x.b) - hue(y.r, y.g, y.b));
                return Math.min(d, 360 - d);
              };
              const picked = [];
              for (const c of ranked) {
                if (c.n < minPixels || picked.length === 3) {
                  break;
                }
                if (picked.every(p => hueGap(p, c) > 35)) {
                  picked.push(c);
                }
              }
              done(picked.length ? picked.map(c => `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`) : null);
            } catch (e) {
              done(null);
            }
          };
          img.src = url;
        });
      };
      const updateTileColors = tab => {
        const url = tab.getAttribute("image");
        // keep the last colors while an icon is briefly missing (loading)
        if (!tab.pinned || !url) {
          return;
        }
        iconColors(url).then(colors => {
          if (!tab.isConnected || tab.getAttribute("image") !== url) {
            return;
          }
          for (let i = 1; i <= 3; i++) {
            if (colors?.[i - 1]) {
              tab.style.setProperty(`--arc-tile-c${i}`, colors[i - 1]);
            } else {
              tab.style.removeProperty(`--arc-tile-c${i}`);
            }
          }
          tab.toggleAttribute("arc-tile-colored", !!colors);
        });
      };
      // A tile never sits without an icon either: LibreWolf clears it when a
      // new page starts loading (Reddit's bot check page has none, so at
      // launch its tile was blank for seconds); the one saved with its pinned
      // page fills in until the page brings its own
      guard("tile colors", () => {
        gBrowser.tabContainer.addEventListener("TabAttrModified", e => {
          const tab = e.target;
          if (!tab.pinned || !e.detail?.changed?.includes("image")) {
            return;
          }
          const icon = !tab.getAttribute("image") && getHome(tab)?.icon;
          if (icon) {
            try {
              gBrowser.setIcon(tab, icon);
            } catch {}
            return; // (that change comes back here and updates the colors)
          }
          updateTileColors(tab);
        });
        gBrowser.tabContainer.addEventListener("TabPinned", e => updateTileColors(e.target));
        for (const tab of gBrowser.tabs) {
          updateTileColors(tab);
        }
      });

