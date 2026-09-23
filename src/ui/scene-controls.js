(() => {
  const site = (window.BabelSite = window.BabelSite || {});
  const ui = (site.ui = site.ui || {});
  const STORAGE_KEY = "babel:scene-paused";

  function readStoredPause() {
    try {
      return window.localStorage?.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  }

  function storePause(paused) {
    try {
      window.localStorage?.setItem(STORAGE_KEY, paused ? "1" : "0");
    } catch {
      // Private or blocked storage keeps the choice for this visit only.
    }
  }

  let initialized = false;

  ui.initSceneControls = function initSceneControls() {
    if (initialized) return true;
    const button = document.getElementById("scene-pause");
    const host = document.getElementById("home-scene");
    if (!button || !host) return false;

    let paused = readStoredPause();
    // The scene bundle reads this before its reveal.
    (site.scene = site.scene || {}).visitorPausedPreference = paused;

    // Media-control pattern: the label names the next action, so no aria-pressed.
    function render() {
      button.setAttribute("data-paused", paused ? "true" : "false");
      button.textContent = paused ? "Play scene" : "Pause scene";
    }

    // The control exists only while the live scene is revealed. Hiding it
    // under keyboard focus hands focus to the footer's Email link.
    function sync() {
      const ready = host.classList.contains("is-ready");
      if (ready && site.scene.isVisitorPaused?.() !== paused) site.scene.setVisitorPaused?.(paused);
      render();
      if (!ready && document.activeElement === button) {
        const next =
          document.querySelector(".site-footer__email") || document.getElementById("main");
        next?.focus({ preventScroll: true });
      }
      button.hidden = !ready;
    }

    button.addEventListener("click", () => {
      paused = !paused;
      site.scene.visitorPausedPreference = paused;
      site.scene.setVisitorPaused?.(paused);
      storePause(paused);
      render();
    });
    if (typeof MutationObserver === "function") {
      new MutationObserver(sync).observe(host, { attributes: true, attributeFilter: ["class"] });
    }
    sync();
    initialized = true;
    return true;
  };
})();
