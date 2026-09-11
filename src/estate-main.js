(() => {
  function boot() {
    const navigation = document.querySelector(".estate-destinations");
    const fallback = Array.from(document.querySelectorAll("[data-estate-fallback]"));
    if (!navigation || !fallback.length) return;
    // A delayed download must not remove content the visitor is already using.
    if (fallback.some((element) => element.contains(document.activeElement))) return;
    try {
      if (window.BabelSite?.ui?.initPanels?.() !== true) return;
    } catch {
      // The ordinary links and section copy remain usable if enhancement fails.
      return;
    }
    navigation.hidden = false;
    fallback.forEach((element) => {
      element.hidden = true;
    });
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
