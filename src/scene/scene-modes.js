// Keep comparison URL precedence in one place. Unknown values retain the
// original default; explicit comparison controls keep the full legacy world.
export function resolveSceneModes(search = "") {
  const query = new URLSearchParams(search);
  const architecture = query.get("architecture");
  const completeTower = !["classic", "assembled"].includes(architecture);
  const quiet = completeTower && query.get("setting") !== "previous";
  const requestedView = query.get("view");
  const view = quiet && ["tree", "tower", "orbit"].includes(requestedView)
    ? requestedView : quiet ? "tower" : "orbit";
  return {
    architecture: architecture !== "classic",
    completeTower,
    view,
    quiet,
    film: quiet && requestedView !== "orbit" && query.get("cinematography") !== "baseline",
    grounded: completeTower && query.get("refinement") !== "baseline",
    mud: completeTower && !["desert", "procedural"].includes(query.get("ground")),
    propScale: completeTower && query.get("scale") !== "baseline",
    earthFooting: completeTower && query.get("setting") !== "plinth",
    legacy: requestedView === "orbit" || [
      "architecture", "setting", "cinematography", "refinement", "scale",
      "ground", "brick", "stone", "construction", "preview",
    ].some(key => query.has(key)),
  };
}
