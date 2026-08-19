import { CONFIG } from "./config.js";
import { PATH_BACKDROP_RELEASE, applyDistantPathBackdrop } from "./world25-config.js";

const pathBand = applyDistantPathBackdrop(CONFIG);
window.__lioraPathBackdrop = {
  release: PATH_BACKDROP_RELEASE,
  band: pathBand.name,
  radius: pathBand.radius,
};

await import("./main.js");
