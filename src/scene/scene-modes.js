// Keep comparison URL precedence in one place. Unknown values retain the
// original default; explicit comparison controls keep the full legacy world.
// `ground` names the terrain maps: the default film slate (the authored cracked
// ground pair), or the earth+grass, desert and procedural comparisons.
export const GROUND_COMPARISONS = Object.freeze(["earth", "desert", "procedural"]);

export function resolveSceneModes(search = "") {
  const query = new URLSearchParams(search);
  const architecture = query.get("architecture");
  const groundParam = query.get("ground");
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
    mud: completeTower && !["desert", "procedural"].includes(groundParam),
    ground: GROUND_COMPARISONS.includes(groundParam) ? groundParam : "slate",
    propScale: completeTower && query.get("scale") !== "baseline",
    earthFooting: completeTower && query.get("setting") !== "plinth",
    // Review toggle for the film's scattered rocks; it keeps the authored scene.
    rocks: query.get("rocks") !== "off",
    // ground=earth swaps only the film terrain maps; it keeps the authored scene.
    legacy: requestedView === "orbit" || [
      "architecture", "setting", "cinematography", "refinement", "scale",
      "ground", "brick", "stone", "construction", "preview",
    ].some(key => query.has(key) && !(key === "ground" && groundParam === "earth")),
  };
}
