      // --- profile switcher (Arc's Space switcher, with LibreWolf profiles) ---
      // In the middle of the sidebar's bottom row: the profiles' avatars
      // (as many as fit, the current one always; hover for the name). A
      // click on another profile brings its window forward (or starts it).
      // New profiles are made from LibreWolf's Profiles menu (and set up on
      // their first run, see above). Hidden in private windows and when
      // LibreWolf's profiles are off.
      guard("profile switcher", () => {
        const profilesBox = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
        profilesBox.id = "arc-profiles";
        profilesBox.hidden = true;
        doc.getElementById("downloads-button")?.after(profilesBox);
        let profileService = null;
        try {
          ({ SelectableProfileService: profileService } = win.ChromeUtils.importESModule("resource:///modules/profiles/SelectableProfileService.sys.mjs"));
        } catch {}
        // As many as fit between Downloads and Extensions (centered, 4px clear
        // of them; 30px buttons 4px apart, like the other icon buttons): fewer
        // in a narrow sidebar
        const maxProfiles = () => {
          const width = doc.querySelector("sidebar-main")?.getBoundingClientRect().width || 273;
          // Downloads ends 43px in, Extensions starts 42px from the end
          const room = width - 2 * 47;
          return Math.max(1, Math.floor((room + 4) / 34));
        };
        let lastProfiles = null;
        // (list, current): also called by the tests with made-up profiles
        const renderProfiles = async (list, current) => {
          lastProfiles = [list, current];
          const max = maxProfiles();
          const shown = list.filter(p => p.id === current?.id);
          for (const p of list) {
            if (shown.length >= max) {
              break;
            }
            if (!shown.includes(p)) {
              shown.push(p);
            }
          }
          shown.sort((a, b) => list.indexOf(a) - list.indexOf(b));
          const buttons = [];
          for (const p of shown) {
            const isCurrent = p.id === current?.id;
            const b = doc.createElementNS("http://www.w3.org/1999/xhtml", "button");
            b.className = "arc-profile";
            b.title = p.name;
            b.setAttribute("aria-label", p.name);
            b.addEventListener("click", () => !isCurrent && profileService?.launchInstance(p));
            b.toggleAttribute("current", isCurrent);
            if (isCurrent) {
              b.setAttribute("aria-current", "true");
            }
            const img = doc.createElementNS("http://www.w3.org/1999/xhtml", "img");
            img.alt = "";
            try {
              img.src = p.hasCustomAvatar ? await p.getAvatarURL(20) : `chrome://browser/content/profiles/assets/20_${p.avatar}.svg`;
            } catch {
              img.src = "chrome://browser/content/profiles/assets/20_default-favicon.svg";
            }
            if (p.theme?.themeBg) {
              b.style.setProperty("--arc-profile-bg", p.theme.themeBg);
            }
            if (p.theme?.themeFg) {
              b.style.setProperty("--arc-profile-fg", p.theme.themeFg);
            }
            b.append(img);
            buttons.push(b);
          }
          profilesBox.replaceChildren(...buttons);
          // (one profile alone has nothing to switch to)
          profilesBox.hidden = buttons.length < 2;
        };
        profilesBox._arcRender = renderProfiles;
        const refreshProfiles = async () => {
          if (isPrivate || !profileService) {
            profilesBox.hidden = true;
            return;
          }
          // LibreWolf's profile service starts up in its own time: at launch it
          // had no profiles to give yet
          try {
            if (!profileService.initialized) {
              await profileService.init();
            }
          } catch {}
          if (!profileService.isEnabled) {
            profilesBox.hidden = true;
            return;
          }
          let list = [];
          try {
            list = await profileService.getAllProfiles();
          } catch {}
          renderProfiles(list, profileService.currentProfile);
        };
        if (!isPrivate && profileService) {
          const profilesObserver = { observe: () => refreshProfiles() };
          win.Services.obs.addObserver(profilesObserver, "sps-profiles-updated");
          const onEnable = () => refreshProfiles();
          profileService.on?.("enableChanged", onEnable);
          win.addEventListener("unload", () => {
            win.Services.obs.removeObserver(profilesObserver, "sps-profiles-updated");
            profileService.off?.("enableChanged", onEnable);
          }, { once: true });
          refreshProfiles();
          // (and once LibreWolf has settled, in case it was still busy)
          SessionStore.promiseAllWindowsRestored.then(() => win.setTimeout(refreshProfiles, 1000));
        }
        // the sidebar resized: recount what fits
        let profilesFit = maxProfiles();
        new win.ResizeObserver(() => {
          const fit = maxProfiles();
          if (fit !== profilesFit && lastProfiles) {
            profilesFit = fit;
            renderProfiles(...lastProfiles);
          }
        }).observe(doc.querySelector("sidebar-main") || doc.documentElement);
      });

