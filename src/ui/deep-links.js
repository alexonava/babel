(() => {
  const site = (window.BabelSite = window.BabelSite || {});
  const ui = (site.ui = site.ui || {});
  const PANELS = ["about", "profile", "experience", "contact"];

  // "#contact" and the no-script "#contact-text" name the same dialog.
  function panelFromHash(hash) {
    const id = String(hash || "")
      .replace(/^#/, "")
      .replace(/-text$/, "");
    return PANELS.includes(id) ? id : null;
  }

  let initialized = false;

  ui.initDeepLinks = function initDeepLinks() {
    if (initialized) return true;
    const entry = document.querySelector(".scene-entry");
    if (!entry || entry.hidden) return false;
    let current = null;

    function press(element) {
      element?.click();
    }

    function closeButton(id) {
      return document.getElementById(`panel-${id}`)?.querySelector(".panel-close");
    }

    // Opening goes through the same buttons a visitor uses, so Back, Escape
    // and focus restoration step through About exactly as they would by hand.
    function navigate(target) {
      if (current && current !== "about" && current !== target) press(closeButton(current));
      if (!target) {
        if (current === "about") press(closeButton("about"));
        return;
      }
      if (!current) press(entry);
      if (current === "about" && target !== "about") {
        press(document.querySelector(`.estate-destination.estate-${target}`));
      }
    }

    // Replacing keeps dialogs out of the Back history.
    function writeHash(id) {
      const hash = id ? `#${id}` : "";
      if (window.location.hash === hash) return;
      const { pathname, search } = window.location;
      try {
        window.history.replaceState(window.history.state, "", `${pathname}${search}${hash}`);
      } catch {
        // A document that refuses URL updates keeps its dialogs working.
      }
    }

    function followHash() {
      const hash = window.location.hash;
      const target = panelFromHash(hash);
      if (!target && hash) return;
      navigate(target);
      if (target && current === target) writeHash(target);
    }

    document.addEventListener("babel:panelchange", (event) => {
      const { id, open } = event.detail || {};
      current = open && PANELS.includes(id) ? id : null;
      writeHash(current);
    });
    window.addEventListener("hashchange", followHash);
    initialized = true;
    if (panelFromHash(window.location.hash)) followHash();
    return true;
  };
})();
