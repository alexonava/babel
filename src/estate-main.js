(() => {
  function boot() {
    window.BabelSite.ui.initPanels();
    document.querySelector(".estate-destinations")?.removeAttribute("hidden");
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
