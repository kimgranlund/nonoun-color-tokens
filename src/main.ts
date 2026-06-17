// Entry point: mount the HCT Palette Generator.
//
// The web component + its stylesheet live under `src/ui/` (app.js customElements.define's
// <hct-app> and pulls in the `./model.mjs` → `../engine/…` ES-module graph). We import them
// here and drop <hct-app> into the page; Vite resolves and bundles the graph.
import "./ui/styles.css";
import "./ui/app.js";

const root = document.querySelector<HTMLElement>("#app");
if (root) root.innerHTML = "<hct-app></hct-app>";
