(() => {
  const site = (window.BabelSite = window.BabelSite || {});
  const ui = (site.ui = site.ui || {});
  ui.initSceneMenu = function initSceneMenu() {
    const entry = document.querySelector(".scene-entry");
    const fallback = Array.from(document.querySelectorAll("[data-scene-fallback]"));
    if (!entry || !fallback.length) return false;
    if (fallback.some((element) => element.contains(document.activeElement))) return false;
    try {
      if (ui.initPanels?.() !== true) return false;
    } catch {
      return false;
    }
    entry.hidden = false;
    fallback.forEach((element) => {
      element.hidden = true;
    });
    return true;
  };
})();
