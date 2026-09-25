(() => {
  const site = (window.BabelSite = window.BabelSite || {});
  const ui = (site.ui = site.ui || {});
  // The footer's Pause scene control was retired at the owner's request
  // (2026-09-24); the scene always plays (reduced motion and open dialogs still
  // pause it). A visitor who paused before keeps no stale preference.
  const STORAGE_KEY = "babel:scene-paused";

  ui.initSceneControls = function initSceneControls() {
    try {
      window.localStorage?.removeItem(STORAGE_KEY);
    } catch {
      // Private or blocked storage holds nothing to clear.
    }
    (site.scene = site.scene || {}).visitorPausedPreference = false;
    return true;
  };
})();
