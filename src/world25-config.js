export const PATH_BACKDROP_RELEASE = "path25";

export function applyDistantPathBackdrop(config) {
  const bands = config?.paintedBackdrop?.bands;
  if (!Array.isArray(bands)) throw new Error("painted backdrop bands are unavailable");

  let band = bands.find((entry) => entry.name === "PaintedPath");
  if (!band) {
    band = {
      name: "PaintedPath",
      // Full authored 4096x512 PNG. painted-backdrop.js removes the magenta
      // key in memory and uploads a 4096x256 crop, so horizontal detail is
      // preserved instead of being crushed into the old 1024x34 WebP.
      texture: "./assets/textures/backdrop_path.png",
      chromaKey: 0xff00ff,
      chromaTolerance: 28,
      chromaFeather: 70,
      cropY: 184,
      cropHeight: 256,
      radius: 424,
      height: 20,
      y: 0,
      repeat: 2,
      tint: 0xf7f0e3,
      haze: 0.06,
      renderOrder: -27,
    };
    bands.push(band);
  }

  return band;
}
